#!/usr/bin/env node

import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Función para crear una nueva tarea
async function crearNuevaTarea(nombreTarea, opciones = {}) {
  const {
    displayName = nombreTarea,
    description = `Servicio de ${nombreTarea}`,
    icon = "fas fa-cog",
    requiresApiKey = false,
    schedulable = false,
    commands = [],
    isConversational = false,
  } = opciones

  const templateTarea = `import { fetch } from "undici"
${schedulable ? 'import cron from "node-cron"' : ""}

${
  schedulable
    ? `
const tareasProgramadas = new Set()

// Función para programar la tarea
export function programar${nombreTarea.charAt(0).toUpperCase() + nombreTarea.slice(1)}UTC(chatId, bot, offset, horaLocal) {
  const utcHour = (horaLocal - offset + 24) % 24
  const tareaId = \`${nombreTarea}-\${chatId}\`

  if (tareasProgramadas.has(tareaId)) {
    console.log(\`⚠️ Tarea de ${nombreTarea} ya programada para chat \${chatId}\`)
    return
  }

  console.log(\`⏰ Programando ${nombreTarea} para las \${utcHour}:00 UTC (chat \${chatId})\`)
  tareasProgramadas.add(tareaId)

  cron.schedule(\`0 \${utcHour} * * *\`, async () => {
    try {
      await ejecutar${nombreTarea.charAt(0).toUpperCase() + nombreTarea.slice(1)}(chatId, bot)
      console.log(\`✅ ${nombreTarea} enviado a chat \${chatId}\`)
    } catch (error) {
      console.error(\`❌ Error en ${nombreTarea}:\`, error)
      bot.sendMessage(chatId, "❌ Hubo un problema con el servicio de ${nombreTarea}.")
    }
  })
}
`
    : ""
}

// Función principal del servicio
export async function ejecutar${nombreTarea.charAt(0).toUpperCase() + nombreTarea.slice(1)}(chatId, bot${isConversational ? ", mensaje" : ""}) {
  ${
    requiresApiKey
      ? `
  const apiKey = process.env.${nombreTarea.toUpperCase()}_API_KEY
  
  if (!apiKey) {
    bot.sendMessage(chatId, "❌ API key de ${nombreTarea} no configurada.")
    return
  }
  `
      : ""
  }

  try {
    // TODO: Implementar la lógica del servicio aquí
    const respuesta = "🤖 Servicio de ${nombreTarea} funcionando correctamente!"
    
    await bot.sendMessage(chatId, respuesta)
    console.log(\`✅ ${nombreTarea} ejecutado para chat \${chatId}\`)
  } catch (error) {
    console.error(\`❌ Error en ${nombreTarea}:\`, error)
    bot.sendMessage(chatId, "❌ Error en el servicio de ${nombreTarea}.")
  }
}

${
  commands.length > 0
    ? `
// Configurar comandos específicos
export function configurar${nombreTarea.charAt(0).toUpperCase() + nombreTarea.slice(1)}(bot) {
  ${commands
    .map(
      (cmd) => `
  bot.onText(/${cmd.replace("/", "\\/")}/, async (msg) => {
    const chatId = msg.chat.id
    await ejecutar${nombreTarea.charAt(0).toUpperCase() + nombreTarea.slice(1)}(chatId, bot)
  })
  `,
    )
    .join("")}
  
  return {
    comandosRegistrados: [${commands.map((cmd) => `'${cmd}'`).join(", ")}]
  }
}
`
    : ""
}

// Configuración del servicio
export const ${nombreTarea}Config = {
  name: '${nombreTarea}',
  displayName: '${displayName}',
  description: '${description}',
  icon: '${icon}',
  commands: [${commands.map((cmd) => `'${cmd}'`).join(", ")}],
  schedulable: ${schedulable},
  requiresApiKey: ${requiresApiKey},
  ${requiresApiKey ? `apiKeyName: '${nombreTarea.toUpperCase()}_API_KEY',` : ""}
  ${isConversational ? `isConversational: ${isConversational}` : ""}
}
`

  // Crear el archivo de la nueva tarea
  const rutaTarea = path.join(__dirname, "..", "bot-templates", "tareas", `${nombreTarea}.js`)
  await fs.writeFile(rutaTarea, templateTarea)

  console.log(`✅ Nueva tarea creada: ${rutaTarea}`)

  // Actualizar el archivo index.js de tareas
  await actualizarIndiceTareas(nombreTarea)

  console.log(`🎉 Tarea '${nombreTarea}' agregada exitosamente!`)
  console.log(`📝 Edita el archivo ${rutaTarea} para implementar la lógica específica.`)
}

// Función para actualizar el índice de tareas
async function actualizarIndiceTareas(nuevaTarea) {
  const rutaIndice = path.join(__dirname, "..", "bot-templates", "tareas", "index.js")

  try {
    let contenidoIndice = await fs.readFile(rutaIndice, "utf8")

    // Agregar import
    const importLine = `import * as ${nuevaTarea} from './${nuevaTarea}.js'`
    contenidoIndice = contenidoIndice.replace(/(import \* as \w+ from '\.\/\w+\.js'\n)/g, `$1${importLine}\n`)

    // Agregar al registro
    const registroLine = `  ${nuevaTarea}: {
    modulo: ${nuevaTarea},
    config: ${nuevaTarea}.${nuevaTarea}Config
  },`

    contenidoIndice = contenidoIndice.replace(
      /(export const tareasDisponibles = \{[\s\S]*?)(\})/,
      `$1${registroLine}\n$2`,
    )

    await fs.writeFile(rutaIndice, contenidoIndice)
    console.log(`✅ Índice de tareas actualizado`)
  } catch (error) {
    console.error("❌ Error actualizando índice:", error)
  }
}

// Función para listar tareas existentes
async function listarTareas() {
  const rutaTareas = path.join(__dirname, "..", "bot-templates", "tareas")
  const archivos = await fs.readdir(rutaTareas)

  console.log("📋 Tareas existentes:")
  archivos
    .filter((archivo) => archivo.endsWith(".js") && archivo !== "index.js")
    .forEach((archivo) => {
      console.log(`  - ${archivo.replace(".js", "")}`)
    })
}

// CLI
const args = process.argv.slice(2)
const comando = args[0]

switch (comando) {
  case "crear":
    const nombreTarea = args[1]
    if (!nombreTarea) {
      console.error("❌ Debes especificar el nombre de la tarea")
      console.log("Uso: node agregar-nueva-tarea.js crear <nombre>")
      process.exit(1)
    }

    // Opciones adicionales (puedes expandir esto)
    const opciones = {
      displayName: args[2] || nombreTarea,
      requiresApiKey: args.includes("--api-key"),
      schedulable: args.includes("--schedulable"),
      isConversational: args.includes("--conversational"),
    }

    await crearNuevaTarea(nombreTarea, opciones)
    break

  case "listar":
    await listarTareas()
    break

  default:
    console.log("🤖 Gestor de Tareas - TarDía Cloud Bot Platform")
    console.log("")
    console.log("Comandos disponibles:")
    console.log("  crear <nombre> [opciones]  - Crear nueva tarea")
    console.log("  listar                     - Listar tareas existentes")
    console.log("")
    console.log("Opciones para crear:")
    console.log("  --api-key                  - Requiere API key")
    console.log("  --schedulable              - Puede programarse")
    console.log("  --conversational           - Es conversacional")
    console.log("")
    console.log("Ejemplos:")
    console.log("  node agregar-nueva-tarea.js crear traduccion --api-key")
    console.log("  node agregar-nueva-tarea.js crear recordatorios --schedulable")
    break
}
