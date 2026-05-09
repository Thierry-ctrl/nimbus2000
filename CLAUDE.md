# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**KigaliWeShare** is a mobile-first, invite-only PWA for neighbor-to-neighbor carpool matching in Kigali, Rwanda. It is legally positioned as cost-sharing (not a taxi service). The stack is a pnpm monorepo with an Express API, React 19 PWA, and shared TypeScript libraries driven by a single OpenAPI spec.

## Commands

### Workspace-level
```bash
pnpm run build          # typecheck all + build all artifacts
pnpm run typecheck      # full workspace typecheck
pnpm run typecheck:libs # typecheck lib packages only
```

### API server (`artifacts/api-server`)
```bash
pnpm --filter @workspace/api-server run dev        # build + start with watch
pnpm --filter @workspace/api-server run build      # esbuild → dist/index.mjs
pnpm --filter @workspace/api-server run start      # run built server
pnpm --filter @workspace/api-server run typecheck
```

### Frontend (`artifacts/kigaliweshare`)
```bash
pnpm --filter @workspace/kigaliweshare run dev     # Vite dev server
pnpm --filter @workspace/kigaliweshare run build   # Vite production build
pnpm --filter @workspace/kigaliweshare run typecheck
```

### Component sandbox (`artifacts/mockup-sandbox`)
```bash
pnpm --filter @workspace/mockup-sandbox run dev
```

### Code generation (run after editing `lib/api-spec/openapi.yaml`)
```bash
pnpm --filter @workspace/api-spec run codegen      # regenerates api-zod + api-client-react
```

### Database
```bash
pnpm --filter @workspace/db run push               # Drizzle push (dev)
pnpm --filter @workspace/db run push-force         # force push schema
```

### Docker (production deployment)
```bash
docker compose up -d db                            # bring up Postgres only
docker compose --profile migrate run --rm migrate  # run Drizzle schema push
docker compose up -d --build                       # build + start full stack
```

## Architecture

### Monorepo layout

```
lib/
  api-spec/           # OpenAPI 3.1.0 spec (single source of truth) + orval config
  api-zod/            # Generated Zod schemas — DO NOT edit manually
  api-client-react/   # Generated React Query hooks — DO NOT edit manually
  db/                 # Drizzle ORM schema + PostgreSQL connection pool
artifacts/
  api-server/         # Express.js backend
  kigaliweshare/      # React 19 PWA (the main app)
  mockup-sandbox/     # Component preview environment
```

### Data flow

1. **`lib/api-spec/openapi.yaml`** is the contract between frontend and backend.
2. Running `codegen` generates `lib/api-zod` (request/response validators) and `lib/api-client-react` (React Query hooks with auth token injection).
3. The API server uses the Zod schemas for runtime validation; the frontend uses the React Query hooks.
4. Auth is handled by **Clerk** — the backend middleware validates Bearer tokens; the frontend injects them via `lib/api-client-react/src/custom-fetch.ts` (`setAuthTokenGetter()`).

### Backend (`artifacts/api-server`)

- **Entry**: `src/index.ts` → `src/app.ts` (Express factory)
- **Routes**: `src/routes/index.ts` mounts all route files; domain modules cover `health`, `invites`, `profile`, `catalog`, `trips`, `requests`, `ratings`, `dashboard`, `admin`, `reports`, `notifications`. Payments will be added under `routes/payments.ts`.
- **Notable lib modules**: `fuel-share.ts` (cost-share algorithm), `serializers.ts` (DB → API response transforms), `recurring.ts` (recurring trip materialization), `notify.ts` (VAPID web push + optional SMTP). MoMo integration lives in `lib/momo.ts`.
- **Build**: esbuild bundles to ESM (`dist/index.mjs`) with pino transport support

### Frontend (`artifacts/kigaliweshare`)

- **Routing**: Wouter (`<Switch>` / `<Route>`) configured in `src/App.tsx`
- **Auth**: Clerk provider → `RequireProfile` wrapper (`src/lib/auth-utils.tsx`) guards authenticated routes
- **Server state**: React Query (configured in `src/lib/queryClient.ts`)
- **UI**: Tailwind CSS v4 + Radix UI + shadcn/ui components in `src/components/ui/`
- **PWA**: `PwaBootstrap.tsx` handles A2HS prompt and service worker registration
- **Key safety feature**: `SOSButton.tsx` — 5-second countdown before dialing 112

### Database

- PostgreSQL 16, Drizzle ORM, no migrations folder — schema is managed via `drizzle-kit push`
- All schema + the `db` Drizzle instance are exported from `lib/db/src/index.ts`

## Monetization & Regulatory Architecture

The full plan lives in `KigaliWeShare_Monetization_Plan.md`; the implementation roadmap is `claude_code_prompt.md`. The rules below MUST hold regardless of which phase is being implemented.

### Two-transaction payment model — non-negotiable

1. **Fuel share** (rider → driver, off-platform). Rider pays the driver directly via MoMo P2P or cash. The platform NEVER touches this money. This keeps KigaliWeShare outside BNR Regulation N° 74/2023 (Payment Service Provider licensing).
2. **Service fee** (rider → KigaliWeShare, on-platform). Collected separately via MTN MoMo Collections API. This is the platform's only revenue.

### Rules that must always hold

- **Fuel share and service fee MUST stay separate** in code (`calculateFuelShare` vs `calculateServiceFee`), in API responses (separate fields, never a single `total`), and in UI (separate visual blocks with clear labels). The legal distinction between cost-sharing and a platform charge is the entire regulatory defense.
- **`serviceFeeEnabled` config flag** in `platformConfig` controls all fee logic. When `false`, the app must behave identically to today (no fee fields in responses, no fee UI). This is the kill switch for monetization.
- **Driver money never flows through the platform.** No code path may route, hold, or disburse the fuel share.
- **NIN is never exposed in any public API response.** Only `/profile/me` may return the requesting user's own NIN.
- **Atomic seat approval** (`UPDATE ... WHERE seatsRemaining > 0 RETURNING`) must NOT be made conditional on fee payment success. Approve the seat first; collect the fee after.
- **Invite-only signup gate stays.** Do not remove or weaken `KGL-…` invite code validation.
- **Fuel share formula is legally validated** — do not modify the calculation in `lib/fuel-share.ts`.
- **Data residency**: PostgreSQL data must remain in Rwanda OR be covered by NCSA overseas-storage authorization. The Docker stack pins data to a local volume on whichever host runs it.

### MoMo integration env vars (used by `artifacts/api-server/src/lib/momo.ts`)

```
MOMO_COLLECTION_PRIMARY_KEY    # MoMo Collections API subscription key
MOMO_COLLECTION_API_USER       # OAuth2 API user UUID
MOMO_COLLECTION_API_KEY        # OAuth2 API key
MOMO_CALLBACK_URL              # Public webhook URL (POST /api/payments/callback)
MOMO_TARGET_ENVIRONMENT        # "sandbox" or "rwandamtn"
MOMO_CURRENCY                  # always "RWF"
```

## Deployment

The stack is deployed via Docker Compose on a self-hosted server (currently DigitalOcean 4 vCPU / 8 GB). Three services: `db` (Postgres 16), `api` (Express bundle), `web` (nginx serving the built PWA + reverse-proxying `/api` to the api container). Postgres is not exposed to the host; only `web:80` is reachable externally. See `docker-compose.yml` and `.env`.

## Key Constraints

- **OpenAPI is the single source of truth**: changes to request/response shapes must start in `lib/api-spec/openapi.yaml` followed by `codegen`. Do not edit files in `lib/api-zod/` or `lib/api-client-react/` directly.
- **Ports**: API server on `8080`, Vite dev server on `8081`, Replit preview on `26119`.
- **Package manager**: pnpm only (enforced via `.npmrc`). All workspace packages are private (`@workspace/*`).
- **TypeScript**: strict mode, ES2022 target, `moduleResolution: bundler` (set in `tsconfig.base.json`).
