# ---- Etapa 1: "Builder" ----
FROM busybox:latest as builder

# Establecer el directorio de trabajo
WORKDIR /app

# Copiar los archivos del frontend desde el contexto raíz
COPY frontend/ .

# ---- Etapa 2: "Runner" ----
FROM nginx:1.25-alpine

# Eliminar la configuración por defecto de Nginx
RUN rm /etc/nginx/conf.d/default.conf

# Copiar configuración de Nginx desde la raíz del proyecto
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar los archivos estáticos de la etapa "builder"
COPY --from=builder /app /usr/share/nginx/html

# Exponer el puerto 80
EXPOSE 80

# Comando para iniciar Nginx
CMD ["nginx", "-g", "daemon off;"]
