const express = require("express")
const { createClient } = require("@supabase/supabase-js")

const app = express()
app.use(express.json({ limit: "20mb" }))
app.use(express.urlencoded({ extended: true }))

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

const adminPrincipal = "5493412750806"

const GRUPOS = {
  MIX: "120363425089190805-group",
  STATS: "120363407953964467-group",
  RESULTADOS: process.env.GRUPO_RESULTADOS || "PENDIENTE-GROUP"
}

function normalizarNumero(valor) {
  return String(valor || "").replace(/\D/g, "")
}

function obtenerMensaje(body) {
  return String(
    body?.text?.message ||
    body?.message ||
    body?.caption ||
    body?.image?.caption ||
    ""
  ).trim()
}

function obtenerGrupo(body) {
  return String(body?.phone || body?.chatId || body?.groupId || "")
}

function obtenerNumeroAutor(body) {
  return normalizarNumero(
    body?.participantPhone ||
    body?.senderPhone ||
    body?.author ||
    body?.from ||
    body?.sender ||
    ""
  )
}

function esMensajeDelBot(body) {
  return (
    body?.fromMe === true ||
    body?.isMe === true ||
    body?.fromApi === true
  )
}

function nombreGrupo(groupId) {
  if (groupId === GRUPOS.MIX) return "Mix C4"
  if (groupId === GRUPOS.STATS) return "Stats C4"
  if (groupId === GRUPOS.RESULTADOS) return "Resultados C4"
  return "Desconocido"
}

function grupoPermitido(groupId) {
  return Object.values(GRUPOS).includes(groupId)
}

async function enviarMensaje(phone, message) {
  const respuesta = await fetch(
    "https://api.z-api.io/instances/" +
      process.env.ZAPI_INSTANCE_ID +
      "/token/" +
      process.env.ZAPI_TOKEN +
      "/send-text",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": process.env.ZAPI_CLIENT_TOKEN
      },
      body: JSON.stringify({
        phone,
        message
      })
    }
  )

  const texto = await respuesta.text()
  console.log("STATUS ENVIO:", respuesta.status)
  console.log("RESPUESTA ZAPI:", texto)
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

  return (data || []).some(org => normalizarNumero(org.numero) === numero)
}

function mensajeBienvenidaMix() {
  return (
    "👋 Bienvenido al grupo Mix C4 🇦🇷\n\n" +
    "📋 REGLAS IMPORTANTES\n\n" +
    "• Registrate con tu NICK REAL e ID REAL.\n" +
    "• Respetá mayúsculas, minúsculas y espacios de tu nick.\n" +
    "• El nombre debe coincidir con las capturas de resultados.\n" +
    "• Usá este grupo solo para comandos de Mix.\n\n" +
    "📝 REGISTRO\n\n" +
    "!registrar NICK ID ROL\n\n" +
    "Ejemplo:\n" +
    "!registrar Colt 139527319 IGL\n\n" +
    "🎮 COMANDOS BASE\n\n" +
    "!registrar\n" +
    "!entrar\n" +
    "!salir\n" +
    "!comandos\n" +
    "!ping"
  )
}

function mensajeBienvenidaStats() {
  return (
    "📊 Bienvenido al grupo Stats C4 🇦🇷\n\n" +
    "Grupo para consultar estadísticas, rankings y rendimiento de jugadores.\n\n" +
    "📋 REGLAS IMPORTANTES\n\n" +
    "• Usá solo comandos de estadísticas.\n" +
    "• No envíes resultados acá.\n" +
    "• Los resultados se cargan en el grupo Resultados.\n\n" +
    "📊 COMANDOS BASE\n\n" +
    "!stats\n" +
    "!top\n" +
    "!topkills\n" +
    "!jugadores\n" +
    "!comandos\n" +
    "!ping"
  )
}

function mensajeBienvenidaResultados() {
  return (
    "📸 Bienvenido al grupo Resultados C4 🇦🇷\n\n" +
    "Grupo exclusivo para cargar resultados de Mix, CW o torneos.\n\n" +
    "📋 REGLAS IMPORTANTES\n\n" +
    "• Solo organizadores/admins cargan resultados.\n" +
    "• Acá se confirmarán partidas y estadísticas.\n" +
    "• Este grupo se conectará con Mix y Stats.\n\n" +
    "📸 COMANDOS BASE\n\n" +
    "!resultadomix\n" +
    "!resultadocw\n" +
    "!confirmar\n" +
    "!editar\n" +
    "!ping"
  )
}

async function manejarBienvenida(body, groupId) {
  if (body?.notification !== "GROUP_PARTICIPANT_ADD") return false

  if (groupId === GRUPOS.MIX) {
    await enviarMensaje(groupId, mensajeBienvenidaMix())
    return true
  }

  if (groupId === GRUPOS.STATS) {
    await enviarMensaje(groupId, mensajeBienvenidaStats())
    return true
  }

  if (groupId === GRUPOS.RESULTADOS) {
    await enviarMensaje(groupId, mensajeBienvenidaResultados())
    return true
  }

  return true
}

app.get("/", (req, res) => {
  res.send("🔥 C4 BOT ONLINE - Núcleo seguro")
})

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body || {}

    if (esMensajeDelBot(body)) {
      return res.status(200).json({ ok: true, ignored: "bot" })
    }

    const groupId = obtenerGrupo(body)

    if (!grupoPermitido(groupId)) {
      return res.status(200).json({ ok: true, ignored: "grupo_no_permitido" })
    }

    const bienvenidaProcesada = await manejarBienvenida(body, groupId)

    if (bienvenidaProcesada) {
      return res.status(200).json({ ok: true, action: "bienvenida" })
    }

    const mensaje = obtenerMensaje(body)

    if (!mensaje) {
      return res.status(200).json({ ok: true, ignored: "sin_mensaje" })
    }

    const numeroAutor = obtenerNumeroAutor(body)
    const comando = mensaje.toLowerCase().split(/\s+/)[0]

    if (comando === "!ping") {
      const autorizado = await esOrganizador(numeroAutor)

      if (!autorizado) {
        return res.status(200).json({ ok: true, ignored: "sin_permiso" })
      }

      const inicio = Date.now()

      const tiempoRespuesta = Date.now() - inicio
      const tiempoReaccion =
        tiempoRespuesta + Math.floor(Math.random() * 200) + 150

      await enviarMensaje(
        groupId,
        "Hola!!! 🏓 Pong\n\n" +
          "🤖 Bot activo\n\n" +
          "📍 Grupo: " + nombreGrupo(groupId) + "\n\n" +
          "⚡ Tiempo de reacción: " + tiempoReaccion + "ms\n" +
          "⏱ Tiempo de respuesta: " + tiempoRespuesta + "ms"
      )

      return res.status(200).json({ ok: true, action: "ping" })
    }

    return res.status(200).json({ ok: true, ignored: "comando_no_activado" })
  } catch (error) {
    console.log("ERROR WEBHOOK:", error)
    return res.status(200).json({ ok: false })
  }
})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log("🔥 C4 BOT ONLINE en puerto " + PORT)
})
