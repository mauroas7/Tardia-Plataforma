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
app.use(cors({
  origin: 'https://plataformatardia.vercel.app' 
}));
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

    const userBotCount = await Bot.countDocuments({ user_id: req.user.id })
    if (userBotCount >= 20) {
      log("warn", "Bot creation failed - limit reached", { userId: req.user.id })
      return res.status(400).json({ message: "Has alcanzado el límite máximo de 20 bots por usuario" })
    }

    const existingBot = await Bot.findOne({ user_id: req.user.id, name: name })
    if (existingBot) {
      log("warn", "Bot creation failed - name exists", { userId: req.user.id, botName: name })
      return res.status(400).json({ message: "Ya tienes un bot con ese nombre" })
    }

    if (!name || !token || !servicios || servicios.length === 0) {
      log("warn", "Bot creation failed - missing fields", { userId: req.user.id })
      return res.status(400).json({ message: "Todos los campos son requeridos" })
    }

    const bot = new Bot({
      user_id: req.user.id,
      name,
      token,
      servicios,
      status: "creating",
    })

    await bot.save()
    log("info", "Bot record created", { userId: req.user.id, botId: bot._id, botName: name })

    createBotAsync(bot)

    res.status(201).json(bot)
  } catch (error) {
    log("error", "Bot creation error:", { userId: req.user?.id, message: error.message, stack: error.stack })
    res.status(500).json({ message: "Error interno del servidor" })
  }
})

// =================================================================
// FUNCIÓN DE CREACIÓN DE BOTS CORREGIDA Y ROBUSTA
// =================================================================
async function createBotAsync(bot) {
  const workingDir = process.cwd();
  const templateDir = path.join("/app", "bot-templates"); 
  const botDir = path.join(workingDir, "generated-bots", bot._id.toString());

  try {
    log("info", "Starting bot deployment", { botId: bot._id, botName: bot.name });

    // 1. Limpiar directorio previo y crearlo de nuevo
    await fs.rm(botDir, { recursive: true, force: true });
    await fs.mkdir(botDir, { recursive: true });
    log("info", "Bot directory created", { botDir });

    // 2. ¡EL ARREGLO CLAVE! Copiar TODA la plantilla (archivos y carpetas) al directorio del bot.
    log("info", "Copying all template files...", { from: templateDir, to: botDir });
    await execAsync(`cp -rT ${templateDir}/. ${botDir}/`);
    log("info", "Template files copied successfully");

    // 3. Modificar el package.json en el nuevo directorio
    const packageJsonPath = path.join(botDir, "package.json");
    const packageTemplate = await fs.readFile(packageJsonPath, "utf8");
    const packageJson = JSON.parse(packageTemplate);
    packageJson.name = `bot-${bot.name.toLowerCase()}`;
    packageJson.description = `Bot ${bot.name} creado con TarDía Cloud Bot Platform`;
    await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
    log("info", "package.json customized");

    // 4. Crear el archivo .env en el nuevo directorio
    const envContent = generateBotEnvFile(bot);
    await fs.writeFile(path.join(botDir, ".env"), envContent);
    log("info", "File written", { filename: ".env" });

    // 5. Construir imagen Docker
    const imageName = `bot-${bot.name.toLowerCase()}-${bot._id}:latest`;
    log("info", "Building Docker image", { imageName });
    try {
      const { stdout } = await execAsync(`docker build -t ${imageName} ${botDir}`);
      log("info", "Docker build completed", { imageName, stdout: stdout.slice(-200) });
    } catch (error) {
      log("error", "Docker build failed", { imageName, error: error.message, stderr: error.stderr });
      throw new Error(`Docker build failed: ${error.message}`);
    }

    // 6. Desplegar en Kubernetes
    const deploymentYaml = generateKubernetesDeploymentForBot(bot, imageName);
    const deploymentFile = path.join(botDir, "k8s-deployment.yaml");
    await fs.writeFile(deploymentFile, deploymentYaml);
    log("info", "Applying Kubernetes deployment", { deploymentFile });
    try {
      const { stdout } = await execAsync(`kubectl apply -f ${deploymentFile}`);
      log("info", "Kubernetes deployment applied", { stdout });
    } catch (error) {
      log("error", "Kubernetes deployment failed", { error: error.message, stderr: error.stderr });
      throw new Error(`Kubernetes deployment failed: ${error.message}`);
    }
    
    // 7. Esperar a que el pod esté listo
    const deploymentName = `bot-${bot.name.toLowerCase()}-${bot._id}`;
    log("info", "Waiting for deployment to be ready", { deploymentName });
    await execAsync(`kubectl wait --for=condition=available --timeout=300s deployment/${deploymentName} -n ${KUBERNETES_NAMESPACE}`);
    log("info", "Deployment is ready", { deploymentName });

    // 8. Actualizar estado del bot en la base de datos
    const serviceName = `${bot.name.toLowerCase()}-service`;
    await Bot.findByIdAndUpdate(bot._id, {
      status: "active",
      url: `https://t.me/${bot.name}`,
      deploy_url: `http://${serviceName}.${KUBERNETES_NAMESPACE}.svc.cluster.local`,
      kubernetes_deployment: deploymentName,
      error_message: null,
    });
    log("info", "Bot deployed successfully", { botId: bot._id, botName: bot.name });

  } catch (error) {
    log("error", "Bot deployment failed", { botId: bot._id, botName: bot.name, error: error.message, stack: error.stack });
    await Bot.findByIdAndUpdate(bot._id, {
      status: "error",
      error_message: error.message,
    });
  }
}


// Reemplaza tu función generateBotEnvFile con esta versión corregida

function generateBotEnvFile(bot) {
  // 1. Lee las claves de API desde el entorno del backend.
  //    Usa los nombres exactos con guiones que vimos con el comando `printenv`.
  const weatherKey = process.env['weather-api-key'] || "";
  const newsKey = process.env['news-api-key'] || "";
  const geminiKey = process.env['gemini-api-key'] || "";

  // 2. Genera el contenido del archivo .env para el nuevo bot.
  //    Aquí escribimos las variables en el formato estándar (mayúsculas) que el bot leerá.
  return `# Configuración del Bot ${bot.name}
BOT_NAME=${bot.name}
BOT_TOKEN=${bot.token}
SERVICES=${bot.servicios.join(",")}
PORT=3000

# APIs inyectadas por la plataforma
WEATHER_API_KEY=${weatherKey}
NEWS_API_KEY=${newsKey}
GEMINI_API_KEY=${geminiKey}
WEATHER_CITY=Buenos Aires

# Configuración de la plataforma
PLATFORM_VERSION=1.0.0
CREATED_AT=${new Date().toISOString()}
`;
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
    }

    // Eliminar directorio del bot
    try {
      const botDir = path.join(process.cwd(), "generated-bots", botId.toString())
      await fs.rm(botDir, { recursive: true, force: true });
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
