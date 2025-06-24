#!/bin/bash

# =================================================================
# SCRIPT DE DESPLIEGUE PARA EC2 - TarDia Bot Platform
# =================================================================

set -e

echo "🚀 Desplegando TarDia Bot Platform en EC2"
echo "======================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Verificar que estamos en EC2
check_environment() {
    log_info "Verificando entorno EC2..."
    
    if ! command -v node &> /dev/null; then
        log_error "Node.js no está instalado"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        log_error "npm no está instalado"
        exit 1
    fi
    
    log_success "Entorno verificado"
}

# Instalar dependencias
install_dependencies() {
    log_info "Instalando dependencias..."
    
    npm install
    
    log_success "Dependencias instaladas"
}

# Configurar variables de entorno
setup_environment() {
    log_info "Configurando variables de entorno..."
    
    if [ ! -f .env ]; then
        log_warning "Archivo .env no encontrado, creando desde .env.example"
        cp .env.example .env
        
        log_warning "⚠️  IMPORTANTE: Edita el archivo .env con tus configuraciones:"
        echo "   - EMAIL_PASS: Tu App Password de Gmail"
        echo "   - FRONTEND_URL: URL de tu frontend en Vercel"
        echo "   - Otras configuraciones según sea necesario"
        
        read -p "¿Has configurado el archivo .env? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_error "Configura el archivo .env antes de continuar"
            exit 1
        fi
    fi
    
    log_success "Variables de entorno configuradas"
}

# Configurar PM2 para mantener el proceso corriendo
setup_pm2() {
    log_info "Configurando PM2..."
    
    # Instalar PM2 globalmente si no está instalado
    if ! command -v pm2 &> /dev/null; then
        log_info "Instalando PM2..."
        sudo npm install -g pm2
    fi
    
    # Crear archivo de configuración PM2
    cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'tardia-bot-platform',
    script: 'index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
}
EOF
    
    # Crear directorio de logs
    mkdir -p logs
    
    log_success "PM2 configurado"
}

# Configurar nginx como proxy reverso
setup_nginx() {
    log_info "¿Quieres configurar nginx como proxy reverso? (recomendado para producción)"
    read -p "(y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Configurando nginx..."
        
        # Instalar nginx si no está instalado
        if ! command -v nginx &> /dev/null; then
            log_info "Instalando nginx..."
            sudo apt update
            sudo apt install -y nginx
        fi
        
        # Crear configuración de nginx
        sudo tee /etc/nginx/sites-available/tardia-bot-platform << EOF
server {
    listen 80;
    server_name _;
    
    # CORS headers para el frontend en Vercel
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization' always;
    
    # Handle preflight requests
    if (\$request_method = 'OPTIONS') {
        add_header 'Access-Control-Allow-Origin' '*';
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS';
        add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization';
        add_header 'Content-Length' 0;
        add_header 'Content-Type' 'text/plain charset=UTF-8';
        return 204;
    }
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
        
        # Habilitar el sitio
        sudo ln -sf /etc/nginx/sites-available/tardia-bot-platform /etc/nginx/sites-enabled/
        sudo rm -f /etc/nginx/sites-enabled/default
        
        # Verificar configuración y reiniciar nginx
        sudo nginx -t
        sudo systemctl restart nginx
        sudo systemctl enable nginx
        
        log_success "Nginx configurado y ejecutándose"
    else
        log_info "Saltando configuración de nginx"
    fi
}

# Configurar firewall
setup_firewall() {
    log_info "Configurando firewall..."
    
    # Permitir SSH, HTTP y HTTPS
    sudo ufw allow ssh
    sudo ufw allow 80
    sudo ufw allow 443
    sudo ufw allow 3000  # Puerto directo de la aplicación
    
    # Habilitar firewall si no está activo
    sudo ufw --force enable
    
    log_success "Firewall configurado"
}

# Iniciar la aplicación
start_application() {
    log_info "Iniciando aplicación..."
    
    # Detener procesos previos
    pm2 delete tardia-bot-platform 2>/dev/null || true
    
    # Iniciar con PM2
    pm2 start ecosystem.config.js
    
    # Guardar configuración PM2
    pm2 save
    pm2 startup
    
    log_success "Aplicación iniciada con PM2"
}

# Mostrar información final
show_final_info() {
    echo ""
    log_success "🎉 ¡Despliegue completado exitosamente!"
    echo ""
    echo "📊 Estado de la aplicación:"
    pm2 status
    echo ""
    echo "🔗 URLs de acceso:"
    echo "   - Aplicación: http://$(curl -s ifconfig.me):3000"
    if command -v nginx &> /dev/null && systemctl is-active --quiet nginx; then
        echo "   - Nginx Proxy: http://$(curl -s ifconfig.me)"
    fi
    echo ""
    echo "📋 Comandos útiles:"
    echo "   - Ver logs: pm2 logs tardia-bot-platform"
    echo "   - Reiniciar: pm2 restart tardia-bot-platform"
    echo "   - Detener: pm2 stop tardia-bot-platform"
    echo "   - Estado: pm2 status"
    echo ""
    echo "🔧 Configuración importante:"
    echo "   - Actualiza FRONTEND_URL en .env con la IP pública de EC2"
    echo "   - Configura el Security Group para permitir tráfico en puerto 80 y 3000"
    echo "   - Actualiza el frontend para apuntar a la IP de EC2"
    echo ""
    echo "📧 Email configurado con:"
    echo "   - Usuario: $(grep EMAIL_USER .env | cut -d'=' -f2)"
    echo "   - Servicio: Gmail via Nodemailer"
    echo ""
}

# Función principal
main() {
    echo "🚀 Iniciando despliegue en EC2..."
    echo ""
    
    check_environment
    install_dependencies
    setup_environment
    setup_pm2
    setup_nginx
    setup_firewall
    start_application
    show_final_info
    
    echo ""
    log_success "✨ Despliegue completado!"
}

# Ejecutar función principal
main "$@"
