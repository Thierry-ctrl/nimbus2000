# syntax=docker/dockerfile:1.7

# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

RUN npm install -g pnpm

WORKDIR /repo

# Vite bakes env vars into the static bundle at build time, so they must be
# passed as build args (not runtime env). Keep VITE_CLERK_PUBLISHABLE_KEY safe
# to ship — it is the publishable (public) Clerk key, not the secret.
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_CLERK_PROXY_URL=
ARG BASE_PATH=/

ENV VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY}
ENV VITE_CLERK_PROXY_URL=${VITE_CLERK_PROXY_URL}
ENV BASE_PATH=${BASE_PATH}
# vite.config.ts requires PORT during build even though no dev server runs
ENV PORT=8081

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/kigaliweshare run build

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

COPY artifacts/kigaliweshare/nginx.conf /etc/nginx/nginx.conf

COPY --from=builder /repo/artifacts/kigaliweshare/dist/public /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
