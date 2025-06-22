import cron from "node-cron"
import { fetch } from "undici"
import dotenv from "dotenv"

dotenv.config()

const tareasProgramadas = new Set() // Para evitar tareas duplicadas

// 🟡 Programa el clima según zona horaria del usuario
export function programarClimaUTC(chatId, bot, offset, horaLocal) {
  const utcHour = (horaLocal - offset + 24) % 24
  const tareaId = `clima-${chatId}`

  if (tareasProgramadas.has(tareaId)) {
    console.log(`⚠️ Tarea de clima ya programada para chat ${chatId}`)
    return
  }

  console.log(`⏰ Programando clima para las ${utcHour}:00 UTC (chat ${chatId})`)
  tareasProgramadas.add(tareaId)

  cron.schedule(`0 ${utcHour} * * *`, async () => {
    const ciudad = process.env.WEATHER_CITY || "Buenos Aires" // Configurable
    const apiKey = process.env.WEATHER_API_KEY

    if (!apiKey) {
      console.error("❌ WEATHER_API_KEY no configurada")
      return
    }

    const url = `https://api.openweathermap.org/data/2.5/weather?q=${ciudad}&units=metric&appid=${apiKey}&lang=es`

    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data = await res.json()
      const temp = Math.round(data.main.temp)
      const desc = data.weather[0].description
      const sensacion = Math.round(data.main.feels_like)

      const mensaje = `☀️ **Clima en ${ciudad}**\n🌡️ ${temp}°C (se siente como ${sensacion}°C)\n📝 ${desc}\n💨 Viento: ${data.wind.speed} m/s`

      await bot.sendMessage(chatId, mensaje, { parse_mode: "Markdown" })
      console.log(`✅ Clima enviado a chat ${chatId}`)
    } catch (err) {
      console.error("❌ Error al obtener el clima:", err)
      bot.sendMessage(chatId, "❌ Hubo un problema al consultar el clima de hoy.")
    }
  })
}

// 🟣 Programa la noticia según zona horaria del usuario
export function programarNoticiaUTC(chatId, bot, offset, horaLocal) {
  const utcHour = (horaLocal - offset + 24) % 24
  const tareaId = `noticia-${chatId}`

  if (tareasProgramadas.has(tareaId)) {
    console.log(`⚠️ Tarea de noticia ya programada para chat ${chatId}`)
    return
  }

  console.log(`⏰ Programando noticia para las ${utcHour}:00 UTC (chat ${chatId})`)
  tareasProgramadas.add(tareaId)

  cron.schedule(`0 ${utcHour} * * *`, async () => {
    const apiKey = process.env.NEWS_API_KEY

    if (!apiKey) {
      console.error("❌ NEWS_API_KEY no configurada")
      return
    }

    const url = `https://gnews.io/api/v4/top-headlines?lang=es&max=3&token=${apiKey}`

    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data = await res.json()

      if (data.articles && data.articles.length > 0) {
        let mensaje = "🗞️ **Noticias del día:**\n\n"

        data.articles.slice(0, 2).forEach((noticia, index) => {
          mensaje += `**${index + 1}.** ${noticia.title}\n`
          mensaje += `📝 ${noticia.description}\n`
          mensaje += `🔗 [Leer más](${noticia.url})\n\n`
        })

        await bot.sendMessage(chatId, mensaje, {
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        })
        console.log(`✅ Noticias enviadas a chat ${chatId}`)
      } else {
        bot.sendMessage(chatId, "📰 No se encontraron noticias para hoy.")
      }
    } catch (err) {
      console.error("❌ Error al obtener noticias:", err)
      bot.sendMessage(chatId, "❌ Hubo un problema al consultar noticias.")
    }
  })
}

// 🧠 Integración con IA (Gemini)
export async function responderConIA(chatId, bot, pregunta) {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    bot.sendMessage(chatId, "❌ Servicio de IA no disponible.")
    return
  }

  const botName = process.env.BOT_NAME || "TarDía"
  const contextoBase = [
    {
      role: "user",
      parts: [
        {
          text: `A partir de ahora sos ${botName}, un asistente digital amigable creado por TarDía Cloud Bot Platform. Tu propósito es ayudar a las personas con información, consejos, conversación inteligente y más. Respondé siempre con amabilidad, claridad y un toque de humor cuando sea apropiado. Mantené las respuestas concisas pero útiles.`,
        },
      ],
    },
    {
      role: "model",
      parts: [
        {
          text: `¡Entendido! Soy ${botName} 🤖, tu asistente digital creado con TarDía Cloud Bot Platform. Estoy aquí para ayudarte con lo que necesites.`,
        },
      ],
    },
    {
      role: "user",
      parts: [{ text: pregunta }],
    },
  ]

  const body = {
    contents: contextoBase,
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 1024,
    },
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    )

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = await res.json()
    const respuesta = data.candidates?.[0]?.content?.parts?.[0]?.text

    if (respuesta) {
      await bot.sendMessage(chatId, respuesta)
      console.log(`✅ Respuesta IA enviada a chat ${chatId}`)
    } else {
      bot.sendMessage(chatId, "❌ No pude generar una respuesta en este momento.")
    }
  } catch (err) {
    console.error("❌ Error IA:", err)
    bot.sendMessage(chatId, "❌ Error al generar respuesta. Inténtalo de nuevo.")
  }
}

// 🧪 Funciones de prueba
export async function enviarClimaInstantaneo(chatId, bot) {
  const ciudad = process.env.WEATHER_CITY || "Buenos Aires"
  const apiKey = process.env.WEATHER_API_KEY

  if (!apiKey) {
    bot.sendMessage(chatId, "❌ API key del clima no configurada.")
    return
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?q=${ciudad}&units=metric&appid=${apiKey}&lang=es`

  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = await res.json()
    const temp = Math.round(data.main.temp)
    const desc = data.weather[0].description
    const sensacion = Math.round(data.main.feels_like)

    const mensaje = `☀️ **Clima actual en ${ciudad}:**\n🌡️ ${temp}°C (se siente como ${sensacion}°C)\n📝 ${desc}\n💨 Viento: ${data.wind.speed} m/s`

    await bot.sendMessage(chatId, mensaje, { parse_mode: "Markdown" })
  } catch (err) {
    console.error("Error en clima instantáneo:", err)
    bot.sendMessage(chatId, "❌ Hubo un problema al consultar el clima.")
  }
}

export async function enviarNoticiaInstantanea(chatId, bot) {
  const apiKey = process.env.NEWS_API_KEY

  if (!apiKey) {
    bot.sendMessage(chatId, "❌ API key de noticias no configurada.")
    return
  }

  const url = `https://gnews.io/api/v4/top-headlines?lang=es&max=1&token=${apiKey}`

  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = await res.json()

    if (data.articles && data.articles.length > 0) {
      const noticia = data.articles[0]
      const mensaje = `🗞️ **Noticia destacada:**\n\n**${noticia.title}**\n\n📝 ${noticia.description}\n\n🔗 [Leer completo](${noticia.url})`

      await bot.sendMessage(chatId, mensaje, {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      })
    } else {
      bot.sendMessage(chatId, "📰 No se encontraron noticias en este momento.")
    }
  } catch (err) {
    console.error("Error en noticia instantánea:", err)
    bot.sendMessage(chatId, "❌ Hubo un problema al consultar noticias.")
  }
}
