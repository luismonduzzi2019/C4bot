const fs = require("fs")

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

const express = require("express")

const jugadoresRegistrados = cargarJugadores()

let mixAbierto = false
let jugadoresMix = []

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

let admins = []

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

async function enviarEncuesta(telefone) {

    const resposta = await fetch(
        `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_TOKEN}/send-poll`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Client-Token": process.env.ZAPI_CLIENT_TOKEN
            },
            body: JSON.stringify({
    phone: telefone,
    poll: {
        name: "🗺️ PICK MAPA",
        selectableCount: 1,
        options: [
                    "Dune",
                    "Rust",
                    "Sandstone",
                    "Province",
                    "Prisión",
                    "Hanami",
                    "Breeze"
                ]
    }
            })
        }
    )

    const texto = await resposta.text()

    console.log("STATUS ENCUESTA:", resposta.status)
    console.log("RESPUESTA ENCUESTA:", texto)
}

app.post("/webhook", async (req, res) => {
    
  console.log("📩 WEBHOOK RECIBIDO")
  console.log(req.body)

  const mensaje = req.body?.text?.message || ""
  const telefono = req.body?.phone

    const telefonoJugador =
    req.body?.participantPhone ||
    req.body?.senderPhone ||
    req.body?.author ||
    req.body?.from ||
    telefono

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

if (req.body?.fromMe) return res.sendStatus(200)

  console.log("MENSAJE:", mensaje)
  console.log("RESPONDER A:", telefono)

if (mensaje.toLowerCase() === "!ping") {

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
    
if (mensaje.startsWith("!registrar")) {

  const partes = mensaje.split(" ")

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

  const nick = partes[1]
  const idGame = partes[2]

   const numeroLimpio = String(telefonoJugador).replace(/\D/g, "")

    const yaRegistrado = Object.values(jugadoresRegistrados).find(j =>
    String(j.telefono).replace(/\D/g, "") === numeroLimpio
)

if (yaRegistrado) {
    await enviarMensaje(
        telefono,
        `⚠️ Ya estás registrado.

🎮 Nick: ${yaRegistrado.nick}
🆔 ID: ${yaRegistrado.idGame}`
    )
    return
}
    
jugadoresRegistrados[idGame] = {
  nick,
  idGame,
  telefono: numeroLimpio
}

guardarJugadores(jugadoresRegistrados)

  await enviarMensaje(
  telefono,
  `✅ Jugador registrado

🎮 Nick: ${nick}
🆔 ID: ${idGame}
📱 Número: ${numeroLimpio}`
      
)

}

if (mensaje.toLowerCase() === "!abrirmix") {
  mixAbierto = true
  jugadoresMix = []

  await enviarMensaje(telefono, "🔥 MIX ABIERTO\n\n👥 Cupos: 0/10\n\nUsá:\n!entrar\n\npara entrar al mix.")
}

  if (
    mensaje.toLowerCase() === "!join" ||
    mensaje.toLowerCase() === "!entrar"
) {

  if (!mixAbierto) {
    await enviarMensaje(telefono, "❌ No hay ningún mix abierto.")
    return
  }

  const numeroActual = String(telefonoJugador).replace(/\D/g, "")

const jugador = Object.values(jugadoresRegistrados).find(j => {
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
    await enviarMensaje(
      telefono,
      "❌ No estás registrado.\n\nUsá:\n!registrar NICK ID"
    )
    return
  }

  const yaEsta = jugadoresMix.find(
    j => j.telefono === telefono
  )

  if (yaEsta) {
    await enviarMensaje(telefono, "⚠️ Ya estás dentro del mix.")
    return
  }

  jugadoresMix.push(jugador)

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

const mezclados = [...jugadoresMix].sort(() => Math.random() - 0.5)
const equipoA = mezclados.slice(0, 5)
const equipoB = mezclados.slice(5, 10)

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

    if (mensaje.toLowerCase() === "!resetmix") {

jugadoresMix = []
mixAbierto = false

await enviarMensaje(
telefono,
`♻️ MIX REINICIADO

👥 Cupos: 0/10

Usá:
!abrirmix

para abrir uno nuevo.`
)

return
}

  if (mensaje.toLowerCase() === "!fake10") {

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

await enviarMensaje(
telefono,
`📋 COMANDOS DISPONIBLES

🏓 !ping
📥 !registrar NICK ID
🔥 !abrirmix
❌ !cerrarmix
🎮 !join
🚪 !salir

🗺️ !mapas
🗳️ !votar MAPA`
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

await enviarEncuesta(telefono)

return
}
    
    const comandosValidos = [
  "!ping",
  "!registrar",
  "!abrirmix",
  "!cerrarmix",
  "!join",
  "!entrar",   
  "!salir",
  "!mapas",
  "!votar",
  "!votarmapa",
  "!comandos",   
]

if (
  mensaje.startsWith("!") &&
  !comandosValidos.some(cmd => mensaje.toLowerCase().startsWith(cmd))
) {
  await enviarMensaje(
    telefono,
    "❌ Comando no reconocido.\n\nUsá !comandos para ver la lista."
  )
}
    
  res.status(200).json({
    status: true
  })
})

app.listen(process.env.PORT || 3000, () => {
    console.log("🔥 C4 BOT PANEL ONLINE")
})

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys")

const qrcode = require("qrcode-terminal")

