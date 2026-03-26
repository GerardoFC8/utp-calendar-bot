# Build stage — uses the same base as production so native modules compile
# against the exact same Node.js version that will run them.
# Use Playwright's official image — includes Chromium + system dependencies.
# The tag MUST match the version in package.json (playwright@1.58.2 -> v1.58.2).
# Check available tags: https://mcr.microsoft.com/en-us/artifact/mar/playwright/tags
FROM mcr.microsoft.com/playwright:v1.58.2-noble AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage — same image, copy only artifacts
FROM mcr.microsoft.com/playwright:v1.58.2-noble
WORKDIR /app

# Copy only what's needed for production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create directory for persistent data (SQLite + session state)
# NOTE: do NOT use VOLUME here — persistence is handled by docker-compose.yml
# (bot-data named volume). A VOLUME instruction in Dockerfile creates an
# anonymous volume that shadows the named volume on every rebuild.
RUN mkdir -p /app/data

# Default environment variables
ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/utp.db
ENV TZ=America/Lima

# Healthcheck: verifies the bot process is running
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=2 \
  CMD pgrep -f "node dist/index.js" > /dev/null || exit 1

CMD ["node", "dist/index.js"]
