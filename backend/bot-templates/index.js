import express from "express"
import TelegramBot from "node-telegram-bot-api"
import dotenv from "dotenv"
import {
  programarClimaUTC,
  programarNoticiaUTC,
  responderConIA,
  enviarClimaInstantaneo,
  enviarNoticiaInstantanea,
} from "./tareas.js"

dotenv.config()

// --- Servidor Express mínimo ---
const app = express()
const port = process.env.PORT || 3000

app.get("/", (req, res) => {
  res.json({
    status: "active",
    bot: process.env.BOT_NAME || "TarDía Bot",
    timestamp: new Date().toISOString(),
  })
})

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    uptime: process.uptime(),
    bot: process.env.BOT_NAME,
  })
})

app.listen(port, () => {
  console.log(`🤖 Bot ${process.env.BOT_NAME} corriendo en puerto ${port}`)
})

// --- Bot de Telegram ---
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true })

// Guardar zona horaria en memoria
const zonasUsuarios = {} // { chatId: offset }

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id
  const botName = process.env.BOT_NAME || "TarDía"

  bot.sendMessage(
    chatId,
    `¡Hola ${msg.from.first_name}! Soy ${botName} 🤖\n\nMis servicios disponibles:\n${getAvailableServices()}\n\nPrimero, elegí tu zona horaria:`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🇦🇷 GMT-3 (Argentina)", callback_data: "tz_-3" }],
          [{ text: "🇲🇽 GMT-6 (México)", callback_data: "tz_-6" }],
          [{ text: "🇪🇸 GMT+1 (España)", callback_data: "tz_1" }],
          [{ text: "🇺🇸 GMT-5 (EST)", callback_data: "tz_-5" }],
          [{ text: "🇧🇷 GMT-3 (Brasil)", callback_data: "tz_-3" }],
        ],
      },
    },
  )
})

function getAvailableServices() {
  const services = process.env.SERVICES ? process.env.SERVICES.split(",") : []
  const serviceDescriptions = {
    clima: "☀️ Clima diario programado",
    noticias: "📰 Noticias diarias",
    ia: "🧠 Chat con inteligencia artificial",
    chistes: "😄 Chistes aleatorios",
  }

  return services.map((s) => serviceDescriptions[s] || s).join("\n")
}

bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id
  const data = callbackQuery.data

  // --- ZONA HORARIA ---
  if (data.startsWith("tz_")) {
    const offset = Number.parseInt(data.split("_")[1])
    zonasUsuarios[chatId] = offset

    const services = process.env.SERVICES ? process.env.SERVICES.split(",") : []
    const buttons = []

    if (services.includes("clima")) {
      buttons.push([{ text: "☀️ Clima a las 8:00 AM", callback_data: "clima_diario" }])
    }
    if (services.includes("noticias")) {
      buttons.push([{ text: "🗞 Noticias a las 8:00 AM", callback_data: "noticias_diarias" }])
    }

    bot.sendMessage(chatId, "✅ Zona horaria guardada.\nAhora elegí qué querés recibir cada día:", {
      reply_markup: {
        inline_keyboard: buttons,
      },
    })
  }

  // --- CLIMA ---
  if (data === "clima_diario") {
    const offset = zonasUsuarios[chatId]
    if (offset === undefined) {
      bot.sendMessage(chatId, "⚠️ Primero seleccioná tu zona horaria con /start.")
      return
    }

    const horaLocal = 8 // 8:00 AM local
    programarClimaUTC(chatId, bot, offset, horaLocal)
    bot.sendMessage(chatId, "✅ ¡Listo! Vas a recibir el clima todos los días a las 8:00 AM.")
  }

  // --- NOTICIAS ---
  if (data === "noticias_diarias") {
    const offset = zonasUsuarios[chatId]
    if (offset === undefined) {
      bot.sendMessage(chatId, "⚠️ Primero seleccioná tu zona horaria con /start.")
      return
    }

    const horaLocal = 8 // 8:00 AM local
    programarNoticiaUTC(chatId, bot, offset, horaLocal)
    bot.sendMessage(chatId, "✅ ¡Listo! Vas a recibir noticias todos los días a las 8:00 AM.")
  }

  bot.answerCallbackQuery(callbackQuery.id)
})

// IA (si está habilitada)
const services = process.env.SERVICES ? process.env.SERVICES.split(",") : []
if (services.includes("ia")) {
  bot.on("message", (msg) => {
    const chatId = msg.chat.id
    const texto = msg.text

    // Ignoramos comandos y callbacks
    if (texto.startsWith("/") || !texto) return

    bot.sendMessage(chatId, "🤖 Pensando...")
    responderConIA(chatId, bot, texto)
  })
}

// Comandos de prueba
bot.onText(/\/test_clima/, (msg) => {
  if (!services.includes("clima")) {
    bot.sendMessage(msg.chat.id, "❌ Servicio de clima no habilitado.")
    return
  }

  const chatId = msg.chat.id
  bot.sendMessage(chatId, "🔄 Probando clima en tiempo real...")
  enviarClimaInstantaneo(chatId, bot)
})

bot.onText(/\/test_noticia/, (msg) => {
  if (!services.includes("noticias")) {
    bot.sendMessage(msg.chat.id, "❌ Servicio de noticias no habilitado.")
    return
  }

  const chatId = msg.chat.id
  bot.sendMessage(chatId, "📰 Buscando noticia de prueba...")
  enviarNoticiaInstantanea(chatId, bot)
})

// Chistes (si está habilitado)
if (services.includes("chistes")) {
  bot.onText(/\/chiste/, (msg) => {
    const chatId = msg.chat.id
    const chistes = [
      "¿Por qué los pájaros vuelan hacia el sur en invierno? Porque es muy lejos para caminar.",
      "¿Qué le dice un taco a otro taco? ¿Quieres que vayamos por unas quesadillas?",
      "¿Cómo se llama el campeón de buceo japonés? Tokofondo.",
      "¿Qué hace una abeja en el gimnasio? ¡Zum-ba!",
      "¿Por qué los elefantes no usan computadoras? Porque le tienen miedo al mouse.",
    ]

    const randomJoke = chistes[Math.floor(Math.random() * chistes.length)]
    bot.sendMessage(chatId, `😄 ${randomJoke}`)
  })
}

// Comando de ayuda
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id
  const botName = process.env.BOT_NAME || "TarDía"

  let helpMessage = `🤖 ${botName} - Comandos disponibles:\n\n`
  helpMessage += `/start - Configurar bot y zona horaria\n`

  if (services.includes("clima")) {
    helpMessage += `/test_clima - Probar clima instantáneo\n`
  }
  if (services.includes("noticias")) {
    helpMessage += `/test_noticia - Probar noticia instantánea\n`
  }
  if (services.includes("chistes")) {
    helpMessage += `/chiste - Escuchar un chiste\n`
  }
  if (services.includes("ia")) {
    helpMessage += `💬 Escribe cualquier mensaje para chatear con IA\n`
  }

  helpMessage += `/help - Mostrar esta ayuda\n\n`
  helpMessage += `¡Creado con TarDía Cloud Bot Platform! 🚀`

  bot.sendMessage(chatId, helpMessage)
})

// Error handling
bot.on("polling_error", (error) => {
  console.error("❌ Polling error:", error)
})

console.log(`🤖 Bot ${process.env.BOT_NAME || "TarDía"} iniciado correctamente`)
console.log(`📊 Servicios habilitados: ${services.join(", ")}`)
