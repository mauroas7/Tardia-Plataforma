// 😄 Servicio de chistes
export function configurarChistes(bot) {
  const chistes = [
    "¿Por qué los pájaros vuelan hacia el sur en invierno? Porque es muy lejos para caminar.",
    "¿Qué le dice un taco a otro taco? ¿Quieres que vayamos por unas quesadillas?",
    "¿Cómo se llama el campeón de buceo japonés? Tokofondo.",
    "¿Qué hace una abeja en el gimnasio? ¡Zum-ba!",
    "¿Por qué los elefantes no usan computadoras? Porque le tienen miedo al mouse.",
    "¿Qué le dice un jardinero a otro? Nos vemos cuando podamos.",
    "¿Por qué los peces no pagan impuestos? Porque viven en bancos.",
    "¿Cómo se despiden los químicos? Ácido un placer.",
  ]

  bot.onText(/\/chiste/, (msg) => {
    const chatId = msg.chat.id
    const randomJoke = chistes[Math.floor(Math.random() * chistes.length)]
    bot.sendMessage(chatId, `😄 ${randomJoke}`)
  })

  return {
    comandosRegistrados: ["/chiste"],
    totalChistes: chistes.length,
  }
}

export const chistesConfig = {
  name: "chistes",
  displayName: "Chistes",
  description: "Chistes aleatorios para alegrar el día",
  icon: "fas fa-smile",
  commands: ["/chiste"],
  schedulable: false,
  requiresApiKey: false,
}
