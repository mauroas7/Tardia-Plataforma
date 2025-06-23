const express = require("express")
const cors = require("cors")
const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const { v4: uuidv4 } = require("uuid")
const fs = require("fs").promises
const path = require("path")
const { exec } = require("child_process")
const { promisify } = require("util")

// Enhanced logging con más detalles
const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString()
  const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`
  console.log(logMessage)
  if (data) {
    console.log(JSON.stringify(data, null, 2))
  }
}

const app = express()
const execAsync = promisify(exec)

// Enhanced error handling con más información
process.on("uncaughtException", (error) => {
  log("error", "Uncaught Exception:", {
    message: error.message,
    stack: error.stack,
    name: error.name,
  })
  process.exit(1)
})

process.on("unhandledRejection", (reason, promise) => {
  log("error", "Unhandled Rejection:", {
    reason: reason,
    promise: promise,
    stack: reason?.stack,
  })
  process.exit(1)
})

// Middleware
app.use(cors())
app.use(express.json({ limit: "10mb" }))
app.use(express.static("public"))

// Environment variables with defaults y logging
const PORT = process.env.PORT || 3000
const JWT_SECRET = process.env.JWT_SECRET || "cloud-bot-secret-key-2024"
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://dbUser:ProyectoTarDia987654321@tardiacluster.mg4kvzx.mongodb.net/cloud-bot-platform?retryWrites=true&w=majority&appName=TarDiaCluster"
const KUBERNETES_NAMESPACE = process.env.KUBERNETES_NAMESPACE || "bot-platform"

log("info", "Starting Cloud Bot Platform API", {
  port: PORT,
  mongoUri: MONGODB_URI.replace(/\/\/.*@/, "//***:***@"), // Hide credentials in logs
  kubernetesNamespace: KUBERNETES_NAMESPACE,
  nodeVersion: process.version,
  platform: process.platform,
  workingDirectory: process.cwd(),
})

// MongoDB connection con mejor logging
const connectDB = async () => {
  try {
    log("info", "Attempting MongoDB connection...")

    const conn = await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      retryWrites: true,
      w: "majority",
    })

    log("info", "MongoDB Atlas connected successfully", {
      host: conn.connection.host,
      database: conn.connection.name,
      readyState: conn.connection.readyState,
    })
  } catch (error) {
    log("error", "MongoDB Atlas connection failed:", {
      message: error.message,
      code: error.code,
      name: error.name,
    })
    process.exit(1)
  }
}

// Connect to database
connectDB()

mongoose.connection.on("error", (err) => {
  log("error", "MongoDB connection error:", {
    message: err.message,
    code: err.code,
  })
})

mongoose.connection.on("disconnected", () => {
  log("warn", "MongoDB disconnected")
})

mongoose.connection.on("reconnected", () => {
  log("info", "MongoDB reconnected")
})

// User Schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  created_at: { type: Date, default: Date.now },
})

const User = mongoose.model("User", userSchema)

// Bot Schema
const botSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true },
  token: { type: String, required: true },
  servicios: [{ type: String }],
  status: { type: String, enum: ["creating", "active", "error", "stopped"], default: "creating" },
  url: String,
  deploy_url: String,
  repo_url: String,
  kubernetes_deployment: String,
  error_message: String, // Agregar campo para errores
  created_at: { type: Date, default: Date.now },
})

const Bot = mongoose.model("Bot", botSchema)

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"]
  const token = authHeader && authHeader.split(" ")[1]

  if (!token) {
    return res.status(401).json({ message: "Token de acceso requerido" })
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      log("warn", "Invalid token attempt", { error: err.message })
      return res.status(403).json({ message: "Token inválido" })
    }
    req.user = user
    next()
  })
}

// Routes

// Health check mejorado
app.get("/health", (req, res) => {
  const healthData = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    memory: process.memoryUsage(),
    version: "1.0.0",
    environment: process.env.NODE_ENV || "development",
  }

  log("info", "Health check requested", healthData)
  res.json(healthData)
})

// Debug endpoint
app.get("/api/debug", authenticateToken, async (req, res) => {
  try {
    const debugInfo = {
      timestamp: new Date().toISOString(),
      user: req.user,
      mongodb: {
        readyState: mongoose.connection.readyState,
        host: mongoose.connection.host,
        name: mongoose.connection.name,
      },
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        workingDirectory: process.cwd(),
      },
      kubernetes: {
        namespace: KUBERNETES_NAMESPACE,
      },
    }

    res.json(debugInfo)
  } catch (error) {
    log("error", "Debug endpoint error:", error)
    res.status(500).json({ message: "Error en debug", error: error.message })
  }
})

// Auth routes con mejor logging
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password } = req.body
    log("info", "Registration attempt", { email })

    const existingUser = await User.findOne({ email })
    if (existingUser) {
      log("warn", "Registration failed - user exists", { email })
      return res.status(400).json({ message: "El usuario ya existe" })
    }

    const hashedPassword = await bcrypt.hash(password, 12)
    const user = new User({ email, password: hashedPassword })
    await user.save()

    log("info", "User registered successfully", { email, userId: user._id })
    res.status(201).json({ message: "Usuario creado exitosamente" })
  } catch (error) {
    log("error", "Registration error:", {
      message: error.message,
      stack: error.stack,
    })
    res.status(500).json({ message: "Error interno del servidor" })
  }
})

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body
    log("info", "Login attempt", { email })

    const user = await User.findOne({ email })
    if (!user) {
      log("warn", "Login failed - user not found", { email })
      return res.status(400).json({ message: "Credenciales inválidas" })
    }

    const validPassword = await bcrypt.compare(password, user.password)
    if (!validPassword) {
      log("warn", "Login failed - invalid password", { email })
      return res.status(400).json({ message: "Credenciales inválidas" })
    }

    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: "24h" })

    log("info", "User logged in successfully", { email, userId: user._id })
    res.json({
      token,
      user: { id: user._id, email: user.email },
    })
  } catch (error) {
    log("error", "Login error:", {
      message: error.message,
      stack: error.stack,
    })
    res.status(500).json({ message: "Error interno del servidor" })
  }
})

// Bot routes con mejor logging
app.get("/api/bots", authenticateToken, async (req, res) => {
  try {
    log("info", "Fetching bots", { userId: req.user.id })
    const bots = await Bot.find({ user_id: req.user.id }).sort({ created_at: -1 })
    log("info", "Bots fetched successfully", { userId: req.user.id, count: bots.length })
    res.json(bots)
  } catch (error) {
    log("error", "Error fetching bots:", {
      userId: req.user.id,
      message: error.message,
      stack: error.stack,
    })
    res.status(500).json({ message: "Error interno del servidor" })
  }
})

app.post("/api/crear-bot", authenticateToken, async (req, res) => {
  try {
    const { name, token, servicios } = req.body
    log("info", "Bot creation request", {
      userId: req.user.id,
      botName: name,
      services: servicios,
    })

    // Verificar límite de bots
    const userBotCount = await Bot.countDocuments({ user_id: req.user.id })
    if (userBotCount >= 20) {
      log("warn", "Bot creation failed - limit reached", {
        userId: req.user.id,
        currentCount: userBotCount,
      })
      return res.status(400).json({
        message: "Has alcanzado el límite máximo de 20 bots por usuario",
      })
    }

    // Verificar que el nombre del bot sea único para el usuario
    const existingBot = await Bot.findOne({
      user_id: req.user.id,
      name: name,
    })
    if (existingBot) {
      log("warn", "Bot creation failed - name exists", {
        userId: req.user.id,
        botName: name,
      })
      return res.status(400).json({
        message: "Ya tienes un bot con ese nombre",
      })
    }

    if (!name || !token || !servicios || servicios.length === 0) {
      log("warn", "Bot creation failed - missing fields", {
        userId: req.user.id,
        hasName: !!name,
        hasToken: !!token,
        servicesCount: servicios?.length || 0,
      })
      return res.status(400).json({ message: "Todos los campos son requeridos" })
    }

    // Create bot record
    const bot = new Bot({
      user_id: req.user.id,
      name,
      token,
      servicios,
      status: "creating",
    })

    await bot.save()
    log("info", "Bot record created", {
      userId: req.user.id,
      botId: bot._id,
      botName: name,
    })

    // Start bot creation process asynchronously
    createBotAsync(bot)

    res.status(201).json(bot)
  } catch (error) {
    log("error", "Bot creation error:", {
      userId: req.user?.id,
      message: error.message,
      stack: error.stack,
    })
    res.status(500).json({ message: "Error interno del servidor" })
  }
})

// Bot creation logic con mejor error handling
async function createBotAsync(bot) {
  try {
    log("info", "Starting bot deployment", {
      botId: bot._id,
      botName: bot.name,
    })

    // 1. Verificar directorios y crear estructura si no existe
    const workingDir = process.cwd()
    log("info", "Working directory", { workingDir })

    // Buscar el directorio de templates en varias ubicaciones posibles
    const possibleTemplateDirs = [
      path.join(workingDir, "bot-templates"),
      path.join(__dirname, "bot-templates"),
      path.join(__dirname, "..", "bot-templates"),
      path.join("/app", "bot-templates"),
    ]

    let templateDir = null
    for (const dir of possibleTemplateDirs) {
      try {
        await fs.access(dir)
        templateDir = dir
        log("info", "Template directory found", { templateDir })
        break
      } catch (error) {
        log("info", "Template directory not found", { attemptedDir: dir })
      }
    }

    if (!templateDir) {
      log("warn", "No template directory found, creating basic templates")
      // Crear templates básicos si no existen
      templateDir = path.join(workingDir, "bot-templates")
      await createBasicTemplates(templateDir)
    }

    // 2. Generar archivos del bot
    const botFiles = await generateBotFiles(bot, templateDir)
    const botDir = path.join(workingDir, "generated-bots", bot._id.toString())

    await fs.mkdir(botDir, { recursive: true })
    log("info", "Bot directory created", { botDir })

    // Escribir todos los archivos
    for (const [filename, content] of Object.entries(botFiles)) {
      await fs.writeFile(path.join(botDir, filename), content)
      log("info", "File written", { filename, size: content.length })
    }

    // 3. Construir imagen Docker
    const imageName = `bot-${bot.name.toLowerCase()}-${bot._id}:latest`
    log("info", "Building Docker image", { imageName })

    try {
      const { stdout, stderr } = await execAsync(`docker build -t ${imageName} ${botDir}`)
      log("info", "Docker build completed", { imageName, stdout: stdout.slice(-200) })
    } catch (error) {
      log("error", "Docker build failed", {
        imageName,
        error: error.message,
        stderr: error.stderr,
      })
      throw new Error(`Docker build failed: ${error.message}`)
    }

    // 4. Desplegar en Kubernetes
    const deploymentYaml = generateKubernetesDeploymentForBot(bot, imageName)
    const deploymentFile = path.join(botDir, "k8s-deployment.yaml")
    await fs.writeFile(deploymentFile, deploymentYaml)

    log("info", "Applying Kubernetes deployment", { deploymentFile })
    try {
      const { stdout, stderr } = await execAsync(`kubectl apply -f ${deploymentFile}`)
      log("info", "Kubernetes deployment applied", { stdout })
    } catch (error) {
      log("error", "Kubernetes deployment failed", {
        error: error.message,
        stderr: error.stderr,
      })
      throw new Error(`Kubernetes deployment failed: ${error.message}`)
    }

    // 5. Esperar a que el pod esté listo
    const deploymentName = `bot-${bot.name.toLowerCase()}-${bot._id}`
    log("info", "Waiting for deployment to be ready", { deploymentName })

    try {
      await execAsync(
        `kubectl wait --for=condition=available --timeout=300s deployment/${deploymentName} -n ${KUBERNETES_NAMESPACE}`,
      )
      log("info", "Deployment is ready", { deploymentName })
    } catch (error) {
      log("error", "Deployment wait failed", {
        deploymentName,
        error: error.message,
      })
      throw new Error(`Deployment wait failed: ${error.message}`)
    }

    // 6. Actualizar estado del bot
    const serviceName = `${bot.name.toLowerCase()}-service`
    await Bot.findByIdAndUpdate(bot._id, {
      status: "active",
      url: `https://t.me/${bot.name}`,
      deploy_url: `http://${serviceName}.${KUBERNETES_NAMESPACE}.svc.cluster.local`,
      kubernetes_deployment: deploymentName,
      error_message: null, // Limpiar errores previos
    })

    log("info", "Bot deployed successfully", {
      botId: bot._id,
      botName: bot.name,
      telegramUrl: `https://t.me/${bot.name}`,
      deployUrl: `http://${serviceName}.${KUBERNETES_NAMESPACE}.svc.cluster.local`,
    })
  } catch (error) {
    log("error", "Bot deployment failed", {
      botId: bot._id,
      botName: bot.name,
      error: error.message,
      stack: error.stack,
    })

    await Bot.findByIdAndUpdate(bot._id, {
      status: "error",
      error_message: error.message,
    })
  }
}

// Función para crear templates básicos si no existen
async function createBasicTemplates(templateDir) {
  try {
    await fs.mkdir(templateDir, { recursive: true })
    log("info", "Creating basic templates", { templateDir })

    // Template básico de index.js
    const basicIndexTemplate = `import express from "express"
import TelegramBot from "node-telegram-bot-api"
import dotenv from "dotenv"

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
  console.log(\`🤖 Bot \${process.env.BOT_NAME} corriendo en puerto \${port}\`)
})

// --- Bot de Telegram ---
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true })

bot.onText(/\\/start/, (msg) => {
  const chatId = msg.chat.id
  const botName = process.env.BOT_NAME || "TarDía"

  bot.sendMessage(
    chatId,
    \`¡Hola \${msg.from.first_name}! Soy \${botName} 🤖\
\
Comandos disponibles:\
/help - Mostrar ayuda\
/chiste - Escuchar un chiste\`,
  )
})

// Chistes
const chistes = [
  "¿Por qué los pájaros vuelan hacia el sur en invierno? Porque es muy lejos para caminar.",
  "¿Qué le dice un taco a otro taco? ¿Quieres que vayamos por unas quesadillas?",
  "¿Cómo se llama el campeón de buceo japonés? Tokofondo.",
  "¿Qué hace una abeja en el gimnasio? ¡Zum-ba!",
  "¿Por qué los elefantes no usan computadoras? Porque le tienen miedo al mouse.",
]

bot.onText(/\\/chiste/, (msg) => {
  const chatId = msg.chat.id
  const randomJoke = chistes[Math.floor(Math.random() * chistes.length)]
  bot.sendMessage(chatId, \`😄 \${randomJoke}\`)
})

// Comando de ayuda
bot.onText(/\\/help/, (msg) => {
  const chatId = msg.chat.id
  const botName = process.env.BOT_NAME || "TarDía"

  const helpMessage = \`🤖 \${botName} - Comandos disponibles:

/start - Iniciar bot
/chiste - Escuchar un chiste
/help - Mostrar esta ayuda

¡Creado con TarDía Cloud Bot Platform! 🚀\`

  bot.sendMessage(chatId, helpMessage)
})

// Error handling
bot.on("polling_error", (error) => {
  console.error("❌ Polling error:", error)
})

console.log(\`🤖 Bot \${process.env.BOT_NAME || "TarDía"} iniciado correctamente\`)
`

    // Template básico de package.json
    const basicPackageTemplate = {
      name: "bot-template",
      version: "1.0.0",
      description: "Bot template for TarDía Cloud Bot Platform",
      main: "index.js",
      type: "module",
      scripts: {
        start: "node index.js",
        dev: "nodemon index.js",
      },
      dependencies: {
        express: "^4.18.2",
        "node-telegram-bot-api": "^0.64.0",
        dotenv: "^16.3.1",
      },
    }

    // Template básico de Dockerfile
    const basicDockerfileTemplate = `FROM node:18-alpine

# Instalar dependencias del sistema
RUN apk add --no-cache curl bash

# Crear directorio de la aplicación
WORKDIR /app

# Crear usuario no-root
RUN addgroup -g 1001 -S botuser && \\
    adduser -S botuser -u 1001

# Copiar archivos de configuración
COPY package*.json ./

# Instalar dependencias
RUN npm install --production && npm cache clean --force

# Copiar código fuente
COPY --chown=botuser:botuser . .

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \\
  CMD curl -f http://localhost:\${PORT:-3000}/health || exit 1

# Cambiar al usuario no-root
USER botuser

# Exponer puerto
EXPOSE 3000

# Comando de inicio
CMD ["npm", "start"]`

    // Escribir templates
    await fs.writeFile(path.join(templateDir, "index.js"), basicIndexTemplate)
    await fs.writeFile(path.join(templateDir, "package.json"), JSON.stringify(basicPackageTemplate, null, 2))
    await fs.writeFile(path.join(templateDir, "Dockerfile"), basicDockerfileTemplate)

    // Crear archivo tareas.js vacío para compatibilidad
    await fs.writeFile(path.join(templateDir, "tareas.js"), "// Archivo de compatibilidad\nexport default {}")

    log("info", "Basic templates created successfully", { templateDir })
  } catch (error) {
    log("error", "Error creating basic templates", { error: error.message })
    throw error
  }
}

// REEMPLAZA LA FUNCIÓN ANTIGUA CON ESTA VERSIÓN CORREGIDA

async function generateBotFiles(bot, templateDir) {
  const files = {}

  try {
    log("info", "Loading templates", { templateDir })

    // CAMBIO 1: Añadimos 'package-lock.json' a la lista de archivos requeridos.
    const requiredTemplates = ["index.js", "package.json", "package-lock.json", "Dockerfile"]

    for (const template of requiredTemplates) {
      const templatePath = path.join(templateDir, template)
      try {
        await fs.access(templatePath)
        log("info", "Template found", { template })
      } catch (error) {
        log("error", "Template not found", { template, templatePath })
        // También veo que en una versión anterior buscabas "Dockerfile.txt".
        // Esta versión busca "Dockerfile", lo cual es correcto.
        throw new Error(`Required template not found: ${template}`)
      }
    }

    // CAMBIO 2: Leemos el contenido de 'package-lock.json' junto con los demás.
    const indexTemplate = await fs.readFile(path.join(templateDir, "index.js"), "utf8")
    const packageTemplate = await fs.readFile(path.join(templateDir, "package.json"), "utf8")
    const packageLockTemplate = await fs.readFile(path.join(templateDir, "package-lock.json"), "utf8") // <-- Nueva línea
    const dockerfileTemplate = await fs.readFile(path.join(templateDir, "Dockerfile"), "utf8")

    // Generar archivos personalizados para el bot
    files["index.js"] = indexTemplate
    files["Dockerfile"] = dockerfileTemplate

    // Personalizar package.json
    const packageJson = JSON.parse(packageTemplate)
    packageJson.name = `bot-${bot.name.toLowerCase()}`
    packageJson.description = `Bot ${bot.name} creado con TarDía Cloud Bot Platform`
    files["package.json"] = JSON.stringify(packageJson, null, 2)

    // CAMBIO 3: Añadimos 'package-lock.json' a los archivos que se van a generar.
    files["package-lock.json"] = packageLockTemplate // <-- Nueva línea

    // Generar archivo de configuración específico del bot
    files[".env"] = generateBotEnvFile(bot)

    log("info", "Templates loaded successfully", {
      botName: bot.name,
      filesGenerated: Object.keys(files).length,
    })

    return files
  } catch (error) {
    log("error", "Error loading templates", {
      botName: bot.name,
      error: error.message,
      stack: error.stack,
    })

    // Fallback al código anterior si no se pueden cargar los templates
    log("warn", "Using legacy template generation")
    return generateBotFilesLegacy(bot)
  }
}

// Generar archivo .env para el bot
function generateBotEnvFile(bot) {
  return `# Configuración del Bot ${bot.name}
BOT_NAME=${bot.name}
BOT_TOKEN=${bot.token}
SERVICES=${bot.servicios.join(",")}
PORT=3000

# APIs (configurar según necesidad)
WEATHER_API_KEY=
NEWS_API_KEY=
GEMINI_API_KEY=
WEATHER_CITY=Buenos Aires

# Configuración de la plataforma
PLATFORM_VERSION=1.0.0
CREATED_AT=${new Date().toISOString()}
`
}

// Endpoint para eliminar bot con mejor logging
app.delete("/api/bots/:id", authenticateToken, async (req, res) => {
  try {
    const botId = req.params.id
    log("info", "Bot deletion request", { userId: req.user.id, botId })

    const bot = await Bot.findOne({ _id: botId, user_id: req.user.id })

    if (!bot) {
      log("warn", "Bot deletion failed - not found", { userId: req.user.id, botId })
      return res.status(404).json({ message: "Bot no encontrado" })
    }

    log("info", "Deleting bot", { botId, botName: bot.name })

    // Eliminar recursos de Kubernetes
    try {
      if (bot.kubernetes_deployment) {
        const deploymentName = bot.kubernetes_deployment
        const serviceName = `${bot.name.toLowerCase()}-service`

        log("info", "Deleting Kubernetes resources", { deploymentName, serviceName })

        await execAsync(
          `kubectl delete deployment ${deploymentName} -n ${KUBERNETES_NAMESPACE} --ignore-not-found=true`,
        )

        await execAsync(`kubectl delete service ${serviceName} -n ${KUBERNETES_NAMESPACE} --ignore-not-found=true`)

        log("info", "Kubernetes resources deleted", { deploymentName, serviceName })
      }
    } catch (k8sError) {
      log("error", "Error deleting Kubernetes resources", {
        botId,
        error: k8sError.message,
      })
      // Continuar con la eliminación del bot aunque falle Kubernetes
    }

    // Eliminar directorio del bot
    try {
      const botDir = path.join(process.cwd(), "generated-bots", botId.toString())
      await fs.rmdir(botDir, { recursive: true })
      log("info", "Bot directory deleted", { botDir })
    } catch (dirError) {
      log("error", "Error deleting bot directory", {
        botId,
        error: dirError.message,
      })
    }

    // Eliminar bot de la base de datos
    await Bot.findByIdAndDelete(botId)

    log("info", "Bot deleted successfully", { botId, botName: bot.name })
    res.json({ message: "Bot eliminado exitosamente" })
  } catch (error) {
    log("error", "Bot deletion error:", {
      userId: req.user?.id,
      botId: req.params.id,
      message: error.message,
      stack: error.stack,
    })
    res.status(500).json({ message: "Error interno del servidor" })
  }
})

// Start server
app.listen(PORT, () => {
  log("info", "Server started successfully", {
    port: PORT,
    healthEndpoint: `http://localhost:${PORT}/health`,
    kubernetesNamespace: KUBERNETES_NAMESPACE,
  })
})

// Graceful shutdown
process.on("SIGTERM", async () => {
  log("info", "Received SIGTERM, shutting down gracefully...")
  await mongoose.connection.close()
  process.exit(0)
})

// Function to generate Kubernetes deployment YAML
function generateKubernetesDeploymentForBot(bot, imageName) {
  const deploymentName = `bot-${bot.name.toLowerCase()}-${bot._id}`

  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${deploymentName}
  namespace: ${KUBERNETES_NAMESPACE}
  labels:
    app: ${bot.name.toLowerCase()}
    bot-id: "${bot._id}"
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${bot.name.toLowerCase()}
  template:
    metadata:
      labels:
        app: ${bot.name.toLowerCase()}
        bot-id: "${bot._id}"
    spec:
      containers:
      - name: ${bot.name.toLowerCase()}
        image: ${imageName}
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 3000
        env:
        - name: BOT_NAME
          value: "${bot.name}"
        - name: BOT_TOKEN
          value: "${bot.token}"
        - name: SERVICES
          value: "${bot.servicios.join(",")}"
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "200m"
        livenessProbe:
          httpGet:
            path: /
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 10
      restartPolicy: Always
---
apiVersion: v1
kind: Service
metadata:
  name: ${bot.name.toLowerCase()}-service
  namespace: ${KUBERNETES_NAMESPACE}
spec:
  selector:
    app: ${bot.name.toLowerCase()}
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP
`
}

// Función legacy como fallback
function generateBotFilesLegacy(bot) {
  log("warn", "Using legacy bot file generation", { botName: bot.name })

  const basicIndex = `
const express = require('express')
const app = express()
const port = process.env.PORT || 3000

app.get('/', (req, res) => {
  res.json({
    status: 'active',
    bot: '${bot.name}',
    timestamp: new Date().toISOString()
  })
})

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    bot: '${bot.name}',
    uptime: process.uptime()
  })
})

app.listen(port, () => {
  console.log(\`Bot ${bot.name} running on port \${port}\`)
})
`

  return {
    "index.js": basicIndex,
    "package.json": JSON.stringify(
      {
        name: `bot-${bot.name.toLowerCase()}`,
        version: "1.0.0",
        main: "index.js",
        scripts: {
          start: "node index.js",
        },
        dependencies: {
          express: "^4.18.2",
        },
      },
      null,
      2,
    ),
    Dockerfile: `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]`,
    ".env": `BOT_NAME=${bot.name}\nSERVICES=${bot.servicios.join(",")}`,
  }
}
