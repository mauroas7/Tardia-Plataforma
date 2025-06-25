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
