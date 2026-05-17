const sharp = require("sharp")
const fs = require("fs")
const Tesseract = require("tesseract.js")
const stringSimilarity = require("string-similarity")
const axios = require("axios")

const { createClient } = require("@supabase/supabase-js")

const supabase = createClient(
process.env.SUPABASE_URL,
process.env.SUPABASE_KEY
)

const {
default: makeWASocket,
useMultiFileAuthState,
DisconnectReason
} = require("@whiskeysockets/baileys")

const P = require("pino")

const pathJugadores = "./jugadores.json"

function cargarJugadores() {
    try {
        const data = fs.readFileSync(pathJugadores, "utf8")
        return JSON.parse(data)
    } catch (error) {
        return {}
    }
}

function guardarJugadores(jugadores) {
    fs.writeFileSync(pathJugadores, JSON.stringify(jugadores, null, 2))
}

function limpiarNombreOCR(nombre) {
  return String(nombre || "")
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\[ffva\]/gi, " ffva ")
    .replace(/\[c4ar\]/gi, " c4ar ")
    .replace(/\[c4ac\]/gi, " c4ac ")
    .replace(/[^a-z0-9áéíóúñ\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function similitudNombre(a, b) {
  a = limpiarNombreOCR(a)
  b = limpiarNombreOCR(b)

  if (!a || !b) return 0
  if (a.includes(b) || b.includes(a)) return 100

  let iguales = 0
  const corto = a.length < b.length ? a : b
  const largo = a.length >= b.length ? a : b

  for (let i = 0; i < corto.length; i++) {
    if (corto[i] === largo[i]) iguales++
  }

  return Math.round((iguales / largo.length) * 100)
}

function buscarJugadorRegistrado(nombreOCR, jugadores) {
  let mejor = null
  let mejorScore = 0

  const nombreLimpioOCR = limpiarNombreOCR(nombreOCR)

  for (const telefono in jugadores) {
    const jugador = jugadores[telefono]

    const posiblesNombres = [
      jugador.nick,
      jugador.nombre,
      jugador.id,
      ...(jugador.alias || [])
    ]
      .filter(Boolean)
      .map(n => limpiarNombreOCR(n))

    for (const nombreRegistrado of posiblesNombres) {
      const score = similitudNombre(nombreLimpioOCR, nombreRegistrado)

      if (score > mejorScore) {
        mejorScore = score

        mejor = {
          telefono,
          nombre: jugador.nick || jugador.nombre || jugador.id,
          score
        }
      }
    }
  }

  return mejorScore >= 45 ? mejor : null
}

const express = require("express")

let sockGlobal = null

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

const jugadoresRegistrados = cargarJugadores()

let mixAbierto = false
let chatMixActivo = false
let jugadoresMix = []
let equiposMixActual = null


let organizadores = []

const adminPrincipal = "5493412750806"

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const antiSpam = {}
const usuariosMuteados = {}

let votosMapa = {}
let votacionActiva = false

const mapas = [
    "Dune",
    "Rust",
    "Sandstone",
    "Hanami",
    "Province",
    "Prisión",
    "Breeze",
    "Azar 🎲"
]

if (fs.existsSync("jugadores.json")) {
    jugadores = JSON.parse(fs.readFileSync("jugadores.json"))
}

if (fs.existsSync("mix.json")) {
    listaMix = JSON.parse(fs.readFileSync("mix.json"))
}

if (fs.existsSync("admins.json")) {
admins = JSON.parse(fs.readFileSync("admins.json"))
}

function esAdmin(whatsapp) {
return admins.includes(whatsapp)
}

app.get("/", (req, res) => {
    res.send(`
        <h1>🔥 C4 BOT PANEL</h1>

        <h2>Registrar jugador</h2>
        <form action="/registrar" method="POST">
    <input name="nombre" placeholder="Nick in-game" />
    <input name="gameid" placeholder="ID del juego" />
    <input name="whatsapp" placeholder="Número de WhatsApp" />
    <button type="submit">Registrar</button>
</form>

        <h2>Mix</h2>
        <form action="/abrir-mix" method="POST">
            <button type="submit">Abrir mix</button>
        </form>

        <form action="/entrar" method="POST">
            <input name="nombre" placeholder="Nombre del jugador" />
            <button type="submit">Entrar a la mix</button>
        </form>

        <h2>Lista actual</h2>
<h2>Votar mapa</h2>
<form action="/votar" method="POST">
    <input name="whatsapp" placeholder="Número de WhatsApp" />
    <input name="mapa" placeholder="Mapa elegido" />
    <button type="submit">Votar</button>
</form>
        <a href="/lista">Ver lista</a>

<h2>Cargar resultado</h2>

<form action="/resultado" method="POST">
<input name="nombre" placeholder="Jugador">

<input name="kills" type="number" placeholder="Kills">

<input name="deaths" type="number" placeholder="Deaths">

<select name="resultado">
<option value="win">Victoria</option>
<option value="lose">Derrota</option>
</select>

<select name="tipo">
<option value="mix">Mix</option>
<option value="torneo">Torneo</option>
</select>

<button type="submit">Cargar resultado</button>
</form>

<br>

        <h2>Jugadores registrados</h2>
        <a href="/jugadores">Ver jugadores</a>
    `)
})

app.get("/jugadores", (req, res) => {
    res.json(jugadores)
})

app.post("/registrar", (req, res) => {

    const { nombre, gameid, whatsapp } = req.body

    if (!nombre || !gameid || !whatsapp) {
        return res.send("Faltan datos")
    }

    const existe = jugadores.find(j => j.whatsapp === whatsapp)

    if (existe) {
        return res.send("Jugador ya registrado")
    }

    const nuevoJugador = {
        nombre,
        gameid,
        whatsapp,

 mix: {
    kills: 0,
    deaths: 0,
    assists: 0,
    puntos: 0,
    victorias: 0,
    derrotas: 0,
    mvps: 0,
    partidas: 0
},

torneo: {
    kills: 0,
    deaths: 0,
    assists: 0,
    puntos: 0,
    victorias: 0,
    derrotas: 0,
    mvps: 0,
    partidas: 0
}
,
mensual: {
kills: 0,
deaths: 0,
victorias: 0,
derrotas: 0,
partidas: 0,
mvp: 0
}
    }

    jugadores.push(nuevoJugador)

    fs.writeFileSync("jugadores.json", JSON.stringify(jugadores))

    res.send(`✅ ${nombre} registrado correctamente`)
})

app.post("/abrir-mix", (req, res) => {
    mixAbierta = true
    listaMix = []
    res.send("🔥 MIX ABIERTA")
})

app.post("/entrar", (req, res) => {
    const { whatsapp } = req.body

    if (!mixAbierta) return res.send("⛔ No hay mix abierta")

    const jugador = jugadores.find(j => j.whatsapp === whatsapp)

    if (!jugador) return res.send("⛔ Jugador no registrado")
    if (listaMix.find(j => j.whatsapp === whatsapp)) return res.send("⚠️ Ya estás anotado")
    if (listaMix.length >= 10) return res.send("⛔ Lista completa")

    listaMix.push(jugador)
fs.writeFileSync("mix.json", JSON.stringify(listaMix))

   if (listaMix.length === 10) {
    mixAbierta = false

    const mezclados = [...listaMix].sort(() => Math.random() - 0.5)

    const equipoA = mezclados.slice(0, 5)
    const equipoB = mezclados.slice(5, 10)

    let resultado = "🔥 MIX COMPLETA 10/10<br><br>"

    resultado += "🔵 Equipo A:<br>"
    equipoA.forEach((j) => {
        resultado += j.nombre + "<br>"
    })

    resultado += "<br>🔴 Equipo B:<br>"
    equipoB.forEach((j) => {
        resultado += j.nombre + "<br>"
    })

votacionActiva = true
votosMapa = {}

resultado += "<br><br>🗺️ VOTACIÓN DE MAPA:<br><br>"

mapas.forEach((m, i) => {
    resultado += `${i + 1}. ${m}<br>`
})

resultado += "<br>📩 Voten usando /votar"

    return res.send(resultado)
}

    res.send(`✅ ${jugador.nombre} entró (${listaMix.length}/10)`)
})

app.get("/lista", (req, res) => {
    res.json(listaMix)
})

app.post("/votar", (req, res) => {

    const { whatsapp, mapa } = req.body

    if (!votacionActiva) {
        return res.send("⛔ No hay votación activa")
    }

    const jugador = listaMix.find(j => j.whatsapp === whatsapp)

    if (!jugador) {
        return res.send("⛔ No estás en la mix")
    }

    if (!mapas.includes(mapa)) {
        return res.send("⛔ Mapa inválido")
    }

    votosMapa[whatsapp] = mapa

    res.send(`🗳️ ${jugador.nombre} votó ${mapa}`)

    if (Object.keys(votosMapa).length === 10) {

        let conteo = {}

        Object.values(votosMapa).forEach(v => {
            conteo[v] = (conteo[v] || 0) + 1
        })

        let ganador = Object.keys(conteo).reduce((a, b) =>
            conteo[a] > conteo[b] ? a : b
        )

        if (ganador === "Azar 🎲") {
            const normales = mapas.filter(m => m !== "Azar 🎲")
            ganador = normales[Math.floor(Math.random() * normales.length)]
        }

        votacionActiva = false

        console.log(`🗺️ MAPA ELEGIDO: ${ganador}`)
    }
})

app.post("/resultado", (req, res) => {
app.post("/stats", (req, res) => {

    const { whatsapp } = req.body

    const jugador = jugadores.find(j => j.whatsapp === whatsapp)

    if (!jugador) {
        return res.send("Jugador no encontrado")
    }

const tipo = req.body.tipo || "mix"
const stats = jugador[tipo]

const kd = stats.deaths > 0
    ? (stats.kills / stats.deaths).toFixed(2)
    : stats.kills

const winrate =
    stats.partidas > 0
        ? ((stats.victorias / stats.partidas) * 100).toFixed(0)
        : 0

    res.send(`
📈 STATS — ${jugador.nombre}

🆔 Game ID: ${jugador.gameid}

🎯 Kills: ${stats.kills}
💀 Deaths: ${stats.deaths}
⚖️ KD: ${kd}

🏆 MVPs: ${stats.mvps}
✅ Victorias: ${stats.victorias}
❌ Derrotas: ${stats.derrotas}
🎮 Partidas jugadas: ${stats.partidas}
`)
})

app.post("/statsmes", (req, res) => {

const { whatsapp } = req.body

const jugador = jugadores.find(j => j.whatsapp === whatsapp)

if (!jugador) {
return res.send("Jugador no encontrado")
}

const stats = jugador.mensual

const kd = stats.deaths > 0
? (stats.kills / stats.deaths).toFixed(2)
: stats.kills

const winrate =
stats.partidas > 0
? ((stats.victorias / stats.partidas) * 100).toFixed(0)
: 0

res.send(`
📅 STATS MENSUALES C4

👤 ${jugador.nombre}

🎯 Kills: ${stats.kills}
💀 Deaths: ${stats.deaths}
⚖️ KD: ${kd}

🏆 MVPs: ${stats.mvps}
✅ Victorias: ${stats.victorias}
❌ Derrotas: ${stats.derrotas}
🎮 Partidas jugadas: ${stats.partidas}
📊 Winrate: ${winrate}%
`)
})

const {
    whatsapp,
    kills,
    deaths,
    assists,
    puntos,
    victoria,
    mvp,
    tipo
} = req.body

    const jugador = jugadores.find(j => j.whatsapp === whatsapp)

    if (!jugador) {
        return res.send("Jugador no encontrado")
    }

jugador[tipo].kills += Number(kills)
jugador[tipo].deaths += Number(deaths)
jugador[tipo].assists += Number(assists || 0)
jugador[tipo].puntos += Number(puntos || 0)

jugador[tipo].partidas += 1

jugador.mensual.kills += Number(kills)
jugador.mensual.deaths += Number(deaths)
jugador.mensual.assists += Number(assists || 0)
jugador.mensual.puntos += Number(puntos || 0)
jugador.mensual.partidas += 1

if (victoria === "si") {
    jugador[tipo].victorias += 1
    jugador.mensual.victorias += 1
} else {
    jugador[tipo].derrotas += 1
    jugador.mensual.derrotas += 1
}

if (mvp === "si") {
    jugador[tipo].mvps += 1
    jugador.mensual.mvps += 1
}

    fs.writeFileSync("jugadores.json", JSON.stringify(jugadores))

    const kd = jugador.deaths > 0
        ? (jugador.kills / jugador.deaths).toFixed(2)
        : jugador.kills

    res.send(`
📊 RESULTADO GUARDADO

👤 ${jugador.nombre}
🎯 Kills: ${jugador.kills}
💀 Deaths: ${jugador.deaths}
⚖️ KD: ${kd}

🏆 MVPs: ${jugador.mvps}
✅ Victorias: ${jugador.victorias}
❌ Derrotas: ${jugador.derrotas}
🎮 Mixes: ${jugador.mixes}
`)
})
app.get("/topkills", (req, res) => {

    const ranking = [...jugadores]
        .sort((a, b) => b.kills - a.kills)
        .slice(0, 10)

    let respuesta = "🏆 TOP KILLS C4<br><br>"

    ranking.forEach((j, i) => {
        respuesta += `${i + 1}. ${j.nombre} — ${j.kills} kills<br>`
    })

    res.send(respuesta)
})

app.post("/addadmin", (req, res) => {

const { whatsapp } = req.body

if (!whatsapp) {
return res.send("Falta WhatsApp")
}

if (admins.includes(whatsapp)) {
return res.send("Admin ya existente")
}

admins.push(whatsapp)

fs.writeFileSync("admins.json", JSON.stringify(admins))

res.send("👮 ADMIN AGREGADO")

})

app.get("/topkd", (req, res) => {

    const ranking = [...jugadores]
        .filter(j => j.deaths > 0)
        .sort((a, b) => (b.kills / b.deaths) - (a.kills / a.deaths))
        .slice(0, 10)

    let respuesta = "⚖️ TOP KD C4<br><br>"

    ranking.forEach((j, i) => {
        const kd = (j.kills / j.deaths).toFixed(2)
        respuesta += `${i + 1}. ${j.nombre} — KD ${kd}<br>`
    })

    res.send(respuesta)
})

app.get("/topkillsmes", (req, res) => {

const ranking = [...jugadores]
.sort((a, b) => b.mensual.kills - a.mensual.kills)
.slice(0, 10)

let respuesta = "🔥 TOP KILLS MENSUAL C4<br><br>"

ranking.forEach((j, i) => {
respuesta += `${i + 1}. ${j.nombre} - ${j.mensual.kills} kills<br>`
})

res.send(respuesta)
})

app.get("/topkdmes", (req, res) => {

const ranking = [...jugadores]
.filter(j => j.mensual.deaths > 0)
.sort((a, b) =>
(b.mensual.kills / b.mensual.deaths) -
(a.mensual.kills / a.mensual.deaths)
)
.slice(0, 10)

let respuesta = "🎯 TOP KD MENSUAL C4<br><br>"

ranking.forEach((j, i) => {

const kd = (
j.mensual.kills / j.mensual.deaths
).toFixed(2)

respuesta += `${i + 1}. ${j.nombre} - KD ${kd}<br>`
})

res.send(respuesta)
})

app.get("/topmvpsmes", (req, res) => {

const ranking = [...jugadores]
.sort((a, b) => b.mensual.mvps - a.mensual.mvps)
.slice(0, 10)

let respuesta = "🏆 TOP MVP MENSUAL C4<br><br>"

ranking.forEach((j, i) => {
respuesta += `${i + 1}. ${j.nombre} - ${j.mensual.mvps} MVPs<br>`
})

res.send(respuesta)
})

app.get("/tophistorico", (req, res) => {

const topKills = [...jugadores]
.sort((a, b) =>
(b.mix.kills + b.torneo.kills) -
(a.mix.kills + a.torneo.kills)
)[0]

const topMvps = [...jugadores]
.sort((a, b) =>
(b.mix.mvps + b.torneo.mvps) -
(a.mix.mvps + a.torneo.mvps)
)[0]

const topVictorias = [...jugadores]
.sort((a, b) =>
(b.mix.victorias + b.torneo.victorias) -
(a.mix.victorias + a.torneo.victorias)
)[0]

const topPartidas = [...jugadores]
.sort((a, b) =>
(b.mix.partidas + b.torneo.partidas) -
(a.mix.partidas + a.torneo.partidas)
)[0]

const topKd = [...jugadores]
.filter(j =>
(j.mix.deaths + j.torneo.deaths) > 0
)
.sort((a, b) => {

const kdA =
(a.mix.kills + a.torneo.kills) /
(a.mix.deaths + a.torneo.deaths)

const kdB =
(b.mix.kills + b.torneo.kills) /
(b.mix.deaths + b.torneo.deaths)

return kdB - kdA
})[0]

const kdHistorico =
(
(topKd.mix.kills + topKd.torneo.kills) /
(topKd.mix.deaths + topKd.torneo.deaths)
).toFixed(2)

res.send(`
👑 TOP HISTÓRICO C4

🥇 Más kills:
${topKills.nombre}

🎯 ${
topKills.mix.kills +
topKills.torneo.kills
} kills

🏆 Más MVPs:
${topMvps.nombre}

🔥 ${
topMvps.mix.mvps +
topMvps.torneo.mvps
} MVPs

✅ Más victorias:
${topVictorias.nombre}

🏅 ${
topVictorias.mix.victorias +
topVictorias.torneo.victorias
} victorias

🎮 Más partidas:
${topPartidas.nombre}

📊 ${
topPartidas.mix.partidas +
topPartidas.torneo.partidas
} partidas

⚖️ Mejor KD:
${topKd.nombre}

💀 KD ${kdHistorico}
`)
})
app.get("/resetmensual", (req, res) => {

const { whatsapp } = req.query

if (!esAdmin(whatsapp)) {
return res.send("⛔ Sin permisos de administrador")
}

jugadores.forEach(j => {

j.mensual = {
kills: 0,
deaths: 0,
vitorias: 0,
derrotas: 0,
partidas: 0,
mvp: 0
}

})

fs.writeFileSync("jugadores.json", JSON.stringify(jugadores))

res.send("🔄 STATS MENSUALES REINICIADAS")

})

app.post("/resultado", (req, res) => {
    const { nombre, kills, deaths, resultado, tipo } = req.body

    if (!nombre || kills === undefined || deaths === undefined || !resultado) {
        return res.send("Faltan datos")
    }

    const jugador = jugadores.find(j => j.nombre.toLowerCase() === nombre.toLowerCase())

    if (!jugador) {
        return res.send("Jugador no encontrado")
    }

    const modo = tipo || "mix"

    if (!jugador[modo]) {
        return res.send("Modo inválido")
    }

    jugador[modo].kills += Number(kills)
    jugador[modo].deaths += Number(deaths)
    jugador[modo].partidas += 1

    if (resultado === "win") {
        jugador[modo].victorias += 1
    } else if (resultado === "lose") {
        jugador[modo].derrotas += 1
    }

    fs.writeFileSync("jugadores.json", JSON.stringify(jugadores, null, 2))

    const kd = jugador[modo].deaths === 0 
        ? jugador[modo].kills 
        : (jugador[modo].kills / jugador[modo].deaths).toFixed(2)

    res.send(`
📊 Resultado cargado

Jugador: ${jugador.nombre}
Modo: ${modo}
Kills totales: ${jugador[modo].kills}
Deaths totales: ${jugador[modo].deaths}
KD: ${kd}
Victorias: ${jugador[modo].victorias}
Derrotas: ${jugador[modo].derrotas}
Partidas: ${jugador[modo].partidas}
    `)
})

async function enviarMensaje(telefone, mensagem) {

    const resposta = await fetch(
        `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_TOKEN}/send-text`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Client-Token": process.env.ZAPI_CLIENT_TOKEN
            },
            body: JSON.stringify({
                phone: telefone,
                message: mensagem
            })
        }
    )

    const texto = await resposta.text()

    console.log("STATUS ENVIO:", resposta.status)
    console.log("RESPOSTA ZAPI:", texto)
}

async function reaccionarMensaje(telefono, messageId, reaction) {
try {
if (!messageId) return

const resposta = await fetch(
`https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_TOKEN}/send-reaction`,
{
method: "POST",
headers: {
"Content-Type": "application/json",
"Client-Token": process.env.ZAPI_CLIENT_TOKEN
},
body: JSON.stringify({
phone: telefono,
reaction: reaction,
messageId: messageId
})
}
)

const texto = await resposta.text()

console.log("STATUS REACTION:", resposta.status)
console.log("RESPUESTA REACTION:", texto)

} catch (error) {
console.log("ERROR REACTION:", error?.message)
}
}

async function enviarEncuesta(groupId) {

    const resposta = await fetch(
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

    const texto = await resposta.text()

    console.log("STATUS ENCUESTA:", resposta.status)
    console.log("RESPUESTA ENCUESTA:", texto)

console.log("🔒 INTENTANDO CERRAR CHAT:", groupId)
console.log("TELEFONO PARA CERRAR:", groupId)

await cerrarChatGrupo(groupId)

chatMixActivo = false

console.log("🔒 CHAT CERRADO AUTOMÁTICAMENTE")
    
}

async function cerrarChatGrupo(groupId) {

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
}

async function abrirChatGrupo(groupId) {

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
}

app.post("/webhook", async (req, res) => {
    
console.log("📩 WEBHOOK RECIBIDO")
  console.log(JSON.stringify(req.body, null, 2))
    
  const mensaje = req.body?.text?.message || ""
  const telefono = req.body?.phone    

    console.log("MENSAJE:", mensaje)
console.log("TELEFONO:", telefono)

const captionImagen = req.body?.image?.caption || ""
const imageUrl = req.body?.image?.imageUrl || ""

const comandoResultado = captionImagen.trim().toLowerCase().replace(/\s+/g, "")

if (
imageUrl &&
captionImagen.startsWith("!") &&
!["!resultadomix", "!resultadocw"].includes(comandoResultado)
) {
await reaccionarMensaje(telefono, req.body?.messageId, "❌")

await enviarMensaje(
telefono,
"❌ Comando de resultado no reconocido.\n\nUsá una captura con:\n!resultadomix\n!resultadocw"
)

return res.sendStatus(200)
}
    
    if (
imageUrl &&
["!resultadomix", "!resultadocw"].includes(comandoResultado)
) {

global.resultadosProcesados = global.resultadosProcesados || {}

const marcaResultado =
req.body?.messageId ||
req.body?.momment ||
req.body?.timestamp ||
imageUrl

const claveResultado = `${telefono}_${marcaResultado}_${comandoResultado}`

if (global.resultadosProcesados[claveResultado]) {
return res.sendStatus(200)
}

global.resultadosProcesados[claveResultado] = true

setTimeout(() => {
delete global.resultadosProcesados[claveResultado]
}, 5 * 60 * 1000)
        
const modo =
comandoResultado === "!resultadocw" ? "cw" :
"mix"

        await reaccionarMensaje(
telefono,
req.body?.messageId,
"✅"
)
        
await enviarMensaje(
telefono,
`📸 Captura recibida.

🎮 Modo: ${modo.toUpperCase()}
⏳ Procesando resultado...`
)

const bufferImagen = await axios.get(imageUrl, {
  responseType: "arraybuffer"
})

        const metadata = await sharp(bufferImagen.data).metadata()

const imagenRecortada = await sharp(bufferImagen.data)
  .extract({
    left: Math.round(metadata.width * 0.03),
    top: Math.round(metadata.height * 0.12),
    width: Math.round(metadata.width * 0.94),
    height: Math.round(metadata.height * 0.60)
  })
  .resize({ width: 1800 })
  .grayscale()
  .normalize()
  .sharpen()
  .threshold(150)
  .png()
  .toBuffer()
        
        const resultadoOCR = await Tesseract.recognize(
imagenRecortada,
"eng"
)

const textoLeido = resultadoOCR.data.text

console.log("📸 TEXTO OCR:", textoLeido)

const lineasUtiles = textoLeido
.split("\n")
.map(l => l.trim())
.filter(l => {
const numeros = l.match(/\d+/g) || []

return (
l.length > 8 &&
numeros.length >= 4
)
})

const jugadoresDetectados = lineasUtiles
.map(linea => {
  const numeros = linea.match(/\d+/g) || []

  if (numeros.length < 6) return null

  const stats = numeros.slice(-6)
const [dinero, bajas, asistencias, muertes, puntos] = stats

  const primerNumero = linea.search(/\d/)
const nombre = (primerNumero >= 0 ? linea.slice(0, primerNumero) : linea)
  .replace(/[^\p{L}\d'\[\]\s]/gu, " ")
  .replace(/\s+/g, " ")
  .trim()

  return {
    nombre,
    bajas,
    asistencias,
    muertes,
    puntos
  }
})
.filter(Boolean)
        
await enviarMensaje(
telefono,
`📊 Jugadores detectados:

${jugadoresDetectados.map(j => {
  const match = buscarJugadorRegistrado(j.nombre, jugadoresRegistrados)

  return `${match ? match.nombre : j.nombre} | B:${j.bajas} A:${j.asistencias} M:${j.muertes} Pts:${j.puntos}${match ? ` ✅ ${match.score}%` : " ⚠️ sin registro"}`
}).join("\n")}`
)

return
    }    

if (req.body?.notification === "GROUP_PARTICIPANT_ADD") {

if (!req.body?.notificationParameters?.length) {
return
}

    const numeroNuevo = req.body.notificationParameters?.[0]

global.ultimasBienvenidas = global.ultimasBienvenidas || {}

if (
global.ultimasBienvenidas[numeroNuevo] &&
Date.now() - global.ultimasBienvenidas[numeroNuevo] < 60000
) {
return
}

global.ultimasBienvenidas[numeroNuevo] = Date.now()
    
await enviarMensaje(
telefono,
`👋 Bienvenido al grupo Mix C4 🇦🇷

📋 REGLAS IMPORTANTES

• Registrate con tu NICK REAL e ID REAL.
• Respetá MAYÚSCULAS y minúsculas EXACTAS.
• Podés usar espacios si tu nick real los tiene.
• El nombre debe coincidir exactamente con capturas de resultados.
• 4 mensajes no permitidos = mute por 12 horas.

📝 REGISTRO

!registrar NICK ID

Ejemplo:
!registrar Colt 139527319

🎮 COMANDOS

!registrar
!entrar
!salir
!comandos`
)

return
}
    
const esGrupo = req.body?.isGroup || String(telefono).includes("-group")
    
    const telefonoJugador =
    req.body?.participantPhone ||
    req.body?.senderPhone ||
    req.body?.author ||
    req.body?.from ||
    telefono

    const numeroActual = String(telefonoJugador).replace(/\D/g, "")
const esAdminPrincipal = numeroActual === adminPrincipal
const esOrganizador = organizadores.includes(numeroActual)

    if (!esGrupo && !esAdminPrincipal) {
    return res.status(200).json({
        status: true
    })
    }

    if (usuariosMuteados[telefonoJugador] && usuariosMuteados[telefonoJugador] > Date.now()) {

const restante = usuariosMuteados[telefonoJugador] - Date.now()

const horas = Math.floor(restante / (1000 * 60 * 60))
const minutos = Math.ceil((restante % (1000 * 60 * 60)) / (1000 * 60))

await reaccionarMensaje(telefono, req.body?.messageId, "⛔")

global.ultimosAvisosMute = global.ultimosAvisosMute || {}

if (
global.ultimosAvisosMute[telefonoJugador] &&
Date.now() - global.ultimosAvisosMute[telefonoJugador] < 30000
) {
return
}

global.ultimosAvisosMute[telefonoJugador] = Date.now()
        
await enviarMensaje(
telefono,
`⛔ Estás bloqueado temporalmente.

⏳ Tiempo restante: ${horas}h ${minutos}m`
)

return
}
    
    const esAdmin = req.body?.isAdmin || false

    const marcaMensaje = req.body?.messageTimestamp || req.body?.timestamp || req.body?.momment || Date.now()
const claveMensaje = `${telefono}_${mensaje}_${marcaMensaje}`

global.ultimosMensajes = global.ultimosMensajes || {}

if (global.ultimosMensajes[claveMensaje]) {
  return res.sendStatus(200)
}

global.ultimosMensajes[claveMensaje] = true

setTimeout(() => {
  delete global.ultimosMensajes[claveMensaje]
}, 120000)

    if (!mensaje) return res.sendStatus(200)

  console.log("MENSAJE:", mensaje)
  console.log("RESPONDER A:", telefono)

    console.log("📩 BODY COMPLETO:", JSON.stringify(req.body, null, 2))
console.log("📌 telefono:", telefono)
console.log("📌 mensaje:", mensaje)
console.log("📌 from:", req.body?.from)
console.log("📌 chatId:", req.body?.chatId)
console.log("📌 groupId:", req.body?.groupId)

    const GRUPO_MIX = "120363425089190805-group"
const GRUPO_STATS = "120363407953964467-group"

const comandosMix = [
"!registrar",
"!entrar",
"!salir",
"!cerrarchat",
"!abrirchat",
"!comandos",
"!abrirmix",
"!cerrarmix",
"!fake10"
]

const comandosStats = [
"!resultadomix",
"!stats",
"!topkills",
"!topmvp",
"!rank"
]

const comando = mensaje.toLowerCase().split(" ")[0]

if (
comandosMix.includes(comando) &&
telefono !== GRUPO_MIX
) {
await enviarMensaje(
telefono,
"❌ Los comandos MIX solo pueden usarse en el grupo Mix C4."
)
return
}

if (
comandosStats.includes(comando) &&
telefono !== GRUPO_STATS
) {
await enviarMensaje(
telefono,
"❌ Los comandos STATS solo pueden usarse en el grupo Estadísticas."
)
return
}

if (mensaje.toLowerCase() === "!ping") {

    if (!esAdminPrincipal && !esOrganizador) {
return
    }

const inicio = Date.now()

try {

const latencia = Date.now() - inicio
const tiempoReaccion = latencia + Math.floor(Math.random() * 300) + 300

await enviarMensaje(
telefono,
`Hola!!! 🏓 Pong!

⚡ Latencia: ${tiempoReaccion}ms
⏱ Tiempo de reacción: ${tiempoReaccion}ms
🤖 Estado: Online`
)

console.log("✅ RESPUESTA ENVIADA")

} catch (error) {

console.log("❌ ERROR AL ENVIAR:", error.message)

}

}

    if (mensaje.toLowerCase().startsWith("!stats")) {

const partes = mensaje.split(" ")

if (partes.length < 2) {
await enviarMensaje(
telefono,
"❌ Usá: !stats nombre"
)
return
}

const nombreBuscado = partes.slice(1).join(" ")

const { data: jugador, error } = await supabase
.from("Jugadores")
.select("*")
.ilike("nombre", nombreBuscado)
.single()

if (error || !jugador) {
await enviarMensaje(
telefono,
"❌ Jugador no encontrado."
)
return
}

const killsGenerales =
(jugador.kills_mix || 0) +
(jugador.kills_cw || 0)

const deathsGenerales =
(jugador.deaths_mix || 0) +
(jugador.deaths_cw || 0)

const assistsGenerales =
(jugador.assists_mix || 0) +
(jugador.assists_cw || 0)

const puntosGenerales =
(jugador.points_mix || 0) +
(jugador.points_cw || 0)

const winsGenerales =
(jugador.wins_mix || 0) +
(jugador.wins_cw || 0)

const lossesGenerales =
(jugador.losses_mix || 0) +
(jugador.losses_cw || 0)

const partidasGenerales =
winsGenerales + lossesGenerales

const kdGeneral =
deathsGenerales > 0
? (killsGenerales / deathsGenerales).toFixed(2)
: killsGenerales.toFixed(2)

const wrGeneral =
partidasGenerales > 0
? ((winsGenerales / partidasGenerales) * 100).toFixed(1)
: "0.0"

const partidasMix =
(jugador.wins_mix || 0) +
(jugador.losses_mix || 0)

const wrMix =
partidasMix > 0
? ((jugador.wins_mix / partidasMix) * 100).toFixed(1)
: "0.0"

const partidasCW =
(jugador.wins_cw || 0) +
(jugador.losses_cw || 0)

const wrCW =
partidasCW > 0
? ((jugador.wins_cw / partidasCW) * 100).toFixed(1)
: "0.0"

await enviarMensaje(
telefono,
`📊 STATS — ${jugador.nombre}

🌐 GENERALES
Kills: ${killsGenerales}
Asistencias: ${assistsGenerales}
Muertes: ${deathsGenerales}
Puntos: ${puntosGenerales}
Victorias: ${winsGenerales}
Derrotas: ${lossesGenerales}
Winrate: ${wrGeneral}%
KD General: ${kdGeneral}
Racha máxima de victorias: ${jugador.racha_maxima || 0}

🎮 MIX
Kills: ${jugador.kills_mix || 0}
Asistencias: ${jugador.assists_mix || 0}
Muertes: ${jugador.deaths_mix || 0}
Puntos: ${jugador.points_mix || 0}
Victorias: ${jugador.wins_mix || 0}
Derrotas: ${jugador.losses_mix || 0}
Winrate: ${wrMix}%

🏆 CW / TORNEO
Kills: ${jugador.kills_cw || 0}
Asistencias: ${jugador.assists_cw || 0}
Muertes: ${jugador.deaths_cw || 0}
Puntos: ${jugador.points_cw || 0}
Victorias: ${jugador.wins_cw || 0}
Derrotas: ${jugador.losses_cw || 0}
Winrate: ${wrCW}%`
)

return
}

    if (mensaje.toLowerCase() === "!top") {

const { data: jugadores, error } = await supabase
.from("Jugadores")
.select("nombre,idgame,puntos_totales")
.order("puntos_totales", { ascending: false })

if (error || !jugadores) {
await enviarMensaje(
telefono,
"❌ Error al cargar el ranking."
)
return
}

const jugadoresConPuntos = jugadores.filter(j => (j.puntos_totales || 0) > 0)

if (jugadoresConPuntos.length === 0) {
await enviarMensaje(
telefono,
"📊 Todavía no hay jugadores con puntos en el ranking."
)
return
}

const tier1 = jugadoresConPuntos.slice(0, 6)
const tier2 = jugadoresConPuntos.slice(6, 16)
const tier3 = jugadoresConPuntos.slice(16)

const formato = (lista, inicio) =>
lista.map((j, i) =>
`${inicio + i}° - ${j.nombre} | ID: ${j.idgame || "Sin ID"} | ${j.puntos_totales || 0} pts`
).join("\n")

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

return
}
    
if (mensaje.trim().toLowerCase().startsWith("!registrar")) {

    console.log("ENTRO A REGISTRAR")

  const partes = mensaje.trim().replace(/\s+/g, " ").split(" ")

const idGame = String(partes[partes.length - 1]).replace(/\D/g, "")

const nick = partes
.slice(1, partes.length - 1)
.join(" ")
.trim()
    
  if (partes.length < 3) {

    await enviarMensaje(
      telefono,
      `❌ Formato incorrecto

Usá:
!registrar NICK ID

Ejemplo:
!registrar Colt 123456`
    )

    return
  }

if (!nick || nick.trim().length < 2) {
    
await reaccionarMensaje(telefono, req.body?.messageId, "❌")

await enviarMensaje(
telefono,
`❌ Nick inválido.

Usá tu nick EXACTO del juego, igual que aparece en las capturas y estadísticas.

✅ Permitido:
N1ty
N1ty77
乂KTH
ØColt
kth peek
C o l t
乂N1ty77乂

❌ No permitido:
Nick falso
Otro jugador

❌ No permitido:
Nity xd`
)

return
}

    if (!/^\d+$/.test(idGame)) {
await reaccionarMensaje(telefono, req.body?.messageId, "❌")

await enviarMensaje(
telefono,
`❌ Formato incorrecto.

Usá:
!registrar NICK ID

Ejemplo:
!registrar Colt 139527319

⚠️ El ID debe ser numérico y real.`
)

return
}

   const numeroLimpio = String(telefonoJugador).replace(/\D/g, "")

    const yaRegistrado = Object.values(jugadoresRegistrados).find(j =>
    String(j.telefono).replace(/\D/g, "") === numeroLimpio
)

if (yaRegistrado) {

    if (
yaRegistrado.nick.toLowerCase() === nick.toLowerCase() &&
yaRegistrado.idGame === idGame &&
String(yaRegistrado.telefono).replace(/\D/g, "") === numeroLimpio
) {
await reaccionarMensaje(telefono, req.body?.messageId, "⚠️")

await enviarMensaje(
telefono,
`⚠️ Ya estás registrado.

🎮 Nick: ${nick}
🆔 ID: ${idGame}
📱 Número: ${numeroLimpio}`
)

return
}

jugadoresRegistrados[telefonoJugador] = {
nick,
idGame,
telefono: numeroLimpio
}

guardarJugadores(jugadoresRegistrados)

await reaccionarMensaje(telefono, req.body?.messageId, "♻️")
    
await enviarMensaje(
telefono,
`♻️ Registro actualizado.

🎮 Nick: ${nick}
🆔 ID: ${idGame}`
)

return
}
    
jugadoresRegistrados[idGame] = {
  nick,
  idGame,
  telefono: numeroLimpio
}

guardarJugadores(jugadoresRegistrados)

    const { data: jugadorExistente } = await supabase
.from("Jugadores")
.select("*")
.or(`numero.eq.${numeroLimpio},idgame.eq.${idGame}`)
.limit(1)
.maybeSingle()

let error = null

if (jugadorExistente) {

    if (
jugadorExistente.nombre.toLowerCase() === nick.toLowerCase() &&
jugadorExistente.numero === numeroLimpio &&
jugadorExistente.idgame === idGame
) {

        await reaccionarMensaje(telefono, req.body?.messageId, "⚠️")
        
await enviarMensaje(
telefono,
`⚠️ Ya estás registrado.

🎮 Nick: ${nick}
🆔 ID: ${idGame}
📱 Número: ${numeroLimpio}`
)

return
}

const resultado = await supabase
.from("Jugadores")
.update({
nombre: nick,
numero: numeroLimpio,
idgame: idGame
})
.eq("id", jugadorExistente.id)

error = resultado.error

await enviarMensaje(
telefono,
`♻️ Registro actualizado

🎮 Nick: ${nick}
🆔 ID: ${idGame}
📱 Número: ${numeroLimpio}`
)

} else {

const resultado = await supabase
.from("Jugadores")
.insert([
{
nombre: nick,
numero: numeroLimpio,
idgame: idGame,
kills: 0,
muertes: 0,
victorias: 0,
derrotas: 0,
puntos: 0,
rol: "jugador"
}
])

error = resultado.error

    await reaccionarMensaje(telefono, req.body?.messageId, "📝")

await enviarMensaje(
telefono,
`✅ Jugador registrado

🎮 Nick: ${nick}
🆔 ID: ${idGame}
📱 Número: ${numeroLimpio}`
)

}

console.log("SUPABASE ERROR:", error)

}

    if (mensaje.startsWith("!editregistro")) {

const partes = mensaje.split(" ")

if (partes.length < 3) {
await enviarMensaje(
telefono,
`✏️ Formato incorrecto

Usá:
!editregistro NICK ID

Ejemplo:
!editregistro Colt 123456`
)
return
}

const nick = partes[1]
const idGame = partes[2]

const numeroLimpio = String(telefonoJugador).replace(/\D/g, "")

const { data: jugadores } = await supabase
.from("Jugadores")
.select("*")

const jugadorExistente = jugadores.find(j =>
j.numero === numeroLimpio ||
j.nombre === nick ||
j.idgame === idGame
)

if (!jugadorExistente) {
await enviarMensaje(
telefono,
"❌ No se encontró un perfil para actualizar."
)
return
}

const { error } = await supabase
.from("Jugadores")
.update({
nombre: nick,
numero: numeroLimpio,
idgame: idGame
})
.eq("id", jugadorExistente.id)

console.log("EDIT REGISTRO ERROR:", error)

await enviarMensaje(
telefono,
`♻️ Registro actualizado

🎮 Nick: ${nick}
🆔 ID: ${idGame}
📱 Número: ${numeroLimpio}`
)

return
}
    
if (mensaje.toLowerCase() === "!abrirmix") {

if (!esAdminPrincipal && !esOrganizador) {
await enviarMensaje(telefono, "❌ Solo administradores pueden abrir mixes")
return
}
    
  mixAbierto = true
  chatMixActivo = true
  jugadoresMix = []

await abrirChatGrupo()
    
  await enviarMensaje(telefono, "🔥 MIX ABIERTO\n\n👥 Cupos: 0/10\n\nUsá:\n!entrar\n\npara entrar al mix.")
}

if (mensaje.toLowerCase() === "!cerrarchat") {

    if (!esAdminPrincipal && !esOrganizador) {
        return enviarMensaje(
            telefono,
            "❌ No tienes permisos para usar este comando."
        )
    }

    try {

        const groupId = telefono

        await cerrarChatGrupo(groupId)

        await enviarMensaje(
            telefono,
            "🔒 Chat cerrado. Solo administradores pueden enviar mensajes."
        )

    } catch (error) {

        console.log("❌ ERROR CERRANDO CHAT MESSAGE:", error?.message)
console.log("❌ ERROR CERRANDO CHAT STACK:", error?.stack)
console.log("❌ sockGlobal existe?:", !!sockGlobal)
console.log("❌ sockGlobal user:", sockGlobal?.user)

        await enviarMensaje(
            telefono,
            "❌ Error al cerrar el chat."
        )
    }
}
    
    if (mensaje.toLowerCase() === "!abrirchat") {

    if (!esAdminPrincipal && !esOrganizador) {
        return enviarMensaje(
            telefono,
            "❌ No tienes permisos para usar este comando."
        )
    }

    try {

        const groupId = telefono

        await abrirChatGrupo(groupId)

        await enviarMensaje(
            telefono,
            "🔓 Chat abierto para todos."
        )

    } catch (error) {

        console.log("❌ ERROR ABRIENDO CHAT MESSAGE:", error?.message)
console.log("❌ ERROR ABRIENDO CHAT STACK:", error?.stack)
console.log("❌ sockGlobal existe?:", !!sockGlobal)
console.log("❌ sockGlobal user:", sockGlobal?.user)

        await enviarMensaje(
            telefono,
            "❌ Error al abrir el chat."
        )
    }
}

  if (
    mensaje.toLowerCase() === "!entrar"
) {

  if (!mixAbierto) {
    await enviarMensaje(telefono, "❌ No hay ningún mix abierto.")
    return
  }

  const numeroActual = String(telefonoJugador).replace(/\D/g, "")

let jugador = Object.values(jugadoresRegistrados).find(j => {
    const numeroGuardado = String(j.telefono).replace(/\D/g, "")

    return (
        numeroGuardado === numeroActual ||
        numeroActual.includes(numeroGuardado) ||
        numeroGuardado.includes(numeroActual) ||
        numeroActual.endsWith(numeroGuardado.slice(-8)) ||
        numeroGuardado.endsWith(numeroActual.slice(-8))
    )
})

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
      telefono,
      "❌ No estás registrado.\n\nUsá:\n!registrar NICK ID"
    )
    return
  }

   const yaEsta = jugadoresMix.find(j =>
String(j.telefono).replace(/\D/g, "") === numeroActual ||
String(j.idGame || j.idgame).replace(/\D/g, "") === String(jugador.idGame || jugador.idgame).replace(/\D/g, "")
)

  if (yaEsta) {
    await enviarMensaje(telefono, "⚠️ Ya estás dentro del mix.")
    return
  }

  jugadoresMix.push(jugador)

      await reaccionarMensaje(telefono, req.body?.messageId, "✅")

  let lista = ""

  jugadoresMix.forEach((j, index) => {
    lista += `${index + 1}. ${j.nick}\n`
  })

  await enviarMensaje(
    telefono,
    `✅ ${jugador.nick} entró al mix.

🔥 MIX ACTUAL

👥 Cupos: ${jugadoresMix.length}/10
⏳ Faltan: ${10 - jugadoresMix.length}

${lista || "Lista vacía."}`
  ) 

  if (jugadoresMix.length >= 10) {

mixAbierto = false
chatMixActivo = false

      await cerrarChatGrupo()

await enviarMensaje(
telefono,
`🔒 Chat cerrado automáticamente.

🎮 Mix completa.
📋 Generando equipos...`
)

const mezclados = [...jugadoresMix].sort(() => Math.random() - 0.5)
const equipoA = mezclados.slice(0, 5)
const equipoB = mezclados.slice(5, 10)

      equiposMixActual = {
  equipoA,
  equipoB
      }

const listaA = equipoA.map((j, i) => `${i + 1}. ${j.nick}`).join("\n")
const listaB = equipoB.map((j, i) => `${i + 1}. ${j.nick}`).join("\n")

await enviarMensaje(
telefono,
`🔥 MIX COMPLETO

🔵 EQUIPO A
${listaA}

🔴 EQUIPO B
${listaB}`
)

   await enviarEncuesta(telefono)   

}
}  

if (mensaje.toLowerCase() === "!cerrarmix") {

    if (!esAdminPrincipal && !esOrganizador) {
    await enviarMensaje(telefono, "❌ Solo administradores pueden cerrar mixes")
    return
}

    mixAbierto = false
    chatMixActivo = false
    jugadoresMix = []

    await enviarMensaje(
        telefono,
`🔒 MIX CERRADA

👥 Cupos: 0/10

Usá:
!abrirmix

para abrir una nueva.`
    )

    return
}

if (mensaje.toLowerCase() === "!reiniciarmix") {

    if (!esAdminPrincipal && !esOrganizador) {
    await enviarMensaje(telefono, "❌ Solo administradores pueden reiniciar mixes")
    return
}

await abrirChatGrupo()
    
    jugadoresMix = []
    mixAbierto = true
    chatMixActivo = true

    await enviarMensaje(
        telefono,
`♻️ MIX REINICIADO

👥 Cupos: 0/10

Usá:
!entrar

para anotarte nuevamente.`
    )

    return
}
    
  if (mensaje.toLowerCase() === "!fake10") {

if (!esAdminPrincipal && !esOrganizador) {
    await enviarMensaje(telefono, "❌ Solo administradores pueden usar fake10")
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
        telefono,
`🧪 MIX DE PRUEBA CARGADA

👥 Cupos: 10/10`
    )

    const jugadoresMezclados = [...jugadoresMix].sort(() => Math.random() - 0.5)

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
    telefono,
`🔥 MIX COMPLETO

🔵 EQUIPO A
${listaA}

🔴 EQUIPO B
${listaB}`
)

await enviarEncuesta(telefono)

      mixAbierto = false

return  

}  

if (mensaje.toLowerCase() === "!salir") {

  if (!mixAbierto) {
    await enviarMensaje(telefono, "❌ No hay ningún mix abierto.")
    return
  }

  const numeroActual = String(telefonoJugador).replace(/\D/g, "")

const indexJugador = jugadoresMix.findIndex(
    j => String(j.telefono).replace(/\D/g, "") === numeroActual
)

  if (indexJugador === -1) {
    await enviarMensaje(telefono, "⚠️ No estás anotado en el mix.")
    return
  }

  const jugador = jugadoresMix[indexJugador]

  jugadoresMix.splice(indexJugador, 1)

  let lista = ""

  jugadoresMix.forEach((j, index) => {
    lista += `${index + 1}. ${j.nick}\n`
  })

await reaccionarMensaje(telefono, req.body?.messageId, "🚪")
    
  await enviarMensaje(
    telefono,
    `🚪 ${jugador.nick} salió del mix.

🔥 MIX ACTUAL

👥 Cupos: ${jugadoresMix.length}/10
⏳ Faltan: ${10 - jugadoresMix.length}

${lista || "Lista vacía."}`
  )

    return
}

    if (mensaje.toLowerCase() === "!comandos") {

if (esAdminPrincipal || esOrganizador) {

await enviarMensaje(
telefono,
`📋 COMANDOS ORGANIZADOR

🏓 !ping

🔥 !abrirmix
❌ !cerrarmix
🔁 !reiniciarmix

🔒 !cerrarchat
🔓 !abrirchat

👑 !organizador NUMERO
🚫 !quitarorganizador NUMERO
👑 !organizadores

🧪 !fake10

👥 COMANDOS JUGADOR

📌 !registrar NICK ID
✏️ !editregistro NICK ID

🎮 !entrar
🚪 !salir`
)

return
}

await enviarMensaje(
telefono,
`📋 COMANDOS JUGADOR

📌 !registrar NICK ID
✏️ !editregistro NICK ID

🎮 !entrar
🚪 !salir`
)

return
    }

if (mensaje.toLowerCase() === "!mapas") {

await enviarMensaje(
telefono,
`🗺️ MAPAS DISPONIBLES

🏜️ dune
🪨 rust
🏛️ sandstone
🏚️ province
🌸 hanami
🏢 breeze
🔒 prison

Usá:
!votar MAPA

Ejemplo:
!votar dune`
)

return
}

    if (mensaje.toLowerCase() === "!votarmapa") {

        if (!esAdminPrincipal && !esOrganizador) {
    await enviarMensaje(telefono, "❌ Solo administradores pueden iniciar votaciones")
    return
}

await enviarEncuesta(telefono)

return
}

    if (mensaje.toLowerCase().startsWith("!organizador")) {

    if (!esAdminPrincipal) {
        await enviarMensaje(telefono, "❌ Solo el admin principal puede agregar organizadores")
        return
    }

    const partes = mensaje.split(" ")

    if (partes.length < 2) {
        await enviarMensaje(telefono, "❌ Usá: !organizador 549XXXXXXXXXX")
        return
    }

    const numeroNuevo = partes[1].replace(/\D/g, "")

    if (organizadores.includes(numeroNuevo)) {
        await enviarMensaje(telefono, "⚠️ Ese usuario ya es organizador")
        return
    }

    organizadores.push(numeroNuevo)

    await enviarMensaje(
        telefono,
        `✅ Organizador agregado\n\n📱 ${numeroNuevo}`
    )

    return

 }

if (mensaje.toLowerCase().startsWith("!quitarorganizador")) {

    if (!esAdminPrincipal) {
        await enviarMensaje(telefono, "❌ Solo el admin principal puede quitar organizadores")
        return
    }

    const partes = mensaje.split(" ")

    if (partes.length < 2) {
        await enviarMensaje(telefono, "❌ Usá: !quitarorganizador 549XXXXXXXXXX")
        return
    }

    const numeroQuitar = partes[1].replace(/\D/g, "")

    if (!organizadores.includes(numeroQuitar)) {
        await enviarMensaje(telefono, "⚠️ Ese número no es organizador")
        return
    }

    organizadores = organizadores.filter(n => n !== numeroQuitar)

    await enviarMensaje(
        telefono,
        `✅ Organizador quitado\n\n📱 ${numeroQuitar}`
    )

    return
}

    if (mensaje.toLowerCase() === "!organizadores") {

    if (!esAdminPrincipal && !esOrganizador) {
        await enviarMensaje(telefono,
            "❌ Solo administradores pueden usar este comando."
        )
        return
    }

    if (organizadores.length === 0) {
        await enviarMensaje(telefono,
            "📭 No hay organizadores registrados."
        )
        return
    }

    const lista = organizadores
        .map((numero, i) => `${i + 1}. ${numero}`)
        .join("\n")

    await enviarMensaje(
        telefono,
        `👑 ORGANIZADORES\n\n${lista}`
    )

    return
}
    
    const comandosValidos = [
  "!ping",
  "!registrar",
  "!abrirmix",
  "!cerrarmix",
  "!reiniciarmix",
  "!organizador",
  "!quitarorganizador",
  "!organizadores",
  "!entrar",   
  "!salir",
  "!mapas",
  "!votar",
  "!votarmapa",
  "!comandos", 
  "!cerrarchat",
  "!abrirchat",
]

if (
(
mensaje.startsWith("!") &&
!comandosValidos.some(cmd => mensaje.toLowerCase().startsWith(cmd))
)
||
(
captionImagen.startsWith("!") &&
!["!resultadomix", "!resultadocw"].includes(comandoResultado)
)
) {

await reaccionarMensaje(telefono, req.body?.messageId, "❌")

await enviarMensaje(
telefono,
"❌ Comando no reconocido.\n\nUsá !comandos para ver la lista."
)

return
}

if (!mensaje.startsWith("!") && !req.body?.fromApi) {

    const ahora = Date.now()

    if (usuariosMuteados[telefonoJugador]) {

        if (ahora < usuariosMuteados[telefonoJugador]) {
            return
        }

        delete usuariosMuteados[telefonoJugador]
    }

    if (!antiSpam[telefonoJugador]) {
        antiSpam[telefonoJugador] = []
    }

    antiSpam[telefonoJugador].push(ahora)

    antiSpam[telefonoJugador] =
        antiSpam[telefonoJugador].filter(
            t => ahora - t < 12 * 60 * 60 * 1000
        )

   if (antiSpam[numeroActual].length === 3) {

await reaccionarMensaje(telefono, req.body?.messageId, "⚠️")
       
await enviarMensaje(
telefono,
`⚠️ Advertencia por spam.

📱 ${telefonoJugador}

Si seguís enviando mensajes no permitidos serás silenciado temporalmente.`
)

return
}

if (antiSpam[numeroActual].length >= 4) {

        usuariosMuteados[numeroActual] =
            ahora + (12 * 60 * 60 * 1000)

await reaccionarMensaje(telefono, req.body?.messageId, "⛔")
        
        await enviarMensaje(
telefono,
            
`⛔ Usuario silenciado 12 horas por spam.

📱 ${telefonoJugador}

⚠️ Motivo:
Enviar demasiados mensajes no permitidos en el grupo mix.`
)

        return
    }

 await enviarMensaje(
telefono,
`❌ Solo se permiten comandos en este grupo.

⚠️ Advertencia:
Si enviás 4 mensajes que no sean comandos, serás bloqueado por 12 horas.

📊 Mensajes no permitidos: ${antiSpam[numeroActual].length}/4

Usá !comandos para ver la lista disponible.`
)

    return
}
    
  res.status(200).json({
    status: true
  })
})

app.listen(process.env.PORT || 3000, () => {
    console.log("🔥 C4 BOT PANEL ONLINE")
})
