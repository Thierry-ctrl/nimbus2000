# syntax=docker/dockerfile:1.7

# ── Build stage ──────────────────────────────────────────────────────────────
# Keeps all dev deps (drizzle-kit, etc.) so the `migrate` compose service
# can target this stage and still find drizzle-kit.
FROM node:24-alpine AS builder

RUN npm install -g pnpm@10.33.0

# Satisfies the root package.json preinstall guard that checks npm_config_user_agent.
ENV npm_config_user_agent="pnpm/docker"

WORKDIR /repo

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api-server run build

# ── Prune stage ───────────────────────────────────────────────────────────────
# Strips dev deps so the runtime image is smaller. Separate from builder so
# that the migrate service (target: builder) still has drizzle-kit available.
FROM builder AS pruned

RUN pnpm prune --prod --config.confirmModulesPurge=false

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime

RUN apk add --no-cache tini

WORKDIR /app

COPY --from=pruned --chown=node:node /repo/artifacts/api-server/dist ./dist
COPY --from=pruned --chown=node:node /repo/artifacts/api-server/package.json ./
COPY --from=pruned --chown=node:node /repo/node_modules ./node_modules

USER node

ENV NODE_ENV=production
EXPOSE 8080

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.mjs"]
