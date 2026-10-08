# syntax=docker/dockerfile:1.7
# Imagen única para web (Next standalone), worker y migraciones.

ARG NODE_VERSION=24-bookworm-slim

# ── Dependencias completas (para compilar) ──
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts && DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate

# ── Build ──
FROM node:${NODE_VERSION} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY --from=deps /app/src/generated ./src/generated
# Variables mínimas para que el build no falle (los valores reales llegan en runtime)
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" BETTER_AUTH_SECRET="build-time-placeholder-secret" \
    npx next build && npm run build:worker

# ── Dependencias de producción ──
FROM node:${NODE_VERSION} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --ignore-scripts

# ── Runtime ──
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 STORAGE_LOCAL_DIR=/app/storage/uploads
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tini && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/storage/uploads && chown -R node:node /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts /app/package.json ./
USER node
EXPOSE 3000
VOLUME ["/app/storage/uploads"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
# web por defecto; el worker usa: node dist/worker.mjs ; migraciones: npx prisma migrate deploy
CMD ["node", "server.js"]
