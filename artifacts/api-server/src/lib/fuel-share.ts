/**
 * Fuel-share calculator for KigaliWeShare.
 *
 * Implements a *cost-sharing* split (not a fare) so the platform stays
 * outside RURA's commercial-transport definition:
 *
 *   - The driver was going to make this trip anyway.
 *   - The total fuel cost is split equally per seat (driver counts as one).
 *   - Per-rider contribution is therefore fuelCost / (numPassengers + 1).
 *   - Hard caps make it impossible for the driver to come out ahead.
 *   - Very short trips return zero (friction > value below ~3km).
 *   - Result is rounded to nearest 100 RWF for cash-friendliness.
 */

export interface FuelShareInput {
  distanceKm: number;
  consumptionLPer100Km: number;
  pricePerLitreRwf: number;
  numPassengers: number; // riders currently on board (excluding the driver and the asking rider)
  seatsTotal: number; // total rider seats the driver advertised (excluding driver)
}

export interface FuelShareResult {
  distanceKm: number;
  pricePerLitreRwf: number;
  consumptionLPer100Km: number;
  fuelCostRwf: number;
  perPassengerRwf: number;
  driverPaysRwf: number;
  totalRiderShareRwf: number;
}

const round100 = (n: number) => Math.round(n / 100) * 100;

export function computeFuelShare(input: FuelShareInput): FuelShareResult {
  const distanceKm = Math.max(0, Number(input.distanceKm) || 0);
  const cons = Math.max(0, Number(input.consumptionLPer100Km) || 0);
  const price = Math.max(0, Number(input.pricePerLitreRwf) || 0);
  const numPassengers = Math.max(0, Math.floor(input.numPassengers));
  const seatsTotal = Math.max(1, Math.floor(input.seatsTotal));

  const fuelCostRwf = Math.round(distanceKm * (cons / 100) * price);

  // Two divisors:
  //  - currentDivisor (driver + rider asking + riders already aboard) reflects
  //    today's reality if we suggested a contribution to the next rider.
  //  - fullDivisor (driver + every advertised seat) is the floor the driver
  //    targeted when posting; a rider should never pay more than this share.
  // We take the lower of the two so the driver always carries at least an
  // equal seat-share — the platform never quotes a "fare", only a friendly
  // chip-in that can never exceed an equal split.
  const currentDivisor = numPassengers + 2; // driver + asking rider + on-board
  const fullDivisor = seatsTotal + 1; // driver + every advertised seat
  const rawCurrent = fuelCostRwf / currentDivisor;
  const rawFull = fuelCostRwf / fullDivisor;
  const rawCap = Math.min(rawCurrent, rawFull);
  const perSeat = round100(rawCap);

  // Hide tiny amounts (< 100 RWF or < 3km) — frame as a friendly lift.
  const tooShort = distanceKm < 3;
  const perPassengerRwf = tooShort ? 0 : Math.min(perSeat, Math.floor(rawCap));
  const totalRiderShareRwf = perPassengerRwf * numPassengers;
  const driverPaysRwf = Math.max(0, fuelCostRwf - totalRiderShareRwf);

  return {
    distanceKm,
    pricePerLitreRwf: price,
    consumptionLPer100Km: cons,
    fuelCostRwf,
    perPassengerRwf,
    driverPaysRwf,
    totalRiderShareRwf,
  };
}

// ─── Service fee ──────────────────────────────────────────────────────────────
// The platform service fee is computed as a percentage of the per-rider fuel
// share. It is INTENTIONALLY a separate function — the fuel share is a
// cost-sharing computation (off-platform); the service fee is a platform
// charge (on-platform). They must never be combined into a single number in
// any API response, UI rendering, or computation. This separation is the
// regulatory boundary KigaliWeShare relies on. See
// KigaliWeShare_Monetization_Plan.md, Part 4 §4.1.

export interface ServiceFeeConfigInput {
  enabled: boolean;
  pct: number;
  minRwf: number;
  maxRwf: number;
  freeKm: number;
}

export function calculateServiceFee(
  fuelSharePerRider: number,
  distanceKm: number,
  cfg: ServiceFeeConfigInput,
): number {
  if (!cfg.enabled) return 0;
  if (fuelSharePerRider <= 0) return 0;
  if (distanceKm < cfg.freeKm) return 0;

  const raw = (fuelSharePerRider * cfg.pct) / 100;
  const rounded = round100(raw);
  if (rounded < cfg.minRwf) return cfg.minRwf;
  if (rounded > cfg.maxRwf) return cfg.maxRwf;
  return rounded;
}
