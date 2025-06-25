#!/bin/bash
echo "🔄 Reiniciando servicios..."

echo "Reiniciando backend..."
kubectl delete pod -l app=backend -n bot-platform

echo "Reiniciando frontend..."
kubectl delete pod -l app=frontend -n bot-platform

echo "✅ Servicios reiniciados"
echo "Usa ./monitor-local.sh para ver el estado"
