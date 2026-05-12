const express = require("express")

const {
  default: makeWASocket,
  useMultiFileAuthState
} = require("@whiskeysockets/baileys")

const P = require("pino")

async function conectarWhatsApp() {

  console.log("🟢 Iniciando conexión Baileys...")

  const { state, saveCreds } = await useMultiFileAuthState("session")

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" })
  })

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", async ({ connection, qr }) => {

    if (!qr) return

    console.log("📱 ESCANEÁ EL QR")
    console.log(qr)

  })

}

setInterval(() => {}, 1000)

const app = express()

app.get("/", (req, res) => {
  res.send("C4 BOT ONLINE")
})

app.listen(process.env.PORT || 3000)

conectarWhatsApp()
