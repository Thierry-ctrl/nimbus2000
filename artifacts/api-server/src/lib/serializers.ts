import { db } from "./db";
import {
  ratings,
  trips,
  rideRequests,
  vehicles,
  profiles,
  neighborhoods,
  corridors,
} from "@workspace/db";
import { and, avg, count, eq, sql } from "drizzle-orm";
import { computeFuelShare, calculateServiceFee } from "./fuel-share";
import { getConfigValue, getServiceFeeConfig } from "./config";

const FEE_DISCLAIMER =
  "The fuel share goes directly to your driver. The service fee supports KigaliWeShare. We never collect or hold the fuel share.";

/**
 * Build the rider-facing fee breakdown. Returns null when monetization is
 * disabled OR the trip is too short to charge. The fuel share and service
 * fee MUST stay separate fields — totalRiderPaysRwf is shown for transparency
 * but is NEVER collected as a single charge.
 */
function buildFeeBreakdown(
  perRiderFuelShareRwf: number,
  serviceFeeRwf: number,
  feePct: number,
) {
  return {
    fuelShareRwf: Math.round(perRiderFuelShareRwf),
    serviceFeeRwf,
    totalRiderPaysRwf: Math.round(perRiderFuelShareRwf) + serviceFeeRwf,
    feePercentage: feePct,
    disclaimerText: FEE_DISCLAIMER,
  };
}

async function computeTripFuelShare(t: typeof trips.$inferSelect) {
  const [c] = await db
    .select()
    .from(corridors)
    .where(
      and(
        eq(corridors.originId, t.originId),
        eq(corridors.destinationId, t.destinationId),
      ),
    );
  if (!c) return null;
  const [v] = await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.userId, t.driverId));
  const cons =
    v?.consumptionLPer100Km !== null && v?.consumptionLPer100Km !== undefined
      ? Number(v.consumptionLPer100Km)
      : await getConfigValue("vehicleConsumptionLPer100Km");
  const price =
    v?.fuelType === "diesel"
      ? await getConfigValue("dieselPriceRwfPerLitre")
      : await getConfigValue("fuelPriceRwfPerLitre");
  const numPassengers = Math.max(0, t.seatsTotal - t.seatsRemaining);
  return computeFuelShare({
    distanceKm: Number(c.distanceKm),
    consumptionLPer100Km: cons,
    pricePerLitreRwf: price,
    numPassengers,
    seatsTotal: t.seatsTotal,
  });
}

export async function getUserStats(userId: string) {
  const [ratingRow] = await db
    .select({
      avg: avg(ratings.stars),
      n: count(ratings.id),
    })
    .from(ratings)
    .where(eq(ratings.toUserId, userId));

  const [driverDone] = await db
    .select({ n: count(trips.id) })
    .from(trips)
    .where(and(eq(trips.driverId, userId), eq(trips.status, "completed")));

  const [riderDone] = await db
    .select({ n: count(rideRequests.id) })
    .from(rideRequests)
    .where(
      and(
        eq(rideRequests.riderId, userId),
        eq(rideRequests.status, "completed"),
      ),
    );

  return {
    averageRating: ratingRow?.avg ? Number(ratingRow.avg) : null,
    completedTrips: Number(driverDone?.n ?? 0) + Number(riderDone?.n ?? 0),
  };
}

export function vehicleToApi(
  v: typeof vehicles.$inferSelect | null | undefined,
  opts: { includePrivate?: boolean } = {},
) {
  if (!v) return null;
  return {
    id: v.id,
    make: v.make,
    model: v.model,
    color: v.color,
    plate: v.plate,
    seats: v.seats,
    photoUrl: v.photoUrl,
    nationalId: opts.includePrivate ? v.nationalId : null,
    fuelType: v.fuelType,
    consumptionLPer100Km:
      v.consumptionLPer100Km !== null && v.consumptionLPer100Km !== undefined
        ? Number(v.consumptionLPer100Km)
        : null,
  };
}

export async function tripToApi(
  t: typeof trips.$inferSelect,
  opts: { driver?: typeof profiles.$inferSelect } = {},
) {
  let driverName = "Driver";
  let driverRating: number | null = null;
  if (opts.driver) {
    driverName = opts.driver.fullName;
  } else {
    const [d] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, t.driverId));
    if (d) driverName = d.fullName;
  }
  const [origin] = await db
    .select()
    .from(neighborhoods)
    .where(eq(neighborhoods.id, t.originId));
  const [dest] = await db
    .select()
    .from(neighborhoods)
    .where(eq(neighborhoods.id, t.destinationId));
  const stats = await getUserStats(t.driverId);
  driverRating = stats.averageRating;
  const fuelShare = await computeTripFuelShare(t);

  // Fee breakdown — only included when monetization is enabled AND the trip
  // has a non-zero fuel share. When disabled, all fee fields stay null so
  // the response is byte-for-byte equivalent to the pre-monetization shape.
  const feeCfg = await getServiceFeeConfig();
  let serviceFeePerRider: number | null = null;
  let feeBreakdown: ReturnType<typeof buildFeeBreakdown> | null = null;
  if (feeCfg.enabled && fuelShare && fuelShare.perPassengerRwf > 0) {
    const fee =
      t.serviceFeePerRider ??
      calculateServiceFee(
        fuelShare.perPassengerRwf,
        fuelShare.distanceKm,
        feeCfg,
      );
    serviceFeePerRider = fee;
    feeBreakdown =
      fee > 0
        ? buildFeeBreakdown(fuelShare.perPassengerRwf, fee, feeCfg.pct)
        : null;
  }

  return {
    id: t.id,
    driverId: t.driverId,
    driverName,
    driverRating,
    originId: t.originId,
    originName: origin?.name ?? "",
    destinationId: t.destinationId,
    destinationName: dest?.name ?? "",
    departureDate: t.departureDate,
    departureTime: t.departureTime,
    windowEndTime: t.windowEndTime,
    pickupPoint: t.pickupPoint,
    flexMinutes: t.flexMinutes,
    seatsTotal: t.seatsTotal,
    seatsRemaining: t.seatsRemaining,
    sameGenderOnly: t.sameGenderOnly,
    notes: t.notes,
    status: t.status,
    cancelReason: t.cancelReason,
    fuelShare,
    serviceFeePerRider,
    feeBreakdown,
  };
}

export async function rideRequestToApi(
  r: typeof rideRequests.$inferSelect,
  opts: { revealPhone?: boolean; includeTrip?: boolean } = {},
) {
  const [rider] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, r.riderId));
  const stats = rider ? await getUserStats(rider.userId) : null;
  let riderNeighborhood: string | null = null;
  if (rider) {
    const [n] = await db
      .select()
      .from(neighborhoods)
      .where(eq(neighborhoods.id, rider.neighborhoodId));
    riderNeighborhood = n?.name ?? null;
  }
  let trip = null;
  let feeBreakdown: ReturnType<typeof buildFeeBreakdown> | null = null;
  if (opts.includeTrip) {
    const [t] = await db.select().from(trips).where(eq(trips.id, r.tripId));
    if (t) trip = await tripToApi(t);
  }

  // Per-request fee breakdown (only when monetization on AND fee is non-zero).
  const feeCfg = await getServiceFeeConfig();
  if (feeCfg.enabled && r.serviceFeeAmount > 0) {
    const [t] = await db.select().from(trips).where(eq(trips.id, r.tripId));
    if (t) {
      const share = await computeTripFuelShare(t);
      if (share && share.perPassengerRwf > 0) {
        feeBreakdown = buildFeeBreakdown(
          share.perPassengerRwf,
          r.serviceFeeAmount,
          feeCfg.pct,
        );
      }
    }
  }

  return {
    id: r.id,
    tripId: r.tripId,
    riderId: r.riderId,
    riderName: rider?.fullName ?? "",
    riderRating: stats?.averageRating ?? null,
    riderGender: rider?.gender ?? "prefer_not_to_say",
    riderPhone: opts.revealPhone ? rider?.phone ?? null : null,
    riderNeighborhood,
    pickupPoint: r.pickupPoint,
    notes: r.notes,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    serviceFeeAmount: feeCfg.enabled ? r.serviceFeeAmount : null,
    serviceFeeStatus: feeCfg.enabled ? r.serviceFeeStatus : null,
    feeBreakdown,
    trip,
  };
}
