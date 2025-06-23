#!/bin/bash

# Define el namespace para no tener que repetirlo.
NAMESPACE="bot-platform"

echo "🧹 Script para limpiar recursos en el namespace '$NAMESPACE', conservando 'frontend' y 'backend'."
echo ""

# --- Vista Previa de lo que se va a eliminar ---
echo "🔎 Se han encontrado los siguientes recursos para eliminar:"
echo "----------------------------------------------------"

echo "📜 DEPLOYMENTS a eliminar:"
# El comando busca deployments, excluye con 'grep -vE' los que empiezan por 'backend' o 'frontend', y muestra solo el nombre.
kubectl get deployments -n $NAMESPACE --no-headers | awk '{print $1}' | grep -vE '^(backend|frontend)' | column || echo "   (Ninguno para eliminar)"

echo ""
echo "📜 SERVICES a eliminar:"
# Hace lo mismo para los servicios, excluyendo también el servicio 'kubernetes' que está por defecto.
kubectl get services -n $NAMESPACE --no-headers | awk '{print $1}' | grep -vE '^(backend|frontend|kubernetes)' | column || echo "   (Ninguno para eliminar)"
echo "----------------------------------------------------"
echo ""

# --- Confirmación ---
read -p "¿Estás seguro de que deseas eliminar estos recursos? (y/N): " confirm

if [[ $confirm == [yY] || $confirm == [yY][eE][sS] ]]; then
    echo "🗑️ Eliminando deployments..."
    # Se obtienen los nombres de los deployments y se pasan a 'kubectl delete'.
    # xargs -r se asegura de que el comando no se ejecute si no hay nada que borrar.
    kubectl get deployments -n $NAMESPACE --no-headers | awk '{print $1}' | grep -vE '^(backend|frontend)' | xargs -r kubectl delete deployment -n $NAMESPACE

    echo "🗑️ Eliminando services..."
    kubectl get services -n $NAMESPACE --no-headers | awk '{print $1}' | grep -vE '^(backend|frontend|kubernetes)' | xargs -r kubectl delete service -n $NAMESPACE

    echo ""
    # Mantenemos la limpieza opcional de Docker de tu script original.
    read -p "¿Deseas limpiar también las imágenes Docker locales de los bots? (y/N): " clean_docker
    if [[ $clean_docker == [yY] || $clean_docker == [yY][eE][sS] ]]; then
        echo "🐳 Limpiando imágenes Docker de bots..."
        docker images | grep "bot-" | awk '{print $3}' | xargs -r docker rmi --force 2>/dev/null || true
    fi

    echo ""
    echo "✅ Limpieza completada."
else
    echo "❌ Operación cancelada."
fi
