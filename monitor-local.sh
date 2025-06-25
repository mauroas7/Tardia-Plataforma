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
