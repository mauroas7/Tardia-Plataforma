#!/bin/bash

# Script para debuggear problemas con bots
set -e

echo "🔍 Debug de Cloud Bot Platform"
echo "=============================="

# Colors
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

# 1. Verificar estado general
check_general_status() {
    log_info "1. Verificando estado general del sistema..."
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
}

# 2. Verificar logs del backend
check_backend_logs() {
    log_info "2. Verificando logs del backend..."
    echo ""
    
    BACKEND_POD=$(kubectl get pods -n bot-platform -l app=backend -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    
    if [ ! -z "$BACKEND_POD" ]; then
        echo "📋 Logs del backend (últimas 50 líneas):"
        kubectl logs $BACKEND_POD -n bot-platform --tail=50
        echo ""
    else
        log_error "No se encontró pod del backend"
    fi
}

# 3. Verificar logs de bots específicos
check_bot_logs() {
    log_info "3. Verificando logs de bots..."
    echo ""
    
    # Buscar pods de bots (que no sean backend o frontend)
    BOT_PODS=$(kubectl get pods -n bot-platform --no-headers | grep -v "backend\|frontend" | awk '{print $1}')
    
    if [ ! -z "$BOT_PODS" ]; then
        for pod in $BOT_PODS; do
            echo "🤖 Logs del bot: $pod"
            kubectl logs $pod -n bot-platform --tail=30
            echo ""
            echo "📋 Estado del pod:"
            kubectl describe pod $pod -n bot-platform | tail -10
            echo "----------------------------------------"
        done
    else
        log_warning "No se encontraron pods de bots"
    fi
}

# 4. Verificar eventos del cluster
check_cluster_events() {
    log_info "4. Verificando eventos del cluster..."
    echo ""
    
    echo "📅 Eventos recientes en bot-platform:"
    kubectl get events -n bot-platform --sort-by='.lastTimestamp' | tail -20
    echo ""
}

# 5. Verificar conectividad de red
check_network() {
    log_info "5. Verificando conectividad de red..."
    echo ""
    
    # Test backend health
    log_info "Probando health check del backend..."
    kubectl port-forward service/backend 8080:80 -n bot-platform &
    PF_PID=$!
    sleep 3
    
    if curl -f http://localhost:8080/health 2>/dev/null; then
        log_success "Backend responde correctamente"
        curl http://localhost:8080/health 2>/dev/null | jq . 2>/dev/null || curl http://localhost:8080/health 2>/dev/null
    else
        log_error "Backend no responde"
    fi
    
    kill $PF_PID 2>/dev/null || true
    sleep 2
    echo ""
}

# 6. Verificar configuración de MongoDB
check_mongodb() {
    log_info "6. Verificando configuración de MongoDB..."
    echo ""
    
    BACKEND_POD=$(kubectl get pods -n bot-platform -l app=backend -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    
    if [ ! -z "$BACKEND_POD" ]; then
        echo "🔍 Variables de entorno relacionadas con MongoDB:"
        kubectl exec $BACKEND_POD -n bot-platform -- env | grep -i mongo || echo "No se encontraron variables de MongoDB"
        echo ""
    fi
}

# 7. Verificar secretos y configmaps
check_secrets() {
    log_info "7. Verificando secretos y configmaps..."
    echo ""
    
    echo "🔐 Secretos:"
    kubectl get secrets -n bot-platform
    echo ""
    
    echo "📄 ConfigMaps:"
    kubectl get configmaps -n bot-platform
    echo ""
}

# 8. Verificar recursos del sistema
check_resources() {
    log_info "8. Verificando uso de recursos..."
    echo ""
    
    echo "💾 Uso de recursos por pods:"
    kubectl top pods -n bot-platform 2>/dev/null || log_warning "Metrics server no disponible"
    echo ""
}

# 9. Función interactiva para logs en tiempo real
interactive_logs() {
    log_info "9. Modo interactivo - Selecciona qué logs ver:"
    echo ""
    
    echo "Opciones disponibles:"
    echo "1) Backend logs (tiempo real)"
    echo "2) Logs de un bot específico"
    echo "3) Todos los eventos del cluster"
    echo "4) Salir"
    echo ""
    
    read -p "Selecciona una opción (1-4): " choice
    
    case $choice in
        1)
            log_info "Mostrando logs del backend en tiempo real (Ctrl+C para salir)..."
            kubectl logs -l app=backend -n bot-platform -f
            ;;
        2)
            echo "Bots disponibles:"
            kubectl get pods -n bot-platform --no-headers | grep -v "backend\|frontend" | awk '{print NR") " $1}'
            read -p "Selecciona el número del bot: " bot_num
            BOT_NAME=$(kubectl get pods -n bot-platform --no-headers | grep -v "backend\|frontend" | sed -n "${bot_num}p" | awk '{print $1}')
            if [ ! -z "$BOT_NAME" ]; then
                log_info "Mostrando logs de $BOT_NAME en tiempo real (Ctrl+C para salir)..."
                kubectl logs $BOT_NAME -n bot-platform -f
            else
                log_error "Bot no encontrado"
            fi
            ;;
        3)
            log_info "Mostrando eventos en tiempo real (Ctrl+C para salir)..."
            kubectl get events -n bot-platform -w
            ;;
        4)
            log_info "Saliendo..."
            exit 0
            ;;
        *)
            log_error "Opción inválida"
            ;;
    esac
}

# Función principal
main() {
    if [ "$1" = "--interactive" ] || [ "$1" = "-i" ]; then
        interactive_logs
    else
        check_general_status
        check_backend_logs
        check_bot_logs
        check_cluster_events
        check_network
        check_mongodb
        check_secrets
        check_resources
        
        echo ""
        log_info "🔧 Para debugging interactivo, ejecuta:"
        echo "   ./scripts/debug-bot.sh --interactive"
        echo ""
        log_info "🔍 Para logs específicos:"
        echo "   kubectl logs -l app=backend -n bot-platform -f"
        echo "   kubectl logs <nombre-del-bot> -n bot-platform -f"
        echo ""
        log_info "📊 Para ver el estado en tiempo real:"
        echo "   watch kubectl get pods -n bot-platform"
    fi
}

# Ejecutar función principal
main "$@"
