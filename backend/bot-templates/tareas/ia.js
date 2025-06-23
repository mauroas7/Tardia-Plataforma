import { fetch } from "undici";

// Esta función inicializa el historial con el prompt del sistema
function inicializarHistorial(botName) {
  return [
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
  ];
}

// 🧠 Integración con IA (Gemini) con memoria
export async function responderConIA(chatId, bot, pregunta, historialesIA) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    bot.sendMessage(chatId, "❌ Servicio de IA no disponible.");
    return;
  }

  const botName = process.env.BOT_NAME || "TarDía";

  // 1. Obtener o inicializar el historial de esta conversación
  let historial = historialesIA.get(chatId);
  if (!historial) {
    historial = inicializarHistorial(botName);
    historialesIA.set(chatId, historial);
  }

  // 2. Añadir la nueva pregunta del usuario al historial
  historial.push({
    role: "user",
    parts: [{ text: pregunta }],
  });

  // 3. (Opcional pero recomendado) Limitar el tamaño del historial para no exceder límites
  // Mantenemos el prompt del sistema y los últimos 10 mensajes (5 idas y vueltas)
  const MAX_HISTORY = 12; // 2 de prompt + 10 de conversación
  if (historial.length > MAX_HISTORY) {
    // Quitamos los mensajes más antiguos de la conversación, pero no el prompt inicial
    historial.splice(2, historial.length - MAX_HISTORY);
  }

  const body = {
    contents: historial, // Usamos el historial completo en la petición
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 1024,
    },
  };

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const respuesta = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (respuesta) {
      // 4. Añadir la respuesta del modelo al historial para la próxima vez
      historial.push({
        role: "model",
        parts: [{ text: respuesta }],
      });
      historialesIA.set(chatId, historial); // Actualizamos el historial en el mapa

      await bot.sendMessage(chatId, respuesta);
      console.log(`✅ Respuesta IA enviada a chat ${chatId}`);
    } else {
      bot.sendMessage(chatId, "❌ No pude generar una respuesta en este momento.");
      // Quitamos la última pregunta del usuario si el modelo no respondió, para que pueda reintentar
      historial.pop();
    }
  } catch (err) {
    console.error("❌ Error IA:", err);
    bot.sendMessage(chatId, "❌ Error al generar respuesta. Inténtalo de nuevo.");
    // Quitamos la última pregunta del usuario si hubo un error en la llamada
    historial.pop();
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
};
