import { fetch } from "undici"
import cron from "node-cron"

const tareasProgramadas = new Set()

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

export const noticiasConfig = {
  name: "noticias",
  displayName: "Noticias",
  description: "Últimas noticias del día",
  icon: "fas fa-newspaper",
  commands: ["/test_noticia"],
  schedulable: true,
  requiresApiKey: true,
  apiKeyName: "NEWS_API_KEY",
}
