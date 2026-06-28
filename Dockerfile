FROM node:20-bookworm-slim AS builder

RUN apt-get update && \
    apt-get install -y python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS dependencies

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-bookworm-slim AS runner

RUN apt-get update && \
    apt-get install -y curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# Copy pre-built node_modules from the dependencies stage (no reinstall)
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

RUN mkdir -p uploads

# Running as root for now — the bind-mounted host `uploads` directory's
# ownership doesn't match the `node` user's UID inside the container, which
# blocks status/media uploads (writes to ./uploads/status) with permission
# errors severe enough to surface as a 502 rather than a clean 4xx/5xx.
# Revert to `USER node` once the host directory's ownership is fixed to
# match (see Dockerfile git history for the non-root setup).
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/main.js"]