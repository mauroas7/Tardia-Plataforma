import { fetch } from "undici"

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

export const iaConfig = {
  name: "ia",
  displayName: "Chat IA",
  description: "Conversación inteligente con IA",
  icon: "fas fa-brain",
  commands: [],
  schedulable: false,
  requiresApiKey: true,
  apiKeyName: "GEMINI_API_KEY",
  isConversational: true,
}
