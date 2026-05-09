# Contributing to KigaliWeShare

This is a young codebase with strong opinions about a few things — read this before you open a PR.

## Prerequisites

- **Node 24** (matches the runtime; the Docker images and the API server are pinned to it)
- **pnpm 10+** (enforced via `.npmrc` — `npm install` will fail by design)
- A PostgreSQL 16 instance reachable via `DATABASE_URL`. Easiest is `docker compose up -d db` from the repo root.
- A [Clerk](https://dashboard.clerk.com) project (test keys are fine for local dev)

## First-time setup

```bash
git clone <repo>
cd nimbus2000
cp .env.example .env                          # then fill in CLERK_*, VAPID_*, POSTGRES_PASSWORD
pnpm install
docker compose up -d db                       # starts postgres on the docker network
docker compose --profile migrate run --rm migrate   # pushes the Drizzle schema
pnpm --filter @workspace/api-server run start:seed  # seed neighborhoods, corridors, invite codes
```

Then in three terminals:

```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/kigaliweshare run dev
pnpm --filter @workspace/mockup-sandbox run dev      # only if you're iterating on UI primitives
```

## How the monorepo fits together

```
lib/
  api-spec/           # OpenAPI 3.1 spec — single source of truth
  api-zod/            # GENERATED — Zod validators (do not edit)
  api-client-react/   # GENERATED — React Query hooks (do not edit)
  db/                 # Drizzle schema + pg pool
artifacts/
  api-server/         # Express + Drizzle + Zod + esbuild bundle
  kigaliweshare/      # React 19 PWA (Vite)
  mockup-sandbox/     # Component playground
```

Cross-workspace imports use `@workspace/*` aliases (e.g. `@workspace/db`).

### The OpenAPI loop

1. Edit `lib/api-spec/openapi.yaml`.
2. Run `pnpm --filter @workspace/api-spec run codegen`.
3. Both `lib/api-zod` and `lib/api-client-react` regenerate. The frontend gets new typed React Query hooks; the backend gets new Zod validators.
4. Implement the route in `artifacts/api-server/src/routes/`.
5. Consume the hook in the frontend.

**Never edit files in `lib/api-zod/` or `lib/api-client-react/` directly** — they will be overwritten on the next codegen run.

### The Drizzle loop

1. Edit `lib/db/src/schema/index.ts`.
2. Run `pnpm --filter @workspace/db run push` (or `push-force` if Drizzle prompts about destructive changes).
3. New columns/tables are now available via `db.select()` etc.

There is no migrations folder — schema is managed via `drizzle-kit push`. This is fine for the current pilot; for production with real user data, switch to a migration-based workflow before you start losing data.

## Branch + PR conventions

- `feat/...` for new functionality
- `fix/...` for bug fixes
- `chore/...` for tooling, deps, refactors
- A PR must pass `pnpm -w run typecheck` before review
- A PR that changes API request/response shapes MUST update `lib/api-spec/openapi.yaml` and check in the regenerated `lib/api-zod` + `lib/api-client-react` outputs
- A PR that changes DB schema MUST update `lib/db/src/schema/index.ts` and (if the deployment target is real users) include a thought-out migration plan in the description

## Architectural rules — read before changing payment, fee, or seat logic

These rules are why this codebase looks the way it does. Don't quietly relax any of them.

1. **Fuel share and service fee MUST stay separate.** They are computed by separate functions (`computeFuelShare` vs `calculateServiceFee`), they appear as separate fields in API responses (`fuelShare`, `feeBreakdown.serviceFeeRwf`), and they are rendered in separate visual blocks in the UI. The legal distinction between cost-sharing (off-platform) and a platform service charge (on-platform) is the entire regulatory defense. Don't merge them into a single "total" anywhere. Period.

2. **Driver money never flows through the platform.** No code path may route, hold, or disburse the rider's fuel share. The rider pays the driver directly via MoMo P2P or cash; KigaliWeShare only collects its own service fee.

3. **`serviceFeeEnabled` is the kill switch.** When this `config` key is `false`, the entire fee surface area must vanish — no fee fields in API responses, no fee UI, no fee collection. The app must look identical to its pre-monetization state. Test backward compatibility before merging anything that touches fees.

4. **Atomic seat approval is sacred.** `UPDATE … WHERE seatsRemaining > 0 RETURNING` runs inside a transaction with the request status flip. Do NOT make seat approval conditional on fee payment success — approve the seat, collect the fee after.

5. **NIN never leaves `/profile/me`.** The national ID is only ever returned for the requesting user themselves. Do not add it to public endpoints, don't include it in serializers that other users will see.

6. **Invite-only signup gate stays.** `KGL-…` codes are the cold-start mechanism and the trust layer. Don't remove or weaken the gate.

7. **Fuel share formula is legally validated** — don't modify the math in `lib/fuel-share.ts::computeFuelShare`. If you need to change it, talk to legal first.

## Secrets

`.env.example` enumerates every env var. Copy to `.env`, fill in values, and **don't commit it** — `.gitignore` already excludes it. For production, store secrets in your hosting platform's secret manager rather than a `.env` file on disk where possible.

## Where things live

- The MoMo Collections client: `artifacts/api-server/src/lib/momo.ts`
- The fee/payment routes: `artifacts/api-server/src/routes/payments.ts`
- The fee-aware serializers: `artifacts/api-server/src/lib/serializers.ts`
- The MoMo flow UI: `artifacts/kigaliweshare/src/components/MoMoPaymentFlow.tsx`
- The architecture/regulatory plan: `KigaliWeShare_Monetization_Plan.md`
- The Claude Code briefing: `CLAUDE.md`

## Asking questions

Open a Discussion on the repo. Tag the maintainer if it blocks your PR.
