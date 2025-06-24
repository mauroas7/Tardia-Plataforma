// Global state
let currentUser = null
let bots = []

// API Configuration - Detectar automáticamente la URL base
const API_BASE_URL = window.location.origin + "/api"

// Session management
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 días en milisegundos

// Initialize app
document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 Inicializando aplicación...")

  // Check for verification token in URL
  const urlParams = new URLSearchParams(window.location.search)
  const verifyToken = urlParams.get("token")
  const resetToken = urlParams.get("token")

  if (window.location.pathname === "/verify-email" && verifyToken) {
    handleEmailVerification(verifyToken)
  } else if (window.location.pathname === "/reset-password" && resetToken) {
    showResetPasswordScreen(resetToken)
  } else {
    initializeApp()
  }

  setupEventListeners()
})

function initializeApp() {
  console.log("🔍 Verificando usuario guardado...")

  // Check if user is logged in and session is valid
  const savedUser = localStorage.getItem("currentUser")
  const sessionExpiry = localStorage.getItem("sessionExpiry")
  const rememberMe = localStorage.getItem("rememberMe") === "true"

  if (savedUser && sessionExpiry) {
    const now = new Date().getTime()
    const expiryTime = Number.parseInt(sessionExpiry)

    if (now < expiryTime || rememberMe) {
      console.log("👤 Sesión válida encontrada:", savedUser)
      currentUser = JSON.parse(savedUser)

      // Extend session if remember me is checked
      if (rememberMe) {
        extendSession()
      }

      showDashboard()
      loadBots()
    } else {
      console.log("⏰ Sesión expirada")
      clearSession()
      showAuth()
    }
  } else {
    console.log("❌ No hay sesión válida, mostrando auth")
    showAuth()
  }
}

function setupEventListeners() {
  // Auth forms
  document.getElementById("loginForm").addEventListener("submit", handleLogin)
  document.getElementById("registerForm").addEventListener("submit", handleRegister)
  document.getElementById("forgotPasswordForm").addEventListener("submit", handleForgotPassword)
  document.getElementById("resetPasswordForm").addEventListener("submit", handleResetPassword)

  // Create bot form
  document.getElementById("createBotForm").addEventListener("submit", handleCreateBot)

  // Setup bot name validation
  setupBotNameValidation()

  // Modal close on background click
  document.getElementById("createBotModal").addEventListener("click", function (e) {
    if (e.target === this || e.target.classList.contains("modal-backdrop")) {
      closeCreateBotModal()
    }
  })

  // Fixed tab switching - usar event delegation
  document.querySelector(".tabs").addEventListener("click", (e) => {
    const tabBtn = e.target.closest(".tab-btn")
    if (!tabBtn) return

    const targetTab = tabBtn.getAttribute("data-tab")
    switchTab(targetTab)
  })
}

// Email verification handler
async function handleEmailVerification(token) {
  console.log("📧 Verificando email...")

  try {
    showLoading("Verificando tu email...")

    const response = await fetch(`${API_BASE_URL}/auth/verify-email/${token}`)
    const data = await response.json()

    hideLoading()

    if (response.ok) {
      showToast("✅ Email verificado exitosamente. Ya puedes iniciar sesión.", "success")

      // Redirect to login after 3 seconds
      setTimeout(() => {
        window.location.href = window.location.origin
      }, 3000)
    } else {
      showToast(data.message || "Error al verificar el email", "error")

      // Redirect to home after error
      setTimeout(() => {
        window.location.href = window.location.origin
      }, 3000)
    }
  } catch (error) {
    hideLoading()
    showToast("Error de conexión al verificar email", "error")
    setTimeout(() => {
      window.location.href = window.location.origin
    }, 3000)
  }
}

// Session management functions
function createSession(user, token, rememberMe = false) {
  const now = new Date().getTime()
  const expiry = now + SESSION_DURATION

  localStorage.setItem("currentUser", JSON.stringify(user))
  localStorage.setItem("authToken", token)
  localStorage.setItem("sessionExpiry", expiry.toString())
  localStorage.setItem("rememberMe", rememberMe.toString())

  console.log("✅ Sesión creada:", {
    user: user.email,
    rememberMe,
    expiresAt: new Date(expiry).toLocaleString(),
  })
}

function extendSession() {
  const now = new Date().getTime()
  const expiry = now + SESSION_DURATION
  localStorage.setItem("sessionExpiry", expiry.toString())
  console.log("🔄 Sesión extendida hasta:", new Date(expiry).toLocaleString())
}

function clearSession() {
  localStorage.removeItem("currentUser")
  localStorage.removeItem("authToken")
  localStorage.removeItem("sessionExpiry")
  localStorage.removeItem("rememberMe")
  console.log("🧹 Sesión limpiada")
}

// Agregar después de setupEventListeners()
function setupBotNameValidation() {
  const botNameInput = document.getElementById("botName")
  const errorDiv = document.getElementById("botNameError")

  if (botNameInput) {
    botNameInput.addEventListener("input", validateBotName)
    botNameInput.addEventListener("blur", validateBotName)
  }
}

function validateBotName() {
  const botNameInput = document.getElementById("botName")
  const errorDiv = document.getElementById("botNameError")
  const value = botNameInput.value.trim()

  // Limpiar clases previas
  botNameInput.classList.remove("error", "valid")
  errorDiv.style.display = "none"

  if (!value) {
    return false
  }

  // Validaciones para compatibilidad con Kubernetes DNS-1123
  const errors = []

  // Solo letras, números y guiones (compatible con Kubernetes)
  if (!/^[a-zA-Z0-9-]+$/.test(value)) {
    errors.push("Solo se permiten letras, números y guiones (-)")
  }

  // Debe terminar en "bot"
  if (!value.toLowerCase().endsWith("bot")) {
    errors.push("Debe terminar en 'bot'")
  }

  // Longitud mínima y máxima
  if (value.length < 5) {
    errors.push("Debe tener al menos 5 caracteres")
  }

  if (value.length > 32) {
    errors.push("No puede tener más de 32 caracteres")
  }

  // Debe empezar y terminar con carácter alfanumérico (regla DNS-1123)
  if (!/^[a-zA-Z0-9]/.test(value)) {
    errors.push("Debe empezar con una letra o número")
  }

  if (!/[a-z0-9]$/.test(value)) {
    errors.push("Debe terminar con una letra o número")
  }

  // No puede tener guiones consecutivos
  if (value.includes("--")) {
    errors.push("No puede tener guiones consecutivos")
  }

  // No puede empezar o terminar con guión
  if (value.startsWith("-") || value.endsWith("-")) {
    errors.push("No puede empezar o terminar con guión")
  }

  if (errors.length > 0) {
    botNameInput.classList.add("error")
    errorDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${errors[0]}`
    errorDiv.style.display = "flex"
    return false
  } else {
    botNameInput.classList.add("valid")
    return true
  }
}

// Fixed Authentication functions
function switchTab(tab) {
  console.log("🔄 Switching to tab:", tab)

  const authForm = document.querySelector(".auth-form")

  // Remove active class from all tab buttons
  document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"))

  // Remove active class from all tab contents
  document.querySelectorAll(".tab-content").forEach((content) => {
    content.classList.remove("active")
  })

  // Manejar la visibilidad de los tabs
  if (tab === "forgot") {
    // Ocultar tabs para forgot password
    authForm.classList.add("forgot-active")
  } else {
    // Mostrar tabs para login/register
    authForm.classList.remove("forgot-active")

    // Add active class to clicked tab button
    const tabButton = document.querySelector(`[data-tab="${tab}"]`)
    if (tabButton) {
      tabButton.classList.add("active")
    }
  }

  // Add active class to corresponding tab content
  const targetContent = document.querySelector(`[data-tab-content="${tab}"]`)
  if (targetContent) {
    // Small delay for smooth transition
    setTimeout(() => {
      targetContent.classList.add("active")
    }, 50)
  }
}

function showForgotPassword() {
  console.log("🔑 Mostrando formulario de recuperación")
  switchTab("forgot")
}

async function handleLogin(e) {
  e.preventDefault()
  console.log("🔐 Intentando login...")

  const email = document.getElementById("loginEmail").value
  const password = document.getElementById("loginPassword").value
  const rememberMe = document.getElementById("rememberMe").checked

  try {
    console.log("📡 Enviando request a:", `${API_BASE_URL}/auth/login`)

    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    })

    const data = await response.json()
    console.log("📥 Respuesta del servidor:", data)

    if (response.ok) {
      console.log("✅ Login exitoso")
      currentUser = data.user
      createSession(data.user, data.token, rememberMe)

      showToast("¡Bienvenido de vuelta!", "success")

      // Pequeño delay para que se vea el toast
      setTimeout(() => {
        console.log("🔄 Cambiando a dashboard...")
        showDashboard()
        loadBots()
      }, 1000)
    } else {
      console.log("❌ Error en login:", data.message)

      // Manejar caso especial de email no verificado
      if (data.emailNotVerified) {
        showToast(data.message, "error")

        // Mostrar opción para reenviar verificación
        setTimeout(() => {
          if (confirm("¿Quieres que te reenviemos el email de verificación?")) {
            resendVerificationEmail(email)
          }
        }, 2000)
      } else {
        showToast(data.message || "Error al iniciar sesión", "error")
      }
    }
  } catch (error) {
    console.error("💥 Error de conexión:", error)
    showToast(`Error de conexión: ${error.message}`, "error")
  }
}

async function handleRegister(e) {
  e.preventDefault()
  console.log("📝 Intentando registro...")

  const email = document.getElementById("registerEmail").value
  const password = document.getElementById("registerPassword").value

  try {
    console.log("📡 Enviando request a:", `${API_BASE_URL}/auth/register`)

    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    })

    const data = await response.json()
    console.log("📥 Respuesta del servidor:", data)

    if (response.ok) {
      console.log("✅ Registro exitoso")
      showToast("📧 Cuenta creada exitosamente. Revisa tu email para verificar tu cuenta.", "success")

      // Mostrar mensaje adicional
      setTimeout(() => {
        showToast("💡 Revisa tu bandeja de entrada y spam", "info")
      }, 2000)

      switchTab("login")
      document.getElementById("registerForm").reset()
    } else {
      console.log("❌ Error en registro:", data.message)
      showToast(data.message || "Error al crear la cuenta", "error")
    }
  } catch (error) {
    console.error("💥 Error de conexión:", error)
    showToast(`Error de conexión: ${error.message}`, "error")
  }
}

// Función para reenviar email de verificación
async function resendVerificationEmail(email) {
  try {
    showLoading("Reenviando email de verificación...")

    const response = await fetch(`${API_BASE_URL}/auth/resend-verification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    })

    const data = await response.json()
    hideLoading()

    if (response.ok) {
      showToast("📧 Email de verificación reenviado. Revisa tu bandeja de entrada.", "success")
    } else {
      showToast(data.message || "Error al reenviar el email", "error")
    }
  } catch (error) {
    hideLoading()
    showToast("Error de conexión al reenviar email", "error")
  }
}

async function handleForgotPassword(e) {
  e.preventDefault()
  console.log("🔑 Solicitando recuperación de contraseña...")

  const email = document.getElementById("forgotEmail").value

  try {
    showLoading("Enviando enlace de recuperación...")

    const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    })

    const data = await response.json()
    hideLoading()

    if (response.ok) {
      showToast("Si el email existe, recibirás un enlace de recuperación", "success")
      document.getElementById("forgotPasswordForm").reset()
      switchTab("login")
    } else {
      showToast(data.message || "Error al enviar el enlace", "error")
    }
  } catch (error) {
    hideLoading()
    showToast(`Error de conexión: ${error.message}`, "error")
  }
}

async function handleResetPassword(e) {
  e.preventDefault()
  console.log("🔄 Restableciendo contraseña...")

  const newPassword = document.getElementById("newPassword").value
  const confirmPassword = document.getElementById("confirmPassword").value
  const token = new URLSearchParams(window.location.search).get("token")

  if (newPassword !== confirmPassword) {
    showToast("Las contraseñas no coinciden", "error")
    return
  }

  if (newPassword.length < 6) {
    showToast("La contraseña debe tener al menos 6 caracteres", "error")
    return
  }

  try {
    showLoading("Actualizando contraseña...")

    const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token, newPassword }),
    })

    const data = await response.json()
    hideLoading()

    if (response.ok) {
      showToast("Contraseña actualizada exitosamente", "success")

      // Redirect to login after success
      setTimeout(() => {
        window.location.href = window.location.origin
      }, 2000)
    } else {
      showToast(data.message || "Error al actualizar la contraseña", "error")
    }
  } catch (error) {
    hideLoading()
    showToast(`Error de conexión: ${error.message}`, "error")
  }
}

function logout() {
  console.log("👋 Cerrando sesión...")
  clearSession()
  currentUser = null
  bots = []
  showAuth()
  showToast("Sesión cerrada", "info")
}

// Screen management
function showDashboard() {
  console.log("🔄 Mostrando dashboard...")
  const authScreen = document.getElementById("authScreen")
  const dashboardScreen = document.getElementById("dashboardScreen")
  const resetScreen = document.getElementById("resetPasswordScreen")
  const userEmailElement = document.getElementById("userEmail")

  if (authScreen && dashboardScreen) {
    authScreen.classList.remove("active")
    authScreen.style.display = "none"
    resetScreen.classList.remove("active")
    resetScreen.style.display = "none"
    dashboardScreen.classList.add("active")
    dashboardScreen.style.display = "block"

    if (userEmailElement && currentUser) {
      userEmailElement.textContent = `Bienvenido, ${currentUser.email}`
    }

    console.log("✅ Dashboard activado para:", currentUser?.email)
  } else {
    console.error("❌ No se encontraron las pantallas del dashboard")
  }
}

function showAuth() {
  console.log("🔄 Mostrando pantalla de autenticación")
  const authScreen = document.getElementById("authScreen")
  const dashboardScreen = document.getElementById("dashboardScreen")
  const resetScreen = document.getElementById("resetPasswordScreen")

  if (authScreen && dashboardScreen) {
    authScreen.classList.add("active")
    authScreen.style.display = "flex"
    dashboardScreen.classList.remove("active")
    dashboardScreen.style.display = "none"
    resetScreen.classList.remove("active")
    resetScreen.style.display = "none"
    console.log("✅ Pantalla de auth activada")
  } else {
    console.error("❌ No se encontraron las pantallas")
  }
}

async function showResetPasswordScreen(token) {
  console.log("🔄 Mostrando pantalla de reset de contraseña")

  try {
    // Verify token first
    const response = await fetch(`${API_BASE_URL}/auth/verify-reset-token/${token}`)
    const data = await response.json()

    if (!data.valid) {
      showToast("El enlace de recuperación es inválido o ha expirado", "error")
      showAuth()
      return
    }

    const authScreen = document.getElementById("authScreen")
    const dashboardScreen = document.getElementById("dashboardScreen")
    const resetScreen = document.getElementById("resetPasswordScreen")

    if (resetScreen) {
      authScreen.classList.remove("active")
      authScreen.style.display = "none"
      dashboardScreen.classList.remove("active")
      dashboardScreen.style.display = "none"
      resetScreen.classList.add("active")
      resetScreen.style.display = "flex"
      console.log("✅ Pantalla de reset activada")
    }
  } catch (error) {
    console.error("Error verificando token:", error)
    showToast("Error al verificar el enlace de recuperación", "error")
    showAuth()
  }
}

// Bot management (Ver bots)
async function loadBots() {
  console.log("🤖 Cargando bots...")
  try {
    const token = localStorage.getItem("authToken")
    console.log("🔑 Token:", token ? "Presente" : "No encontrado")

    const response = await fetch(`${API_BASE_URL}/bots`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    console.log("📡 Respuesta de bots:", response.status)

    if (response.ok) {
      bots = await response.json()
      console.log("🤖 Bots cargados:", bots.length)
      renderBots()
      updateStats()
    } else if (response.status === 401 || response.status === 403) {
      console.log("🔒 Token expirado, cerrando sesión")
      logout()
    } else {
      console.log("❌ Error cargando bots:", response.status)
    }
  } catch (error) {
    console.error("💥 Error loading bots:", error)
  }
}

function renderBots() {
  console.log("🎨 Renderizando bots...")
  const container = document.getElementById("botsContainer")
  const emptyState = document.getElementById("emptyState")
  const botsGrid = document.getElementById("botsGrid")

  if (!container || !emptyState || !botsGrid) {
    console.error("❌ No se encontraron elementos del DOM para bots")
    return
  }

  if (bots.length === 0) {
    console.log("📭 No hay bots, mostrando estado vacío")
    emptyState.style.display = "flex"
    botsGrid.style.display = "none"
  } else {
    console.log("🤖 Mostrando", bots.length, "bots")
    emptyState.style.display = "none"
    botsGrid.style.display = "grid"

    botsGrid.innerHTML = bots
      .map(
        (bot) => `
        <div class="bot-card">
            <div class="bot-header">
                <div>
                    <div class="bot-title">${bot.name}</div>
                    <div class="bot-date">Creado el ${new Date(bot.created_at).toLocaleDateString()}</div>
                </div>
                <div class="bot-status">
                    <div class="status-dot ${bot.status}"></div>
                    <span class="status-badge ${bot.status}">${getStatusText(bot.status)}</span>
                </div>
            </div>
            
            <div class="bot-services">
                <p>Servicios disponibles:</p>
                <div class="services-tags">
                    ${bot.servicios.map((service) => `<span class="service-tag">${getServiceName(service)}</span>`).join("")}
                </div>
            </div>
            
            <div class="bot-actions">
                ${
                  bot.status === "active" && bot.url
                    ? `
                    <button class="btn btn-primary btn-sm btn-glow" onclick="openTelegramBot('${bot.name}')">
                        <i class="fas fa-external-link-alt"></i>
                        Abrir Bot
                        <div class="btn-shine"></div>
                    </button>
                `
                    : ""
                }
                <button class="btn btn-danger btn-sm" onclick="confirmDeleteBot('${bot._id}', '${bot.name}')">
                    <i class="fas fa-trash"></i>
                    Eliminar
                </button>
            </div>
        </div>
    `,
      )
      .join("")
  }
}

function updateStats() {
  console.log("📊 Actualizando estadísticas...")
  const totalBotsElement = document.getElementById("totalBots")
  const activeBotsElement = document.getElementById("activeBots")
  const pendingBotsElement = document.getElementById("pendingBots")
  const botLimitTextElement = document.getElementById("botLimitText")

  if (totalBotsElement) totalBotsElement.textContent = bots.length
  if (activeBotsElement) activeBotsElement.textContent = bots.filter((bot) => bot.status === "active").length
  if (pendingBotsElement) pendingBotsElement.textContent = bots.filter((bot) => bot.status === "creating").length

  // Actualizar contador en el modal
  if (botLimitTextElement) {
    botLimitTextElement.textContent = `(${bots.length}/20)`

    // Cambiar color si está cerca del límite
    if (bots.length >= 18) {
      botLimitTextElement.style.color = "#e53e3e"
    } else if (bots.length >= 15) {
      botLimitTextElement.style.color = "#ed8936"
    } else {
      botLimitTextElement.style.color = "#718096"
    }
  }
}

// Función para confirmar eliminación de bot
function confirmDeleteBot(botId, botName) {
  if (
    confirm(
      `¿Estás seguro de que quieres eliminar el bot "${botName}"?\n\nEsta acción no se puede deshacer y eliminará todos los recursos asociados.`,
    )
  ) {
    deleteBot(botId, botName)
  }
}

// Función para eliminar bot
async function deleteBot(botId, botName) {
  console.log(`🗑️ Eliminando bot: ${botName}`)

  try {
    showLoading(`Eliminando bot ${botName}...`)

    const response = await fetch(`${API_BASE_URL}/bots/${botId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("authToken")}`,
      },
    })

    const data = await response.json()

    if (response.ok) {
      hideLoading()
      showToast(`Bot "${botName}" eliminado exitosamente`, "success")

      // Remover bot de la lista local
      bots = bots.filter((bot) => bot._id !== botId)
      renderBots()
      updateStats()
    } else {
      hideLoading()
      showToast(data.message || "Error al eliminar el bot", "error")
    }
  } catch (error) {
    hideLoading()
    showToast(`Error de conexión: ${error.message}`, "error")
  }
}

async function handleCreateBot(e) {
  e.preventDefault()
  console.log("🚀 Creando nuevo bot...")

  // Verificar límite antes de enviar
  if (bots.length >= 20) {
    showToast("Has alcanzado el límite máximo de 20 bots", "error")
    return
  }

  const name = document.getElementById("botName").value.trim()
  const token = document.getElementById("botToken").value.trim()
  const servicios = Array.from(document.querySelectorAll('input[name="servicios"]:checked')).map((cb) => cb.value)

  // Validar nombre del bot
  if (!validateBotName()) {
    showToast("Por favor corrige el username del bot", "error")
    return
  }

  // Validar token
  if (!validateBotToken(token)) {
    showToast("El token del bot no tiene el formato correcto", "error")
    return
  }

  if (servicios.length === 0) {
    showToast("Selecciona al menos un servicio", "error")
    return
  }

  // Verificar nombre duplicado
  if (bots.some((bot) => bot.name.toLowerCase() === name.toLowerCase())) {
    showToast("Ya tienes un bot con ese username", "error")
    return
  }

  // Show loading
  showLoading("Creando tu bot...")
  closeCreateBotModal()

  try {
    const response = await fetch(`${API_BASE_URL}/crear-bot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("authToken")}`,
      },
      body: JSON.stringify({
        name,
        token,
        servicios,
      }),
    })

    const data = await response.json()

    if (response.ok) {
      hideLoading()
      showToast(`¡Tu bot ${name} está siendo creado! 🎉`, "success")

      // Add bot to list
      bots.unshift(data)
      renderBots()
      updateStats()

      // Recargar bots después de un tiempo para ver el estado actualizado
      setTimeout(() => {
        loadBots()
      }, 10000)
    } else {
      hideLoading()
      showToast(data.message || "Error al crear el bot", "error")
    }
  } catch (error) {
    hideLoading()
    showToast(`Error de conexión: ${error.message}`, "error")
  }
}

function validateBotToken(token) {
  // Formato básico del token de Telegram: número:string
  const tokenRegex = /^\d+:[A-Za-z0-9_-]+$/
  return tokenRegex.test(token)
}

function getStatusText(status) {
  const statusMap = {
    active: "Activo",
    creating: "Desplegando",
    error: "Error",
  }
  return statusMap[status] || "Desconocido"
}

function getServiceName(service) {
  const serviceMap = {
    clima: "Clima",
    noticias: "Noticias",
    chistes: "Chistes",
    ia: "Chat IA",
  }
  return serviceMap[service] || service
}

// Modal management (Crear bot)
function openCreateBotModal() {
  console.log("🔧 Abriendo modal de crear bot")

  // Verificar límite
  if (bots.length >= 20) {
    showToast("Has alcanzado el límite máximo de 20 bots", "error")
    return
  }

  const modal = document.getElementById("createBotModal")
  if (modal) {
    modal.classList.add("active")
    document.body.style.overflow = "hidden"
  }
}

function closeCreateBotModal() {
  console.log("❌ Cerrando modal de crear bot")
  const modal = document.getElementById("createBotModal")
  if (modal) {
    modal.classList.remove("active")
    document.body.style.overflow = "auto"
    document.getElementById("createBotForm").reset()
  }
}

// Loading management
function showLoading(message) {
  const loadingOverlay = document.getElementById("loadingOverlay")
  const loadingText = document.getElementById("loadingText")

  if (loadingText) loadingText.textContent = message
  if (loadingOverlay) loadingOverlay.classList.add("active")
}

function hideLoading() {
  const loadingOverlay = document.getElementById("loadingOverlay")
  if (loadingOverlay) loadingOverlay.classList.remove("active")
}

// Utility functions
function openTelegramBot(botName) {
  window.open(`https://t.me/${botName}`, "_blank")
}

// BotFather Instructions functions
function openBotFatherInstructions() {
  console.log("🤖 Abriendo instrucciones de BotFather")
  const modal = document.getElementById("botFatherModal")
  if (modal) {
    modal.classList.add("active")
    document.body.style.overflow = "hidden"
  }
}

function closeBotFatherInstructions() {
  console.log("❌ Cerrando instrucciones de BotFather")
  const modal = document.getElementById("botFatherModal")
  if (modal) {
    modal.classList.remove("active")
    document.body.style.overflow = "auto"
  }
}

function openBotFather() {
  console.log("🚀 Abriendo BotFather en Telegram")
  window.open("https://t.me/BotFather", "_blank")
  showToast("¡Abriendo @BotFather en Telegram!", "info")
}

function copyTokenExample() {
  const tokenText = "123456789:AAAbot_token_example_here"
  navigator.clipboard
    .writeText(tokenText)
    .then(() => {
      showToast("Ejemplo de token copiado al portapapeles", "success")
    })
    .catch(() => {
      showToast("No se pudo copiar el ejemplo", "error")
    })
}

function showToast(message, type = "info") {
  console.log(`🍞 Toast: ${message} (${type})`)
  const toast = document.createElement("div")
  toast.className = `toast ${type}`

  const icon = type === "success" ? "check-circle" : type === "error" ? "exclamation-circle" : "info-circle"

  toast.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${message}</span>
    `

  const container = document.getElementById("toastContainer")
  if (container) {
    container.appendChild(toast)

    setTimeout(() => {
      toast.remove()
    }, 5000)
  }
}

// Close modals on background click
document.addEventListener("DOMContentLoaded", () => {
  // Existing code...

  // Add event listener for BotFather modal
  document.getElementById("botFatherModal").addEventListener("click", function (e) {
    if (e.target === this || e.target.classList.contains("modal-backdrop")) {
      closeBotFatherInstructions()
    }
  })
})
