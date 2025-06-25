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
