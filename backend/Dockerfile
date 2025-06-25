FROM node:18-alpine

# Instalar dependencias del sistema
RUN apk add --no-cache \
    curl \
    bash \
    docker \
    kubectl

# Crear directorio de trabajo
WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production

# Copiar código fuente
COPY . .

# Crear directorio para logs
RUN mkdir -p logs

# Crear directorio para bots generados
RUN mkdir -p generated-bots

# Exponer puerto
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Comando por defecto
CMD ["node", "index.js"]

