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
const crypto = require("crypto")
const nodemailer = require("nodemailer")

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

// Enhanced error handling
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

// Environment variables - Configuración para desarrollo local
const PORT = process.env.PORT || 3000
const JWT_SECRET = process.env.JWT_SECRET || "cloud-bot-secret-key-2024"
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://dbUser:ProyectoTarDia987654321@tardiacluster.mg4kvzx.mongodb.net/cloud-bot-platform?retryWrites=true&w=majority&appName=TarDiaCluster"
const KUBERNETES_NAMESPACE = process.env.KUBERNETES_NAMESPACE || "bot-platform"

// Configuración de Nodemailer con Gmail
const EMAIL_USER = process.env.EMAIL_USER || "tardiainfo@gmail.com"
const EMAIL_PASS = process.env.EMAIL_PASS // App Password de Gmail
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:8080"

// CORS configuration - CORREGIDO para desarrollo local
const corsOptions = {
  origin: [
    "http://localhost:8080",
    "http://localhost:3000",
    "http://127.0.0.1:8080",
    "http://127.0.0.1:3000",
    FRONTEND_URL,
    "https://plataformatardiadevelop.vercel.app",
  ].filter(Boolean),
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
  optionsSuccessStatus: 200, // Para navegadores legacy
}

// Middleware - APLICAR CORS ANTES QUE CUALQUIER OTRA COSA
app.use(cors(corsOptions))

// Middleware adicional para debugging CORS
app.use((req, res, next) => {
  log("info", "Request received", {
    method: req.method,
    url: req.url,
    origin: req.headers.origin,
    userAgent: req.headers["user-agent"]?.substring(0, 50),
  })
  next()
})

app.use(express.json({ limit: "10mb" }))
app.use(express.static("public"))

// Crear transporter de Nodemailer
const createEmailTransporter = () => {
  if (!EMAIL_PASS) {
    log("warn", "Email password not configured")
    return null
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false,
    },
  })
}

const emailTransporter = createEmailTransporter()

log("info", "Starting Cloud Bot Platform API", {
  port: PORT,
  frontendUrl: FRONTEND_URL,
  mongoUri: MONGODB_URI.replace(/\/\/.*@/, "//***:***@"),
  kubernetesNamespace: KUBERNETES_NAMESPACE,
  emailConfigured: !!emailTransporter,
  emailUser: EMAIL_USER,
  nodeVersion: process.version,
  platform: process.platform,
  workingDirectory: process.cwd(),
  corsOrigins: corsOptions.origin,
})

// MongoDB connection
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

// Schemas
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  email_verified: { type: Boolean, default: false },
  verification_token: { type: String },
  verification_expires: { type: Date },
  created_at: { type: Date, default: Date.now },
})

const User = mongoose.model("User", userSchema)

const botSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true },
  token: { type: String, required: true },
  servicios: [{ type: String }],
  status: { type: String, enum: ["creating", "active", "error", "stopped"], default: "creating" },
  url: String,
  repo_url: String,
  kubernetes_deployment: String,
  error_message: String,
  created_at: { type: Date, default: Date.now },
})

const Bot = mongoose.model("Bot", botSchema)

const passwordResetSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  token: { type: String, required: true },
  expires_at: { type: Date, required: true },
  used: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
})

const PasswordReset = mongoose.model("PasswordReset", passwordResetSchema)

// Función para enviar emails con Nodemailer
async function sendEmail(to, subject, html) {
  if (!emailTransporter) {
    log("warn", "Email transporter not configured, skipping email", { to, subject })
    return { success: false, error: "Email service not configured" }
  }

  try {
    log("info", "Sending email via Nodemailer", { to, subject })

    const mailOptions = {
      from: `"TarDia Bot Platform" <${EMAIL_USER}>`,
      to: to,
      subject: subject,
      html: html,
    }

    const result = await emailTransporter.sendMail(mailOptions)

    log("info", "Email sent successfully", {
      to,
      messageId: result.messageId,
      response: result.response,
    })

    return { success: true, messageId: result.messageId }
  } catch (error) {
    log("error", "Email service error", {
      to,
      error: error.message,
      code: error.code,
    })
    return { success: false, error: error.message }
  }
}

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

// Health check - MEJORADO con información de CORS
app.get("/health", (req, res) => {
  const healthData = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    email: {
      nodemailerConfigured: !!emailTransporter,
      emailUser: EMAIL_USER,
    },
    frontendUrl: FRONTEND_URL,
    corsOrigins: corsOptions.origin,
    memory: process.memoryUsage(),
    version: "1.0.0",
    environment: process.env.NODE_ENV || "development",
  }

  log("info", "Health check requested", healthData)
  res.json(healthData)
})

// Test endpoint para verificar CORS
app.get("/api/test", (req, res) => {
  log("info", "Test endpoint called", {
    origin: req.headers.origin,
    method: req.method,
  })
  res.json({
    message: "CORS test successful",
    timestamp: new Date().toISOString(),
    origin: req.headers.origin,
  })
})

// Auth routes
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

    // Generar token de verificación
    const verificationToken = crypto.randomBytes(32).toString("hex")
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 horas

    const user = new User({
      email,
      password: hashedPassword,
      verification_token: verificationToken,
      verification_expires: verificationExpires,
      email_verified: false,
    })
    await user.save()

    // URL de verificación apuntando al frontend
    const verificationUrl = `${FRONTEND_URL}/verify-email?token=${verificationToken}`

    log("info", "Generated verification URL", {
      verificationUrl,
      frontendUrl: FRONTEND_URL,
    })

    const emailResult = await sendEmail(
      email,
      "Verifica tu cuenta - TarDia Bot Platform",
      `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">🤖 TarDia Bot Platform</h1>
          </div>
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <h2 style="color: #2d3748; margin-bottom: 20px;">¡Bienvenido a TarDia Bot Platform!</h2>
            <p style="color: #718096; line-height: 1.6; margin-bottom: 25px;">
              Gracias por registrarte. Para completar tu registro y comenzar a crear bots de Telegram, 
              necesitas verificar tu dirección de email.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
                Verificar Email
              </a>
            </div>
            <p style="color: #718096; font-size: 14px; line-height: 1.5;">
              Este enlace expirará en 24 horas por seguridad.<br>
              Si no te registraste en nuestra plataforma, puedes ignorar este email.
            </p>
            <p style="color: #a0aec0; font-size: 12px; margin-top: 20px;">
              Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
              <span style="word-break: break-all;">${verificationUrl}</span>
            </p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;">
            <p style="color: #a0aec0; font-size: 12px; text-align: center;">
              © 2024 TarDia Bot Platform. Todos los derechos reservados.
            </p>
          </div>
        </div>
      `,
    )

    log("info", "User registered successfully", {
      email,
      userId: user._id,
      emailSent: emailResult.success,
      emailError: emailResult.error || null,
      verificationUrl,
    })

    let message = "Usuario creado exitosamente."
    if (emailResult.success) {
      message += " Revisa tu email para verificar tu cuenta."
    } else {
      message += " Hubo un problema enviando el email de verificación."
    }

    res.status(201).json({
      message,
      emailSent: emailResult.success,
    })
  } catch (error) {
    log("error", "Registration error:", {
      message: error.message,
      stack: error.stack,
    })
    res.status(500).json({ message: "Error interno del servidor" })
  }
})

// Verificar email
app.get("/api/auth/verify-email/:token", async (req, res) => {
  try {
    const { token } = req.params
    log("info", "Email verification attempt", { token: token.substring(0, 8) + "..." })

    const user = await User.findOne({
      verification_token: token,
      verification_expires: { $gt: new Date() },
      email_verified: false,
    })

    if (!user) {
      log("warn", "Invalid or expired verification token", { token: token.substring(0, 8) + "..." })
      return res.status(400).json({ message: "Token de verificación inválido o expirado" })
    }

    // Marcar email como verificado
    await User.findByIdAndUpdate(user._id, {
      email_verified: true,
      verification_token: null,
      verification_expires: null,
    })

    log("info", "Email verified successfully", { userId: user._id, email: user.email })
    res.json({ message: "Email verificado exitosamente. Ya puedes iniciar sesión." })
  } catch (error) {
    log("error", "Email verification error:", { message: error.message })
    res.status(500).json({ message: "Error interno del servidor" })
  }
})

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body
    log("info", "Login attempt", { email, origin: req.headers.origin })

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

    // Verificar si el email está verificado
    if (!user.email_verified) {
      log("warn", "Login failed - email not verified", { email })
      return res.status(400).json({
        message: "Debes verificar tu email antes de iniciar sesión. Revisa tu bandeja de entrada.",
        emailNotVerified: true,
      })
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

// Reenviar verificación de email
app.post("/api/auth/resend-verification", async (req, res) => {
  try {
    const { email } = req.body
    log("info", "Resend verification request", { email })

    const user = await User.findOne({ email })
    if (!user) {
      return res.json({ message: "Si el email existe, recibirás un nuevo enlace de verificación" })
    }

    if (user.email_verified) {
      return res.status(400).json({ message: "Este email ya está verificado" })
    }

    // Generar nuevo token
    const verificationToken = crypto.randomBytes(32).toString("hex")
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000)

    await User.findByIdAndUpdate(user._id, {
      verification_token: verificationToken,
      verification_expires: verificationExpires,
    })

    const verificationUrl = `${FRONTEND_URL}/verify-email?token=${verificationToken}`

    const emailResult = await sendEmail(
      email,
      "Verifica tu cuenta - TarDia Bot Platform",
      `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">🤖 TarDia Bot Platform</h1>
          </div>
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <h2 style="color: #2d3748; margin-bottom: 20px;">Verifica tu cuenta</h2>
            <p style="color: #718096; line-height: 1.6; margin-bottom: 25px;">
              Solicitaste un nuevo enlace de verificación. Haz clic en el botón de abajo para verificar tu email.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
                Verificar Email
              </a>
            </div>
            <p style="color: #718096; font-size: 14px; line-height: 1.5;">
              Este enlace expirará en 24 horas por seguridad.
            </p>
            <p style="color: #a0aec0; font-size: 12px; margin-top: 20px;">
              Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
              <span style="word-break: break-all;">${verificationUrl}</span>
            </p>
          </div>
        </div>
      `,
    )

    log("info", "Verification email resent", { email, emailSent: emailResult.success })
    res.json({ message: "Si el email existe, recibirás un nuevo enlace de verificación" })
  } catch (error) {
    log("error", "Resend verification error:", { message: error.message })
    res.status(500).json({ message: "Error interno del servidor" })
  }
})

// Solicitar recuperación de contraseña
app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body
    log("info", "Password reset request", { email })

    const user = await User.findOne({ email })
    if (!user) {
      log("warn", "Password reset for non-existent user", { email })
      return res.json({ message: "Si el email existe, recibirás un enlace de recuperación" })
    }

    // Generar token único
    const resetToken = crypto.randomBytes(32).toString("hex")
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hora

    // Guardar token en la base de datos
    await PasswordReset.create({
      user_id: user._id,
      token: resetToken,
      expires_at: expiresAt,
    })

    const resetUrl = `${FRONTEND_URL}/reset-password?token=${resetToken}`

    const emailResult = await sendEmail(
      email,
      "Recupera tu contraseña - TarDia Bot Platform",
      `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">🤖 TarDia Bot Platform</h1>
          </div>
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <h2 style="color: #2d3748; margin-bottom: 20px;">Recupera tu contraseña</h2>
            <p style="color: #718096; line-height: 1.6; margin-bottom: 25px;">
              Recibimos una solicitud para restablecer la contraseña de tu cuenta. 
              Haz clic en el botón de abajo para crear una nueva contraseña.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
                Restablecer Contraseña
              </a>
            </div>
            <p style="color: #718096; font-size: 14px; line-height: 1.5;">
              Este enlace expirará en 1 hora por seguridad.<br>
              Si no solicitaste este cambio, puedes ignorar este email.
            </p>
            <p style="color: #a0aec0; font-size: 12px; margin-top: 20px;">
              Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
              <span style="word-break: break-all;">${resetUrl}</span>
            </p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;">
            <p style="color: #a0aec0; font-size: 12px; text-align: center;">
              © 2024 TarDia Bot Platform. Todos los derechos reservados.
            </p>
          </div>
        </div>
      `,
    )

    log("info", "Password reset email processed", {
      email,
      emailSent: emailResult.success,
      error: emailResult.error || null,
      resetUrl,
    })

    res.json({ message: "Si el email existe, recibirás un enlace de recuperación" })
  } catch (error) {
    log("error", "Forgot password error:", { message: error.message })
    res.status(500).json({ message: "Error interno del servidor" })
  }
})

// Restablecer contraseña
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body
    log("info", "Password reset attempt", { token: token.substring(0, 8) + "..." })

    // Buscar token válido
    const resetRecord = await PasswordReset.findOne({
      token,
      used: false,
      expires_at: { $gt: new Date() },
    }).populate("user_id")

    if (!resetRecord) {
      log("warn", "Invalid or expired reset token", { token: token.substring(0, 8) + "..." })
      return res.status(400).json({ message: "Token inválido o expirado" })
    }

    // Actualizar contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 12)
    await User.findByIdAndUpdate(resetRecord.user_id._id, {
      password: hashedPassword,
    })

    // Marcar token como usado
    await PasswordReset.findByIdAndUpdate(resetRecord._id, { used: true })

    log("info", "Password reset successful", { userId: resetRecord.user_id._id })
    res.json({ message: "Contraseña actualizada exitosamente" })
  } catch (error) {
    log("error", "Reset password error:", { message: error.message })
    res.status(500).json({ message: "Error interno del servidor" })
  }
})

// Verificar token de reset
app.get("/api/auth/verify-reset-token/:token", async (req, res) => {
  try {
    const { token } = req.params

    const resetRecord = await PasswordReset.findOne({
      token,
      used: false,
      expires_at: { $gt: new Date() },
    })

    if (!resetRecord) {
      return res.status(400).json({ valid: false, message: "Token inválido o expirado" })
    }

    res.json({ valid: true })
  } catch (error) {
    log("error", "Verify reset token error:", { message: error.message })
    res.status(500).json({ valid: false, message: "Error interno del servidor" })
  }
})

// Bot routes
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

// Función de creación de bots (mantenida igual)
async function createBotAsync(bot) {
  const workingDir = process.cwd()
  const templateDir = path.join("/app", "bot-templates")
  const botDir = path.join(workingDir, "generated-bots", bot._id.toString())

  try {
    log("info", "Starting bot deployment", { botId: bot._id, botName: bot.name })

    await fs.rm(botDir, { recursive: true, force: true })
    await fs.mkdir(botDir, { recursive: true })
    log("info", "Bot directory created", { botDir })

    log("info", "Copying all template files...", { from: templateDir, to: botDir })
    await execAsync(`cp -rT ${templateDir}/. ${botDir}/`)
    log("info", "Template files copied successfully")

    const packageJsonPath = path.join(botDir, "package.json")
    const packageTemplate = await fs.readFile(packageJsonPath, "utf8")
    const packageJson = JSON.parse(packageTemplate)
    packageJson.name = `bot-${bot.name.toLowerCase()}`
    packageJson.description = `Bot ${bot.name} creado con TarDía Cloud Bot Platform`
    await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2))
    log("info", "package.json customized")

    const envContent = generateBotEnvFile(bot)
    await fs.writeFile(path.join(botDir, ".env"), envContent)
    log("info", "File written", { filename: ".env" })

    const imageName = `bot-${bot.name.toLowerCase()}-${bot._id}:latest`
    log("info", "Building Docker image", { imageName })
    try {
      const { stdout } = await execAsync(`docker build -t ${imageName} ${botDir}`)
      log("info", "Docker build completed", { imageName, stdout: stdout.slice(-200) })
    } catch (error) {
      log("error", "Docker build failed", { imageName, error: error.message, stderr: error.stderr })
      throw new Error(`Docker build failed: ${error.message}`)
    }

    const deploymentYaml = generateKubernetesDeploymentForBot(bot, imageName)
    const deploymentFile = path.join(botDir, "k8s-deployment.yaml")
    await fs.writeFile(deploymentFile, deploymentYaml)
    log("info", "Applying Kubernetes deployment", { deploymentFile })
    try {
      const { stdout } = await execAsync(`kubectl apply -f ${deploymentFile}`)
      log("info", "Kubernetes deployment applied", { stdout })
    } catch (error) {
      log("error", "Kubernetes deployment failed", { error: error.message, stderr: error.stderr })
      throw new Error(`Kubernetes deployment failed: ${error.message}`)
    }

    const deploymentName = `bot-${bot.name.toLowerCase()}-${bot._id}`
    log("info", "Waiting for deployment to be ready", { deploymentName })
    await execAsync(
      `kubectl wait --for=condition=available --timeout=300s deployment/${deploymentName} -n ${KUBERNETES_NAMESPACE}`,
    )
    log("info", "Deployment is ready", { deploymentName })

    const serviceName = `${bot.name.toLowerCase()}-service`
    await Bot.findByIdAndUpdate(bot._id, {
      status: "active",
      url: `https://t.me/${bot.name}`,
      kubernetes_deployment: deploymentName,
      error_message: null,
    })
    log("info", "Bot deployed successfully", { botId: bot._id, botName: bot.name })
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

function generateBotEnvFile(bot) {
  const weatherKey = process.env.WEATHER_API_KEY || ""
  const newsKey = process.env.NEWS_API_KEY || ""
  const geminiKey = process.env.GEMINI_API_KEY || ""

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
`
}

// Endpoint para eliminar bot
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

    try {
      const botDir = path.join(process.cwd(), "generated-bots", botId.toString())
      await fs.rm(botDir, { recursive: true, force: true })
      log("info", "Bot directory deleted", { botDir })
    } catch (dirError) {
      log("error", "Error deleting bot directory", {
        botId,
        error: dirError.message,
      })
    }

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
app.listen(PORT, "0.0.0.0", () => {
  log("info", "Server started successfully", {
    port: PORT,
    host: "0.0.0.0",
    healthEndpoint: `http://localhost:${PORT}/health`,
    testEndpoint: `http://localhost:${PORT}/api/test`,
    kubernetesNamespace: KUBERNETES_NAMESPACE,
    frontendUrl: FRONTEND_URL,
    corsOrigins: corsOptions.origin,
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
