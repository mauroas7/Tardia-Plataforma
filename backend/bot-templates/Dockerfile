FROM node:18-alpine

# Instalar dependencias del sistema
RUN apk add --no-cache curl bash

# Crear directorio de la aplicación
WORKDIR /app

# Crear usuario no-root
RUN addgroup -g 1001 -S botuser && \
    adduser -S botuser -u 1001

# Copiar archivos de configuración
COPY package*.json ./
COPY .env .

# Instalar dependencias
RUN npm ci --only=production && npm cache clean --force

# Copiar código fuente
COPY --chown=botuser:botuser . .

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

# Cambiar al usuario no-root
USER botuser

# Exponer puerto
EXPOSE 3000

# Comando de inicio
CMD ["npm", "start"]
