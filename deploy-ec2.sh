#!/bin/bash

set -e

echo "🚀 Desplegando TarDia Bot Platform en EC2 con Minikube"
echo "===================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Verificar que estamos en EC2
check_environment() {
    log_info "Verificando entorno EC2..."
    
    # Verificar que estamos en una instancia EC2
    if ! curl -s --max-time 3 http://169.254.169.254/latest/meta-data/instance-id > /dev/null; then
        log_warning "No se detectó instancia EC2, continuando de todas formas..."
    else
        log_success "Instancia EC2 detectada"
    fi
    
   

# Instalar dependencias del sistema
install_system_dependencies() {
    log_info "Instalando dependencias del sistema..."
    
    # Actualizar sistema
    sudo apt update && sudo apt upgrade -y
    
    # Instalar dependencias básicas
    sudo apt install -y \
        curl \
        wget \
        apt-transport-https \
        ca-certificates \
        gnupg \
        lsb-release \
        unzip \
        git \
        htop \
        net-tools
    
    log_success "Dependencias del sistema instaladas"
}

# Instalar Docker
install_docker() {
    log_info "Instalando Docker..."
    
    if command -v docker &> /dev/null; then
        log_info "Docker ya está instalado"
        return
    fi
    
    # Instalar Docker
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    
    # Agregar usuario al grupo docker
    sudo usermod -aG docker $USER
    
    # Iniciar Docker
    sudo systemctl enable docker
    sudo systemctl start docker
    
    log_success "Docker instalado correctamente"
}

# Instalar kubectl
install_kubectl() {
    log_info "Instalando kubectl..."
    
    if command -v kubectl &> /dev/null; then
        log_info "kubectl ya está instalado"
        return
    fi
    
    # Descargar kubectl
    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
    
    # Instalar kubectl
    sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
    
    # Verificar instalación
    kubectl version --client
    
    log_success "kubectl instalado correctamente"
}

# Instalar Minikube
install_minikube() {
    log_info "Instalando Minikube..."
    
    if command -v minikube &> /dev/null; then
        log_info "Minikube ya está instalado"
        return
    fi
    
    # Descargar Minikube
    curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
    
    # Instalar Minikube
    sudo install minikube-linux-amd64 /usr/local/bin/minikube
    
    log_success "Minikube instalado correctamente"
}

# Instalar Node.js
install_nodejs() {
    log_info "Instalando Node.js..."
    
    if command -v node &> /dev/null; then
        log_info "Node.js ya está instalado"
        return
    fi
    
    # Instalar Node.js 18
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    
    # Verificar instalación
    node --version
    npm --version
    
    log_success "Node.js instalado correctamente"
}

# Configurar Minikube
setup_minikube() {
    log_info "Configurando Minikube..."
    
    # Detener Minikube si está corriendo
    minikube stop 2>/dev/null || true
    minikube delete 2>/dev/null || true
    
    # Iniciar Minikube con configuración optimizada para EC2
    log_info "Iniciando Minikube..."
    minikube start \
        --driver=docker \
        --memory=2048 \
        --cpus=2 \
        --disk-size=20g \
        --kubernetes-version=v1.28.0 \
        --addons=ingress,dashboard,metrics-server
    
    # Verificar que Minikube está corriendo
    minikube status
    
    # Configurar kubectl para usar Minikube
    kubectl config use-context minikube
    
    log_success "Minikube configurado correctamente"
}

# Configurar variables de entorno
setup_environment() {
    log_info "Configurando variables de entorno..."
    
    # Crear archivo .env en backend si no existe
    if [ ! -f backend/.env ]; then
        log_info "Creando archivo .env..."
        cat > backend/.env << EOF
# Puerto del servidor
PORT=3000

# JWT Secret para autenticación
JWT_SECRET=cloud-bot-secret-key-2024

# MongoDB Atlas Connection
MONGODB_URI=mongodb+srv://tardiacluster.mg4kvzx.mongodb.net/

# Configuración de Email con Nodemailer + Gmail
EMAIL_USER=tardiainfo@gmail.com
EMAIL_PASS=jbka nukx bmov mmij

# URL del Frontend en Vercel
FRONTEND_URL=https://plataformatardiadevelop.vercel.app/

# APIs para los bots
WEATHER_API_KEY=a9fa79faf7ce399e52f803b1abc336dd
NEWS_API_KEY=d93ff7fc3de6c7b1142a5111c59ec2eb
GEMINI_API_KEY=AIzaSyC95s7mI5n9BNCyQdWNacPnm13PKS8hekw

# Kubernetes (si usas K8s en EC2)
KUBERNETES_NAMESPACE=bot-platform

# Entorno
NODE_ENV=production
EOF
        log_success "Archivo .env creado"
    else
        log_info "Archivo .env ya existe"
    fi
}

# Construir imagen Docker
build_docker_image() {
    log_info "Construyendo imagen Docker del backend..."
    
    # Configurar Docker para usar el daemon de Minikube
    eval $(minikube docker-env)
    
    # Navegar al directorio backend
    cd backend
    
    # Instalar dependencias
    log_info "Instalando dependencias de Node.js..."
    npm install
    
    # Construir imagen Docker
    log_info "Construyendo imagen Docker..."
    docker build -t tardia-bot-platform:latest . --no-cache
    
    # Verificar que la imagen se construyó
    if docker images | grep -q tardia-bot-platform; then
        log_success "Imagen Docker construida exitosamente"
    else
        log_error "Error construyendo imagen Docker"
        exit 1
    fi
    
    cd ..
}

# Configurar Kubernetes
setup_kubernetes() {
    log_info "Configurando recursos de Kubernetes..."
    
    # Crear namespace
    log_info "Creando namespace bot-platform..."
    kubectl create namespace bot-platform --dry-run=client -o yaml | kubectl apply -f -
    
    # Limpiar recursos existentes
    log_info "Limpiando recursos existentes..."
    kubectl delete deployment backend --ignore-not-found=true -n bot-platform
    kubectl delete service backend --ignore-not-found=true -n bot-platform
    kubectl delete secret app-secrets bot-secrets --ignore-not-found=true -n bot-platform
    
    # Crear secretos
    log_info "Creando secretos..."
    kubectl create secret generic app-secrets \
        --from-literal=jwt-secret="cloud-bot-secret-key-2024" \
        --from-literal=mongodb-uri="mongodb+srv://tardiacluster.mg4kvzx.mongodb.net/" \
        --from-literal=email-user="tardiainfo@gmail.com" \
        --from-literal=email-pass="jbka nukx bmov mmij" \
        --from-literal=frontend-url="https://plataformatardiadevelop.vercel.app/" \
        --namespace=bot-platform
    
    kubectl create secret generic bot-secrets \
        --from-literal=weather-api-key="a9fa79faf7ce399e52f803b1abc336dd" \
        --from-literal=news-api-key="d93ff7fc3de6c7b1142a5111c59ec2eb" \
        --from-literal=gemini-api-key="AIzaSyC95s7mI5n9BNCyQdWNacPnm13PKS8hekw" \
        --namespace=bot-platform
    
    log_success "Secretos creados correctamente"
}

# Desplegar aplicación
deploy_application() {
    log_info "Desplegando aplicación en Kubernetes..."
    
    # Crear deployment del backend
    cat > k8s/backend-deployment.yaml << EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: bot-platform
  labels:
    app: backend
spec:
  replicas: 1
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
      - name: backend
        image: tardia-bot-platform:latest
        imagePullPolicy: Never
        ports:
        - containerPort: 3000
        env:
        - name: PORT
          value: "3000"
        - name: NODE_ENV
          value: "production"
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: jwt-secret
        - name: MONGODB_URI
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: mongodb-uri
        - name: EMAIL_USER
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: email-user
        - name: EMAIL_PASS
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: email-pass
        - name: FRONTEND_URL
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: frontend-url
        - name: WEATHER_API_KEY
          valueFrom:
            secretKeyRef:
              name: bot-secrets
              key: weather-api-key
        - name: NEWS_API_KEY
          valueFrom:
            secretKeyRef:
              name: bot-secrets
              key: news-api-key
        - name: GEMINI_API_KEY
          valueFrom:
            secretKeyRef:
              name: bot-secrets
              key: gemini-api-key
        - name: KUBERNETES_NAMESPACE
          value: "bot-platform"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: bot-platform
spec:
  selector:
    app: backend
  ports:
  - port: 80
    targetPort: 3000
    protocol: TCP
  type: ClusterIP
EOF

    # Aplicar deployment
    kubectl apply -f k8s/backend-deployment.yaml
    
    log_success "Deployment aplicado correctamente"
}

# Configurar acceso externo
setup_external_access() {
    log_info "Configurando acceso externo..."
    
    # Crear servicio NodePort para acceso externo
    cat > k8s/backend-nodeport.yaml << EOF
apiVersion: v1
kind: Service
metadata:
  name: backend-external
  namespace: bot-platform
spec:
  selector:
    app: backend
  ports:
  - port: 3000
    targetPort: 3000
    nodePort: 30000
    protocol: TCP
  type: NodePort
EOF

    kubectl apply -f k8s/backend-nodeport.yaml
    
    log_success "Acceso externo configurado en puerto 30000"
}

# Configurar firewall
setup_firewall() {
    log_info "Configurando firewall..."
    
    # Permitir puertos necesarios
    sudo ufw allow ssh
    sudo ufw allow 30000  # Puerto NodePort para el backend
    sudo ufw allow 80     # HTTP
    sudo ufw allow 443    # HTTPS
    
    # Habilitar firewall
    sudo ufw --force enable
    
    log_success "Firewall configurado"
}

# Esperar a que los deployments estén listos
wait_for_deployments() {
    log_info "Esperando que los deployments estén listos..."
    
    # Esperar backend
    log_info "Esperando backend..."
    if kubectl wait --for=condition=available --timeout=300s deployment/backend -n bot-platform; then
        log_success "Backend está listo"
    else
        log_error "Backend no pudo iniciarse en 5 minutos"
        kubectl logs -l app=backend -n bot-platform --tail=20
        return 1
    fi
}

# Probar servicios
test_services() {
    log_info "Probando servicios..."
    
    # Obtener IP del nodo Minikube
    MINIKUBE_IP=$(minikube ip)
    
    # Probar health check
    log_info "Probando health check en ${MINIKUBE_IP}:30000..."
    
    # Esperar un poco para que el servicio esté listo
    sleep 10
    
    if curl -f http://${MINIKUBE_IP}:30000/health > /dev/null 2>&1; then
        log_success "Backend responde correctamente"
    else
        log_warning "Backend no responde al health check"
        log_info "Verificando logs del backend..."
        kubectl logs -l app=backend -n bot-platform --tail=10
    fi
}

# Mostrar estado final
show_final_status() {
    log_info "Estado final del sistema..."
    echo ""
    echo "📦 Deployments:"
    kubectl get deployments -n bot-platform
    
    echo ""
    echo "🏃 Pods:"
    kubectl get pods -n bot-platform
    
    echo ""
    echo "🌐 Services:"
    kubectl get services -n bot-platform
    
    echo ""
    echo "🔐 Secrets:"
    kubectl get secrets -n bot-platform
}

# Mostrar instrucciones de acceso
show_access_instructions() {
    MINIKUBE_IP=$(minikube ip)
    EC2_PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "TU-EC2-IP")
    
    echo ""
    log_success "🎉 ¡Despliegue completado exitosamente!"
    echo ""
    echo "🔗 URLs de acceso:"
    echo "   - Backend (interno): http://${MINIKUBE_IP}:30000"
    echo "   - Backend (externo): http://${EC2_PUBLIC_IP}:30000"
    echo "   - Health check: http://${EC2_PUBLIC_IP}:30000/health"
    echo ""
    echo "📱 Para conectar desde Vercel:"
    echo "   Actualiza la variable API_BASE_URL en tu frontend a:"
    echo "   const API_BASE_URL = \"http://${EC2_PUBLIC_IP}:30000/api\""
    echo ""
    echo "🔍 Comandos útiles:"
    echo "   - Ver logs: kubectl logs -l app=backend -n bot-platform -f"
    echo "   - Estado pods: kubectl get pods -n bot-platform"
    echo "   - Reiniciar: kubectl rollout restart deployment/backend -n bot-platform"
    echo "   - Dashboard: minikube dashboard"
    echo ""
    echo "🛠️ Minikube:"
    echo "   - Estado: minikube status"
    echo "   - IP: minikube ip"
    echo "   - SSH: minikube ssh"
    echo ""
    echo "🔧 Configuración importante:"
    echo "   - Security Group EC2: Permitir puerto 30000"
    echo "   - Frontend URL configurada: https://plataformatardiadevelop.vercel.app/"
    echo "   - MongoDB Atlas: Configurado"
    echo "   - Email Gmail: Configurado"
    echo ""
}

# Función principal
main() {
    echo "🚀 Iniciando despliegue en EC2 con Minikube..."
    echo ""
    
    check_environment
    install_system_dependencies
    install_docker
    install_kubectl
    install_minikube
    install_nodejs
    setup_minikube
    setup_environment
    build_docker_image
    setup_kubernetes
    deploy_application
    setup_external_access
    setup_firewall
    wait_for_deployments
    test_services
    show_final_status
    show_access_instructions
    
    echo ""
    log_success "✨ Despliegue completado!"
    echo ""
    log_info "💡 Próximos pasos:"
    echo "1. Configura el Security Group de EC2 para permitir puerto 30000"
    echo "2. Actualiza la URL del API en tu frontend de Vercel"
    echo "3. Prueba la conexión desde Vercel"
}

# Ejecutar función principal
main "$@"

