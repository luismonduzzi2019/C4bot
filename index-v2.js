const express = require("express")
const { createClient } = require("@supabase/supabase-js")

const app = express()
app.use(express.json())

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

const adminPrincipal = "5493412750806"

const GRUPOS = {
  MIX: "120363425089190805-group",
  STATS: "120363407953964467-group",
  RESULTADOS: process.env.GRUPO_RESULTADOS || "PEGAR_ID_GRUPO_RESULTADOS"
}

async function enviarMensaje(phone, message) {
  const respuesta = await fetch(
    `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_TOKEN}/send-text`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": process.env.ZAPI_CLIENT_TOKEN
      },
      body: JSON.stringify({ phone, message })
    }
  )

  const texto = await respuesta.text()
  console.log("STATUS ENVIO:", respuesta.status)
  console.log("RESPUESTA ZAPI:", texto)
}

function normalizarNumero(valor) {
  return String(valor || "").replace(/\D/g, "")
}

function obtenerMensaje(body) {
  return String(
    body?.text?.message ||
    body?.message?.text ||
    body?.caption ||
    ""
  ).trim()
}

function obtenerGrupo(body) {
  return body?.phone || body?.chatId || body?.groupId || ""
}

function obtenerNumeroAutor(body) {
  return normalizarNumero(
    body?.participantPhone ||
    body?.senderPhone ||
    body?.author ||
    body?.from ||
    body?.phone
  )
}

function esMensajeDelBot(body) {
  return (
    body?.fromMe === true ||
    body?.isMe === true ||
    body?.fromApi === true
  )
}

function esGrupoPermitido(groupId) {
  return Object.values(GRUPOS).includes(groupId)
}

async function esOrganizador(numero) {
  if (numero === adminPrincipal) return true

  const { data, error } = await supabase
    .from("Organizadores")
    .select("numero")

  if (error) {
    console.log("ERROR ORGANIZADORES:", error)
    return false
  }

  return (data || []).some(org =>
    normalizarNumero(org.numero) === numero
  )
}

app.get("/", (req, res) => {
  res.send("🔥 C4 BOT ONLINE - Núcleo seguro")
})

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body

    const mensaje = obtenerMensaje(body)
    const groupId = obtenerGrupo(body)
    const numeroAutor = obtenerNumeroAutor(body)

    if (esMensajeDelBot(body)) {
      return res.status(200).json({ ok: true, ignored: "bot" })
    }

    if (!mensaje) {
      return res.status(200).json({ ok: true, ignored: "empty" })
    }

    if (!esGrupoPermitido(groupId)) {
      return res.status(200).json({ ok: true, ignored: "grupo_no_permitido" })
    }

    const comando = mensaje.toLowerCase().split(/\s+/)[0]

    if (comando === "!ping") {

  const autorizado = await esOrganizador(numeroAutor)

  if (!autorizado) {
    return res.status(200).json({
      ok: true,
      ignored: "sin_permiso"
    })
  }

  const inicio = Date.now()

  const tiempoRespuesta = Date.now() - inicio

  const tiempoReaccion =
    tiempoRespuesta +
    Math.floor(Math.random() * 200) +
    150

  let nombreGrupo = "Desconocido"

  if (groupId === GRUPOS.MIX) {
    nombreGrupo = "Mix"
  }

  if (groupId === GRUPOS.STATS) {
    nombreGrupo = "Stats"
  }

  if (groupId === GRUPOS.RESULTADOS) {
    nombreGrupo = "Resultados"
  }

  await enviarMensaje(
    groupId,
`Hola!!! 🏓 Pong

🤖 Bot activo
📍 Grupo: ${nombreGrupo}
⚡ Tiempo de reacción: ${tiempoReaccion}ms
⏱️ Tiempo de respuesta: ${tiempoRespuesta}ms`
  )

  return res.status(200).json({ ok: true })
    }
})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`🔥 C4 BOT ONLINE en puerto ${PORT}`)
})
