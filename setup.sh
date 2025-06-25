#!/bin/bash

set -e  # Exit on any error

echo "🚀 TarDía Bot Platform - Setup Local con Minikube"
echo "================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Check prerequisites
check_prerequisites() {
    log_info "Verificando prerequisitos para desarrollo local..."
    
    if ! command -v minikube &> /dev/null; then
        log_error "minikube no está instalado"
        echo "Instala minikube desde: https://minikube.sigs.k8s.io/docs/start/"
        exit 1
    fi
    
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl no está instalado"
        echo "Instala kubectl desde: https://kubernetes.io/docs/tasks/tools/"
        exit 1
    fi
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker no está instalado"
        echo "Instala Docker desde: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    log_success "Prerequisitos verificados"
}

# Setup minikube
setup_minikube() {
    log_info "🎯 Configurando Minikube..."
    
    # Check if minikube is running
    if ! minikube status &> /dev/null; then
        log_info "Iniciando Minikube..."
        minikube start --driver=docker --memory=4096 --cpus=2
        log_success "Minikube iniciado"
    else
        log_success "Minikube ya está ejecutándose"
    fi
    
    # Enable addons
    log_info "Habilitando addons necesarios..."
    minikube addons enable ingress
    minikube addons enable dashboard
    minikube addons enable metrics-server
    
    # Configure Docker environment
    log_info "Configurando entorno Docker de Minikube..."
    eval $(minikube docker-env)
    
    log_success "Minikube configurado correctamente"
}

# Build Docker image
build_docker_image() {
    log_info "🏗️ Construyendo imagen Docker en Minikube..."
    
    # Make sure we're using minikube's docker
    eval $(minikube docker-env)
    
    cd backend
    if docker build -t cloud-bot-platform:latest . --no-cache; then
        log_success "Imagen Docker construida exitosamente"
    else
        log_error "Error construyendo imagen Docker"
        exit 1
    fi
    cd ..
    
    # Verify image exists in minikube
    if eval $(minikube docker-env) && docker images | grep -q cloud-bot-platform; then
        log_success "Imagen verificada en Minikube"
    else
        log_error "No se pudo verificar la imagen en Minikube"
        exit 1
    fi
}

# Setup Kubernetes resources
setup_kubernetes() {
    log_info "🔧 Configurando recursos de Kubernetes..."
    
    # Create namespace
    log_info "Creando namespace bot-platform..."
    kubectl create namespace bot-platform --dry-run=client -o yaml | kubectl apply -f -
    log_success "Namespace creado/verificado"
    
    # Clean up existing resources
    log_info "Limpiando recursos existentes..."
    kubectl delete deployment backend frontend --ignore-not-found=true -n bot-platform
    kubectl delete service backend frontend --ignore-not-found=true -n bot-platform
    kubectl delete secret app-secrets bot-secrets --ignore-not-found=true -n bot-platform
    kubectl delete configmap frontend-files nginx-config --ignore-not-found=true -n bot-platform
    
    # Wait for cleanup
    log_info "Esperando limpieza completa..."
    sleep 5
    
    # Create secrets for local development
    log_info "Creando secretos para desarrollo local..."
    kubectl create secret generic app-secrets \
      --from-literal=jwt-secret="cloud-bot-secret-key-2024-local" \
      --from-literal=mongodb-uri="mongodb+srv://dbUser:ProyectoTarDia987654321@tardiacluster.mg4kvzx.mongodb.net/cloud-bot-platform?retryWrites=true&w=majority&appName=TarDiaCluster" \
      --from-literal=email-user="tardiainfo@gmail.com" \
      --from-literal=email-pass="jbka nukx bmov mmij" \
      --from-literal=frontend-url="http://localhost:8080" \
      --namespace=bot-platform
    
    kubectl create secret generic bot-secrets \
      --from-literal=weather-api-key="a9fa79faf7ce399e52f803b1abc336dd" \
      --from-literal=news-api-key="d93ff7fc3de6c7b1142a5111c59ec2eb" \
      --from-literal=gemini-api-key="AIzaSyC95s7mI5n9BNCyQdWNacPnm13PKS8hekw" \
      --namespace=bot-platform
    
    log_success "Secretos creados correctamente"
    
    # Create frontend configmap
    log_info "Creando ConfigMap del frontend..."
    kubectl create configmap frontend-files \
      --from-file=frontend/ \
      --namespace=bot-platform \
      --dry-run=client -o yaml | kubectl apply -f -
    
    # Create nginx configmap for local development
    log_info "Creando ConfigMap de nginx para desarrollo local..."
    kubectl create configmap nginx-config \
      --from-file=nginx.conf \
      --namespace=bot-platform \
      --dry-run=client -o yaml | kubectl apply -f -
    
    # Apply RBAC and other configurations
    log_info "Aplicando configuraciones RBAC..."
    kubectl apply -f k8s/rbac.yaml
    
    log_success "ConfigMaps y RBAC aplicados"
}

# Deploy applications
deploy_applications() {
    log_info "🚀 Desplegando aplicaciones..."
    
    # Deploy backend
    log_info "Desplegando backend..."
    kubectl apply -f k8s/deployment.yaml
    
    # Deploy frontend
    log_info "Desplegando frontend..."
    kubectl apply -f k8s/frontend.yaml
    
    log_success "Aplicaciones desplegadas"
}

# Wait for deployments
wait_for_deployments() {
    log_info "⏳ Esperando que los deployments estén listos..."
    
    # Wait for backend
    log_info "Esperando backend..."
    if kubectl wait --for=condition=available --timeout=300s deployment/backend -n bot-platform; then
        log_success "Backend está listo"
    else
        log_error "Backend no pudo iniciarse en 5 minutos"
        show_debug_info
        return 1
    fi
    
    # Wait for frontend
    log_info "Esperando frontend..."
    if kubectl wait --for=condition=available --timeout=180s deployment/frontend -n bot-platform; then
        log_success "Frontend está listo"
    else
        log_warning "Frontend tardó más de lo esperado"
        show_debug_info
    fi
}

# Show debug information
show_debug_info() {
    log_info "🔍 Información de debug..."
    
    echo ""
    echo "📦 Estado de Deployments:"
    kubectl get deployments -n bot-platform
    
    echo ""
    echo "🏃 Estado de Pods:"
    kubectl get pods -n bot-platform
    
    echo ""
    echo "📋 Logs del Backend (últimas 20 líneas):"
    kubectl logs -l app=backend -n bot-platform --tail=20 || echo "No hay logs disponibles"
    
    echo ""
    echo "📋 Eventos recientes:"
    kubectl get events -n bot-platform --sort-by='.lastTimestamp' | tail -10
}

# Test services
test_services() {
    log_info "🧪 Probando servicios..."
    
    # Get minikube IP
    MINIKUBE_IP=$(minikube ip)
    log_info "IP de Minikube: $MINIKUBE_IP"
    
    # Test backend health
    log_info "Probando salud del backend..."
    kubectl port-forward service/backend 8081:80 -n bot-platform &
    BACKEND_PF_PID=$!
    sleep 5
    
    if curl -f http://localhost:8081/health > /dev/null 2>&1; then
        log_success "✅ Backend responde correctamente"
        
        # Show health info
        echo "📊 Estado del backend:"
        curl -s http://localhost:8081/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost:8081/health
    else
        log_warning "Backend no responde al health check"
        show_debug_info
    fi
    
    kill $BACKEND_PF_PID 2>/dev/null || true
    sleep 2
}

# Create helper scripts
create_helper_scripts() {
    log_info "📝 Creando scripts de ayuda..."
    
    # Port forward script
    cat > start-port-forward.sh << 'EOF'
#!/bin/bash
echo "🌐 Iniciando port-forward para acceso web..."
echo "Frontend: http://localhost:8080"
echo "Backend: http://localhost:8081"
echo ""
echo "Presiona Ctrl+C para detener"

# Start port forwards in background
kubectl port-forward service/frontend 8080:80 -n bot-platform &
FRONTEND_PID=$!

kubectl port-forward service/backend 8081:80 -n bot-platform &
BACKEND_PID=$!

# Wait for interrupt
trap "kill $FRONTEND_PID $BACKEND_PID 2>/dev/null; exit" INT

echo "✅ Port-forwards activos"
echo "   Frontend: http://localhost:8080"
echo "   Backend: http://localhost:8081"

wait
EOF

    # Monitor script
    cat > monitor-local.sh << 'EOF'
#!/bin/bash
echo "📊 Monitor del Sistema Local"
echo "============================"

while true; do
    clear
    echo "📊 TarDía Bot Platform - Monitor Local"
    echo "======================================"
    echo "Tiempo: $(date)"
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
    
    echo "💾 Uso de recursos:"
    kubectl top pods -n bot-platform 2>/dev/null || echo "Metrics no disponibles"
    echo ""
    
    echo "Presiona Ctrl+C para salir"
    sleep 10
done
EOF

    # Logs script
    cat > logs-local.sh << 'EOF'
#!/bin/bash
echo "📋 Logs del Sistema"
echo "=================="
echo ""
echo "Selecciona qué logs ver:"
echo "1) Backend"
echo "2) Frontend"
echo "3) Todos los pods"
echo "4) Eventos del cluster"
echo ""
read -p "Opción (1-4): " choice

case $choice in
    1)
        echo "📋 Logs del Backend:"
        kubectl logs -l app=backend -n bot-platform -f
        ;;
    2)
        echo "📋 Logs del Frontend:"
        kubectl logs -l app=frontend -n bot-platform -f
        ;;
    3)
        echo "📋 Logs de todos los pods:"
        kubectl logs -l tier=api,tier=web -n bot-platform -f
        ;;
    4)
        echo "📋 Eventos del cluster:"
        kubectl get events -n bot-platform -w
        ;;
    *)
        echo "Opción inválida"
        ;;
esac
EOF

    # Restart script
    cat > restart-local.sh << 'EOF'
#!/bin/bash
echo "🔄 Reiniciando servicios..."

echo "Reiniciando backend..."
kubectl delete pod -l app=backend -n bot-platform

echo "Reiniciando frontend..."
kubectl delete pod -l app=frontend -n bot-platform

echo "✅ Servicios reiniciados"
echo "Usa ./monitor-local.sh para ver el estado"
EOF

    # Cleanup script
    cat > cleanup-local.sh << 'EOF'
#!/bin/bash
echo "🧹 Limpiando recursos locales..."

read -p "¿Estás seguro de que quieres limpiar todo? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Eliminando namespace bot-platform..."
    kubectl delete namespace bot-platform --ignore-not-found=true
    
    echo "Eliminando imágenes Docker..."
    eval $(minikube docker-env)
    docker rmi cloud-bot-platform:latest 2>/dev/null || true
    
    echo "✅ Limpieza completada"
else
    echo "❌ Limpieza cancelada"
fi
EOF

    # Make scripts executable
    chmod +x start-port-forward.sh monitor-local.sh logs-local.sh restart-local.sh cleanup-local.sh
    
    log_success "Scripts de ayuda creados"
}

# Show final status and instructions
show_final_status() {
    echo ""
    log_success "🎉 ¡Setup local completado exitosamente!"
    echo ""
    
    # Show current status
    echo "📊 Estado actual del sistema:"
    kubectl get all -n bot-platform
    echo ""
    
    # Get minikube info
    MINIKUBE_IP=$(minikube ip)
    
    echo "🔗 Acceso a la aplicación:"
    echo "   1. Ejecuta: ./start-port-forward.sh"
    echo "   2. Abre: http://localhost:8080"
    echo ""
    
    echo "🛠️ Scripts disponibles:"
    echo "   ./start-port-forward.sh  - Iniciar acceso web"
    echo "   ./monitor-local.sh       - Monitorear sistema"
    echo "   ./logs-local.sh          - Ver logs"
    echo "   ./restart-local.sh       - Reiniciar servicios"
    echo "   ./cleanup-local.sh       - Limpiar todo"
    echo ""
    
    echo "🎯 Minikube:"
    echo "   IP: $MINIKUBE_IP"
    echo "   Dashboard: minikube dashboard"
    echo "   Status: minikube status"
    echo ""
    
    echo "✨ Funcionalidades disponibles:"
    echo "   ✅ Registro y login de usuarios"
    echo "   ✅ Creación y gestión de bots"
    echo "   ✅ Recuperación de contraseña por email"
    echo "   ✅ Sesiones persistentes"
    echo "   ✅ MongoDB Atlas integrado"
    echo ""
    
    echo "🔍 Comandos útiles:"
    echo "   kubectl get pods -n bot-platform"
    echo "   kubectl logs -l app=backend -n bot-platform -f"
    echo "   kubectl describe pod <pod-name> -n bot-platform"
    echo ""
    
    # Save setup info
    cat > setup-info-local.txt << EOF
TarDía Bot Platform - Setup Local Information
============================================

Minikube IP: $MINIKUBE_IP
Namespace: bot-platform

URLs de acceso:
- Frontend: http://localhost:8080 (con port-forward)
- Backend: http://localhost:8081 (con port-forward)
- Dashboard: minikube dashboard

MongoDB: MongoDB Atlas (configurado)

Scripts disponibles:
- ./start-port-forward.sh - Iniciar acceso web
- ./monitor-local.sh - Monitorear sistema
- ./logs-local.sh - Ver logs
- ./restart-local.sh - Reiniciar servicios
- ./cleanup-local.sh - Limpiar todo

Setup completado: $(date)
EOF
    
    log_success "Información guardada en setup-info-local.txt"
}

# Main execution
main() {
    echo "🚀 Iniciando setup completo para desarrollo local..."
    echo ""
    
    check_prerequisites
    setup_minikube
    build_docker_image
    setup_kubernetes
    deploy_applications
    wait_for_deployments
    test_services
    create_helper_scripts
    show_final_status
    
    echo ""
    log_success "✨ Setup local completado!"
    log_info "Ejecuta ./start-port-forward.sh para comenzar a usar la aplicación"
}

# Run main function
main "$@"
