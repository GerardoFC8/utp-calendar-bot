# Build stage
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM mcr.microsoft.com/playwright:v1.49.0-noble
WORKDIR /app

# Copy only what's needed
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create directory for persistent data
RUN mkdir -p /app/data
VOLUME /app/data

# Default environment variables
ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/utp.db
ENV TZ=America/Lima

# Healthcheck for Dokploy
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "console.log('ok')" || exit 1

CMD ["node", "dist/index.js"]
