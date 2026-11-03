# Dockerfile for Cloud Run — Next.js production build
# Lightweight multi-stage build; runs as non-root; health-checked.
#
# Base images pinned by exact tag. For production, replace with immutable digests:
#   FROM oven/bun:1.4.4@sha256:<digest>  # oven/bun:1.4.4

ARG BUN_VERSION=1.4.4

# Stage 1: Base image
FROM oven/bun:${BUN_VERSION} AS base
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Stage 2: Install dependencies (production only)
# package.json and bun.lock copied first for layer caching. The postinstall
# hook needs its script present, so it is copied too (the rest of the tree
# follows in the builder stage).
FROM base AS deps
COPY package.json bun.lock ./
COPY scripts/copy-vad-assets.mjs ./scripts/copy-vad-assets.mjs
# Full install (not --production): `next build` needs devDependencies
# (@tailwindcss/turbopack, types). The runner stage stays slim — it only
# takes the standalone output plus the VAD runtime set below.
RUN bun install --frozen-lockfile

# Stage 3: Build the application
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Optional override for the VAD WebSocket URL baked into the client bundle.
# Empty (default) keeps the in-code fallback wss://<host>:8081. Set to
# ws://<host>:8081 when the page is served over plain HTTP (local docker,
# LAN), since browsers refuse wss:// against a plain-ws server.
ARG NEXT_PUBLIC_VAD_URL=""
ENV NEXT_PUBLIC_VAD_URL=$NEXT_PUBLIC_VAD_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# Stage 4: Production runner (slim image, no dev tools)
FROM oven/bun:${BUN_VERSION}-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# OCI image metadata
LABEL org.opencontainers.image.title="atlas"
LABEL org.opencontainers.image.description="Next.js voice orb application"
LABEL org.opencontainers.image.source="https://github.com/sky/Projects/atlas"

# Copy only the runtime artifacts from the builder stage.
# --chown=bun:bun sets ownership to the non-root user in one layer,
# avoiding a separate RUN chown that would double the layer size.
COPY --chown=bun:bun --from=builder /app/public ./public
COPY --chown=bun:bun --from=builder /app/.next/standalone ./
COPY --chown=bun:bun --from=builder /app/.next/static ./.next/static

# VAD server: the WS process the orb uses for server-side Silero scoring.
# The Next standalone output does not include it, so copy the script, the
# start script, the two pure lib modules it imports, and the ONNX runtime it
# scores with (the model itself already rides along inside ./public/vad).
COPY --chown=bun:bun --from=builder /app/scripts/vad-server.mjs ./scripts/vad-server.mjs
COPY --chown=bun:bun --from=builder /app/scripts/start-prod.sh ./scripts/start-prod.sh
COPY --chown=bun:bun --from=builder /app/src/lib/vad-audio.ts ./src/lib/vad-audio.ts
COPY --chown=bun:bun --from=builder /app/src/lib/vad-session.ts ./src/lib/vad-session.ts
COPY --chown=bun:bun --from=deps /app/node_modules/onnxruntime-node ./node_modules/onnxruntime-node
COPY --chown=bun:bun --from=deps /app/node_modules/onnxruntime-common ./node_modules/onnxruntime-common

# The oven/bun image ships a non-root 'bun' user; drop to it for the runtime stage.
USER bun

EXPOSE 8080 8081

# Cloud Run requires a health check. Polls the Next.js server; / returns 200 when the app is up.
# For faster, lighter checks, add a dedicated /api/health route and point this at it.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:8080/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" || exit 1

CMD ["sh", "scripts/start-prod.sh"]
