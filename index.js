const fs = require("fs")

const express = require("express")

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

let jugadores = []
let mixAbierta = false
let listaMix = []

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

        kills: 0,
        deaths: 0,
        victorias: 0,
        derrotas: 0,
        mvps: 0,
        mixes: 0
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

app.listen(process.env.PORT || 3000, () => {
    console.log("🔥 C4 BOT PANEL ONLINE")
})
