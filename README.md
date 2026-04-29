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
| Frontend | React + Vite + Tailwind + shadcn/ui, wouter routing |
| Auth | Clerk (Replit-managed) |
| API | Express + Drizzle ORM + Zod (OpenAPI-driven) |
| DB | Postgres (Replit-managed) |
| Codegen | orval → `@workspace/api-client-react`, `@workspace/zod` |
| Push | `web-push` + VAPID |
| Email | `nodemailer` (optional) |

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

## Required secrets

Stored as Replit Secrets (never commit):

| Key | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection (auto-provided) |
| `CLERK_SECRET_KEY` / `VITE_CLERK_PUBLISHABLE_KEY` | Auth (auto via integration) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push (generate with `npx web-push generate-vapid-keys`) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | _(optional)_ email delivery |

`VAPID_*` were previously checked into `.replit` shared env — they have been removed and must be re-issued as Replit Secrets.

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

## Repo map

```
artifacts/
  api-server/         # Express API
    src/
      routes/         # trips, requests, invites, profile, admin, reports, notifications
      lib/            # auth, db, notify, fuel-share, serializers
  kigaliweshare/      # PWA frontend
    src/
      pages/          # find, post-trip, trip-detail, dashboard, profile, admin, my-*
      components/     # SOSButton, ReportUserDialog, PwaBootstrap, AppLayout
      lib/            # auth-utils, format, api client wiring
    public/           # manifest.webmanifest, service-worker.ts, icons
  mockup-sandbox/     # component preview server (canvas iframes)
lib/
  api-spec/           # openapi.yaml + orval config
  api-client-react/   # generated react-query hooks
  db/                 # drizzle schema + migrations
  zod/                # generated zod schemas
```

---

## Roadmap (post-pilot)

- French + Kinyarwanda translation pass (scaffolding live, copy pending).
- Empty-state KigaliMark illustrations.
- SMS fallback (Africa's Talking) when push isn't subscribed.
- Driver dashboard: weekly fuel savings vs solo driving.
