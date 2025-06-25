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
