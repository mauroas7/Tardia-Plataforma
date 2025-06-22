#!/bin/bash

echo "🔧 Configurando credenciales personalizadas..."

# Solicitar credenciales
read -p "📧 MongoDB URI: " MONGODB_URI
read -p "🔐 JWT Secret: " JWT_SECRET
read -p "🌤️ Weather API Key: " WEATHER_API_KEY
read -p "📰 News API Key: " NEWS_API_KEY
read -p "🧠 Gemini API Key: " GEMINI_API_KEY

# Crear archivo .env
cat > backend/.env << EOF
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb+srv://dbUser:<db_password>@tardiacluster.mg4kvzx.mongodb.net/?retryWrites=true&w=majority&appName=TarDiaCluster
JWT_SECRET=${JWT_SECRET}
KUBERNETES_NAMESPACE=bot-platform
WEATHER_API_KEY=${WEATHER_API_KEY}
NEWS_API_KEY=${NEWS_API_KEY}
GEMINI_API_KEY=${GEMINI_API_KEY}
EOF

echo "✅ Archivo .env creado"

# Codificar en base64 para Kubernetes
MONGODB_PASSWORD_B64=$(echo -n "${MONGODB_URI##*:}" | cut -d'@' -f1 | base64 -w 0)
JWT_SECRET_B64=$(echo -n "${JWT_SECRET}" | base64 -w 0)
WEATHER_API_B64=$(echo -n "${WEATHER_API_KEY}" | base64 -w 0)
NEWS_API_B64=$(echo -n "${NEWS_API_KEY}" | base64 -w 0)
GEMINI_API_B64=$(echo -n "${GEMINI_API_KEY}" | base64 -w 0)

# Actualizar secrets de Kubernetes
cat > k8s/secrets.yaml << EOF
apiVersion: v1
kind: Secret
metadata:
  name: mongodb-secret
  namespace: bot-platform
type: Opaque
data:
  password: ${MONGODB_PASSWORD_B64}
---
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
  namespace: bot-platform
type: Opaque
data:
  jwt-secret: ${JWT_SECRET_B64}
---
apiVersion: v1
kind: Secret
metadata:
  name: bot-secrets
  namespace: bot-platform
type: Opaque
data:
  weather-api-key: ${WEATHER_API_B64}
  news-api-key: ${NEWS_API_B64}
  gemini-api-key: ${GEMINI_API_B64}
EOF

echo "✅ Secrets de Kubernetes actualizados"

# Actualizar docker-compose
sed -i "s|MONGO_INITDB_ROOT_PASSWORD:.*|MONGO_INITDB_ROOT_PASSWORD: $(echo ${MONGODB_URI} | cut -d':' -f3 | cut -d'@' -f1)|" docker-compose.yml
sed -i "s|MONGODB_URI:.*|MONGODB_URI: ${MONGODB_URI}|" docker-compose.yml
sed -i "s|JWT_SECRET:.*|JWT_SECRET: ${JWT_SECRET}|" docker-compose.yml

echo "✅ Docker Compose actualizado"
echo ""
echo "🎉 ¡Configuración completada!"
echo "📋 Próximos pasos:"
echo "   1. docker-compose up -d (para desarrollo)"
echo "   2. ./scripts/setup.sh (para Kubernetes)"
