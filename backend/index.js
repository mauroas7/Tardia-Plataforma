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

// Enhanced logging
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

// Enhanced error handling
process.on("uncaughtException", (error) => {
  log("error", "Uncaught Exception:", error)
  process.exit(1)
})

process.on("unhandledRejection", (reason, promise) => {
  log("error", "Unhandled Rejection at:", { promise, reason })
  process.exit(1)
})

// Middleware
app.use(cors())
app.use(express.json({ limit: "10mb" }))
app.use(express.static("public"))

// Environment variables with defaults
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
})

// MongoDB connection with better error handling
const connectDB = async () => {
  try {
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
    })
  } catch (error) {
    log("error", "MongoDB Atlas connection failed:", error)
    process.exit(1)
  }
}

// Connect to database
connectDB()

mongoose.connection.on("error", (err) => {
  log("error", "MongoDB connection error:", err)
})

mongoose.connection.on("disconnected", () => {
  log("warn", "MongoDB disconnected")
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
      return res.status(403).json({ message: "Token inválido" })
    }
    req.user = user
    next()
  })
}

// Routes

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  })
})

// Auth routes
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password } = req.body

    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({ message: "El usuario ya existe" })
    }

    const hashedPassword = await bcrypt.hash(password, 12)
    const user = new User({ email, password: hashedPassword })
    await user.save()

    console.log(`👤 New user registered: ${email}`)
    res.status(201).json({ message: "Usuario creado exitosamente" })
  } catch (error) {
    console.error("Registration error:", error)
    res.status(500).json({ message: "Error interno del servidor" })
  }
})

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body

    const user = await User.findOne({ email })
    if (!user) {
      return res.status(400).json({ message: "Credenciales inválidas" })
    }

    const validPassword = await bcrypt.compare(password, user.password)
    if (!validPassword) {
      return res.status(400).json({ message: "Credenciales inválidas" })
    }

    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: "24h" })

    console.log(`🔐 User logged in: ${email}`)
    res.json({
      token,
      user: { id: user._id, email: user.email },
    })
  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({ message: "Error interno del servidor" })
  }
})

// Bot routes
app.get("/api/bots", authenticateToken, async (req, res) => {
  try {
    const bots = await Bot.find({ user_id: req.user.id }).sort({ created_at: -1 })
    res.json(bots)
  } catch (error) {
    console.error("Error fetching bots:", error)
    res.status(500).json({ message: "Error interno del servidor" })
  }
})

app.post("/api/crear-bot", authenticateToken, async (req, res) => {
  try {
    const { name, token, servicios } = req.body

    console.log(`🤖 Creating bot: ${name} with services: ${servicios.join(", ")}`)

    if (!name || !token || !servicios || servicios.length === 0) {
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

    // Start bot creation process asynchronously
    createBotAsync(bot)

    res.status(201).json(bot)
  } catch (error) {
    console.error("Bot creation error:", error)
    res.status(500).json({ message: "Error interno del servidor" })
  }
})

// Bot creation logic with Kubernetes
async function createBotAsync(bot) {
  try {
    console.log(`📋 Starting Kubernetes deployment for bot: ${bot.name}`)

    // 1. Generate bot code
    const botCode = generateBotCode(bot)
    const botDir = path.join(__dirname, "generated-bots", bot._id.toString())

    await fs.mkdir(botDir, { recursive: true })
    await fs.writeFile(path.join(botDir, "index.js"), botCode)
    await fs.writeFile(path.join(botDir, "package.json"), generatePackageJson(bot))
    await fs.writeFile(path.join(botDir, "Dockerfile"), generateDockerfile())

    // 2. Build Docker image
    const imageName = `bot-${bot.name.toLowerCase()}-${bot._id}`
    await execAsync(`docker build -t ${imageName} ${botDir}`)
    console.log(`🐳 Docker image built: ${imageName}`)

    // 3. Deploy to Kubernetes
    const deploymentYaml = generateKubernetesDeployment(bot, imageName)
    const deploymentFile = path.join(botDir, "deployment.yaml")
    await fs.writeFile(deploymentFile, deploymentYaml)

    await execAsync(`kubectl apply -f ${deploymentFile} -n ${KUBERNETES_NAMESPACE}`)
    console.log(`☸️ Kubernetes deployment created for bot: ${bot.name}`)

    // 4. Update bot status
    await Bot.findByIdAndUpdate(bot._id, {
      status: "active",
      url: `https://t.me/${bot.name}`,
      deploy_url: `http://${bot.name.toLowerCase()}-service.${KUBERNETES_NAMESPACE}.svc.cluster.local`,
      kubernetes_deployment: `bot-${bot.name.toLowerCase()}-${bot._id}`,
    })

    console.log(`✅ Bot ${bot.name} deployed successfully to Kubernetes`)
  } catch (error) {
    console.error(`❌ Bot deployment failed for ${bot.name}:`, error)

    await Bot.findByIdAndUpdate(bot._id, { status: "error" })
  }
}

// Code generation functions
function generateBotCode(bot) {
  const services = bot.servicios

  return `
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
${services.includes("ia") ? "const { GoogleGenerativeAI } = require('@google/generative-ai');" : ""}

const token = '${bot.token}';
const bot = new TelegramBot(token, { polling: true });

${
  services.includes("ia")
    ? `
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
`
    : ""
}

// Memory system
const userMemory = new Map();

// Bot commands
bot.onText(/\\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage = \`
🤖 ¡Hola! Soy ${bot.name}

Mis comandos disponibles:
${services.includes("clima") ? "🌤️ /clima [ciudad] - Consultar el clima" : ""}
${services.includes("noticias") ? "📰 /noticias - Últimas noticias" : ""}
${services.includes("chistes") ? "😄 /chiste - Chiste aleatorio" : ""}
${services.includes("ia") ? "🧠 /chat [mensaje] - Conversar conmigo" : ""}
ℹ️ /help - Ver esta ayuda
  \`;
  
  bot.sendMessage(chatId, welcomeMessage);
});

${
  services.includes("clima")
    ? `
bot.onText(/\\/clima (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const city = match[1];
  
  try {
    const response = await axios.get(\`https://api.openweathermap.org/data/2.5/weather?q=\${city}&appid=\${process.env.WEATHER_API_KEY}&units=metric&lang=es\`);
    const weather = response.data;
    
    const message = \`
🌤️ Clima en \${weather.name}:
🌡️ Temperatura: \${weather.main.temp}°C
💧 Humedad: \${weather.main.humidity}%
📊 Descripción: \${weather.weather[0].description}
    \`;
    
    bot.sendMessage(chatId, message);
  } catch (error) {
    bot.sendMessage(chatId, '❌ No pude obtener el clima. Verifica el nombre de la ciudad.');
  }
});
`
    : ""
}

${
  services.includes("noticias")
    ? `
bot.onText(/\\/noticias/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const response = await axios.get(\`https://gnews.io/api/v4/top-headlines?token=\${process.env.NEWS_API_KEY}&lang=es&max=5\`);
    const articles = response.data.articles;
    
    let message = '📰 Últimas noticias:\\n\\n';
    articles.forEach((article, index) => {
      message += \`\${index + 1}. \${article.title}\\n\${article.url}\\n\\n\`;
    });
    
    bot.sendMessage(chatId, message);
  } catch (error) {
    bot.sendMessage(chatId, '❌ No pude obtener las noticias en este momento.');
  }
});
`
    : ""
}

${
  services.includes("chistes")
    ? `
bot.onText(/\\/chiste/, (msg) => {
  const chatId = msg.chat.id;
  const chistes = [
    '¿Por qué los pájaros vuelan hacia el sur en invierno? Porque es muy lejos para caminar.',
    '¿Qué le dice un taco a otro taco? ¿Quieres que vayamos por unas quesadillas?',
    '¿Cómo se llama el campeón de buceo japonés? Tokofondo.',
    '¿Qué hace una abeja en el gimnasio? ¡Zum-ba!',
    '¿Por qué los elefantes no usan computadoras? Porque le tienen miedo al mouse.'
  ];
  
  const randomJoke = chistes[Math.floor(Math.random() * chistes.length)];
  bot.sendMessage(chatId, \`😄 \${randomJoke}\`);
});
`
    : ""
}

${
  services.includes("ia")
    ? `
bot.onText(/\\/chat (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userMessage = match[1];
  const userId = msg.from.id;
  
  try {
    // Get user memory
    let memory = userMemory.get(userId) || [];
    memory.push(\`Usuario: \${userMessage}\`);
    
    // Keep only last 10 messages
    if (memory.length > 10) {
      memory = memory.slice(-10);
    }
    
    const context = memory.join('\\n');
    const prompt = \`Eres ${bot.name}, un asistente útil y amigable. Contexto de la conversación:\\n\${context}\\n\\nResponde de manera natural y útil.\`;
    
    const result = await model.generateContent(prompt);
    const response = result.response.text();
    
    // Save response to memory
    memory.push(\`Asistente: \${response}\`);
    userMemory.set(userId, memory);
    
    bot.sendMessage(chatId, \`🧠 \${response}\`);
  } catch (error) {
    bot.sendMessage(chatId, '❌ No pude procesar tu mensaje en este momento.');
  }
});
`
    : ""
}

bot.onText(/\\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = \`
🤖 ${bot.name} - Comandos disponibles:

${services.includes("clima") ? "🌤️ /clima [ciudad] - Consultar el clima de una ciudad" : ""}
${services.includes("noticias") ? "📰 /noticias - Ver las últimas noticias" : ""}
${services.includes("chistes") ? "😄 /chiste - Escuchar un chiste aleatorio" : ""}
${services.includes("ia") ? "🧠 /chat [mensaje] - Conversar con inteligencia artificial" : ""}
ℹ️ /help - Mostrar esta ayuda

¡Creado con Cloud Bot Platform! 🚀
  \`;
  
  bot.sendMessage(chatId, helpMessage);
});

// Error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log(\`🤖 Bot ${bot.name} is running...\`);
console.log(\`📊 Services enabled: ${services.join(", ")}\`);
`
}

function generatePackageJson(bot) {
  return JSON.stringify(
    {
      name: `telegram-bot-${bot.name.toLowerCase()}`,
      version: "1.0.0",
      description: `Telegram bot ${bot.name} created with Cloud Bot Platform`,
      main: "index.js",
      scripts: {
        start: "node index.js",
      },
      dependencies: {
        "node-telegram-bot-api": "^0.64.0",
        axios: "^1.6.0",
        ...(bot.servicios.includes("ia") && { "@google/generative-ai": "^0.2.0" }),
      },
    },
    null,
    2,
  )
}

function generateDockerfile() {
  return `
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
`
}

function generateKubernetesDeployment(bot, imageName) {
  const deploymentName = `bot-${bot.name.toLowerCase()}-${bot._id}`

  return `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${deploymentName}
  namespace: ${KUBERNETES_NAMESPACE}
  labels:
    app: ${deploymentName}
    type: telegram-bot
    user: ${bot.user_id}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${deploymentName}
  template:
    metadata:
      labels:
        app: ${deploymentName}
        type: telegram-bot
    spec:
      containers:
      - name: bot
        image: ${imageName}
        ports:
        - containerPort: 3000
        env:
        - name: BOT_TOKEN
          value: "${bot.token}"
        - name: BOT_NAME
          value: "${bot.name}"
        - name: WEATHER_API_KEY
          valueFrom:
            secretKeyRef:
              name: bot-secrets
              key: weather-api-key
              optional: true
        - name: NEWS_API_KEY
          valueFrom:
            secretKeyRef:
              name: bot-secrets
              key: news-api-key
              optional: true
        - name: GEMINI_API_KEY
          valueFrom:
            secretKeyRef:
              name: bot-secrets
              key: gemini-api-key
              optional: true
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "200m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: ${bot.name.toLowerCase()}-service
  namespace: ${KUBERNETES_NAMESPACE}
spec:
  selector:
    app: ${deploymentName}
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP
`
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Cloud Bot Platform API running on port ${PORT}`)
  console.log(`🌐 Health check: http://localhost:${PORT}/health`)
  console.log(`☸️ Kubernetes namespace: ${KUBERNETES_NAMESPACE}`)
})

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("🛑 Shutting down gracefully...")
  await mongoose.connection.close()
  process.exit(0)
})

