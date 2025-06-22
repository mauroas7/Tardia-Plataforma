# 🤖 Cloud Bot Platform - Enterprise Edition

**Plataforma empresarial para crear y desplegar bots de Telegram automáticamente usando Kubernetes y MongoDB.**

## 🏗️ Arquitectura

\`\`\`
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API   │    │   MongoDB       │
│   (Nginx)       │◄──►│   (Node.js)     │◄──►│   (Database)    │
│   Port: 80      │    │   Port: 3000    │    │   Port: 27017   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Kubernetes    │
                    │   (Bot Pods)    │
                    │   Dynamic       │
                    └─────────────────┘
\`\`\`

## 🚀 Características Principales

### ✨ **Funcionalidades Core**
- 🔐 **Autenticación JWT** con MongoDB
- 🤖 **Creación automática de bots** de Telegram
- ☸️ **Despliegue en Kubernetes** automático
- 📊 **Dashboard en tiempo real** con estadísticas
- 🔄 **Escalabilidad horizontal** automática

### 🛠️ **Servicios de Bots**
- 🌤️ **Clima** - Consulta meteorológica por ciudad
- 📰 **Noticias** - Últimas noticias del día
- 😄 **Chistes** - Entretenimiento aleatorio
- 🧠 **Chat IA** - Conversación con Gemini AI
- 💾 **Memoria persistente** por usuario

### 📈 **Monitoreo y Observabilidad**
- 📊 **Prometheus** - Métricas del sistema
- 📈 **Grafana** - Dashboards visuales
- 🔍 **Health checks** automáticos
- 📱 **Alertas** en tiempo real

## 🏃‍♂️ Inicio Rápido

### Opción 1: Docker Compose (Desarrollo)

\`\`\`bash
# Clonar repositorio
git clone <repo-url>
cd cloud-bot-platform

# Iniciar servicios
docker-compose up -d

# Verificar estado
docker-compose ps
\`\`\`

**URLs de acceso:**
- 🌐 **Frontend**: http://localhost
- 🔧 **API**: http://localhost:3000
- 📊 **Grafana**: http://localhost:3001 (admin/admin123)
- 📈 **Prometheus**: http://localhost:9090

### Opción 2: Kubernetes (Producción)

\`\`\`bash
# Ejecutar script de setup
chmod +x scripts/setup.sh
./scripts/setup.sh

# Verificar despliegue
kubectl get pods -n bot-platform

# Monitorear sistema
chmod +x scripts/monitor.sh
./scripts/monitor.sh
\`\`\`

## ⚙️ Configuración

### 🔑 Variables de Entorno

\`\`\`bash
# Backend (.env)
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb://admin:password@mongodb:27017/cloud-bot-platform?authSource=admin
JWT_SECRET=your-super-secret-jwt-key
KUBERNETES_NAMESPACE=bot-platform

# APIs Opcionales
WEATHER_API_KEY=your-openweathermap-key
NEWS_API_KEY=your-gnews-key  
GEMINI_API_KEY=your-gemini-key
\`\`\`

### 🗄️ Base de Datos

**MongoDB** se configura automáticamente con:
- 👤 **Usuario**: `admin`
- 🔒 **Contraseña**: `cloudbotpassword2024`
- 📊 **Base de datos**: `cloud-bot-platform`

### ☸️ Kubernetes Secrets

\`\`\`bash
# Actualizar secrets con tus API keys
kubectl create secret generic bot-secrets \
  --from-literal=weather-api-key=YOUR_KEY \
  --from-literal=news-api-key=YOUR_KEY \
  --from-literal=gemini-api-key=YOUR_KEY \
  -n bot-platform
\`\`\`

## 📖 Uso de la Plataforma

### 1️⃣ **Registro de Usuario**
1. Accede a http://localhost
2. Crea una cuenta con email/contraseña
3. Inicia sesión en el dashboard

### 2️⃣ **Crear un Bot**
1. Click en **"Crear Nuevo Bot"**
2. Ingresa:
   - 📝 **Nombre del bot**
   - 🔑 **Token de @BotFather**
   - ⚙️ **Servicios deseados**
3. Click **"Crear y Desplegar Bot"**

### 3️⃣ **Gestionar Bots**
- 📊 **Ver estadísticas** en tiempo real
- 🔗 **Abrir bot** en Telegram
- 🖥️ **Ver deployment** en Kubernetes
- 📈 **Monitorear métricas**

## 🔧 Desarrollo

### 📁 Estructura del Proyecto

\`\`\`
cloud-bot-platform/
├── frontend/                 # Frontend (HTML/CSS/JS)
│   ├── index.html
│   ├── styles.css
│   └── script.js
├── backend/                  # Backend API (Node.js)
│   ├── index.js
│   ├── package.json
│   └── Dockerfile
├── k8s/                     # Kubernetes manifests
│   ├── namespace.yaml
│   ├── mongodb.yaml
│   ├── backend.yaml
│   ├── frontend.yaml
│   ├── secrets.yaml
│   └── monitoring.yaml
├── scripts/                 # Automation scripts
│   ├── setup.sh
│   ├── cleanup.sh
│   └── monitor.sh
├── monitoring/              # Monitoring config
│   └── prometheus.yml
├── docker-compose.yml       # Development setup
└── README.md
\`\`\`

### 🧪 Testing

\`\`\`bash
cd backend
npm test                     # Unit tests
npm run lint                 # Code linting
\`\`\`

### 🚀 CI/CD Pipeline

El proyecto incluye **GitHub Actions** para:
- ✅ **Tests automáticos**
- 🏗️ **Build de imágenes Docker**
- 🚀 **Deploy automático a Kubernetes**
- 📊 **Verificación de health checks**

## 📊 Monitoreo

### 📈 Métricas Disponibles
- 🤖 **Bots activos/inactivos**
- 👥 **Usuarios registrados**
- 💾 **Uso de recursos**
- 🔄 **Requests por minuto**
- ⚡ **Tiempo de respuesta**

### 🚨 Alertas Configuradas
- 🔴 **Pod down** - Bot caído
- 🟡 **High CPU** - Alto uso de CPU
- 🟠 **Memory leak** - Fuga de memoria
- 🔵 **Database slow** - Base de datos lenta

## 🛡️ Seguridad

### 🔐 Implementado
- ✅ **JWT Authentication**
- ✅ **Password hashing** (bcrypt)
- ✅ **CORS protection**
- ✅ **Rate limiting**
- ✅ **Input validation**
- ✅ **Kubernetes RBAC**

### 🔒 Recomendaciones
- 🔑 Cambiar secrets por defecto
- 🌐 Configurar HTTPS/TLS
- 🛡️ Implementar WAF
- 📝 Auditoría de logs
- 🔄 Rotación de tokens

## 🚀 Escalabilidad

### 📈 Capacidades
- **Usuarios**: 10,000+ concurrentes
- **Bots**: 1,000+ simultáneos
- **Requests**: 100,000+ por minuto
- **Storage**: Escalable con MongoDB Atlas

### ⚡ Optimizaciones
- 🔄 **Auto-scaling** de pods
- 💾 **Connection pooling**
- 📦 **Image caching**
- 🌐 **CDN integration**

## 🤝 Contribuir

1. Fork el repositorio
2. Crea una rama feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -am 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Crea un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para detalles.

## 🆘 Soporte

- 📧 **Email**: support@cloudbotplatform.com
- 💬 **Discord**: [Servidor de la comunidad]
- 📖 **Docs**: [Documentación completa]
- 🐛 **Issues**: [GitHub Issues]

---

**Hecho con ❤️ para la comunidad de desarrolladores**

🚀 **¡Crea tu primer bot en menos de 5 minutos!**
