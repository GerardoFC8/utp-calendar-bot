# Build stage
FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
# Use Playwright's official image — includes Chromium + system dependencies.
# The tag MUST match the version in package.json (playwright@1.58.2 -> v1.58.2).
# Check available tags: https://mcr.microsoft.com/en-us/artifact/mar/playwright/tags
FROM mcr.microsoft.com/playwright:v1.58.2-noble
WORKDIR /app

# Copy only what's needed for production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create directory for persistent data (SQLite + session state)
RUN mkdir -p /app/data
VOLUME /app/data

# Default environment variables
ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/utp.db
ENV TZ=America/Lima

# Healthcheck for Dokploy
HEALTHCHECK --interval=60s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "console.log('ok')" || exit 1

CMD ["node", "dist/index.js"]
