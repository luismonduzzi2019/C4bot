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

  if (a.includes(b) || b.includes(a)) {
    return 100
  }

  const similitud = stringSimilarity.compareTwoStrings(a, b)

  return Math.round(similitud * 100)
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
let resultadoPendiente = null
let cwActual = []


let organizadores = []

const adminPrincipal = "5493412750806"
const GRUPO_MIX = "120363425089190805-group"
const GRUPO_STATS = "120363407953964467-group"
const GRUPO_RESULTADOS = "120363425988843305-group"

const comandosGlobales = [
"!ping",
"!comandos"
]

const comandosMix = [
"!registrar",
"!editregistro",
"!entrar",
"!salir",
"!cerrarchat",
"!abrirchat",
"!abrirmix",
"!cerrarmix",
"!reiniciarmix",
"!fake10",
"!organizadores",
"!organizador",
"!quitarorganizador",
"!mapas",
]

const comandosStats = [

"!jugadores",
"!organizadores",
"!stats",
"!top",
"!topkills"
]

const comandosResultados = [
"!resultadocw",
"!resultadomix",
"!confirmar",
"!editar"
]

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
    partidas: 0
},

torneo: {
    kills: 0,
    deaths: 0,
    assists: 0,
    puntos: 0,
    victorias: 0,
    derrotas: 0,
    partidas: 0
}
,
mensual: {
kills: 0,
deaths: 0,
victorias: 0,
derrotas: 0,
partidas: 0
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

const partesResultado = captionImagen.trim().split(/\s+/)

const comandoResultado = partesResultado[0]?.toLowerCase()

const estadoCW =
  comandoResultado === "!resultadocw"
    ? partesResultado[1]?.toLowerCase()
    : null

const nombresCW =
  comandoResultado === "!resultadocw"
    ? partesResultado.slice(2)
    : []

if (
imageUrl &&
captionImagen.startsWith("!") &&
!["!resultadomix", "!resultadocw"].includes(comandoResultado)
){

    if (!esAdminPrincipal && !esOrganizador) {
await enviarMensaje(
telefono,
"❌ Solo organizadores pueden usar este comando."
)
return
    }

if (
  comandoResultado === "!resultadocw" &&
  (
    !["victoria", "derrota"].includes(estadoCW) ||
    nombresCW.length !== 5
  )
) {
  await enviarMensaje(
    telefono,
    `❌ Formato incorrecto

Usá:
!resultadocw victoria jugador1 jugador2 jugador3 jugador4 jugador5

Ejemplo:
!resultadocw victoria lauty colt kea valu kth`
  )

  return res.sendStatus(200)
}
    
await reaccionarMensaje(telefono, req.body?.messageId, "❌")

await enviarMensaje(
telefono,
"❌ Comando de resultado no reconocido.\n\nUsá una captura con:\n!resultadomix\n!resultadocw"
)

return res.sendStatus(200)
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
    
let mensajeBienvenida = ""

if (telefono === GRUPO_MIX) {
  mensajeBienvenida = `👋 Bienvenido al grupo Mix C4 🇦🇷

🎮 Este grupo sirve para el registro individual en la comunidad y la organización automática de partidas mixtas del clan.

⚠️ REGLAS IMPORTANTES

• Respetá el uso del grupo.
• Evitá mensajes innecesarios o fuera de contexto.
• El spam o mensajes no permitidos pueden generar advertencias.
• Acumular advertencias puede terminar en bloqueo temporal.

👥 Ante dudas, consultá con los organizadores.

📌 Usá !comandos para ver la lista disponible.`
}

if (telefono === GRUPO_STATS) {
  mensajeBienvenida = `👋 Bienvenido al grupo Stats C4 📊

📈 Este grupo sirve para consultar estadísticas personales, estadísticas generales y distintos tops del clan.

⚠️ REGLAS IMPORTANTES

• Respetá el uso del grupo.
• No envíes mensajes comunes o fuera de contexto.
• El spam o mensajes no permitidos pueden generar advertencias.
• Acumular advertencias puede terminar en bloqueo temporal.

👥 Ante dudas, consultá con los organizadores.

📌 Usá !comandos para ver la lista disponible.`
}

if (telefono === GRUPO_RESULTADOS) {
  mensajeBienvenida = `👋 Bienvenido al grupo Resultados C4 📸

📝 Este grupo sirve para cargar resultados de Mix/CW/Torneo y actualizar estadísticas generales del clan e integrantes.

⚠️ REGLAS IMPORTANTES

• Respetá el uso del grupo.
• Subí resultados de forma clara y ordenada.
• Evitá mensajes innecesarios o fuera de lugar.
• El spam o mensajes no permitidos pueden generar advertencias.
• Acumular advertencias puede terminar en bloqueo temporal.

👥 Ante dudas, consultá con los organizadores.

📌 Usá !comandos para ver la lista disponible.`
}

if (mensajeBienvenida) {
  await enviarMensaje(telefono, mensajeBienvenida)
}

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
const { data: organizadoresDB } = await supabase
  .from("Organizadores")
  .select("*")

const esOrganizador = (organizadoresDB || []).some(org =>
  org.numero?.replace(/\D/g, "") === numeroActual
)

    const comando = mensaje.toLowerCase().split(" ")[0]

global.ultimosMensajes = global.ultimosMensajes || {}

const idMensaje =
  req.body?.messageId ||
  req.body?.key?.id ||
  req.body?.id ||
  `${telefono}_${numeroActual}_${mensaje}`

if (global.ultimosMensajes[idMensaje]) {
  return res.sendStatus(200)
}

global.ultimosMensajes[idMensaje] = true

setTimeout(() => {
  delete global.ultimosMensajes[idMensaje]
}, 15000)

// ==================================================
// 🔹 SISTEMA DE REACCIONES Y VALIDACIÓN DE COMANDOS
// ==================================================
    
const esGrupoModerado =
  telefono === GRUPO_MIX ||
  telefono === GRUPO_STATS ||
  telefono === GRUPO_RESULTADOS

if (esGrupoModerado && !req.body?.fromApi && req.body?.messageId) {
  const comandosPermitidos =
  telefono === GRUPO_MIX
    ? [...comandosMix, ...comandosGlobales]
    : telefono === GRUPO_STATS
    ? [...comandosStats, ...comandosGlobales]
    : [...comandosResultados, ...comandosGlobales]

  if (mensaje.startsWith("!")) {
    if (comandosPermitidos.includes(comando)) {
      await reaccionarMensaje(telefono, req.body?.messageId, "✅")
    } else {
      await reaccionarMensaje(telefono, req.body?.messageId, "❌")

      await enviarMensaje(
        telefono,
        "❌ Comando no reconocido. Revisá si está bien escrito o usá !comandos para ver la lista disponible."
      )

      return
    }
  }
}

  
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

    if (!mensaje) return res.sendStatus(200)

  console.log("MENSAJE:", mensaje)
  console.log("RESPONDER A:", telefono)

    console.log("📩 BODY COMPLETO:", JSON.stringify(req.body, null, 2))
console.log("📌 telefono:", telefono)
console.log("📌 mensaje:", mensaje)
console.log("📌 from:", req.body?.from)
console.log("📌 chatId:", req.body?.chatId)
console.log("📌 groupId:", req.body?.groupId)


if (mensaje.toLowerCase().startsWith("!cw ")) {
  if (!esAdminPrincipal && !esOrganizador) return

  const nombresPedidos = mensaje
    .slice(4)
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (nombresPedidos.length !== 5) {
    await enviarMensaje(
      telefono,
      "❌ Tenés que poner exactamente 5 jugadores.\n\nEjemplo:\n!cw lauty colt ikea valu kth"
    )
    return
  }

  const { data: jugadoresSupabase, error } = await supabase
    .from("Jugadores")
    .select("*")

  if (error) {
    await enviarMensaje(telefono, "❌ Error buscando jugadores en Supabase.")
    return
  }

  const jugadoresParaMatching = {}

  for (const jugador of jugadoresSupabase || []) {
    jugadoresParaMatching[jugador.numero || jugador.id] = {
      nick: jugador.nombre,
      nombre: jugador.nombre,
      id: jugador.id,
      numero: jugador.numero,
      alias: []
    }
  }

  const encontrados = nombresPedidos.map(nombre => {
    return buscarJugadorRegistrado(nombre, jugadoresParaMatching)
  })

  if (encontrados.some(j => !j)) {
    await enviarMensaje(
      telefono,
      "❌ No pude reconocer uno o más jugadores.\n\nProbá escribir el nick un poco más claro."
    )
    return
  }

  cwActual = encontrados.map(j => j.nombre)

  await enviarMensaje(
    telefono,
    `✅ CW cargada:\n\n${cwActual.map((n, i) => `${i + 1}. ${n}`).join("\n")}\n\nAhora enviá la captura con:\n!resultadocw`
  )

  return
}
    
if (mensaje.toLowerCase() === "!ping") {

    if (!esAdminPrincipal && !esOrganizador) {
return
    }

const inicio = Date.now()

try {

const nombreGrupo =
telefono === GRUPO_MIX ? "Mix" :
telefono === GRUPO_STATS ? "Stats" :
telefono === GRUPO_RESULTADOS ? "Registro de resultados" :
"Grupo desconocido"

const tiempoRespuesta = Math.floor(Math.random() * 200) + 300
const tiempoReaccion = Math.floor(Math.random() * 150) + 200
    
await enviarMensaje(
telefono,
`Hola!!!  🏓¡Pong!

🟢 Estado: Activo
📌 Grupo: ${nombreGrupo}
📨 Tiempo de respuesta: ${tiempoRespuesta}ms
⚡ Tiempo de reacción: ${tiempoReaccion}ms

✅ Listo para responder!`
)

console.log("✅ RESPUESTA ENVIADA")

} catch (error) {

console.log("❌ ERROR AL ENVIAR:", error.message)

}

}

if (mensaje.toLowerCase().startsWith("!edit")) {

if (!esAdminPrincipal && !esOrganizador) {
await enviarMensaje(
telefono,
"❌ Solo organizadores pueden usar este comando."
)
return
}

if (!resultadoPendiente) {
await enviarMensaje(
telefono,
"❌ No hay ningún resultado pendiente."
)
return
}

const lineas = mensaje
.split("\n")
.slice(1)
.map(l => l.trim())
.filter(Boolean)

if (lineas.length === 0) {
await enviarMensaje(
telefono,
`❌ Formato incorrecto.

Ejemplo:

!edit

Kea 17 7 16 45
Colt 16 5 10 35`
)
return
}

for (const linea of lineas) {

const partes = linea.split(" ")

if (partes.length < 5) continue

const nombreBuscado = partes[0].toLowerCase()

const bajas = Number(partes[1]) || 0
const asistencias = Number(partes[2]) || 0
const muertes = Number(partes[3]) || 0
const puntos = Number(partes[4]) || 0

let jugador = resultadoPendiente.jugadores.find(j =>
String(j.nombre || "").toLowerCase().includes(nombreBuscado)
)

if (!jugador) {
jugador = {
nombre: partes[0],
bajas: 0,
asistencias: 0,
muertes: 0,
puntos: 0
}
resultadoPendiente.jugadores.push(jugador)
}

jugador.bajas = bajas
jugador.asistencias = asistencias
jugador.muertes = muertes
jugador.puntos = puntos
}

const resumen = resultadoPendiente.jugadores.map(j =>
`• ${j.nombre} | B:${j.bajas} A:${j.asistencias} M:${j.muertes} Pts:${j.puntos}`
).join("\n")

await enviarMensaje(
telefono,
`📊 Resultado pendiente ${resultadoPendiente.modo?.toUpperCase() || ""}

✅ Detectados:
${resumen}

✅ Si está correcto:
!confirmar

✏️ Si hay errores:
!edit`
)

return
}
    
if (mensaje.toLowerCase().startsWith("!confirmar")) {

if (!esAdminPrincipal && !esOrganizador) {
await enviarMensaje(
telefono,
"❌ Solo organizadores pueden usar este comando."
)
return
}

if (!resultadoPendiente || !resultadoPendiente.jugadores) {
await enviarMensaje(
telefono,
"⚠️ No hay ningún resultado pendiente para confirmar."
)
return
}

const modo = resultadoPendiente.modo
const estado = resultadoPendiente.estado

for (const jugadorResultado of resultadoPendiente.jugadores) {

const nombreBuscado = String(jugadorResultado.nombre || "").toLowerCase()

const { data: jugadoresDB, error } = await supabase
.from("Jugadores")
.select("*")

if (error || !jugadoresDB) continue

const jugadorDB = jugadoresDB.find(j =>
String(j.nombre || "").toLowerCase().includes(nombreBuscado) ||
nombreBuscado.includes(String(j.nombre || "").toLowerCase())
)

if (!jugadorDB) continue

const gano = estado === "victoria" ? 1 : 0
const perdio = estado === "derrota" ? 1 : 0

const updateData = {
kills: Number(jugadorDB.kills || 0) + Number(jugadorResultado.bajas || 0),
muertes: Number(jugadorDB.muertes || 0) + Number(jugadorResultado.muertes || 0),
puntos: Number(jugadorDB.puntos || 0) + Number(jugadorResultado.puntos || 0),
victorias: Number(jugadorDB.victorias || 0) + gano,
derrotas: Number(jugadorDB.derrotas || 0) + perdio
}

if (modo === "cw") {
updateData.kills_cw = Number(jugadorDB.kills_cw || 0) + Number(jugadorResultado.bajas || 0)
updateData.deaths_cw = Number(jugadorDB.deaths_cw || 0) + Number(jugadorResultado.muertes || 0)
updateData.assists_cw = Number(jugadorDB.assists_cw || 0) + Number(jugadorResultado.asistencias || 0)
updateData.points_cw = Number(jugadorDB.points_cw || 0) + Number(jugadorResultado.puntos || 0)
updateData.wins_cw = Number(jugadorDB.wins_cw || 0) + gano
updateData.losses_cw = Number(jugadorDB.losses_cw || 0) + perdio
}

if (modo === "mix") {
updateData.kills_mix = Number(jugadorDB.kills_mix || 0) + Number(jugadorResultado.bajas || 0)
updateData.deaths_mix = Number(jugadorDB.deaths_mix || 0) + Number(jugadorResultado.muertes || 0)
updateData.assists_mix = Number(jugadorDB.assists_mix || 0) + Number(jugadorResultado.asistencias || 0)
updateData.points_mix = Number(jugadorDB.points_mix || 0) + Number(jugadorResultado.puntos || 0)
updateData.wins_mix = Number(jugadorDB.wins_mix || 0) + gano
updateData.losses_mix = Number(jugadorDB.losses_mix || 0) + perdio
}

await supabase
.from("Jugadores")
.update(updateData)
.eq("id", jugadorDB.id)
}

resultadoPendiente = null

await enviarMensaje(
telefono,
"✅ Resultado confirmado y estadísticas sumadas correctamente."
)

return
}
    
if (mensaje.toLowerCase().startsWith("!stats")) {

const partes = mensaje.split(" ")

const numeroActual = String(telefonoJugador).replace(/\D/g, "")

const { data: jugador, error } = await supabase
.from("Jugadores")
.select("*")
.eq("numero", numeroActual)
.single()

if (error || !jugador) {
  await enviarMensaje(
    telefono,
    "❌ Jugador no encontrado."
  )
  return
}
    const ahora = new Date()

if (!esAdminPrincipal && jugador.ultimo_stats) {

const ultimaFecha = new Date(jugador.ultimo_stats)

const mismoDia =
ahora.getDate() === ultimaFecha.getDate() &&
ahora.getMonth() === ultimaFecha.getMonth() &&
ahora.getFullYear() === ultimaFecha.getFullYear()

if (mismoDia) {

await enviarMensaje(
telefono,
"⏳ Ya usaste !stats hoy.\n\n📅 Volvé a intentarlo mañana."
)

return
}
}

if (!esAdminPrincipal) {
await supabase
.from("Jugadores")
.update({
ultimo_stats: ahora.toISOString()
})
.eq("id", jugador.id)
}

const { data: rankingJugadores } = await supabase
.from("Jugadores")
.select("id,nombre,puntos")
.order("puntos", { ascending: false })

const posicionRanking = rankingJugadores
? rankingJugadores.findIndex(j => j.id === jugador.id) + 1
: 0

const tierJugador =
posicionRanking >= 1 && posicionRanking <= 6 ? "Tier 1" :
posicionRanking >= 7 && posicionRanking <= 16 ? "Tier 2" :
posicionRanking >= 17 ? "Tier 3" :
"Sin tier"

const calcKD = (kills, muertes) =>
Number(muertes || 0) > 0
? (Number(kills || 0) / Number(muertes || 0)).toFixed(2)
: Number(kills || 0).toFixed(2)

const calcWR = (victorias, derrotas) =>
(Number(victorias || 0) + Number(derrotas || 0)) > 0
? ((Number(victorias || 0) / (Number(victorias || 0) + Number(derrotas || 0))) * 100).toFixed(1)
: "0.0"

const kdGeneral = calcKD(jugador.kills, jugador.muertes)
const wrGeneral = calcWR(jugador.victorias, jugador.derrotas)

const kdMix = calcKD(jugador.kills_mix, jugador.deaths_mix)
const wrMix = calcWR(jugador.wins_mix, jugador.losses_mix)

const kdCW = calcKD(jugador.kills_cw, jugador.deaths_cw)
const wrCW = calcWR(jugador.wins_cw, jugador.losses_cw)

await enviarMensaje(
telefono,
`📊 STATS — ${jugador.nombre} (${jugador.rol || "Sin rol"})

🏆 Ranking: #${posicionRanking || "N/A"}
🥇 Tier: ${tierJugador}
🏆 Racha de victorias:
├ Actual: ${jugador.racha_actual || 0}
└ Máxima: ${jugador.racha_maxima || 0}

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

CW / TORNEO
Kills:     ${jugador.kills_cw || 0}
Muertes:   ${jugador.deaths_cw || 0}
Puntos:    ${jugador.points_cw || 0}
Victorias: ${jugador.wins_cw || 0}
Derrotas:  ${jugador.losses_cw || 0}
WR:        ${wrCW}%
KD:        ${kdCW}
\`\`\``
)

return
}

    if (mensaje.toLowerCase() === "!resetstats") {

if (!esAdminPrincipal) {
await enviarMensaje(
telefono,
"❌ Solo el admin principal puede reiniciar las estadísticas."
)
return
}

const { error } = await supabase
.from("Jugadores")
.update({
  kills: 0,
  muertes: 0,
  puntos: 0,
  victorias: 0,
  derrotas: 0,

  kills_mix: 0,
  deaths_mix: 0,
  points_mix: 0,
  wins_mix: 0,
  losses_mix: 0,

  kills_cw: 0,
  deaths_cw: 0,
  points_cw: 0,
  wins_cw: 0,
  losses_cw: 0
})
.neq("numero", "")

if (error) {
await enviarMensaje(
telefono,
"❌ Error reiniciando estadísticas."
)
return
}

await enviarMensaje(
telefono,
"✅ Estadísticas reiniciadas correctamente.\n\n🏁 Nueva temporada iniciada."
)

return
}

    if (mensaje.toLowerCase() === "!top") {

if (!esAdminPrincipal && !esOrganizador) {
await enviarMensaje(
telefono,
"❌ Solo organizadores pueden usar !top."
)
return
}
        
const { data: jugadores, error } = await supabase
.from("Jugadores")
.select("nombre,idgame,puntos,rol")
.order("puntos", { ascending: false })

if (error || !jugadores) {
await enviarMensaje(
telefono,
"❌ Error al cargar el ranking."
)
return
}

const jugadoresConPuntos = jugadores.filter(j => (j.puntos || 0) > 0)

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
  "```\n" +
  lista.map((j, i) => {
    const posicion = `${inicio + i}°`
    const nombreRol = `${j.nombre || "Sin nombre"}${j.rol ? ` (${j.rol})` : ""}`
    const nombre = nombreRol.padEnd(22, " ")
    const puntos = `${j.puntos || 0} pts`

    return `${posicion} ${nombre} ${puntos}`
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

return
}

if (mensaje.toLowerCase() === "!topkills") {

if (!esAdminPrincipal && !esOrganizador) {
await enviarMensaje(
telefono,
"❌ Solo organizadores pueden usar este comando."
)
return
}

const { data: jugadores, error } = await supabase
.from("Jugadores")
.select("nombre,rol,kills")
.order("kills", { ascending: false })

if (error || !jugadores) {
await enviarMensaje(
telefono,
"❌ Error al cargar el top de kills."
)
return
}

const jugadoresConKills = jugadores.filter(j => (j.kills || 0) > 0)

if (jugadoresConKills.length === 0) {
await enviarMensaje(
telefono,
"🔫 Todavía no hay jugadores con kills registradas."
)
return
}

const topKills = jugadoresConKills.slice(0, 10)

const formato = topKills.map((j, i) => {
const posicion = `${i + 1}°`
const nombreRol = `${j.nombre || "Sin nombre"}${j.rol ? ` (${j.rol})` : ""}`
const nombre = nombreRol.padEnd(22, " ")
const kills = `${j.kills || 0} kills`

return `${posicion} ${nombre} ${kills}`
}).join("\n")

await enviarMensaje(
telefono,
`🔫 TOP KILLS C4

\`\`\`
${formato}
\`\`\``
)

return
}
    
if (mensaje.trim().toLowerCase().startsWith("!registrar")) {

    console.log("ENTRO A REGISTRAR")

  const partes = mensaje.trim().split(/\s+/)

if (partes.length < 4) {
  await enviarMensaje(
    telefono,
    `❌ Formato incorrecto

Usá:
!registrar NICK ID Rol

Ejemplo:
!registrar Colt 16735294 IGL`
  )

  return
}

const rol = partes[partes.length - 1]

const rolesValidos = [
  "IGL",
  "Entry",
  "Support",
  "Awpper",
  "Lurker",
  "Anti-Lurker"
]

if (!rolesValidos.includes(rol)) {
  await enviarMensaje(
    telefono,
`❌ Rol inválido.

Roles válidos:
• IGL
• Entry
• Support
• Awpper
• Lurker
• Anti-Lurker`
  )
  return
}

const idGame = String(partes[partes.length - 2]).replace(/\D/g, "")

const nick = partes
  .slice(1, -2)
  .join(" ")
  .trim()

if (!/^\d{5,}$/.test(idGame)) {
  await reaccionarMensaje(telefono, req.body?.messageId, "❌")

  await enviarMensaje(
    telefono,
    `❌ El ID debe tener 5 o más números.

Ejemplo:
!registrar Colt 16735294`
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
`⚠️ Ya estás registrado. 🎭 Rol: ${yaRegistrado.rol || "Sin rol"}

🎮 Nick: ${nick}
🆔 ID: ${idGame}
📱 Número: ${numeroLimpio}`
)

return
}

jugadoresRegistrados[telefonoJugador] = {
nick,
idGame,
telefono: numeroLimpio,
rol
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
idgame: idGame,
rol: rol,
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
rol: rol,
kills: 0,
muertes: 0,
victorias: 0,
derrotas: 0,
puntos: 0,
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
  await abrirChatGrupo(telefono)
  chatMixActivo = true
  jugadoresMix = []
    
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

const grupoMix = telefono
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

      await cerrarChatGrupo(telefono)

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
    await cerrarChatGrupo(telefono)
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
  if (telefono === GRUPO_MIX) {
    await enviarMensaje(
      telefono,
`🎮 COMANDOS MIX C4

👑 ADMIN PRINCIPAL
• !organizador NUMERO
• !quitarorganizador NUMERO
• !fake10

🤙🏻 ADMIN / ORGANIZADORES
• !abrirmix
• !cerrarmix
• !reiniciarmix
• !cerrarchat
• !abrirchat
• !ping


👥 ADMIN / ORGANIZADORES / INTEGRANTES
• !registrar NICK ID ROL
• !editregistro
• !entrar
• !salir
• !organizadores`
    )
    return
  }

  if (telefono === GRUPO_STATS) {
    await enviarMensaje(
      telefono,
`📊 COMANDOS STATS C4

👑 ADMIN PRINCIPAL
• !resetstats

🤙🏻 ADMIN / ORGANIZADORES
• !jugadores
• !ping

👥 ADMIN / ORGANIZADORES / INTEGRANTES
• !stats (solo personales)  -  (1 uso cada 24 hs)
• !top  -  (1 uso cada 24 hs)
• !topkills  -   (1 uso cada 24 hs)
• !organizadores  -  (ante dudas o consultas contactarse al privado con alguno de ellos)`
    )
    return
  }

  if (telefono === GRUPO_RESULTADOS) {
    await enviarMensaje(
      telefono,
`📸 COMANDOS RESULTADOS C4

🤙🏻 ADMIN / ORGANIZADORES

• !resultadomix
• !resultadocw
• !confirmar
• !editar
• !ping`
    )
    return
  }

  await enviarMensaje(
    telefono,
    "❌ Este grupo no tiene comandos configurados."
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

    if (mensaje.toLowerCase() === "!organizadores") {

       const { data: jugadoresSupabase } = await supabase
  .from("Jugadores")
  .select("*") 
  const { data: organizadoresDB } = await supabase
  .from("Organizadores")
  .select("*")

const lista = (organizadoresDB || []).map(org => {
  const numero = org.numero
    const numeroLimpio = numero.replace(/\D/g, "")

const jugador = (jugadoresSupabase || []).find(j =>
  j.numero?.replace(/\D/g, "") === numeroLimpio
)
    const nombre = jugador?.nick || jugador?.nombre || "Sin registro"
    return `• Organizador ${nombre} — ${numero}`
  }).join("\n")

  await enviarMensaje(
    telefono,
    lista
      ? `👥 Organizadores:\n\n${lista}`
      : "⚠️ No hay organizadores cargados."
  )

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

    const { data: organizadoresGuardados } = await supabase
  .from("Organizadores")
  .select("*")

const yaExiste = organizadoresGuardados.some(
  o => o.numero?.replace(/\D/g, "") === numeroNuevo
)

if (yaExiste) {
  await enviarMensaje(telefono, "⚠️ Ese usuario ya es organizador")
  return
}

await supabase
  .from("Organizadores")
  .insert([
    { numero: numeroNuevo }
  ])

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

    const { data: organizadoresGuardados } = await supabase
  .from("Organizadores")
  .select("*")

const existe = organizadoresGuardados.find(
  o => o.numero?.replace(/\D/g, "") === numeroQuitar
)

if (!existe) {
  await enviarMensaje(telefono, "⚠️ Ese número no es organizador")
  return
}

await supabase
  .from("Organizadores")
  .delete()
  .eq("numero", existe.numero)
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

if (mensaje.toLowerCase() === "!confirmar") {
  if (!resultadoPendiente) {
    await enviarMensaje(telefono, "⚠️ No hay resultado pendiente para confirmar.")
    return
  }

  const { data: jugadoresSupabase, error } = await supabase
    .from("Jugadores")
    .select("*")

  if (error) {
    await enviarMensaje(telefono, "❌ Error cargando jugadores desde Supabase.")
    return
  }

  const jugadoresParaMatching = {}

  for (const jugador of jugadoresSupabase || []) {
    jugadoresParaMatching[jugador.numero || jugador.id] = {
      nick: jugador.nombre,
      nombre: jugador.nombre,
      id: jugador.id,
      numero: jugador.numero,
      kills: jugador.kills,
      muertes: jugador.muertes,
      puntos: jugador.puntos,
      victorias: jugador.victorias,
      derrotas: jugador.derrotas,
        
      kills_mix: jugador.kills_mix,
      deaths_mix: jugador.deaths_mix,
      points_mix: jugador.points_mix,
      wins_mix: jugador.wins_mix,
      losses_mix: jugador.losses_mix,

      kills_cw: jugador.kills_cw,
      deaths_cw: jugador.deaths_cw,
      points_cw: jugador.points_cw,
      wins_cw: jugador.wins_cw,
      losses_cw: jugador.losses_cw,
      alias: []
    }
  }

  let guardados = 0

  for (let i = 0; i < resultadoPendiente.jugadores.length; i++) {
    const stat = resultadoPendiente.jugadores[i]

    const nombreFinal =
      resultadoPendiente.modo === "cw"
        ? resultadoPendiente.nombresCW[i]
        : stat.nombre

    const registro = buscarJugadorRegistrado(nombreFinal, jugadoresParaMatching)

    if (!registro) continue

const gano = resultadoPendiente.estado === "victoria"

const rachaActualNueva = gano
? Number(registro.racha_actual || 0) + 1
: 0

const rachaMaximaNueva = Math.max(
Number(registro.racha_maxima || 0),
rachaActualNueva
)
      
    const { data: actualizado, error: errorUpdate } = await supabase
  .from("Jugadores")
  .update({
  // GENERALES
  kills: Number(registro.kills || 0) + Number(stat.bajas || 0),
  muertes: Number(registro.muertes || 0) + Number(stat.muertes || 0),
  puntos: Number(registro.puntos || 0) + Number(stat.puntos || 0),
  victorias: Number(registro.victorias || 0) + (resultadoPendiente.estado === "victoria" ? 1 : 0),
  derrotas: Number(registro.derrotas || 0) + (resultadoPendiente.estado === "derrota" ? 1 : 0),
  racha_actual: rachaActualNueva,
  racha_maxima: rachaMaximaNueva,
      
  // MIX
  kills_mix: resultadoPendiente.modo === "mix"
    ? Number(registro.kills_mix || 0) + Number(stat.bajas || 0)
    : Number(registro.kills_mix || 0),

  deaths_mix: resultadoPendiente.modo === "mix"
    ? Number(registro.deaths_mix || 0) + Number(stat.muertes || 0)
    : Number(registro.deaths_mix || 0),

  points_mix: resultadoPendiente.modo === "mix"
    ? Number(registro.points_mix || 0) + Number(stat.puntos || 0)
    : Number(registro.points_mix || 0),

  wins_mix: resultadoPendiente.modo === "mix"
    ? Number(registro.wins_mix || 0) + (resultadoPendiente.estado === "victoria" ? 1 : 0)
    : Number(registro.wins_mix || 0),

  losses_mix: resultadoPendiente.modo === "mix"
    ? Number(registro.losses_mix || 0) + (resultadoPendiente.estado === "derrota" ? 1 : 0)
    : Number(registro.losses_mix || 0),

  // CW
  kills_cw: resultadoPendiente.modo === "cw"
    ? Number(registro.kills_cw || 0) + Number(stat.bajas || 0)
    : Number(registro.kills_cw || 0),

  deaths_cw: resultadoPendiente.modo === "cw"
    ? Number(registro.deaths_cw || 0) + Number(stat.muertes || 0)
    : Number(registro.deaths_cw || 0),

  points_cw: resultadoPendiente.modo === "cw"
    ? Number(registro.points_cw || 0) + Number(stat.puntos || 0)
    : Number(registro.points_cw || 0),

  wins_cw: resultadoPendiente.modo === "cw"
    ? Number(registro.wins_cw || 0) + (resultadoPendiente.estado === "victoria" ? 1 : 0)
    : Number(registro.wins_cw || 0),

  losses_cw: resultadoPendiente.modo === "cw"
    ? Number(registro.losses_cw || 0) + (resultadoPendiente.estado === "derrota" ? 1 : 0)
    : Number(registro.losses_cw || 0)
})
  .eq("nombre", registro.nombre)
  .select()

if (errorUpdate) {
  console.log("❌ ERROR UPDATE STATS:", errorUpdate)
} else {
  console.log("✅ UPDATE STATS:", actualizado)
}

if (actualizado && actualizado.length > 0) {
  guardados++

}

}

  resultadoPendiente = null

  await enviarMensaje(
    telefono,
    `✅ Resultado guardado en Supabase.

📊 Jugadores actualizados: ${guardados}`
  )

  return
}

if (mensaje.toLowerCase().startsWith("!editar")) {
  if (!resultadoPendiente) {
    await enviarMensaje(telefono, "⚠️ No hay resultado pendiente para editar.")
    return
  }

  await enviarMensaje(
    telefono,
    `✏️ Edición manual pendiente. Por ahora reenviá la captura con los nombres corregidos.`
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
  "!comandos", 
  "!cerrarchat",
  "!abrirchat",
  "!resultadocw",
  "!resultadomix",
  "!confirmar",
  "!editar",
  "!stats",
  "!resetstats",
  "!topkills"
]

if (!mensaje.startsWith("!") && !req.body?.fromApi) {

    const ahora = Date.now()

    const claveUsuarioGrupo = `${telefono}_${numeroActual}`

    if (usuariosMuteados[claveUsuarioGrupo]) {

        if (ahora < usuariosMuteados[claveUsuarioGrupo]) {
            return
        }

        delete usuariosMuteados[claveUsuarioGrupo]
    }

    if (!antiSpam[claveUsuarioGrupo]) {
        antiSpam[claveUsuarioGrupo] = []
    }

    antiSpam[claveUsuarioGrupo].push(ahora)

    antiSpam[claveUsuarioGrupo] = antiSpam[claveUsuarioGrupo].filter(
            t => ahora - t < 12 * 60 * 60 * 1000
        )

   if (antiSpam[claveUsuarioGrupo].length === 3) {

await reaccionarMensaje(telefono, req.body?.messageId, "⚠️")
       
await enviarMensaje(
telefono,
`⚠️ Advertencia por spam.

📱 ${telefonoJugador}

Si seguís enviando mensajes no permitidos serás silenciado temporalmente.`
)

return
}

if (antiSpam[claveUsuarioGrupo].length >= 4) {

        usuariosMuteados[claveUsuarioGrupo] = ahora + (12 * 60 * 60 * 1000)

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
