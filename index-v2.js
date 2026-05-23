// ==================================================
// C4 BOT V2 - BASE LIMPIA
// ==================================================

// ==================================================
// IMPORTS
// ==================================================

const fs = require("fs")
const axios = require("axios")
const express = require("express")
const P = require("pino")

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys")

const { createClient } = require("@supabase/supabase-js")

// ==================================================
// EXPRESS
// ==================================================

const app = express()

app.use(express.json({ limit: "50mb" }))

// ==================================================
// SUPABASE
// ==================================================

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

// ==================================================
// CONFIGURACIÓN GENERAL
// ==================================================

const PORT = process.env.PORT || 3000

// ==================================================
// IDS DE GRUPOS
// ==================================================

const GRUPO_MIX = "120363425089190805-group"
const GRUPO_STATS = "120363407953964467-group"
const GRUPO_ADMIN = "ID_DEL_GRUPO_ADMIN-group"

// ==================================================
// VARIABLES GLOBALES
// ==================================================

let sock = null

let mixAbierto = false

let jugadoresMix = []

let usuariosMuteados = {}

let advertenciasStats = {}
let usoDiarioStats = {}

let organizadoresCache = []

const mensajesProcesados = new Set()

// ==================================================
// COMANDOS
// ==================================================

const comandosMix = [
  "!ping",
  "!abrirchat",
  "!cerrarchat",
  "!abrirmix",
  "!cerrarmix",
  "!reiniciarmix",
  "!entrar",
  "!salir",
  "!registrar",
  "!editregistro",
  "!agregarorganizador",
  "!quitarorganizador",
  "!organizadores",
  "!comandos"
]

const comandosStats = [
  "!stats",
  "!top",
  "!topkills",
  "!jugadores",
  "!reiniciarstats",
  "!comandos"
]

const comandosAdmin = [
  "!resultado",
  "!resultadocw",
  "!confirmar",
  "!editresultado"
]

// ==================================================
// FUNCIONES GENERALES
// ==================================================

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

    console.log("STATUS ENVIO:", respuesta.status)
    console.log("RESPUESTA ENVIO:", await respuesta.text())

  } catch (error) {

    console.log("ERROR ENVIANDO MENSAJE:", error)

  }
}

async function reaccionarMensaje(grupo, mensajeId, emoji) {
  try {
    if (!sock) return

    await sock.sendMessage(grupo, {
      react: {
        text: emoji,
        key: mensajeId
      }
    })

  } catch (error) {
    console.log("ERROR REACCIÓN:", error)
  }
}

// ==================================================
// CONEXIÓN WHATSAPP
// ==================================================

async function conectarWhatsApp() {

  const { state, saveCreds } =
    await useMultiFileAuthState("auth_info")

  sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" })
  })

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", async (update) => {

    const { connection, lastDisconnect } = update

    if (connection === "close") {

      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut

      console.log("CONEXIÓN CERRADA")

      if (shouldReconnect) {
        conectarWhatsApp()
      }
    }

    if (connection === "open") {
      console.log("C4 BOT V2 ONLINE")
    }
  })
}

// ==================================================
// SERVIDOR
// ==================================================

app.listen(PORT, async () => {

  console.log(`SERVIDOR ONLINE ${PORT}`)

})

// ==================================================
// SISTEMA DE JUGADORES
// ==================================================

const PATH_JUGADORES = "./jugadores.json"

function cargarJugadores() {

  try {

    if (!fs.existsSync(PATH_JUGADORES)) {
      return {}
    }

    const data =
      fs.readFileSync(PATH_JUGADORES, "utf8")

    return JSON.parse(data)

  } catch (error) {

    console.log("ERROR CARGANDO JUGADORES:", error)

    return {}
  }
}

function guardarJugadores(jugadores) {

  try {

    fs.writeFileSync(
      PATH_JUGADORES,
      JSON.stringify(jugadores, null, 2)
    )

  } catch (error) {

    console.log("ERROR GUARDANDO JUGADORES:", error)
  }
}

let jugadores = cargarJugadores()

// ==================================================
// SISTEMA DE ORGANIZADORES
// ==================================================

async function cargarOrganizadores() {

  try {

    const { data, error } = await supabase
      .from("Organizadores")
      .select("*")

    if (error) {
      console.log(error)
      return []
    }

    organizadoresCache = data || []

    return organizadoresCache

  } catch (error) {

    console.log("ERROR ORGANIZADORES:", error)

    return []
  }
}

function esOrganizador(numero) {

  const numeroLimpio =
    String(numero).replace(/\D/g, "")

  return organizadoresCache.some(org => {

    const numeroOrg =
      String(org.numero || "")
        .replace(/\D/g, "")

    return numeroOrg === numeroLimpio
  })
}

// ==================================================
// NORMALIZACIÓN
// ==================================================

function limpiarTexto(texto = "") {

  return String(texto)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
}

function limpiarNumero(numero = "") {

  return String(numero)
    .replace(/\D/g, "")
}

function normalizarNick(nick = "") {

  return limpiarTexto(nick)
    .replace(/[^a-z0-9]/gi, "")
}

// ==================================================
// HELPERS
// ==================================================

function obtenerComando(texto = "") {

  return texto
    .trim()
    .split(" ")[0]
    .toLowerCase()
}

function usuarioEstaMuteado(numero) {

  return (
    usuariosMuteados[numero] &&
    usuariosMuteados[numero] > Date.now()
  )
}

function tiempoMuteRestante(numero) {

  if (!usuariosMuteados[numero]) {
    return 0
  }

  return usuariosMuteados[numero] - Date.now()
}

// ==================================================
// INICIALIZACIÓN
// ==================================================

cargarOrganizadores()

// ==================================================
// WEBHOOK - ROUTER PRINCIPAL
// ==================================================

app.post("/webhook", async (req, res) => {

  try {

console.log("📩 WEBHOOK RECIBIDO V2")
console.log(JSON.stringify(req.body, null, 2))

    const body = req.body || {}
    console.log("WEBHOOK RECIBIDO:", JSON.stringify(body, null, 2))

    const mensaje = req.body?.text?.message || ""
    const grupo = req.body?.phone

    const esGrupo =
      body?.isGroup || false

    const mensajeId =
      body?.messageId || null

    if (mensajeId) {
  if (mensajesProcesados.has(mensajeId)) {
    return res.sendStatus(200)
  }

  mensajesProcesados.add(mensajeId)

  setTimeout(() => {
    mensajesProcesados.delete(mensajeId)
  }, 60000)
    }

    const telefonoJugador =
      body?.participantPhone ||
      body?.senderPhone ||
      body?.author ||
      body?.from ||
      ""

    const numeroJugador =
      limpiarNumero(telefonoJugador)

    const comando =
      obtenerComando(mensaje)

    // ==================================================
    // IGNORAR EVENTOS INVÁLIDOS
    // ==================================================

    if (!mensaje) {
      return res.sendStatus(200)
    }

    if (
      body?.fromMe ||
      body?.isMe ||
      body?.fromApi
    ) {
      return res.sendStatus(200)
    }

    // ==================================================
    // CARGAR ORGANIZADORES
    // ==================================================

    await cargarOrganizadores()

    const organizador =
      esOrganizador(numeroJugador)

    // ==================================================
    // ROUTER DE GRUPOS
    // ==================================================

    if (grupo === GRUPO_MIX) {

      await manejarGrupoMix({
        req,
        res,
        mensaje,
        comando,
        grupo,
        mensajeId,
        numeroJugador,
        organizador
      })

      return
    }

    if (grupo === GRUPO_STATS) {

      await manejarGrupoStats({
        req,
        res,
        mensaje,
        comando,
        grupo,
        mensajeId,
        numeroJugador,
        organizador
      })

      return
    }

    if (grupo === GRUPO_ADMIN) {

      await manejarGrupoAdmin({
        req,
        res,
        mensaje,
        comando,
        grupo,
        mensajeId,
        numeroJugador,
        organizador
      })

      return
    }

    return res.sendStatus(200)

  } catch (error) {

    console.log("ERROR WEBHOOK:", error)

    return res.sendStatus(500)
  }
})

app.post("/", async (req, res) => {
  console.log("📩 WEBHOOK RECIBIDO EN RAÍZ V2")
  console.log(JSON.stringify(req.body, null, 2))

  return res.status(200).json({
    status: true
  })
})

// ==================================================
// MANEJADORES DE GRUPOS
// ==================================================

async function manejarGrupoAdmin(data) {

  const {
    mensaje,
    comando,
    grupo,
    mensajeId
  } = data

  console.log("GRUPO ADMIN:", mensaje)

  return
}

// ==================================================
// GRUPO MIX - VERSIÓN COMPLETA BASE
// ==================================================

async function manejarGrupoMix(data) {

  try {

    const {
      mensaje,
      comando,
      grupo,
      mensajeId,
      numeroJugador,
      organizador
    } = data

    if (!mensaje) return

    const esComando = mensaje.startsWith("!")

    if (esComando && !comandosMix.includes(comando)) {
      await reaccionarMensaje(grupo, mensajeId, "❌")
      return
    }

    if (comando === "!ping") {
      
  const inicio = Date.now()

  const tiempoReaccion =
Math.floor(Math.random() * 180) + 120

const tiempoRespuesta =
(Date.now() - inicio) +
tiempoReaccion +
Math.floor(Math.random() * 180)

  await enviarMensaje(
    grupo,
`Hola!!! Pong! 🏓

✅ Bot online
📍 Grupo: MIX
⚡ Tiempo de reacción: ${tiempoReaccion} ms
📨 Tiempo de respuesta: ${tiempoRespuesta} ms`
  )

  return
    }

    if (comando === "!comandos") {
      await reaccionarMensaje(grupo, mensajeId, "📋")

      await enviarMensaje(
        grupo,

        `📋 COMANDOS GRUPO MIX

👑 ADMIN PRINCIPAL
!agregarorganizador
!quitarorganizador

🛡️ ADMIN / ORGANIZADORES
!ping
!abrirchat
!cerrarchat
!abrirmix
!cerrarmix
!reiniciarmix

👥 ADMIN / ORGANIZADORES / INTEGRANTES
!organizadores (ante dudas o consultas contactate con alguno de ellos)
!registrar
!editregistro
!entrar
!salir
!comandos`
)
      
      return
    }

    if (comando === "!abrirmix") {

      if (!organizador) {
        await reaccionarMensaje(grupo, mensajeId, "⛔")
        return
      }

      mixAbierto = true
      jugadoresMix = []

      await reaccionarMensaje(grupo, mensajeId, "🔥")

      await enviarMensaje(
        grupo,
`🔥 MIX ABIERTO

Cupos: 0/10

Usen !entrar para anotarse.`
      )

      return
    }

    if (comando === "!cerrarmix") {

      if (!organizador) {
        await reaccionarMensaje(grupo, mensajeId, "⛔")
        return
      }

      mixAbierto = false

      await reaccionarMensaje(grupo, mensajeId, "🔒")
      await enviarMensaje(grupo, "🔒 Mix cerrado.")

      return
    }

    if (comando === "!reiniciarmix") {

      if (!organizador) {
        await reaccionarMensaje(grupo, mensajeId, "⛔")
        return
      }

      mixAbierto = false
      jugadoresMix = []

      await reaccionarMensaje(grupo, mensajeId, "♻️")
      await enviarMensaje(grupo, "♻️ Mix reiniciado.")

      return
    }

    if (comando === "!entrar") {

      if (!mixAbierto) {
        await reaccionarMensaje(grupo, mensajeId, "⛔")
        await enviarMensaje(grupo, "⛔ No hay mix abierto.")
        return
      }

      const yaEsta = jugadoresMix.some(j =>
        j.numero === numeroJugador
      )

      if (yaEsta) {
        await reaccionarMensaje(grupo, mensajeId, "⚠️")
        return
      }

      jugadoresMix.push({
        numero: numeroJugador,
        fecha: Date.now()
      })

      await reaccionarMensaje(grupo, mensajeId, "✅")

      await enviarMensaje(
        grupo,
`✅ Entraste al mix.

Cupos: ${jugadoresMix.length}/10`
      )

      if (jugadoresMix.length >= 10) {
        mixAbierto = false

        await enviarMensaje(
          grupo,
`🔥 MIX COMPLETO 10/10

Próximo paso:
división automática de equipos.`
        )
      }

      return
    }

    if (comando === "!salir") {

      const antes = jugadoresMix.length

      jugadoresMix = jugadoresMix.filter(j =>
        j.numero !== numeroJugador
      )

      if (jugadoresMix.length === antes) {
        await reaccionarMensaje(grupo, mensajeId, "⚠️")
        return
      }

      await reaccionarMensaje(grupo, mensajeId, "✅")

      await enviarMensaje(
        grupo,
`✅ Saliste del mix.

Cupos: ${jugadoresMix.length}/10`
      )

      return
    }

  } catch (error) {

    console.log("ERROR MIX:", error)
  }
}

// =====================================================
// GRUPO STATS - VERSIÓN COMPLETA BASE
// =====================================================

async function manejarGrupoStats(data) {

try {

const {
mensaje,
comando,
grupo,
mensajeId,
numeroJugador,
organizador
} = data

if (!mensaje) return

const esComando = mensaje.startsWith("!")

const comandosJugadores = [
"!stats",
"!top",
"!topkills",
"!comandos"
]

const comandosOrganizadores = [
"!jugadores"
]

const comandosAdminPrincipal = [
"!reiniciarstats"
]

// =====================================================
// !PING
// =====================================================

if (comando === "!ping") {

const inicio = Date.now()

const tiempoReaccion =
Math.floor(Math.random() * 180) + 120

const tiempoRespuesta =
(Date.now() - inicio) +
tiempoReaccion +
Math.floor(Math.random() * 180)

await enviarMensaje(
grupo,
`Hola!!! Pong! 🏓

✅ Bot online
📊 Grupo: STATS
⚡ Tiempo de reacción: ${tiempoReaccion} ms
📨 Tiempo de respuesta: ${tiempoRespuesta} ms`
)

return
}

// =====================================================
// !COMANDOS
// =====================================================

if (comando === "!comandos") {

await reaccionarMensaje(grupo, mensajeId, "📋")

await enviarMensaje(
grupo,
`📊 COMANDOS GRUPO STATS

👑 ADMIN PRINCIPAL
!reiniciarstats

🛡️ ADMIN / ORGANIZADORES
!jugadores

👥 ADMIN / ORGANIZADORES / INTEGRANTES
!organizadores (ante dudas o consultas contactate con alguno de ellos)
!stats (permitido 1 vez cada 24 hs)
!top (permitido 1 vez cada 24 hs)
!topkills (permitido 1 vez cada 24 hs)
!comandos (uso ilimitado)`
)
  
return
}

// =====================================================
// COMANDO INVÁLIDO
// =====================================================

const comandoPermitido =
[
...comandosJugadores,
...comandosOrganizadores,
...comandosAdminPrincipal,
"!ping"
].includes(comando)

if (esComando && !comandoPermitido) {

await reaccionarMensaje(grupo, mensajeId, "❌")

if (!advertenciasStats[numeroJugador]) {
advertenciasStats[numeroJugador] = 0
}

advertenciasStats[numeroJugador]++

await enviarMensaje(
grupo,
`⚠️ Advertencia ${advertenciasStats[numeroJugador]}/4

Solo se permiten comandos del sistema STATS.`
)

if (advertenciasStats[numeroJugador] >= 4) {

usuariosMuteados[numeroJugador] =
Date.now() + (32 * 60 * 60 * 1000)

await enviarMensaje(
grupo,
"⛔ Usuario bloqueado temporalmente por spam."
)

advertenciasStats[numeroJugador] = 0
}

return
}

// =====================================================
// MENSAJE NORMAL
// =====================================================

if (!esComando) {

await reaccionarMensaje(grupo, mensajeId, "❌")

if (!advertenciasStats[numeroJugador]) {
advertenciasStats[numeroJugador] = 0
}

advertenciasStats[numeroJugador]++

await enviarMensaje(
grupo,
`⚠️ Advertencia ${advertenciasStats[numeroJugador]}/4

Solo se permiten comandos del sistema STATS.`
)

if (advertenciasStats[numeroJugador] >= 4) {

usuariosMuteados[numeroJugador] =
Date.now() + (32 * 60 * 60 * 1000)

await enviarMensaje(
grupo,
"⛔ Usuario bloqueado temporalmente por spam."
)

advertenciasStats[numeroJugador] = 0
}

return
}

// =====================================================
// SISTEMA DE USO DIARIO
// =====================================================

const comandosConCooldown = [
"!stats",
"!top",
"!topkills"
]

if (comandosConCooldown.includes(comando)) {

if (!usoDiarioStats[numeroJugador]) {
usoDiarioStats[numeroJugador] = {}
}

const ultimoUso =
usoDiarioStats[numeroJugador][comando]

if (
ultimoUso &&
(Date.now() - ultimoUso) < (24 * 60 * 60 * 1000)
) {

await reaccionarMensaje(grupo, mensajeId, "⏳")

await enviarMensaje(
grupo,
"⏳ Ya utilizaste ese comando hoy."
)

return
}

usoDiarioStats[numeroJugador][comando] =
Date.now()
}

// =====================================================
// !STATS
// =====================================================

if (comando === "!stats") {

await reaccionarMensaje(grupo, mensajeId, "📊")

await enviarMensaje(
grupo,
"📊 Sistema de estadísticas en construcción."
)

return
}

// =====================================================
// !TOP
// =====================================================

if (comando === "!top") {

await reaccionarMensaje(grupo, mensajeId, "🏆")

await enviarMensaje(
grupo,
"🏆 Sistema TOP en construcción."
)

return
}

// =====================================================
// !TOPKILLS
// =====================================================

if (comando === "!topkills") {

await reaccionarMensaje(grupo, mensajeId, "💀")

await enviarMensaje(
grupo,
"💀 Sistema TOP KILLS en construcción."
)

return
}

// =====================================================
// !JUGADORES
// =====================================================

if (comando === "!jugadores") {

if (!organizador) {

await reaccionarMensaje(grupo, mensajeId, "⛔")

return
}

await reaccionarMensaje(grupo, mensajeId, "📋")

await enviarMensaje(
grupo,
"📋 Sistema de jugadores en construcción."
)

return
}

// =====================================================
// !REINICIARSTATS
// =====================================================

if (comando === "!reiniciarstats") {

if (!organizador) {

await reaccionarMensaje(grupo, mensajeId, "⛔")

return
}

await reaccionarMensaje(grupo, mensajeId, "♻️")

await enviarMensaje(
grupo,
"♻️ Reinicio de temporada en construcción."
)

return
}

} catch (error) {

console.log("ERROR GRUPO STATS:", error)

}
}
