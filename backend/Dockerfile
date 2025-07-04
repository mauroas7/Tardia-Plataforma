FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache \
    curl \
    docker-cli \
    bash \
    && curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
    && chmod +x kubectl \
    && mv kubectl /usr/local/bin/

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S -u 1001 -G $(getent group 999 | cut -d: -f1) nodejs

# Copy package files
COPY package*.json ./

# Install dependencies and generate package-lock.json
RUN npm install --production && npm cache clean --force

# Copy source code
COPY --chown=nodejs:nodejs . .

# Copy bot templates to the container
COPY --chown=nodejs:nodejs bot-templates ./bot-templates

# Create necessary directories
RUN mkdir -p generated-bots public logs && \
    chown -R nodejs:nodejs /app

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Expose port
EXPOSE 3000

# Switch to non-root user
USER nodejs

# Start the application
CMD ["npm", "start"]
