# KigaliWeShare

Mobile-first, invite-only PWA for neighbour-to-neighbour carpool matching in Kigali, Rwanda.

> Friendly cost-share between neighbours, not a paid taxi service. KigaliWeShare does **not** process payments and does **not** operate as a public transport company. Free rides are explicitly permitted under Rwandan transport law (RURA); paid public transport requires a license, so we deliberately stay out of that lane: drivers may receive a small fuel-cost contribution directly from riders (cash or MoMo), suggested by the app but never collected by it.

---

## What's in the box

### Trust & safety
- **Invite-only signup** — `KGL-…` codes seeded at launch (`KGL-DEMO`, `KGL-PILOT01-04`).
- **Clerk auth** + Replit-managed Clerk integration (no manual OAuth setup).
- **National-ID gating** — riders enter NIN at onboarding; admins toggle `idVerified`. NIN is **never** returned by the public API: `vehicleToApi` and `profileToApi` only include it on `/profile/me`.
- **Same-gender-only** trip flag (offered when posting; enforced when matching).
- **Block & report** dialog on trip detail → admin reports queue.
- **SOS button**: 5-second cancellable countdown before dialling 112 (RNP).

### Matching
- Origin × destination × date × time-window × seats search.
- **Match score** combines time-overlap, seat availability, driver rating, same-gender match.
- **Nearby suggestions**: when no exact match exists, surfaces same-origin trips whose destination is ≤ 6 km from the rider's target (via `corridors.distanceKm`).
- **Atomic seat approval** — `UPDATE … WHERE seatsRemaining > 0 RETURNING` prevents oversell on concurrent approvals.

### Cost-share calculator (legally compliant)
Per trip, the API computes a **suggested** fuel contribution:

```
fuelCost      = distanceKm × (consumptionLPer100Km / 100) × pricePerLitreRwf
perPassenger  = round100( min(
                  fuelCost / (numPassengers + 2),   // driver + on-board riders + asking rider
                  fuelCost / (seatsTotal + 1),      // driver + every advertised seat (equal-share floor)
                ) )
                  ↳ 0 if distanceKm < 3
```

The lower of the two divisors wins, so the driver is always carrying at
least their own equal seat-share — the platform never quotes a "fare", only
a friendly chip-in that can never exceed an equal split.

- Petrol: **2,938 RWF/L** · Diesel: **2,205 RWF/L** (config-driven, fuel-type aware via `vehicles.fuelType`).
- Distance from `corridors.distanceKm`; consumption from `vehicles.consumptionLPer100Km`.
- Surfaced on trip detail with the breakdown ("9 km · 7 L/100 km · 2,938 RWF/L ÷ 3 seats") plus the explicit disclaimer that the app doesn't process payments.

### Driver & rider flow
- **Post a trip**: origin, destination, date, departure + window-end time, pickup point, recurring (weekly batch), seats, same-gender flag, notes.
- **Reverse-trip CTA** in post-trip success.
- **WhatsApp** + **call** buttons on trip detail (driver phone revealed only after approval).
- **My rides** / **My trips** tabs; rating prompt banner after completion.

### PWA
- `manifest.webmanifest` + service worker (app-shell cache).
- A2HS prompt component on first sign-in.
- **Web Push** subscribe flow (VAPID) for trip approvals, departure reminders, SOS escalations.
- Optional **SMTP email** delivery (no-op without `SMTP_*` env config) via nodemailer.

### Admin console
- Metrics tab: weekly aggregates, corridor activity, match rate, totals.
- Reports queue (resolve / dismiss with note).
- Invite analytics + CSV export.
- ID-verification toggle on user list.

### i18n
- EN / FR / RW scaffolding via i18next; `profiles.preferredLanguage` saved on the user.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite + Tailwind v4 + shadcn/ui, wouter routing |
| Auth | Clerk |
| API | Express + Drizzle ORM + Zod (OpenAPI-driven) |
| DB | Postgres 16 |
| Codegen | orval → `@workspace/api-client-react`, `@workspace/api-zod` |
| Push | `web-push` + VAPID |
| Email | `nodemailer` (optional) |
| Payments | MTN MoMo Collections API (gated by `serviceFeeEnabled` config) |
| Deploy | Docker Compose (Postgres + API + nginx) |

Monorepo managed by **pnpm** workspaces. Each artifact (`api-server`, `kigaliweshare`, `mockup-sandbox`) has its own dev workflow.

---

## Local dev

The three workflows run automatically:
- `artifacts/api-server: API Server` → Express on `$PORT` (default `:8080`).
- `artifacts/kigaliweshare: web` → Vite dev server.
- `artifacts/mockup-sandbox: Component Preview Server` → component playground.

After editing `lib/api-spec/openapi.yaml`, regenerate the typed client:

```bash
pnpm --filter @workspace/api-spec run codegen
```

After editing `lib/db/src/schema/*`:

```bash
pnpm --filter @workspace/db run db:push --force
```

Workspace-wide typecheck:

```bash
pnpm -w run typecheck
```

---

## Self-hosted deployment

The stack runs as three Docker containers (Postgres, Express API, nginx PWA) behind a Caddy reverse proxy.

### 1. Prerequisites

- Ubuntu server (tested on 22.04 / 24.04)
- Docker + Docker Compose v2
- Caddy installed (`apt install caddy`)
- A domain/subdomain with its DNS A record pointing to the server IP
- A **Clerk Production** instance (test keys do **not** work on custom domains — see Gotchas)

### 2. Clone and configure

```bash
git clone https://github.com/Thierry-ctrl/nimbus2000.git
cd nimbus2000
cp .env.example .env
nano .env          # fill in all required values — see Gotchas re: inline comments
```

### 3. Required env vars

| Key | Notes |
|---|---|
| `POSTGRES_PASSWORD` | Required — any long random string |
| `CLERK_SECRET_KEY` | `sk_live_…` from Clerk Production dashboard |
| `CLERK_PUBLISHABLE_KEY` | `pk_live_…` — needed by the **API server** |
| `VITE_CLERK_PUBLISHABLE_KEY` | Same `pk_live_…` key — baked into the **frontend bundle at build time** |
| `VAPID_PUBLIC_KEY` | Generate once: `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | As above |
| `MOMO_CALLBACK_URL` | `https://<your-domain>/api/payments/callback` |
| `WEB_PORT` | Set to `8000` when running behind Caddy (avoids port 80 conflict) |

### 4. Caddy reverse proxy

Create `/etc/caddy/Caddyfile`:

```
your-subdomain.example.com {
    reverse_proxy localhost:8000
}
```

```bash
systemctl start caddy
systemctl enable caddy
```

Caddy auto-provisions SSL via Let's Encrypt. No manual cert steps needed.

### 5. Clerk DNS records

In your DNS provider, add these CNAME records (replace `kigaliweshare` with your subdomain name):

| Name | Value |
|---|---|
| `clerk.kigaliweshare` | `frontend-api.clerk.services` |
| `accounts.kigaliweshare` | `accounts.clerk.services` |
| `clkmail.kigaliweshare` | `mail.<your-clerk-id>.clerk.services` |
| `clk._domainkey.kigaliweshare` | `dkim1.<your-clerk-id>.clerk.services` |
| `clk2._domainkey.kigaliweshare` | `dkim2.<your-clerk-id>.clerk.services` |

Exact values are shown in Clerk dashboard → Production → Domains.

### 6. Start the stack

```bash
# Bring up DB first
docker compose up -d db

# Push Drizzle schema
docker compose --profile migrate run --rm migrate

# Build and start everything
docker compose up -d --build

# Verify
curl https://your-subdomain.example.com/api/healthz
# → {"status":"ok"}
```

---

## Deployment gotchas

Hard-won lessons from the first production deployment — read before debugging.

### `.env` inline comments break values

`.env` does **not** support inline comments. Everything after `=` is the literal value.

```bash
# WRONG — Clerk receives "sk_test_abc # required" as the key
CLERK_SECRET_KEY=sk_test_abc                   # required — sk_test_… or sk_live_…

# CORRECT
CLERK_SECRET_KEY=sk_test_abc
```

This caused both the Clerk "publishable key is missing" 500 error and the Clerk "proxy URL is invalid" white-screen crash.

### Both Clerk keys are required on the API server

The API needs **two** Clerk env vars, not one:

```
CLERK_SECRET_KEY=sk_live_…        # verifies JWT tokens server-side
CLERK_PUBLISHABLE_KEY=pk_live_…   # used by Clerk SDK to initialise the JWKS endpoint
```

`VITE_CLERK_PUBLISHABLE_KEY` is a third, separate var — same value but used by Vite at **frontend build time**.

### Clerk test keys don't work on custom domains

`sk_test_` / `pk_test_` keys are locked to `localhost`. On any other hostname you get an infinite 307 redirect loop. Create a **Clerk Production instance** and use `sk_live_` / `pk_live_` keys for any deployed environment.

### Caddy and Docker nginx both want port 80

Set `WEB_PORT=8000` in `.env` so Docker's nginx binds to `8000` instead of `80`. Caddy then owns `80`/`443` and proxies to `localhost:8000`.

### Health endpoint is `/api/healthz` not `/api/health`

```bash
curl https://your-domain/api/healthz   # ✅ returns {"status":"ok"}
curl https://your-domain/api/health    # ❌ 404
```

### `VITE_*` env vars are baked in at build time

Any change to a `VITE_` variable requires a full frontend rebuild:

```bash
docker compose up -d --build web
```

Simply restarting the container is not enough — the old value is compiled into the JS bundle.

---


## Legal posture (Rwanda)

- **RURA Regulation N°004/Board/Rura/2018** governs public road passenger transport: paid services require a license and operate via licensed companies/cooperatives. **Free rides between private individuals are not regulated.**
- KigaliWeShare therefore:
  - Never collects, holds, or routes money.
  - Surfaces the cost-share figure as a **suggestion**, computed from fuel consumption, not as a fare.
  - Caps the per-passenger amount at an equal split of fuel cost so the driver always pays at least their share.
  - Returns 0 RWF for trips < 3 km (truly local lifts).
  - Records all rides for ratings + safety, but transactions remain off-platform (cash / MoMo).

If RURA later issues guidance on ride-sharing platforms, the calculator can be disabled via the `fuelShareEnabled` config key without a code change.

---

## Payment architecture

KigaliWeShare uses a **two-transaction model**:

1. **Fuel share** flows directly from rider to driver, **off-platform**. The app surfaces a suggested amount; the rider sends MoMo P2P or hands over cash. The platform never sees, holds, or routes this money. This keeps KigaliWeShare outside BNR Regulation N° 74/2023 (Payment Service Provider licensing).
2. **Service fee** (rider → KigaliWeShare, **on-platform**) is collected via the [MTN MoMo Collections API](https://momodeveloper.mtn.com). This is the platform's only revenue.

The two amounts are **never combined** into a single charge or rendered as a single "total" anywhere in the API or UI. Riders see two distinct line items: "Fuel share — paid to driver" and "Service fee — paid to KigaliWeShare". This is a hard architectural rule, not a UI choice — see `CONTRIBUTING.md` §Architectural rules.

The full monetization roadmap, license/registration checklist, and rollout plan live in [`KigaliWeShare_Monetization_Plan.md`](KigaliWeShare_Monetization_Plan.md).

---

## Configuration (`platformConfig` keys)

Stored in the `config` table; mutable at runtime via the admin Config tab. Numbers are stored as strings and coerced.

| Key | Default | What it does |
|---|---|---|
| `fuelPriceRwfPerLitre` | `2938` | Petrol price used by the fuel-share calculator |
| `dieselPriceRwfPerLitre` | `2205` | Diesel price (per `vehicles.fuelType`) |
| `vehicleConsumptionLPer100Km` | `8` | Default consumption when a driver hasn't filled it on their vehicle |
| `serviceFeeEnabled` | `false` | **Kill switch**. While `false`, the entire fee surface area is hidden (no fee fields in API responses, no fee UI). Required for backward compatibility during pre-monetization pilot. |
| `serviceFeePct` | `25` | Percentage of the per-rider fuel share charged as service fee |
| `serviceFeeMinRwf` | `50` | Floor — fees below this are bumped up |
| `serviceFeeMaxRwf` | `5000` | Cap — fees above this are clamped down |
| `serviceFeeFreeKm` | `3` | No fee for trips shorter than this distance |

---

## Repo map

```
artifacts/
  api-server/         # Express API
    src/
      routes/         # trips, requests, invites, profile, admin, reports, notifications, payments
      lib/            # auth, db, notify, fuel-share, serializers, momo
  kigaliweshare/      # PWA frontend
    src/
      pages/          # find, post-trip, trip-detail, dashboard, profile, admin, my-*
      components/     # SOSButton, ReportUserDialog, PwaBootstrap, AppLayout, MoMoPaymentFlow
      lib/            # auth-utils, format, api client wiring
    public/           # manifest.webmanifest, service-worker.ts, icons
  mockup-sandbox/     # component preview server (canvas iframes)
lib/
  api-spec/           # openapi.yaml + orval config
  api-client-react/   # generated react-query hooks
  api-zod/            # generated zod schemas
  db/                 # drizzle schema
```

---

## Roadmap (post-pilot)

- French + Kinyarwanda translation pass (scaffolding live, copy pending).
- Empty-state KigaliMark illustrations.
- SMS fallback (Africa's Talking) when push isn't subscribed.
- Driver dashboard: weekly fuel savings vs solo driving.
