import { fetch } from "undici"
import cron from "node-cron"

const tareasProgramadas = new Set()

// 🟡 Programa el clima según zona horaria del usuario
export function programarClimaUTC(chatId, bot, offset, horaLocal, minutoLocal = 0) {
  const utcHour = (horaLocal - offset + 24) % 24
  const tareaId = `clima-${chatId}`

  if (tareasProgramadas.has(tareaId)) {
    console.log(`⚠️ Tarea de clima ya programada para chat ${chatId}`)
    return
  }

  console.log(`⏰ Programando clima para las ${utcHour}:00 UTC (chat ${chatId})`)
  tareasProgramadas.add(tareaId)

  cron.schedule(` ${minutoLocal} ${utcHour} * * *`, async () => {
    const ciudad = process.env.WEATHER_CITY || "Buenos Aires"
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

// 🧪 Función de prueba instantánea
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

// Configuración del servicio
export const climaConfig = {
  name: "clima",
  displayName: "Clima",
  description: "Consulta del clima por ciudad",
  icon: "fas fa-sun",
  commands: ["/test_clima"],
  schedulable: true,
  requiresApiKey: true,
  apiKeyName: "WEATHER_API_KEY",
}
