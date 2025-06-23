// Global state
let currentUser = null
let bots = []

// API Configuration - Detectar automáticamente la URL base
const API_BASE_URL = window.location.origin + "/api"

// Initialize app
document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 Inicializando aplicación...")
  initializeApp()
  setupEventListeners()
})

function initializeApp() {
  console.log("🔍 Verificando usuario guardado...")
  // Check if user is logged in
  const savedUser = localStorage.getItem("currentUser")
  if (savedUser) {
    console.log("👤 Usuario encontrado:", savedUser)
    currentUser = JSON.parse(savedUser)
    showDashboard()
    loadBots()
  } else {
    console.log("❌ No hay usuario guardado, mostrando auth")
    showAuth()
  }
}

function setupEventListeners() {
  // Auth forms
  document.getElementById("loginForm").addEventListener("submit", handleLogin)
  document.getElementById("registerForm").addEventListener("submit", handleRegister)

  // Create bot form
  document.getElementById("createBotForm").addEventListener("submit", handleCreateBot)

  // Modal close on background click
  document.getElementById("createBotModal").addEventListener("click", function (e) {
    if (e.target === this) {
      closeCreateBotModal()
    }
  })
}

// Authentication functions
function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"))
  document.querySelectorAll(".tab-content").forEach((content) => content.classList.remove("active"))

  document.querySelector(`[onclick="switchTab('${tab}')"]`).classList.add("active")
  document.getElementById(tab === "login" ? "loginForm" : "registerForm").classList.add("active")
}

async function handleLogin(e) {
  e.preventDefault()
  console.log("🔐 Intentando login...")

  const email = document.getElementById("loginEmail").value
  const password = document.getElementById("loginPassword").value

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
      localStorage.setItem("currentUser", JSON.stringify(currentUser))
      localStorage.setItem("authToken", data.token)

      showToast("¡Bienvenido de vuelta!", "success")

      // Pequeño delay para que se vea el toast
      setTimeout(() => {
        console.log("🔄 Cambiando a dashboard...")
        showDashboard()
        loadBots()
      }, 1000)
    } else {
      console.log("❌ Error en login:", data.message)
      showToast(data.message || "Error al iniciar sesión", "error")
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
      showToast("Cuenta creada exitosamente. Ahora puedes iniciar sesión.", "success")
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

function logout() {
  console.log("👋 Cerrando sesión...")
  localStorage.removeItem("currentUser")
  localStorage.removeItem("authToken")
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
  const userEmailElement = document.getElementById("userEmail")

  if (authScreen && dashboardScreen) {
    authScreen.classList.remove("active")
    authScreen.style.display = "none" // Forzar ocultación
    dashboardScreen.classList.add("active")
    dashboardScreen.style.display = "block" // Forzar visualización

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

  if (authScreen && dashboardScreen) {
    authScreen.classList.add("active")
    authScreen.style.display = "flex" // Forzar visualización
    dashboardScreen.classList.remove("active")
    dashboardScreen.style.display = "none" // Forzar ocultación
    console.log("✅ Pantalla de auth activada")
  } else {
    console.error("❌ No se encontraron las pantallas")
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
                <p>Servicios:</p>
                <div class="services-tags">
                    ${bot.servicios.map((service) => `<span class="service-tag">${getServiceName(service)}</span>`).join("")}
                </div>
            </div>
            
            <div class="bot-actions">
                ${
                  bot.status === "active" && bot.url
                    ? `
                    <button class="btn btn-primary btn-sm" onclick="openTelegramBot('${bot.name}')">
                        <i class="fas fa-external-link-alt"></i>
                        Abrir Bot
                    </button>
                `
                    : ""
                }
                ${
                  bot.deploy_url
                    ? `
                    <button class="btn btn-outline btn-sm" onclick="window.open('${bot.deploy_url}', '_blank')">
                        <i class="fas fa-server"></i>
                        Ver Deploy
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

  const name = document.getElementById("botName").value
  const token = document.getElementById("botToken").value
  const servicios = Array.from(document.querySelectorAll('input[name="servicios"]:checked')).map((cb) => cb.value)

  if (servicios.length === 0) {
    showToast("Selecciona al menos un servicio", "error")
    return
  }

  // Verificar nombre duplicado
  if (bots.some((bot) => bot.name.toLowerCase() === name.toLowerCase())) {
    showToast("Ya tienes un bot con ese nombre", "error")
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
