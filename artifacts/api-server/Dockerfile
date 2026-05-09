# syntax=docker/dockerfile:1.7

# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

RUN npm install -g pnpm

# Satisfies the root package.json preinstall guard that checks npm_config_user_agent.
ENV npm_config_user_agent="pnpm/docker"

WORKDIR /repo

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api-server run build

# Strip dev deps to shrink the node_modules we copy into the runtime image.
# pino transports + nodemailer (externalized by esbuild) still need to be
# resolvable at runtime, so we can't ship without node_modules entirely.
RUN pnpm prune --prod

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime

RUN apk add --no-cache tini

WORKDIR /app

COPY --from=builder --chown=node:node /repo/artifacts/api-server/dist ./dist
COPY --from=builder --chown=node:node /repo/artifacts/api-server/package.json ./
COPY --from=builder --chown=node:node /repo/node_modules ./node_modules

USER node

ENV NODE_ENV=production
EXPOSE 8080

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.mjs"]
