const express = require("express")

const app = express()
app.use(express.json())

let jugadores = []
let mixAbierta = false
let listaMix = []

app.get("/", (req, res) => {
    res.send("🔥 C4 BOT ONLINE")
})

app.get("/jugadores", (req, res) => {
    res.json(jugadores)
})

app.post("/registrar", (req, res) => {
    const { nombre } = req.body

    if (!nombre) {
        return res.status(400).send("Falta nombre")
    }

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

    if (!mixAbierta) {
        return res.send("⛔ No hay mix abierta")
    }

    if (!jugadores.includes(nombre)) {
        return res.send("⛔ Jugador no registrado")
    }

    if (listaMix.includes(nombre)) {
        return res.send("⚠️ Ya estás anotado")
    }

    if (listaMix.length >= 10) {
        return res.send("⛔ Lista completa")
    }

    listaMix.push(nombre)

    if (listaMix.length === 10) {
        mixAbierta = false
        return res.send("🔥 MIX COMPLETA 10/10")
    }

    res.send(`✅ ${nombre} entró (${listaMix.length}/10)`)
})

app.get("/lista", (req, res) => {
    res.json(listaMix)
})

app.listen(process.env.PORT || 3000, () => {
    console.log("🔥 C4 BOT ONLINE")
})
