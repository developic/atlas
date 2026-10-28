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
# package.json and bun.lock copied first for layer caching.
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Stage 3: Build the application
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
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

# The oven/bun image ships a non-root 'bun' user; drop to it for the runtime stage.
USER bun

EXPOSE 8080

# Cloud Run requires a health check. Polls the Next.js server; / returns 200 when the app is up.
# For faster, lighter checks, add a dedicated /api/health route and point this at it.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:8080/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" || exit 1

CMD ["bun", "server.js"]
