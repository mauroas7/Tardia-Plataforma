#!/bin/bash

set -e  # Exit on any error

echo "🚀 Cloud Bot Platform - Setup Unificado"
echo "======================================="

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
    log_info "Verificando prerequisitos..."
    
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl no está instalado o no está en el PATH"
        exit 1
    fi
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker no está instalado o no está en el PATH"
        exit 1
    fi
    
    log_success "Prerequisitos verificados"
}

# Detect environment
detect_environment() {
    log_info "Detectando entorno de Kubernetes..."
    
    if command -v minikube &> /dev/null && minikube status &> /dev/null; then
        KUBE_ENV="minikube"
        log_info "🎯 Detectado: Minikube"
    elif command -v kind &> /dev/null && kind get clusters &> /dev/null; then
        KUBE_ENV="kind"
        log_info "🎯 Detectado: kind"
    elif kubectl cluster-info | grep -q "docker-desktop"; then
        KUBE_ENV="docker-desktop"
        log_info "🎯 Detectado: Docker Desktop"
    else
        KUBE_ENV="other"
        log_info "🎯 Detectado: Otro entorno Kubernetes"
    fi
}

# Setup Docker environment
setup_docker_environment() {
    log_info "Configurando entorno Docker..."
    
    case $KUBE_ENV in
        "minikube")
            log_info "📦 Configurando Docker para Minikube..."
            eval $(minikube docker-env)
            log_success "Entorno Docker de Minikube configurado"
            ;;
        "kind")
            log_info "📦 Usando Docker local para kind..."
            ;;
        "docker-desktop")
            log_info "📦 Usando Docker Desktop..."
            ;;
        *)
            log_info "📦 Usando Docker local..."
            ;;
    esac
}

# Build Docker image
build_docker_image() {
    log_info "🏗️ Construyendo imagen Docker..."
    
    cd backend
    if docker build -t cloud-bot-platform:latest . --no-cache; then
        log_success "Imagen Docker construida exitosamente"
    else
        log_error "Error construyendo imagen Docker"
        exit 1
    fi
    cd ..
    
    # Load image into cluster if needed
    case $KUBE_ENV in
        "kind")
            log_info "📦 Cargando imagen en kind..."
            kind load docker-image cloud-bot-platform:latest
            log_success "Imagen cargada en kind"
            ;;
        "minikube")
            log_success "Imagen ya disponible en Minikube"
            ;;
        *)
            log_info "Imagen construida localmente"
            ;;
    esac
    
    # Verify image exists
    if docker images | grep -q cloud-bot-platform; then
        log_success "Imagen verificada correctamente"
    else
        log_error "No se pudo verificar la imagen"
        exit 1
    fi
}

# Setup Kubernetes resources
setup_kubernetes() {
    log_info "🔧 Configurando recursos de Kubernetes..."
    
    # Create namespace
    log_info "Creando namespace..."
    kubectl create namespace bot-platform --dry-run=client -o yaml | kubectl apply -f -
    log_success "Namespace creado/verificado"
    
    # Clean up existing resources
    log_info "Limpiando recursos existentes..."
    kubectl delete deployment backend frontend mongodb --ignore-not-found=true -n bot-platform
    kubectl delete pvc mongodb-pvc --ignore-not-found=true -n bot-platform
    kubectl delete service mongodb --ignore-not-found=true -n bot-platform
    kubectl delete secret mongodb-secret app-secrets bot-secrets --ignore-not-found=true -n bot-platform
    kubectl delete configmap frontend-files nginx-config --ignore-not-found=true -n bot-platform
    
    # Wait for cleanup
    log_info "Esperando limpieza completa..."
    sleep 10
    
    # Create secrets
    log_info "Creando secretos..."
    kubectl create secret generic app-secrets \
      --from-literal=jwt-secret="cloud-bot-secret-key-2024" \
      --namespace=bot-platform
    
    kubectl create secret generic bot-secrets \
      --from-literal=weather-api-key="" \
      --from-literal=news-api-key="" \
      --from-literal=gemini-api-key="" \
      --namespace=bot-platform
    
    log_success "Secretos creados"
    
    # Create frontend configmap
    log_info "Creando ConfigMap del frontend..."
    kubectl create configmap frontend-files \
      --from-file=frontend/ \
      --namespace=bot-platform \
      --dry-run=client -o yaml | kubectl apply -f -
    
    # Apply configurations
    log_info "Aplicando configuraciones..."
    kubectl apply -f k8s/configmaps.yaml
    kubectl apply -f k8s/backend-atlas.yaml
    kubectl apply -f k8s/frontend.yaml

    # Create nginx configmap
    log_info "Creando ConfigMap de nginx..."
    kubectl create configmap nginx-config \
      --from-file=nginx.conf \
      --namespace=bot-platform \
      --dry-run=client -o yaml | kubectl apply -f -

    log_success "ConfigMaps creados"

    # Restart frontend to load changes
    log_info "Reiniciando frontend para cargar cambios..."
    kubectl delete pod -l app=frontend -n bot-platform --ignore-not-found=true
    
    log_success "Configuraciones aplicadas"
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
        log_info "Mostrando logs del backend..."
        kubectl logs -l app=backend -n bot-platform --tail=20
        return 1
    fi
    
    # Wait for frontend
    log_info "Esperando frontend..."
    if kubectl wait --for=condition=available --timeout=180s deployment/frontend -n bot-platform; then
        log_success "Frontend está listo"
    else
        log_warning "Frontend tardó más de lo esperado"
    fi
}

# Debug backend issues
debug_backend_issues() {
    log_info "🔍 Diagnosticando problemas del backend..."
    
    # Check backend pod status
    BACKEND_PODS=$(kubectl get pods -n bot-platform -l app=backend --no-headers)
    echo "📦 Estado de pods del backend:"
    echo "$BACKEND_PODS"
    
    # Check if pods are crashing
    if echo "$BACKEND_PODS" | grep -q "CrashLoopBackOff\|Error\|Pending"; then
        log_warning "Backend tiene problemas, mostrando logs..."
        
        # Get the most recent backend pod
        BACKEND_POD=$(kubectl get pods -n bot-platform -l app=backend -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
        
        if [ ! -z "$BACKEND_POD" ]; then
            echo ""
            echo "📋 Logs del backend (últimas 50 líneas):"
            kubectl logs $BACKEND_POD -n bot-platform --tail=50 || true
            
            echo ""
            echo "📋 Eventos del pod:"
            kubectl describe pod $BACKEND_POD -n bot-platform | tail -20
        fi
        
        echo ""
        log_info "💡 Posibles soluciones:"
        echo "1. Verificar que MongoDB Atlas permita conexiones desde tu IP"
        echo "2. Ejecutar: ./fix-atlas-connection.sh"
        echo "3. Verificar variables de entorno en el deployment"
        
        return 1
    else
        log_success "Backend parece estar funcionando correctamente"
        return 0
    fi
}

# Test services
test_services() {
    log_info "🧪 Probando servicios..."
    
    # Test backend health
    log_info "Probando salud del backend..."
    kubectl port-forward service/backend 8080:80 -n bot-platform &
    PF_PID=$!
    sleep 5
    
    if curl -f http://localhost:8080/health > /dev/null 2>&1; then
        log_success "Backend responde correctamente"
    else
        log_warning "Backend no responde al health check"
        log_info "Verificando logs del backend..."
        kubectl logs -l app=backend -n bot-platform --tail=10
    fi
    
    kill $PF_PID 2>/dev/null || true
    sleep 2
}

# Show final status
show_final_status() {
    log_info "📊 Estado final del sistema..."
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

# Show access instructions
show_access_instructions() {
    echo ""
    log_success "🎉 ¡Setup completado exitosamente!"
    echo ""
    echo "🔗 Para acceder a la aplicación:"
    echo "   Frontend: kubectl port-forward service/frontend 8080:80 -n bot-platform"
    echo "   Luego abre: http://localhost:8080"
    echo ""
    echo "🔍 Comandos útiles:"
    echo "   Ver logs backend: kubectl logs -l app=backend -n bot-platform -f"
    echo "   Ver logs frontend: kubectl logs -l app=frontend -n bot-platform -f"
    echo "   Estado general: kubectl get all -n bot-platform"
    echo "   Debug completo: ./scripts/debug.sh"
    echo ""
    echo "🗄️ Base de datos: MongoDB Atlas (ya configurado)"
    echo ""
    
    # Show environment-specific instructions
    case $KUBE_ENV in
        "minikube")
            echo "🎯 Minikube detectado:"
            echo "   Dashboard: minikube dashboard"
            echo "   Tunnel: minikube tunnel (en otra terminal para LoadBalancer)"
            ;;
        "kind")
            echo "🎯 kind detectado:"
            echo "   Clusters: kind get clusters"
            ;;
        "docker-desktop")
            echo "🎯 Docker Desktop detectado:"
            echo "   Dashboard disponible en Docker Desktop"
            ;;
    esac
}

# Main execution
main() {
    echo "🚀 Iniciando setup completo..."
    echo ""
    
    check_prerequisites
    detect_environment
    setup_docker_environment
    build_docker_image
    setup_kubernetes
    wait_for_deployments
    
    # Debug backend if there are issues
    if ! debug_backend_issues; then
        log_warning "Se detectaron problemas con el backend"
        echo ""
        echo "🔧 Para solucionarlo:"
        echo "   1. ./fix-atlas-connection.sh"
        echo "   2. kubectl delete pod -l app=backend -n bot-platform"
        echo "   3. kubectl logs -l app=backend -n bot-platform -f"
    fi
    
    test_services
    show_final_status
    show_access_instructions
    
    echo ""
    log_success "✨ Setup completado!"
}

# Run main function
main "$@"
