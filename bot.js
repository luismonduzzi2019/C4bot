console.log("INICIANDO BOT.JS")

const qrcode = require("qrcode-terminal")

const fs = require("fs")

const {
default: makeWASocket,
useMultiFileAuthState,
DisconnectReason
} = require("@whiskeysockets/baileys")

const P = require("pino")

async function iniciarBot() {

console.log("ENTRÓ A iniciarBot")

const { state, saveCreds } =
await useMultiFileAuthState("session")

console.log("CREANDO SOCKET")

const sock = makeWASocket({
auth: state,
browser: ["Ubuntu", "Chrome", "22.04.4"],
logger: P({ level: "silent" }),
syncFullHistory: false
})

if (!sock.authState.creds.registered) {
const code = await sock.requestPairingCode("3460584275", "C4BOT123")
console.log("CÓDIGO:", code)
}

sock.ev.on("creds.update", saveCreds)

sock.ev.on("connection.update", ({ connection, qr }) => {

console.log("UPDATE:", connection)

if (qr) {
qrcode.generate(qr, { small: true })
}

if (qr) {
console.clear()

qrcode.generate(qr, {
small: true
})

console.log("📱 ESCANEÁ EL QR DE ARRIBA")
}

if (connection === "open") {
console.log("🔥 C4BOT WHATSAPP ONLINE")
}

})

sock.ev.on("messages.upsert", async ({ messages }) => {

const msg = messages[0]

if (!msg.message) return

const texto =
msg.message.conversation ||
msg.message.extendedTextMessage?.text

if (!texto) return

const chat = msg.key.remoteJid

console.log("📩", texto)

if (texto === "!ping") {
await sock.sendMessage(chat, {
text: "🏓 pong"
})
}

})

}

iniciarBot()

setInterval(() => {}, 1000)
