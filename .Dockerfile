# Pin exact digest in real enterprise (we pin tag for maintainability here)
# Meta/Google use digest pinning: node@sha256:abc123...
# For your scale, version pinning is sufficient and more maintainable.
FROM node:20.19.1-alpine3.21 AS deps

# Tini: lightweight init process — prevents zombie processes when Node
# spawns child processes. Docker's default PID 1 doesn't reap zombies.
# Vercel, Railway, Fly.io base images include this; we add it explicitly.
RUN apk add --no-cache tini

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma

# --frozen-lockfile: fails if lockfile is out of sync with package.json.
# This is critical in CI — ensures every build uses identical dependency tree.
# Meta/Google enforce this; "works on my machine" is eliminated.
RUN npm ci --frozen-lockfile

# =============================================================================
FROM node:20.19.1-alpine3.21 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Explicitly target linux/musl (Alpine) for Prisma binary.
# Without this, Prisma sometimes pulls wrong binary and crashes at runtime.
ENV PRISMA_CLI_BINARY_TARGETS="linux-musl-openssl-3.0.x"

RUN npx prisma generate
RUN npm run build

# Remove devDependencies — shrinks final image, reduces CVE surface area.
RUN npm prune --omit=dev

# =============================================================================
FROM node:20.19.1-alpine3.21 AS runner
WORKDIR /app

# Copy tini from deps stage
COPY --from=deps /sbin/tini /sbin/tini

ENV NODE_ENV=production
# Disable Node.js deprecation warnings in production logs (noise reduction)
ENV NODE_NO_WARNINGS=1

# Non-root user — industry standard.
# If container is compromised, attacker gets expressapp not root.
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 expressapp

COPY --from=builder --chown=expressapp:nodejs /app/dist ./dist
COPY --from=builder --chown=expressapp:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=expressapp:nodejs /app/package.json ./package.json
COPY --from=builder --chown=expressapp:nodejs /app/prisma ./prisma

USER expressapp

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Tini as PID 1 — forwards signals (SIGTERM) correctly to Node process.
# Without tini: Fly.io sends SIGTERM → Docker catches it, Node never gets it
# → container force-killed after timeout → active requests dropped.
ENTRYPOINT ["/sbin/tini", "--"]

# Migrations intentionally excluded — run as separate CI/CD step before deploy.
CMD ["node", "dist/src/server.js"]