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
    const grupo =
body?.phone ||
body?.chatId ||
body?.from ||
""

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
    console.log("ROUTER DEBUG:", {
  mensaje,
  comando,
  grupo,
  GRUPO_MIX,
  esMix: grupo === GRUPO_MIX
})

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
mensajeId,
numeroJugador
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

console.log("DEBUG MIX:", {
mensaje,
comando,
grupo,
numeroJugador,
organizador
})
  
if (grupo !== GRUPO_MIX) {
return
}

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

await reaccionarMensaje(grupo, mensajeId, "🏓")

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

// =====================================================
// !COMANDOS
// =====================================================

if (comando === "!comandos") {

await enviarMensaje(
grupo,
`📋 COMANDOS GRUPO MIX

👑 ADMIN PRINCIPAL
!agregarorganizador
!quitarorganizador

🛡️ ADMIN / ORGANIZADORES
!abrirchat
!cerrarchat
!abrirmix
!cerrarmix
!reiniciarmix
!fake10

👥 ADMIN / ORGANIZADORES / INTEGRANTES
!organizadores
!ping
!registrar
!editregistro
!entrar
!salir`
)

return
}

// =====================================================
// !BIENVENIDA
// =====================================================

if (comando === "!bienvenida") {

await reaccionarMensaje(grupo, mensajeId, "👋")

await enviarMensaje(
grupo,
`🇦🇷 BIENVENIDOS A MIX C4

Este grupo está destinado exclusivamente a la organización de mixes.

📌 COMANDOS PRINCIPALES

!registrar NICK ID
!entrar
!salir
!comandos

⚠️ IMPORTANTE

Solo se permiten comandos del bot.
Los mensajes normales o comandos incorrectos generan advertencias automáticas.

🎮 Cuando el mix esté abierto, utilizá !entrar para sumarte a la lista.`
)

return
}

// =====================================================
// !ABRIRMIX
// =====================================================

if (comando === "!abrirmix") {

if (!organizador) {

await enviarMensaje(
grupo,
"❌ Solo administradores pueden abrir mixes"
)

return
}

mixAbierto = true
chatMixActivo = true
jugadoresMix = []

await abrirChatGrupo(grupo)

await reaccionarMensaje(grupo, mensajeId, "🔥")

await enviarMensaje(
grupo,
`🔥 MIX ABIERTA

👥 Cupos: 0/10

Usá:
!entrar

para ingresar al mix.`
)

return
}

// =====================================================
// !ENTRAR
// =====================================================

if (comando === "!entrar") {

if (!mixAbierto) {
await enviarMensaje(grupo, "❌ No hay ningún mix abierto.")
return
}

const numeroActual =
String(numeroJugador).replace(/\D/g, "")

let jugador = Object.values(jugadoresRegistrados).find(
j =>
String(j.telefono).replace(/\D/g, "") === numeroActual
)

if (!jugador) {

const { data: jugadorSupabase } = await supabase
.from("Jugadores")
.select("*")
.eq("numero", numeroActual)
.maybeSingle()

if (jugadorSupabase) {

jugador = {
nick: jugadorSupabase.nombre,
idGame: jugadorSupabase.idgame,
telefono: jugadorSupabase.numero
}

jugadoresRegistrados[jugador.idGame] = jugador
guardarJugadores(jugadoresRegistrados)

}
}

if (!jugador) {

await enviarMensaje(
grupo,
"❌ No estás registrado.\n\nUsá:\n!registrar NICK ID"
)

return
}

const yaEsta = jugadoresMix.find(j =>
String(j.telefono).replace(/\D/g, "") === numeroActual
)

if (yaEsta) {

await enviarMensaje(
grupo,
"⚠️ Ya estás dentro del mix."
)

return
}

jugadoresMix.push(jugador)

await reaccionarMensaje(grupo, mensajeId, "✅")

let lista = ""

jugadoresMix.forEach((j, index) => {
lista += `${index + 1}. ${j.nick}\n`
})

await enviarMensaje(
grupo,
`✅ ${jugador.nick} entró al mix.

🔥 MIX ACTUAL

👥 Cupos: ${jugadoresMix.length}/10
⏳ Faltan: ${10 - jugadoresMix.length}

${lista || "Lista vacía."}`
)

if (jugadoresMix.length >= 10) {

mixAbierto = false
chatMixActivo = false

await cerrarChatGrupo(grupo)

await enviarMensaje(
grupo,
`🔒 Chat cerrado automáticamente.

🎮 Mix completa.
📋 Generando equipos...`
)

const mezclados =
[...jugadoresMix].sort(() => Math.random() - 0.5)

const equipoA = mezclados.slice(0, 5)
const equipoB = mezclados.slice(5, 10)

equiposMixActual = {
equipoA,
equipoB
}

const listaA =
equipoA.map((j, i) =>
`${i + 1}. ${j.nick}`
).join("\n")

const listaB =
equipoB.map((j, i) =>
`${i + 1}. ${j.nick}`
).join("\n")

await enviarMensaje(
grupo,
`🔥 MIX COMPLETO

🔵 EQUIPO A
${listaA}

🔴 EQUIPO B
${listaB}`
)

await enviarEncuesta(grupo)

}

return
}

// =====================================================
// !SALIR
// =====================================================

if (comando === "!salir") {

if (!mixAbierto) {

await enviarMensaje(
grupo,
"❌ No hay ningún mix abierto."
)

return
}

const numeroActual =
String(numeroJugador).replace(/\D/g, "")

const indexJugador = jugadoresMix.findIndex(
j =>
String(j.telefono).replace(/\D/g, "") === numeroActual
)

if (indexJugador === -1) {

await enviarMensaje(
grupo,
"⚠️ No estás anotado en el mix."
)

return
}

const jugador = jugadoresMix[indexJugador]

jugadoresMix.splice(indexJugador, 1)

let lista = ""

jugadoresMix.forEach((j, index) => {
lista += `${index + 1}. ${j.nick}\n`
})

await reaccionarMensaje(grupo, mensajeId, "🚪")

await enviarMensaje(
grupo,
`🚪 ${jugador.nick} salió del mix.

🔥 MIX ACTUAL

👥 Cupos: ${jugadoresMix.length}/10
⏳ Faltan: ${10 - jugadoresMix.length}

${lista || "Lista vacía."}`
)

return
}

// =====================================================
// !CERRARMIX
// =====================================================

if (comando === "!cerrarmix") {

if (!organizador) {

await enviarMensaje(
grupo,
"❌ Solo administradores pueden cerrar mixes"
)

return
}

mixAbierto = false

await cerrarChatGrupo(grupo)

chatMixActivo = false
jugadoresMix = []

await enviarMensaje(
grupo,
`🔒 MIX CERRADA

👥 Cupos: 0/10

Usá:
!abrirmix

para abrir una nueva.`
)

return
}

// =====================================================
// !REINICIARMIX
// =====================================================

if (comando === "!reiniciarmix") {

if (!organizador) {

await enviarMensaje(
grupo,
"❌ Solo administradores pueden reiniciar mixes"
)

return
}

await abrirChatGrupo(grupo)

jugadoresMix = []

mixAbierto = true
chatMixActivo = true

await enviarMensaje(
grupo,
`♻️ MIX REINICIADO

👥 Cupos: 0/10

Usá:
!entrar

para anotarte nuevamente.`
)

return
}

// =====================================================
// !FAKE10
// =====================================================

if (comando === "!fake10") {

if (!organizador) {

await enviarMensaje(
grupo,
"❌ Solo administradores pueden usar fake10"
)

return
}

jugadoresMix = [
{ nick: "Alpha" },
{ nick: "Bravo" },
{ nick: "Charlie" },
{ nick: "Delta" },
{ nick: "Echo" },
{ nick: "Foxtrot" },
{ nick: "Ghost" },
{ nick: "Hunter" },
{ nick: "Iceman" },
{ nick: "Joker" }
]

mixAbierto = true

await enviarMensaje(
grupo,
`🧪 MIX DE PRUEBA CARGADA

👥 Cupos: 10/10`
)

const jugadoresMezclados =
[...jugadoresMix].sort(() => Math.random() - 0.5)

const equipoA = jugadoresMezclados.slice(0, 5)
const equipoB = jugadoresMezclados.slice(5, 10)

let listaA = ""
let listaB = ""

equipoA.forEach((j, i) => {
listaA += `${i + 1}. ${j.nick}\n`
})

equipoB.forEach((j, i) => {
listaB += `${i + 1}. ${j.nick}\n`
})

await enviarMensaje(
grupo,
`🔥 MIX COMPLETO

🔵 EQUIPO A
${listaA}

🔴 EQUIPO B
${listaB}`
)

await enviarEncuesta(grupo)

mixAbierto = false

return
}

// =====================================================
// ANTI SPAM MIX
// =====================================================

if (!mensaje.startsWith("!") && !data.fromApi) {

const ahora = Date.now()

if (usuariosMuteados[numeroJugador]) {

if (ahora < usuariosMuteados[numeroJugador]) {
return
}

delete usuariosMuteados[numeroJugador]
}

if (!antiSpam[numeroJugador]) {
antiSpam[numeroJugador] = []
}

antiSpam[numeroJugador].push(ahora)

antiSpam[numeroJugador] =
antiSpam[numeroJugador].filter(
t => ahora - t < 12 * 60 * 60 * 1000
)

if (antiSpam[numeroJugador].length === 3) {

await reaccionarMensaje(
grupo,
mensajeId,
"⚠️"
)

await enviarMensaje(
grupo,
`⚠️ Advertencia por spam.

📱 ${numeroJugador}

Si seguís enviando mensajes no permitidos serás silenciado temporalmente.`
)

return
}

if (antiSpam[numeroJugador].length >= 4) {

usuariosMuteados[numeroJugador] =
ahora + (12 * 60 * 60 * 1000)

await reaccionarMensaje(
grupo,
mensajeId,
"⛔"
)

await enviarMensaje(
grupo,
`⛔ Usuario silenciado 12 horas por spam.

📱 ${numeroJugador}

⚠️ Motivo:
Enviar demasiados mensajes no permitidos en el grupo mix.`
)

return
}

await reaccionarMensaje(
grupo,
mensajeId,
"❌"
)

await enviarMensaje(
grupo,
`❌ Solo se permiten comandos en este grupo.

⚠️ Advertencia:
Si enviás 4 mensajes que no sean comandos, serás bloqueado por 12 horas.

📊 Mensajes no permitidos:
${antiSpam[numeroJugador].length}/4

Usá !comandos para ver la lista disponible.`
)

return
}

} catch (error) {
console.log("ERROR MIX:", error)
}
}
