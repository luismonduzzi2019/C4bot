const express = require("express")

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

let jugadores = []
let mixAbierta = false
let listaMix = []

app.get("/", (req, res) => {
    res.send(`
        <h1>🔥 C4 BOT PANEL</h1>

        <h2>Registrar jugador</h2>
        <form action="/registrar" method="POST">
            <input name="nombre" placeholder="Nombre del jugador" />
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
        <a href="/lista">Ver lista</a>

        <h2>Jugadores registrados</h2>
        <a href="/jugadores">Ver jugadores</a>
    `)
})

app.get("/jugadores", (req, res) => {
    res.json(jugadores)
})

app.post("/registrar", (req, res) => {
    const { nombre } = req.body

    if (!nombre) return res.send("Falta nombre")

    if (jugadores.includes(nombre)) {
        return res.send("Jugador ya registrado")
    }

    jugadores.push(nombre)
    res.send(`✅ ${nombre} registrado`)
})

app.post("/abrir-mix", (req, res) => {
    mixAbierta = true
    listaMix = []
    res.send("🔥 MIX ABIERTA")
})

app.post("/entrar", (req, res) => {
    const { nombre } = req.body

    if (!mixAbierta) return res.send("⛔ No hay mix abierta")
    if (!jugadores.includes(nombre)) return res.send("⛔ Jugador no registrado")
    if (listaMix.includes(nombre)) return res.send("⚠️ Ya estás anotado")
    if (listaMix.length >= 10) return res.send("⛔ Lista completa")

    listaMix.push(nombre)

   if (listaMix.length === 10) {
    mixAbierta = false

    const mezclados = [...listaMix].sort(() => Math.random() - 0.5)

    const equipoA = mezclados.slice(0, 5)
    const equipoB = mezclados.slice(5, 10)

    let resultado = "🔥 MIX COMPLETA 10/10<br><br>"

    resultado += "🔵 Equipo A:<br>"
    equipoA.forEach((j) => {
        resultado += j + "<br>"
    })

    resultado += "<br>🔴 Equipo B:<br>"
    equipoB.forEach((j) => {
        resultado += j + "<br>"
    })

    return res.send(resultado)
}

    res.send(`✅ ${nombre} entró (${listaMix.length}/10)`)
})

app.get("/lista", (req, res) => {
    res.json(listaMix)
})

app.listen(process.env.PORT || 3000, () => {
    console.log("🔥 C4 BOT PANEL ONLINE")
})
