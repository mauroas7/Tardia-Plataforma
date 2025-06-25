# ---- Etapa 1: "Builder" ----
# Esta etapa prepara los archivos estáticos. En un proyecto con React/Vue/Angular,
# aquí se ejecutaría `npm run build`. Para archivos estáticos, solo los copiamos.
FROM busybox:latest as builder

# Establecer el directorio de trabajo
WORKDIR /app

# Copiar los archivos del frontend (index.html, script.js, styles.css) al directorio de trabajo
COPY . .

# ---- Etapa 2: "Runner" ----
# Esta etapa final utiliza un servidor web Nginx ligero para servir los archivos
# que preparamos en la etapa anterior.

# Usar la imagen oficial de Nginx basada en Alpine Linux (muy ligera)
FROM nginx:1.25-alpine

# Eliminar la configuración por defecto de Nginx
RUN rm /etc/nginx/conf.d/default.conf

# Copiar nuestra configuración personalizada de Nginx al contenedor.
# Asegúrate de que tienes un archivo `nginx.conf` en la raíz de tu proyecto.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar los archivos estáticos de la etapa "builder" al directorio público de Nginx
COPY --from=builder /app /usr/share/nginx/html

# Exponer el puerto 80, que es el puerto por defecto de Nginx
EXPOSE 80

# Comando para iniciar Nginx en modo "foreground" (primer plano),
# que es la práctica recomendada para contenedores.
CMD ["nginx", "-g", "daemon off;"]
