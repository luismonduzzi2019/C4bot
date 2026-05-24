// =====================================================
// 🔥 C4 BOT — INDEX ORGANIZADO
// PARTE 1/4 — BASE, CONFIG, HELPERS Y ESTADO GLOBAL
// =====================================================

const express = require("express")
const fs = require("fs")
const axios = require("axios")
const sharp = require("sharp")
const Tesseract = require("tesseract.js")
const stringSimilarity = require("string-similarity")
const { createClient } = require("@supabase/supabase-js")

const {
  default: makeWASocket,
  useMultiFileAuthState
} = require("@whiskeysockets/baileys")

const P = require("pino")

// =====================================================
// EXPRESS
// =====================================================

const app = express()
app.use(express.json({ limit: "50mb" }))
app.use(express.urlencoded({ extended: true, limit: "50mb" }))

// =====================================================
// SUPABASE
// =====================================================

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

// =====================================================
// CONFIGURACIÓN GENERAL
// =====================================================

const adminPrincipal = "5493412750806"

const GRUPO_MIX = "120363425089190805-group"
const GRUPO_STATS = "120363407953964467-group"

const NOMBRE_BOT = "C4 Top / Organizador Mix"

const pathJugadores = "./jugadores.json"

const DURACION_MUTE_MIX = 12 * 60 * 60 * 1000
const DURACION_MUTE_STATS = 32 * 60 * 60 * 1000

// =====================================================
// ESTADO GLOBAL
// =====================================================

let sockGlobal = null

let mixAbierto = false
let chatMixActivo = false
let jugadoresMix = []
let equiposMixActual = null

let resultadoPendiente = null
let cwActual = []

const antiSpam = {}
const usuariosMuteados = {}

let votosMapa = {}
let votacionActiva = false

global.ultimosMensajes = global.ultimosMensajes || {}
global.ultimosAvisosMute = global.ultimosAvisosMute || {}
global.ultimasBienvenidas = global.ultimasBienvenidas || {}

// =====================================================
// MAPAS
// =====================================================

const mapas = [
  "Dune",
  "Rust",
  "Sandstone",
  "Province",
  "Prisión",
  "Hanami",
  "Breeze",
  "Azar 🎲"
]

// =====================================================
// COMANDOS
// =====================================================

const comandosMix = [
  "!registrar",
  "!editregistro",
  "!entrar",
  "!salir",
  "!cerrarchat",
  "!abrirchat",
  "!comandos",
  "!abrirmix",
  "!cerrarmix",
  "!reiniciarmix",
  "!fake10",
  "!organizadores",
  "!organizador",
  "!quitarorganizador",
  "!mapas"
]

const comandosStats = [
  "!top",
  "!topkills",
  "!stats",
  "!jugadores",
  "!comandos",
  "!ping",
  "!resetstats"
]

const comandosResultados = [
  "!cw",
  "!resultadomix",
  "!resultadocw",
  "!confirmar",
  "!editar",
  "!edit"
]

const comandosValidos = [
  ...comandosMix,
  ...comandosStats,
  ...comandosResultados
]

// =====================================================
// JUGADORES LOCAL BACKUP
// =====================================================

function cargarJugadores() {
  try {
    if (!fs.existsSync(pathJugadores)) return {}
    const data = fs.readFileSync(pathJugadores, "utf8")
    return JSON.parse(data)
  } catch (error) {
    console.log("❌ Error cargando jugadores.json:", error.message)
    return {}
  }
}

function guardarJugadores(jugadores) {
  try {
    fs.writeFileSync(pathJugadores, JSON.stringify(jugadores, null, 2))
  } catch (error) {
    console.log("❌ Error guardando jugadores.json:", error.message)
  }
}

const jugadoresRegistrados = cargarJugadores()

// =====================================================
// WHATSAPP / BAILEYS
// =====================================================

async function conectarWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("session")

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" })
  })

  global.sockGlobal = sock
  sockGlobal = sock

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", ({ connection, qr }) => {
    if (qr) {
      console.log("📱 ESCANEÁ EL QR")
      console.log(qr)
    }

    if (connection === "open") {
      console.log("✅ BOT CONECTADO")
    }

    if (connection === "close") {
      console.log("❌ CONEXIÓN CERRADA")
      conectarWhatsApp()
    }
  })
}

// =====================================================
// HELPERS GENERALES
// =====================================================

function limpiarNumero(numero) {
  return String(numero || "").replace(/\D/g, "")
}

function normalizarTexto(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

function obtenerComando(mensaje) {
  return String(mensaje || "").trim().toLowerCase().split(/\s+/)[0]
}

function esGrupoTelefono(telefono, body) {
  return Boolean(body?.isGroup) || String(telefono || "").includes("-group")
}

function mezclarArray(array) {
  return [...array].sort(() => Math.random() - 0.5)
}

function esMensajeDelBot(body, telefonoJugador, telefonoGrupo) {
  return (
    body?.fromMe === true ||
    body?.isMe === true ||
    body?.fromApi === true ||
    body?.senderName === NOMBRE_BOT ||
    telefonoJugador === telefonoGrupo
  )
}

function registrarMensajeProcesado(clave, ttl = 120000) {
  if (global.ultimosMensajes[clave]) return false

  global.ultimosMensajes[clave] = true

  setTimeout(() => {
    delete global.ultimosMensajes[clave]
  }, ttl)

  return true
}

function formatoListaMix() {
  if (!jugadoresMix.length) return "Lista vacía."

  return jugadoresMix
    .map((j, i) => `${i + 1}. ${j.nick || j.nombre || "Sin nombre"}`)
    .join("\n")
}

// =====================================================
// HELPERS OCR / MATCHING DE NOMBRES
// =====================================================

function limpiarNombreOCR(nombre) {
  return String(nombre || "")
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/ffva|fpva|fva|ffvai/g, " ")
    .replace(/c4ar|caar|c4a/g, " ")
    .replace(/c4ac|c4c/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/[^a-z0-9áéíóúñ\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function similitudNombre(a, b) {
  a = limpiarNombreOCR(a)
  b = limpiarNombreOCR(b)

  if (!a || !b) return 0
  if (a.includes(b) || b.includes(a)) return 100

  const similitud = stringSimilarity.compareTwoStrings(a, b)
  return Math.round(similitud * 100)
}

function buscarJugadorRegistrado(nombreOCR, jugadores) {
  let mejor = null
  let mejorScore = 0

  const nombreLimpioOCR = limpiarNombreOCR(nombreOCR)

  for (const clave in jugadores) {
    const jugador = jugadores[clave]

    const posiblesNombres = [
      jugador.nick,
      jugador.nombre,
      jugador.id,
      jugador.idgame,
      jugador.idGame,
      ...(jugador.alias || [])
    ]
      .filter(Boolean)
      .map(n => limpiarNombreOCR(n))

    for (const nombreRegistrado of posiblesNombres) {
      const score = similitudNombre(nombreLimpioOCR, nombreRegistrado)

      if (score > mejorScore) {
        mejorScore = score
        mejor = {
          ...jugador,
          telefono: jugador.telefono || jugador.numero,
          nombre: jugador.nick || jugador.nombre || jugador.id,
          score
        }
      }
    }
  }

  return mejorScore >= 45 ? mejor : null
}

// =====================================================
// Z-API — ENVIAR MENSAJES Y REACCIONES
// =====================================================

async function enviarMensaje(telefono, mensaje) {
  try {
    const respuesta = await fetch(
      `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_TOKEN}/send-text`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Token": process.env.ZAPI_CLIENT_TOKEN
        },
        body: JSON.stringify({
          phone: telefono,
          message: mensaje
        })
      }
    )

    const texto = await respuesta.text()

    console.log("STATUS ENVIO:", respuesta.status)
    console.log("RESPUESTA ZAPI:", texto)

    return { ok: respuesta.ok, status: respuesta.status, texto }
  } catch (error) {
    console.log("❌ ERROR ENVIAR MENSAJE:", error.message)
    return { ok: false, error }
  }
}

async function reaccionarMensaje(telefono, messageId, reaction) {
  try {
    if (!messageId) return

    const respuesta = await fetch(
      `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_TOKEN}/send-reaction`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Token": process.env.ZAPI_CLIENT_TOKEN
        },
        body: JSON.stringify({
          phone: telefono,
          reaction,
          messageId
        })
      }
    )

    const texto = await respuesta.text()

    console.log("STATUS REACTION:", respuesta.status)
    console.log("RESPUESTA REACTION:", texto)
  } catch (error) {
    console.log("❌ ERROR REACTION:", error.message)
  }
}

// =====================================================
// Z-API — GRUPOS
// =====================================================

async function cerrarChatGrupo(groupId) {
  try {
    const respuesta = await fetch(
      `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_TOKEN}/update-group-settings`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Token": process.env.ZAPI_CLIENT_TOKEN
        },
        body: JSON.stringify({
          phone: groupId,
          adminOnlyMessage: true,
          requireAdminApproval: true,
          adminOnlySettings: true,
          adminOnlyAddMember: true
        })
      }
    )

    const texto = await respuesta.text()

    console.log("STATUS CERRAR CHAT:", respuesta.status)
    console.log("RESPUESTA CERRAR CHAT:", texto)

    return respuesta.ok
  } catch (error) {
    console.log("❌ ERROR CERRAR CHAT:", error.message)
    return false
  }
}

async function abrirChatGrupo(groupId) {
  try {
    const respuesta = await fetch(
      `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_TOKEN}/update-group-settings`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Token": process.env.ZAPI_CLIENT_TOKEN
        },
        body: JSON.stringify({
          phone: groupId,
          adminOnlyMessage: false,
          requireAdminApproval: true,
          adminOnlySettings: true,
          adminOnlyAddMember: true
        })
      }
    )

    const texto = await respuesta.text()

    console.log("STATUS ABRIR CHAT:", respuesta.status)
    console.log("RESPUESTA ABRIR CHAT:", texto)

    return respuesta.ok
  } catch (error) {
    console.log("❌ ERROR ABRIR CHAT:", error.message)
    return false
  }
}

async function enviarEncuesta(groupId) {
  try {
    const respuesta = await fetch(
      `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_TOKEN}/send-poll`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Token": process.env.ZAPI_CLIENT_TOKEN
        },
        body: JSON.stringify({
          phone: groupId,
          message: "🗺️ PICK MAPA",
          pollMaxOptions: 1,
          poll: [
            { name: "Dune" },
            { name: "Rust" },
            { name: "Sandstone" },
            { name: "Province" },
            { name: "Prisión" },
            { name: "Hanami" },
            { name: "Breeze" }
          ]
        })
      }
    )

    const texto = await respuesta.text()

    console.log("STATUS ENCUESTA:", respuesta.status)
    console.log("RESPUESTA ENCUESTA:", texto)

    return respuesta.ok
  } catch (error) {
    console.log("❌ ERROR ENCUESTA:", error.message)
    return false
  }
}

// =====================================================
// SUPABASE — ORGANIZADORES
// =====================================================

async function obtenerOrganizadores() {
  const { data, error } = await supabase
    .from("Organizadores")
    .select("*")

  if (error) {
    console.log("❌ Error obteniendo organizadores:", error)
    return []
  }

  return data || []
}

async function esOrganizadorNumero(numero) {
  const numeroLimpio = limpiarNumero(numero)

  if (numeroLimpio === adminPrincipal) return true

  const organizadores = await obtenerOrganizadores()

  return organizadores.some(org =>
    limpiarNumero(org.numero) === numeroLimpio
  )
}

async function obtenerPermisos(numero) {
  const numeroLimpio = limpiarNumero(numero)
  const esAdminPrincipal = numeroLimpio === adminPrincipal
  const esOrganizador = await esOrganizadorNumero(numeroLimpio)

  return {
    numeroLimpio,
    esAdminPrincipal,
    esOrganizador,
    puedeOrganizar: esAdminPrincipal || esOrganizador
  }
}

// =====================================================
// SUPABASE — JUGADORES
// =====================================================

async function obtenerJugadorPorNumero(numero) {
  const numeroLimpio = limpiarNumero(numero)

  const { data, error } = await supabase
    .from("Jugadores")
    .select("*")
    .eq("numero", numeroLimpio)
    .maybeSingle()

  if (error) {
    console.log("❌ Error buscando jugador:", error)
    return null
  }

  return data || null
}

async function obtenerTodosLosJugadores() {
  const { data, error } = await supabase
    .from("Jugadores")
    .select("*")

  if (error) {
    console.log("❌ Error obteniendo jugadores:", error)
    return []
  }

  return data || []
}

function convertirJugadoresParaMatching(jugadoresDB) {
  const jugadoresParaMatching = {}

  for (const jugador of jugadoresDB || []) {
    jugadoresParaMatching[jugador.numero || jugador.id || jugador.idgame] = {
      ...jugador,
      nick: jugador.nombre,
      nombre: jugador.nombre,
      id: jugador.id,
      numero: jugador.numero,
      alias: []
    }
  }

  return jugadoresParaMatching
}

// =====================================================
// PANEL SIMPLE
// =====================================================

app.get("/", (req, res) => {
  res.send(`
    <h1>🔥 C4 BOT ONLINE</h1>
    <p>Bot funcionando correctamente.</p>
    <p>Grupo Mix: ${GRUPO_MIX}</p>
    <p>Grupo Stats: ${GRUPO_STATS}</p>
  `)
})

// =====================================================
// PARTE 2/4 — MIX C4
// =====================================================

// =====================================================
// REGISTRO
// =====================================================

async function registrarJugador({
  telefono,
  nick,
  idGame,
  rol
}) {
  const numeroLimpio = limpiarNumero(telefono)

  jugadoresRegistrados[numeroLimpio] = {
    nick,
    idGame,
    telefono: numeroLimpio,
    rol
  }

  guardarJugadores(jugadoresRegistrados)

  const { data: jugadorExistente } = await supabase
    .from("Jugadores")
    .select("*")
    .or(`numero.eq.${numeroLimpio},idgame.eq.${idGame}`)
    .limit(1)
    .maybeSingle()

  if (jugadorExistente) {
    const { error } = await supabase
      .from("Jugadores")
      .update({
        nombre: nick,
        numero: numeroLimpio,
        idgame: idGame,
        rol
      })
      .eq("id", jugadorExistente.id)

    if (error) {
      console.log("❌ ERROR UPDATE REGISTRO:", error)
      return false
    }

    return "actualizado"
  }

  const { error } = await supabase
    .from("Jugadores")
    .insert([
      {
        nombre: nick,
        numero: numeroLimpio,
        idgame: idGame,
        rol,

        kills: 0,
        muertes: 0,
        victorias: 0,
        derrotas: 0,
        puntos: 0,

        kills_mix: 0,
        deaths_mix: 0,
        assists_mix: 0,
        points_mix: 0,
        wins_mix: 0,
        losses_mix: 0,

        kills_cw: 0,
        deaths_cw: 0,
        assists_cw: 0,
        points_cw: 0,
        wins_cw: 0,
        losses_cw: 0,

        racha_actual: 0,
        racha_maxima: 0
      }
    ])

  if (error) {
    console.log("❌ ERROR INSERT REGISTRO:", error)
    return false
  }

  return "nuevo"
}

// =====================================================
// MIX
// =====================================================

function resetearMix() {
  mixAbierto = false
  jugadoresMix = []
  equiposMixActual = null
}

async function abrirMix(telefono) {
  mixAbierto = true
  jugadoresMix = []
  equiposMixActual = null

  await enviarMensaje(
    telefono,
`🔥 MIX ABIERTA

📥 Entrá usando:
!entrar

👥 Slots:
0/10`
  )
}

async function cerrarMix(telefono) {
  mixAbierto = false

  await enviarMensaje(
    telefono,
    "🔒 Mix cerrada."
  )
}

async function reiniciarMix(telefono) {
  resetearMix()

  await enviarMensaje(
    telefono,
    "♻️ Mix reiniciada correctamente."
  )
}

// =====================================================
// ENTRAR MIX
// =====================================================

async function entrarMix({
  telefonoGrupo,
  telefonoJugador
}) {
  if (!mixAbierto) {
    await enviarMensaje(
      telefonoGrupo,
      "❌ No hay ninguna mix abierta."
    )
    return
  }

  const jugadorDB = await obtenerJugadorPorNumero(telefonoJugador)

  if (!jugadorDB) {
    await enviarMensaje(
      telefonoGrupo,
`❌ No estás registrado.

Usá:
!registrar NICK ID ROL`
    )
    return
  }

  const yaEsta = jugadoresMix.find(j =>
    limpiarNumero(j.numero) === limpiarNumero(telefonoJugador)
  )

  if (yaEsta) {
    await enviarMensaje(
      telefonoGrupo,
      `⚠️ ${jugadorDB.nombre} ya está dentro de la mix.`
    )
    return
  }

  if (jugadoresMix.length >= 10) {
    await enviarMensaje(
      telefonoGrupo,
      "⛔ La mix ya está llena."
    )
    return
  }

  jugadoresMix.push(jugadorDB)

  const slots = jugadoresMix.length

  await enviarMensaje(
    telefonoGrupo,
`✅ ${jugadorDB.nombre} entró a la mix.

👥 Slots:
${slots}/10

${formatoListaMix()}`
  )

  if (jugadoresMix.length >= 10) {
    await completarMix(telefonoGrupo)
  }
}

// =====================================================
// SALIR MIX
// =====================================================

async function salirMix({
  telefonoGrupo,
  telefonoJugador
}) {
  const index = jugadoresMix.findIndex(j =>
    limpiarNumero(j.numero) === limpiarNumero(telefonoJugador)
  )

  if (index === -1) {
    await enviarMensaje(
      telefonoGrupo,
      "❌ No estás dentro de la mix."
    )
    return
  }

  const jugador = jugadoresMix[index]

  jugadoresMix.splice(index, 1)

  await enviarMensaje(
    telefonoGrupo,
`🚪 ${jugador.nombre} salió de la mix.

👥 Slots:
${jugadoresMix.length}/10

${formatoListaMix()}`
  )
}

// =====================================================
// COMPLETAR MIX
// =====================================================

async function completarMix(telefonoGrupo) {
  mixAbierto = false

  const mezclados = mezclarArray(jugadoresMix)

  const equipoA = mezclados.slice(0, 5)
  const equipoB = mezclados.slice(5, 10)

  equiposMixActual = {
    equipoA,
    equipoB
  }

  let mensaje = "🔥 MIX COMPLETA — 10/10\n\n"

  mensaje += "🔵 EQUIPO A\n"
  equipoA.forEach((j, i) => {
    mensaje += `${i + 1}. ${j.nombre}\n`
  })

  mensaje += "\n🔴 EQUIPO B\n"
  equipoB.forEach((j, i) => {
    mensaje += `${i + 1}. ${j.nombre}\n`
  })

  mensaje += "\n🗺️ Enviando votación de mapa..."

  await enviarMensaje(telefonoGrupo, mensaje)

  votacionActiva = true
  votosMapa = {}

  await enviarEncuesta(telefonoGrupo)

  await cerrarChatGrupo(telefonoGrupo)

  chatMixActivo = false

  await enviarMensaje(
    telefonoGrupo,
    "🔒 Chat cerrado automáticamente."
  )
}

// =====================================================
// FAKE10
// =====================================================

async function fake10(telefonoGrupo) {
  jugadoresMix = []

  for (let i = 1; i <= 10; i++) {
    jugadoresMix.push({
      nombre: `FakePlayer${i}`,
      numero: `000${i}`
    })
  }

  await completarMix(telefonoGrupo)
}

// =====================================================
// COMANDOS / INFO
// =====================================================

async function enviarComandosMix(telefono) {
  await enviarMensaje(
    telefono,
`🎮 COMANDOS MIX C4

📝 REGISTRO
!registrar NICK ID ROL
!editregistro

🎮 MIX
!abrirmix
!cerrarmix
!reiniciarmix
!entrar
!salir

🔒 CHAT
!cerrarchat
!abrirchat

🗺️ OTROS
!mapas
!comandos`
  )
}

async function enviarMapas(telefono) {
  await enviarMensaje(
    telefono,
`🗺️ MAP POOL C4

• Dune
• Rust
• Sandstone
• Province
• Prisión
• Hanami
• Breeze`
  )
}

// =====================================================
// ANTISPAM / MUTE
// =====================================================

async function advertirSpam({
  telefonoGrupo,
  telefonoJugador,
  messageId,
  duracion
}) {
  antiSpam[telefonoJugador] =
    (antiSpam[telefonoJugador] || 0) + 1

  const advertencias = antiSpam[telefonoJugador]

  await reaccionarMensaje(
    telefonoGrupo,
    messageId,
    "❌"
  )

  if (advertencias >= 4) {
    usuariosMuteados[telefonoJugador] =
      Date.now() + duracion

    antiSpam[telefonoJugador] = 0

    const horas = Math.floor(
      duracion / (1000 * 60 * 60)
    )

    await enviarMensaje(
      telefonoGrupo,
`⛔ Usuario bloqueado temporalmente.

⏳ Duración:
${horas} horas`
    )

    return
  }

  await enviarMensaje(
    telefonoGrupo,
`⚠️ Solo se permiten comandos.

Advertencias:
${advertencias}/4`
  )
    }

// =====================================================
// PARTE 3/4 — STATS + RESULTADOS + OCR
// =====================================================

// =====================================================
// STATS
// =====================================================

function calcKD(kills, muertes) {
  return Number(muertes || 0) > 0
    ? (Number(kills || 0) / Number(muertes || 0)).toFixed(2)
    : Number(kills || 0).toFixed(2)
}

function calcWR(victorias, derrotas) {
  const total =
    Number(victorias || 0) +
    Number(derrotas || 0)

  if (total <= 0) return "0.0"

  return (
    (Number(victorias || 0) / total) * 100
  ).toFixed(1)
}

// =====================================================
// TOP GLOBAL
// =====================================================

async function enviarTopGlobal(telefono) {
  const { data: jugadores, error } = await supabase
    .from("Jugadores")
    .select("nombre,puntos,rol")
    .order("puntos", { ascending: false })

  if (error || !jugadores) {
    await enviarMensaje(
      telefono,
      "❌ Error cargando ranking."
    )
    return
  }

  const jugadoresConPuntos = jugadores.filter(
    j => (j.puntos || 0) > 0
  )

  if (!jugadoresConPuntos.length) {
    await enviarMensaje(
      telefono,
      "📊 Todavía no hay jugadores con puntos."
    )
    return
  }

  const tier1 = jugadoresConPuntos.slice(0, 6)
  const tier2 = jugadoresConPuntos.slice(6, 16)
  const tier3 = jugadoresConPuntos.slice(16)

  const formato = (lista, inicio) =>
    "```\n" +
    lista.map((j, i) => {
      const pos = `${inicio + i}°`
      const nombre = `${j.nombre || "Sin nombre"}${j.rol ? ` (${j.rol})` : ""}`
      const puntos = `${j.puntos || 0} pts`

      return `${pos.padEnd(4)} ${nombre.padEnd(25)} ${puntos}`
    }).join("\n") +
    "\n```"

  await enviarMensaje(
    telefono,
`🏆 TOP GLOBAL C4

🥇 TIER 1
${tier1.length ? formato(tier1, 1) : "Sin jugadores"}

🥈 TIER 2
${tier2.length ? formato(tier2, 7) : "Sin jugadores"}

🥉 TIER 3
${tier3.length ? formato(tier3, 17) : "Sin jugadores"}`
  )
}

// =====================================================
// TOP KILLS
// =====================================================

async function enviarTopKills(telefono) {
  const { data: jugadores, error } = await supabase
    .from("Jugadores")
    .select("nombre,rol,kills")
    .order("kills", { ascending: false })

  if (error || !jugadores) {
    await enviarMensaje(
      telefono,
      "❌ Error cargando top kills."
    )
    return
  }

  const top = jugadores
    .filter(j => (j.kills || 0) > 0)
    .slice(0, 10)

  if (!top.length) {
    await enviarMensaje(
      telefono,
      "🔫 No hay kills registradas."
    )
    return
  }

  const texto = top.map((j, i) => {
    return `${i + 1}° ${(j.nombre || "").padEnd(20)} ${j.kills} kills`
  }).join("\n")

  await enviarMensaje(
    telefono,
`🔫 TOP KILLS C4

\`\`\`
${texto}
\`\`\``
  )
}

// =====================================================
// STATS PERSONALES
// =====================================================

async function enviarStatsJugador({
  telefonoGrupo,
  telefonoJugador
}) {
  const jugador = await obtenerJugadorPorNumero(
    telefonoJugador
  )

  if (!jugador) {
    await enviarMensaje(
      telefonoGrupo,
      "❌ Jugador no encontrado."
    )
    return
  }

  const kdGeneral = calcKD(
    jugador.kills,
    jugador.muertes
  )

  const wrGeneral = calcWR(
    jugador.victorias,
    jugador.derrotas
  )

  const kdMix = calcKD(
    jugador.kills_mix,
    jugador.deaths_mix
  )

  const wrMix = calcWR(
    jugador.wins_mix,
    jugador.losses_mix
  )

  const kdCW = calcKD(
    jugador.kills_cw,
    jugador.deaths_cw
  )

  const wrCW = calcWR(
    jugador.wins_cw,
    jugador.losses_cw
  )

  await enviarMensaje(
    telefonoGrupo,
`📊 STATS — ${jugador.nombre}

🛡️ Rol:
${jugador.rol || "Sin rol"}

\`\`\`
GENERALES
Kills:     ${jugador.kills || 0}
Muertes:   ${jugador.muertes || 0}
Puntos:    ${jugador.puntos || 0}
Victorias: ${jugador.victorias || 0}
Derrotas:  ${jugador.derrotas || 0}
WR:        ${wrGeneral}%
KD:        ${kdGeneral}

MIX
Kills:     ${jugador.kills_mix || 0}
Muertes:   ${jugador.deaths_mix || 0}
Puntos:    ${jugador.points_mix || 0}
Victorias: ${jugador.wins_mix || 0}
Derrotas:  ${jugador.losses_mix || 0}
WR:        ${wrMix}%
KD:        ${kdMix}

CW
Kills:     ${jugador.kills_cw || 0}
Muertes:   ${jugador.deaths_cw || 0}
Puntos:    ${jugador.points_cw || 0}
Victorias: ${jugador.wins_cw || 0}
Derrotas:  ${jugador.losses_cw || 0}
WR:        ${wrCW}%
KD:        ${kdCW}
\`\`\``
  )
}

// =====================================================
// OCR
// =====================================================

async function prepararImagenOCR(bufferImagen) {
  const metadata = await sharp(bufferImagen).metadata()

  const prepararColumna = async (
    leftPct,
    widthPct
  ) => {
    return sharp(bufferImagen)
      .extract({
        left: Math.round(metadata.width * leftPct),
        top: Math.round(metadata.height * 0.10),
        width: Math.round(metadata.width * widthPct),
        height: Math.round(metadata.height * 0.68)
      })
      .resize({ width: 1600 })
      .grayscale()
      .normalize()
      .modulate({
        brightness: 1.15,
        saturation: 0
      })
      .sharpen({
        sigma: 1.5
      })
      .threshold(130)
      .png()
      .toBuffer()
  }

  const izquierda = await prepararColumna(
    0.02,
    0.47
  )

  const derecha = await prepararColumna(
    0.51,
    0.47
  )

  return {
    izquierda,
    derecha
  }
}

async function procesarOCR(imageUrl) {
  const bufferImagen = await axios.get(
    imageUrl,
    {
      responseType: "arraybuffer"
    }
  )

  const {
    izquierda,
    derecha
  } = await prepararImagenOCR(
    bufferImagen.data
  )

  const ocrIzquierda =
    await Tesseract.recognize(
      izquierda,
      "eng"
    )

  const ocrDerecha =
    await Tesseract.recognize(
      derecha,
      "eng"
    )

  return `
${ocrIzquierda.data.text}

${ocrDerecha.data.text}
`
}

// =====================================================
// EXTRAER JUGADORES OCR
// =====================================================

function extraerJugadoresOCR(textoOCR) {
  const lineasUtiles = textoOCR
    .split("\n")
    .map(l => l.trim())
    .filter(l => {
      const numeros = l.match(/\d+/g) || []

      return (
        l.length > 8 &&
        numeros.length >= 3
      )
    })

  return lineasUtiles
    .map(linea => {
      const lineaSinDinero =
        linea.replace(/\d+\s*\$/g, " ")

      const numeros =
        lineaSinDinero.match(/\d+/g) || []

      if (numeros.length < 5) return null

      const ultimosCinco =
        numeros.slice(-5)

      const [
        _,
        bajas,
        asistencias,
        muertes,
        puntos
      ] = ultimosCinco

      const statsMatch =
        lineaSinDinero.match(
          /(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/
        )

      let nombre = lineaSinDinero

      if (statsMatch) {
        nombre = lineaSinDinero
          .slice(0, statsMatch.index)
      }

      nombre = nombre
        .replace(/[^\p{L}\d'\[\]\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()

      return {
        nombre,
        bajas: Number(bajas || 0),
        asistencias: Number(asistencias || 0),
        muertes: Number(muertes || 0),
        puntos: Number(puntos || 0)
      }
    })
    .filter(Boolean)
}

// =====================================================
// RESULTADO PENDIENTE
// =====================================================

async function crearResultadoPendiente({
  telefonoGrupo,
  modo,
  estado,
  jugadoresOCR
}) {
  resultadoPendiente = {
    modo,
    estado,
    jugadores: jugadoresOCR,
    fecha: new Date().toISOString()
  }

  const resumen =
    jugadoresOCR
      .map(j =>
`• ${j.nombre}
B:${j.bajas}
A:${j.asistencias}
M:${j.muertes}
Pts:${j.puntos}`
      )
      .join("\n\n")

  await enviarMensaje(
    telefonoGrupo,
`📊 Resultado pendiente

${resumen}

✅ Confirmar:
!confirmar

✏️ Editar:
!edit`
  )
}

// =====================================================
// CONFIRMAR RESULTADO
// =====================================================

async function confirmarResultado(
  telefonoGrupo
) {
  if (
    !resultadoPendiente ||
    !resultadoPendiente.jugadores
  ) {
    await enviarMensaje(
      telefonoGrupo,
      "❌ No hay resultados pendientes."
    )
    return
  }

  const jugadoresDB =
    await obtenerTodosLosJugadores()

  const jugadoresMatching =
    convertirJugadoresParaMatching(
      jugadoresDB
    )

  for (const jugadorResultado of resultadoPendiente.jugadores) {
    const match =
      buscarJugadorRegistrado(
        jugadorResultado.nombre,
        jugadoresMatching
      )

    if (!match) continue

    const jugadorReal =
      jugadoresDB.find(
        j => j.id === match.id
      )

    if (!jugadorReal) continue

    const gano =
      resultadoPendiente.estado === "victoria"

    const updateData = {
      kills:
        Number(jugadorReal.kills || 0) +
        Number(jugadorResultado.bajas || 0),

      muertes:
        Number(jugadorReal.muertes || 0) +
        Number(jugadorResultado.muertes || 0),

      puntos:
        Number(jugadorReal.puntos || 0) +
        Number(jugadorResultado.puntos || 0),

      victorias:
        Number(jugadorReal.victorias || 0) +
        (gano ? 1 : 0),

      derrotas:
        Number(jugadorReal.derrotas || 0) +
        (gano ? 0 : 1)
    }

    if (
      resultadoPendiente.modo === "mix"
    ) {
      updateData.kills_mix =
        Number(jugadorReal.kills_mix || 0) +
        Number(jugadorResultado.bajas || 0)

      updateData.deaths_mix =
        Number(jugadorReal.deaths_mix || 0) +
        Number(jugadorResultado.muertes || 0)

      updateData.assists_mix =
        Number(jugadorReal.assists_mix || 0) +
        Number(jugadorResultado.asistencias || 0)

      updateData.points_mix =
        Number(jugadorReal.points_mix || 0) +
        Number(jugadorResultado.puntos || 0)

      updateData.wins_mix =
        Number(jugadorReal.wins_mix || 0) +
        (gano ? 1 : 0)

      updateData.losses_mix =
        Number(jugadorReal.losses_mix || 0) +
        (gano ? 0 : 1)
    }

    if (
      resultadoPendiente.modo === "cw"
    ) {
      updateData.kills_cw =
        Number(jugadorReal.kills_cw || 0) +
        Number(jugadorResultado.bajas || 0)

      updateData.deaths_cw =
        Number(jugadorReal.deaths_cw || 0) +
        Number(jugadorResultado.muertes || 0)

      updateData.assists_cw =
        Number(jugadorReal.assists_cw || 0) +
        Number(jugadorResultado.asistencias || 0)

      updateData.points_cw =
        Number(jugadorReal.points_cw || 0) +
        Number(jugadorResultado.puntos || 0)

      updateData.wins_cw =
        Number(jugadorReal.wins_cw || 0) +
        (gano ? 1 : 0)

      updateData.losses_cw =
        Number(jugadorReal.losses_cw || 0) +
        (gano ? 0 : 1)
    }

    await supabase
      .from("Jugadores")
      .update(updateData)
      .eq("id", jugadorReal.id)
  }

  resultadoPendiente = null

  await enviarMensaje(
    telefonoGrupo,
    "✅ Resultado confirmado correctamente."
  )
        }

// =====================================================
// PARTE 4/4 — WEBHOOK FINAL + ROUTER + SERVER
// =====================================================

// =====================================================
// WEBHOOK
// =====================================================

app.post("/webhook", async (req, res) => {
  try {
    console.log("📩 WEBHOOK RECIBIDO")

    const body = req.body || {}

    const mensaje =
      body?.text?.message ||
      body?.conversation ||
      ""

    const telefonoGrupo =
      body?.phone ||
      body?.chatId ||
      body?.from ||
      ""

    const telefonoJugador =
      body?.participantPhone ||
      body?.senderPhone ||
      body?.author ||
      body?.from ||
      ""

    const messageId =
      body?.messageId ||
      body?.id ||
      ""

    const captionImagen =
      body?.image?.caption || ""

    const imageUrl =
      body?.image?.imageUrl || ""

    const esGrupo = esGrupoTelefono(
      telefonoGrupo,
      body
    )

    // =====================================================
    // IGNORAR MENSAJES DEL BOT
    // =====================================================

    if (
      esMensajeDelBot(
        body,
        telefonoJugador,
        telefonoGrupo
      )
    ) {
      return res.sendStatus(200)
    }

    // =====================================================
    // EVITAR DUPLICADOS
    // =====================================================

    const marcaMensaje =
      body?.messageTimestamp ||
      body?.timestamp ||
      body?.momment ||
      Date.now()

    const claveMensaje =
      `${telefonoGrupo}_${mensaje}_${marcaMensaje}`

    const permitido =
      registrarMensajeProcesado(
        claveMensaje
      )

    if (!permitido) {
      return res.sendStatus(200)
    }

    // =====================================================
    // PERMISOS
    // =====================================================

    const permisos =
      await obtenerPermisos(
        telefonoJugador
      )

    const {
      numeroLimpio,
      esAdminPrincipal,
      esOrganizador,
      puedeOrganizar
    } = permisos

    // =====================================================
    // COMANDO
    // =====================================================

    const comando = obtenerComando(
      mensaje || captionImagen
    )

    // =====================================================
    // IGNORAR PRIVADOS
    // =====================================================

    if (!esGrupo && !esAdminPrincipal) {
      return res.sendStatus(200)
    }

    // =====================================================
    // USUARIO MUTEADO
    // =====================================================

    if (
      usuariosMuteados[telefonoJugador] &&
      usuariosMuteados[telefonoJugador] > Date.now()
    ) {
      const restante =
        usuariosMuteados[telefonoJugador] -
        Date.now()

      const horas = Math.floor(
        restante / (1000 * 60 * 60)
      )

      const minutos = Math.ceil(
        (
          restante %
          (1000 * 60 * 60)
        ) /
        (1000 * 60)
      )

      await reaccionarMensaje(
        telefonoGrupo,
        messageId,
        "⛔"
      )

      await enviarMensaje(
        telefonoGrupo,
`⛔ Estás bloqueado temporalmente.

⏳ Tiempo restante:
${horas}h ${minutos}m`
      )

      return res.sendStatus(200)
    }

    // =====================================================
    // REACCIONES
    // =====================================================

    if (mensaje.startsWith("!")) {
      await reaccionarMensaje(
        telefonoGrupo,
        messageId,
        "✅"
      )
    } else {
      await reaccionarMensaje(
        telefonoGrupo,
        messageId,
        "❌"
      )
    }

    // =====================================================
    // BLOQUEAR CHAT MIX
    // =====================================================

    if (
      telefonoGrupo === GRUPO_MIX &&
      !mensaje.startsWith("!")
    ) {
      await advertirSpam({
        telefonoGrupo,
        telefonoJugador,
        messageId,
        duracion: DURACION_MUTE_MIX
      })

      return res.sendStatus(200)
    }

    // =====================================================
    // BLOQUEAR CHAT STATS
    // =====================================================

    if (
      telefonoGrupo === GRUPO_STATS &&
      !mensaje.startsWith("!")
    ) {
      await advertirSpam({
        telefonoGrupo,
        telefonoJugador,
        messageId,
        duracion: DURACION_MUTE_STATS
      })

      return res.sendStatus(200)
    }

    // =====================================================
    // COMANDOS MIX SOLO EN MIX
    // =====================================================

    if (
      comandosMix.includes(comando) &&
      telefonoGrupo !== GRUPO_MIX &&
      comando !== "!comandos"
    ) {
      await enviarMensaje(
        telefonoGrupo,
        "❌ Los comandos MIX solo pueden usarse en el grupo Mix."
      )

      return res.sendStatus(200)
    }

    // =====================================================
    // COMANDOS STATS SOLO EN STATS
    // =====================================================

    if (
      comandosStats.includes(comando) &&
      telefonoGrupo !== GRUPO_STATS
    ) {
      await enviarMensaje(
        telefonoGrupo,
        "❌ Los comandos STATS solo pueden usarse en el grupo Stats."
      )

      return res.sendStatus(200)
    }

    // =====================================================
    // REGISTRO
    // =====================================================

    if (comando === "!registrar") {
      const partes =
        mensaje.trim().split(/\s+/)

      if (partes.length < 4) {
        await enviarMensaje(
          telefonoGrupo,
`❌ Formato incorrecto

Usá:
!registrar NICK ID ROL`
        )

        return res.sendStatus(200)
      }

      const rol =
        partes[partes.length - 1]

      const idGame =
        String(
          partes[partes.length - 2]
        ).replace(/\D/g, "")

      const nick =
        partes
          .slice(1, -2)
          .join(" ")
          .trim()

      const resultado =
        await registrarJugador({
          telefono: telefonoJugador,
          nick,
          idGame,
          rol
        })

      if (!resultado) {
        await enviarMensaje(
          telefonoGrupo,
          "❌ Error registrando jugador."
        )

        return res.sendStatus(200)
      }

      await reaccionarMensaje(
        telefonoGrupo,
        messageId,
        resultado === "nuevo"
          ? "📝"
          : "♻️"
      )

      await enviarMensaje(
        telefonoGrupo,
`${resultado === "nuevo"
  ? "✅ Jugador registrado"
  : "♻️ Registro actualizado"}

🎮 Nick: ${nick}
🆔 ID: ${idGame}
🛡️ Rol: ${rol}`
      )

      return res.sendStatus(200)
    }

    // =====================================================
    // EDIT REGISTRO
    // =====================================================

    if (comando === "!editregistro") {
      const partes =
        mensaje.trim().split(/\s+/)

      if (partes.length < 4) {
        await enviarMensaje(
          telefonoGrupo,
          "❌ Formato incorrecto."
        )

        return res.sendStatus(200)
      }

      const rol =
        partes[partes.length - 1]

      const idGame =
        partes[partes.length - 2]

      const nick =
        partes
          .slice(1, -2)
          .join(" ")

      const resultado =
        await registrarJugador({
          telefono: telefonoJugador,
          nick,
          idGame,
          rol
        })

      await enviarMensaje(
        telefonoGrupo,
`♻️ Registro actualizado

🎮 Nick: ${nick}
🆔 ID: ${idGame}
🛡️ Rol: ${rol}`
      )

      return res.sendStatus(200)
    }

    // =====================================================
    // ABRIR MIX
    // =====================================================

    if (comando === "!abrirmix") {
      if (!puedeOrganizar) {
        return res.sendStatus(200)
      }

      await abrirMix(
        telefonoGrupo
      )

      return res.sendStatus(200)
    }

    // =====================================================
    // CERRAR MIX
    // =====================================================

    if (comando === "!cerrarmix") {
      if (!puedeOrganizar) {
        return res.sendStatus(200)
      }

      await cerrarMix(
        telefonoGrupo
      )

      return res.sendStatus(200)
    }

    // =====================================================
    // REINICIAR MIX
    // =====================================================

    if (comando === "!reiniciarmix") {
      if (!puedeOrganizar) {
        return res.sendStatus(200)
      }

      await reiniciarMix(
        telefonoGrupo
      )

      return res.sendStatus(200)
    }

    // =====================================================
    // ENTRAR
    // =====================================================

    if (comando === "!entrar") {
      await entrarMix({
        telefonoGrupo,
        telefonoJugador
      })

      return res.sendStatus(200)
    }

    // =====================================================
    // SALIR
    // =====================================================

    if (comando === "!salir") {
      await salirMix({
        telefonoGrupo,
        telefonoJugador
      })

      return res.sendStatus(200)
    }

    // =====================================================
    // ABRIR CHAT
    // =====================================================

    if (comando === "!abrirchat") {
      if (!puedeOrganizar) {
        return res.sendStatus(200)
      }

      await abrirChatGrupo(
        telefonoGrupo
      )

      await enviarMensaje(
        telefonoGrupo,
        "🔓 Chat abierto."
      )

      return res.sendStatus(200)
    }

    // =====================================================
    // CERRAR CHAT
    // =====================================================

    if (comando === "!cerrarchat") {
      if (!puedeOrganizar) {
        return res.sendStatus(200)
      }

      await cerrarChatGrupo(
        telefonoGrupo
      )

      await enviarMensaje(
        telefonoGrupo,
        "🔒 Chat cerrado."
      )

      return res.sendStatus(200)
    }

    // =====================================================
    // FAKE10
    // =====================================================

    if (comando === "!fake10") {
      if (!puedeOrganizar) {
        return res.sendStatus(200)
      }

      await fake10(
        telefonoGrupo
      )

      return res.sendStatus(200)
    }

    // =====================================================
    // COMANDOS
    // =====================================================

    if (comando === "!comandos") {
      if (
        telefonoGrupo === GRUPO_MIX
      ) {
        await enviarComandosMix(
          telefonoGrupo
        )
      }

      if (
        telefonoGrupo === GRUPO_STATS
      ) {
        await enviarMensaje(
          telefonoGrupo,
`📊 COMANDOS STATS

!stats
!top
!topkills
!ping`
        )
      }

      return res.sendStatus(200)
    }

    // =====================================================
    // MAPAS
    // =====================================================

    if (comando === "!mapas") {
      await enviarMapas(
        telefonoGrupo
      )

      return res.sendStatus(200)
    }

    // =====================================================
    // PING
    // =====================================================

    if (comando === "!ping") {
      await enviarMensaje(
        telefonoGrupo,
`🏓 Pong!

🤖 Estado:
Online`
      )

      return res.sendStatus(200)
    }

    // =====================================================
    // TOP
    // =====================================================

    if (comando === "!top") {
      await enviarTopGlobal(
        telefonoGrupo
      )

      return res.sendStatus(200)
    }

    // =====================================================
    // TOP KILLS
    // =====================================================

    if (comando === "!topkills") {
      await enviarTopKills(
        telefonoGrupo
      )

      return res.sendStatus(200)
    }

    // =====================================================
    // STATS
    // =====================================================

    if (comando === "!stats") {
      await enviarStatsJugador({
        telefonoGrupo,
        telefonoJugador
      })

      return res.sendStatus(200)
    }

    // =====================================================
    // OCR RESULTADOS
    // =====================================================

    if (
      imageUrl &&
      (
        comando === "!resultadomix" ||
        comando === "!resultadocw"
      )
    ) {
      if (!puedeOrganizar) {
        return res.sendStatus(200)
      }

      await enviarMensaje(
        telefonoGrupo,
        "📸 Procesando resultado..."
      )

      const textoOCR =
        await procesarOCR(
          imageUrl
        )

      const jugadoresOCR =
        extraerJugadoresOCR(
          textoOCR
        )

      await crearResultadoPendiente({
        telefonoGrupo,
        modo:
          comando === "!resultadocw"
            ? "cw"
            : "mix",
        estado: "victoria",
        jugadoresOCR
      })

      return res.sendStatus(200)
    }

    // =====================================================
    // CONFIRMAR RESULTADO
    // =====================================================

    if (comando === "!confirmar") {
      if (!puedeOrganizar) {
        return res.sendStatus(200)
      }

      await confirmarResultado(
        telefonoGrupo
      )

      return res.sendStatus(200)
    }

    // =====================================================
    // EDIT RESULTADO
    // =====================================================

    if (
      comando === "!edit" ||
      comando === "!editar"
    ) {
      await enviarMensaje(
        telefonoGrupo,
`✏️ Edit manual todavía pendiente de integrar.

La estructura ya quedó preparada.`
      )

      return res.sendStatus(200)
    }

    return res.sendStatus(200)

  } catch (error) {
    console.log("❌ ERROR WEBHOOK:", error)

    return res.sendStatus(500)
  }
})

// =====================================================
// START
// =====================================================

const PORT =
  process.env.PORT || 3000

app.listen(PORT, async () => {
  console.log(
    `🔥 C4 BOT ONLINE EN PUERTO ${PORT}`
  )

  await conectarWhatsApp()
})
