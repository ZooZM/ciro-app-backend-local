# Stage 1: Build the application
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./

# Install all dependencies (including devDependencies for the build)
RUN npm ci

COPY . .

RUN npm run build

# Stage 2: Production dependencies (avoids reinstalling deps in the final image)
FROM node:20-alpine AS dependencies

WORKDIR /app

COPY package*.json ./

# Install production-only packages (no re-download on deploy)
RUN npm ci --omit=dev && npm cache clean --force

# Stage 3: Runner (minimal final image)
FROM node:20-alpine AS runner

WORKDIR /app

# Copy pre-built node_modules from the dependencies stage (no reinstall)
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json ./

RUN mkdir -p uploads

# Run as non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/main.js"]