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

const GRUPO_MIX = ""
const GRUPO_STATS = ""
const GRUPO_ADMIN = ""

// ==================================================
// VARIABLES GLOBALES
// ==================================================

let sock = null

let mixAbierto = false

let jugadoresMix = []

let usuariosMuteados = {}

let organizadoresCache = []

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

async function enviarMensaje(grupo, texto) {
  try {
    if (!sock) return

    await sock.sendMessage(grupo, {
      text: texto
    })

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
// WEBHOOK
// ==================================================

app.post("/webhook", async (req, res) => {

  try {

    return res.status(200).json({
      status: true
    })

  } catch (error) {

    console.log(error)

    return res.status(500).json({
      status: false
    })
  }
})

// ==================================================
// SERVIDOR
// ==================================================

app.listen(PORT, async () => {

  console.log(`SERVIDOR ONLINE ${PORT}`)

  await conectarWhatsApp()
})
