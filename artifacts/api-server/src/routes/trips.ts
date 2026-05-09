import { Router, type IRouter } from "express";
import { requireAuth, requireVerified, type AuthedRequest } from "../lib/auth";
import { db } from "../lib/db";
import {
  trips,
  recurringTrips,
  rideRequests,
  vehicles,
  profiles,
  neighborhoods,
  corridors,
} from "@workspace/db";
import { and, asc, desc, eq, gte, lt, ne, sql } from "drizzle-orm";
import {
  tripToApi,
  vehicleToApi,
  rideRequestToApi,
  getUserStats,
} from "../lib/serializers";
import { computeFuelShare, calculateServiceFee } from "../lib/fuel-share";
import { getConfigValue, getServiceFeeConfig } from "../lib/config";

const router: IRouter = Router();

function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

router.get("/trips", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const scope = (req.query.scope as string) || "upcoming";
  const today = todayDateStr();
  const conds = [eq(trips.driverId, userId)];
  if (scope === "upcoming") conds.push(gte(trips.departureDate, today));
  else if (scope === "past") conds.push(lt(trips.departureDate, today));
  const rows = await db
    .select()
    .from(trips)
    .where(and(...conds))
    .orderBy(scope === "past" ? desc(trips.departureDate) : asc(trips.departureDate));
  const out = await Promise.all(rows.map((r) => tripToApi(r)));
  res.json(out);
});

router.post("/trips", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const [me] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  if (!me) return res.status(400).json({ error: "Complete onboarding first" });
  if (me.role === "rider")
    return res.status(403).json({ error: "Switch to driver role to post trips" });
  if (me.status !== "verified")
    return res.status(403).json({ error: "Driver must be verified to post trips" });

  const b = req.body ?? {};
  for (const k of [
    "originId",
    "destinationId",
    "departureDate",
    "departureTime",
    "flexMinutes",
    "seats",
  ]) {
    if (b[k] === undefined || b[k] === null || b[k] === "")
      return res.status(400).json({ error: `${k} required` });
  }
  if (b.originId === b.destinationId)
    return res.status(400).json({ error: "Origin and destination must differ" });

  const seats = Math.max(1, Math.min(4, Number(b.seats)));
  const windowEndTime =
    typeof b.windowEndTime === "string" && b.windowEndTime.trim()
      ? b.windowEndTime.trim()
      : null;
  const pickupPoint =
    typeof b.pickupPoint === "string" && b.pickupPoint.trim()
      ? b.pickupPoint.trim()
      : null;
  // Snapshot the per-rider service fee at post-time so a later config change
  // doesn't retroactively alter quoted prices. Fuel share is NEVER stored here
  // — it is recomputed at read-time from current corridor/fuel config.
  let serviceFeePerRider: number | null = null;
  const feeCfg = await getServiceFeeConfig();
  if (feeCfg.enabled) {
    const [corridor] = await db
      .select()
      .from(corridors)
      .where(
        and(
          eq(corridors.originId, b.originId),
          eq(corridors.destinationId, b.destinationId),
        ),
      );
    if (corridor) {
      const [v] = await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.userId, userId));
      const cons =
        v?.consumptionLPer100Km !== null && v?.consumptionLPer100Km !== undefined
          ? Number(v.consumptionLPer100Km)
          : await getConfigValue("vehicleConsumptionLPer100Km");
      const price =
        v?.fuelType === "diesel"
          ? await getConfigValue("dieselPriceRwfPerLitre")
          : await getConfigValue("fuelPriceRwfPerLitre");
      const share = computeFuelShare({
        distanceKm: Number(corridor.distanceKm),
        consumptionLPer100Km: cons,
        pricePerLitreRwf: price,
        numPassengers: 0,
        seatsTotal: seats,
      });
      serviceFeePerRider = calculateServiceFee(
        share.perPassengerRwf,
        share.distanceKm,
        feeCfg,
      );
    }
  }

  const [inserted] = await db
    .insert(trips)
    .values({
      driverId: userId,
      originId: b.originId,
      destinationId: b.destinationId,
      departureDate: b.departureDate,
      departureTime: b.departureTime,
      windowEndTime,
      pickupPoint,
      flexMinutes: Number(b.flexMinutes),
      seatsTotal: seats,
      seatsRemaining: seats,
      sameGenderOnly: !!b.sameGenderOnly,
      notes: b.notes ?? null,
      serviceFeePerRider,
    })
    .returning();
  const dto = await tripToApi(inserted);
  res.status(201).json(dto);
});

// Defaults for "Leaving now" quick-post: most-used corridor for this driver
router.get("/trips/quick-post-defaults", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const rows = await db
    .select({
      originId: trips.originId,
      destinationId: trips.destinationId,
      n: sql<number>`count(*)::int`,
    })
    .from(trips)
    .where(eq(trips.driverId, userId))
    .groupBy(trips.originId, trips.destinationId)
    .orderBy(desc(sql`count(*)`))
    .limit(1);
  if (rows.length === 0) return res.json({ originId: null, destinationId: null });
  res.json({
    originId: rows[0].originId,
    destinationId: rows[0].destinationId,
  });
});

router.get("/trips/:tripId", requireAuth, requireVerified, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const [t] = await db.select().from(trips).where(eq(trips.id, String(req.params.tripId)));
  if (!t) return res.status(404).json({ error: "Not found" });

  const [v] = await db.select().from(vehicles).where(eq(vehicles.userId, t.driverId));
  const reqs = await db
    .select()
    .from(rideRequests)
    .where(eq(rideRequests.tripId, t.id))
    .orderBy(desc(rideRequests.createdAt));

  const isDriver = t.driverId === userId;
  const myApprovedAsRider = reqs.find(
    (r) => r.riderId === userId && r.status === "approved",
  );
  const revealDriverPhone = !!myApprovedAsRider || isDriver;
  const [driverProfile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, t.driverId));

  const dto = await tripToApi(t);
  const visibleRequests = isDriver
    ? reqs
    : reqs.filter((r) => r.riderId === userId);
  const reqDtos = await Promise.all(
    visibleRequests.map((r) =>
      rideRequestToApi(r, { revealPhone: isDriver && r.status === "approved" }),
    ),
  );

  res.json({
    ...dto,
    vehicle: vehicleToApi(v ?? null),
    driverPhone: revealDriverPhone ? driverProfile?.phone ?? null : null,
    driverIdVerified: !!driverProfile?.idVerified,
    requests: reqDtos,
  });
});

router.post("/trips/:tripId/cancel", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const [t] = await db.select().from(trips).where(eq(trips.id, String(req.params.tripId)));
  if (!t) return res.status(404).json({ error: "Not found" });
  if (t.driverId !== userId) return res.status(403).json({ error: "Forbidden" });
  if (t.status === "completed")
    return res.status(400).json({ error: "Already completed" });
  if (t.status === "in_progress")
    return res.status(400).json({ error: "Trip already started — cannot cancel" });
  if (t.status === "cancelled")
    return res.status(400).json({ error: "Already cancelled" });
  const reasonRaw = req.body?.reason;
  const cancelReason =
    typeof reasonRaw === "string" && reasonRaw.trim() ? reasonRaw.trim() : null;
  const [updated] = await db
    .update(trips)
    .set({ status: "cancelled", cancelReason })
    .where(eq(trips.id, t.id))
    .returning();
  await db
    .update(rideRequests)
    .set({ status: "cancelled" })
    .where(
      and(eq(rideRequests.tripId, t.id), ne(rideRequests.status, "completed")),
    );
  res.json(await tripToApi(updated));
});

router.post("/trips/:tripId/start", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const [t] = await db.select().from(trips).where(eq(trips.id, String(req.params.tripId)));
  if (!t) return res.status(404).json({ error: "Not found" });
  if (t.driverId !== userId) return res.status(403).json({ error: "Forbidden" });
  if (t.status !== "scheduled")
    return res.status(400).json({ error: "Trip not in scheduled state" });
  const [updated] = await db
    .update(trips)
    .set({ status: "in_progress" })
    .where(eq(trips.id, t.id))
    .returning();
  res.json(await tripToApi(updated));
});

router.post("/trips/:tripId/complete", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const [t] = await db.select().from(trips).where(eq(trips.id, String(req.params.tripId)));
  if (!t) return res.status(404).json({ error: "Not found" });
  if (t.driverId !== userId) return res.status(403).json({ error: "Forbidden" });
  if (t.status === "completed" || t.status === "cancelled")
    return res.status(400).json({ error: "Trip already finished" });
  const [updated] = await db
    .update(trips)
    .set({ status: "completed" })
    .where(eq(trips.id, t.id))
    .returning();
  await db
    .update(rideRequests)
    .set({ status: "completed" })
    .where(and(eq(rideRequests.tripId, t.id), eq(rideRequests.status, "approved")));
  res.json(await tripToApi(updated));
});

// Recurring trips
router.get("/recurring-trips", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const rows = await db
    .select()
    .from(recurringTrips)
    .where(eq(recurringTrips.driverId, userId))
    .orderBy(desc(recurringTrips.createdAt));
  const out = await Promise.all(
    rows.map(async (r) => {
      const [o] = await db
        .select()
        .from(neighborhoods)
        .where(eq(neighborhoods.id, r.originId));
      const [d] = await db
        .select()
        .from(neighborhoods)
        .where(eq(neighborhoods.id, r.destinationId));
      return {
        id: r.id,
        driverId: r.driverId,
        originId: r.originId,
        originName: o?.name ?? "",
        destinationId: r.destinationId,
        destinationName: d?.name ?? "",
        daysOfWeek: r.daysOfWeek,
        departureTime: r.departureTime,
        flexMinutes: r.flexMinutes,
        seats: r.seats,
        sameGenderOnly: r.sameGenderOnly,
        notes: r.notes,
        active: r.active,
      };
    }),
  );
  res.json(out);
});

router.post("/recurring-trips", requireAuth, requireVerified, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const me = (req as AuthedRequest).profile!;
  if (me.role === "rider")
    return res.status(403).json({ error: "Switch to driver role to post trips" });
  const b = req.body ?? {};
  for (const k of [
    "originId",
    "destinationId",
    "daysOfWeek",
    "departureTime",
    "flexMinutes",
    "seats",
  ]) {
    if (b[k] === undefined) return res.status(400).json({ error: `${k} required` });
  }
  if (!Array.isArray(b.daysOfWeek) || b.daysOfWeek.length === 0)
    return res.status(400).json({ error: "Pick at least one day" });

  const [inserted] = await db
    .insert(recurringTrips)
    .values({
      driverId: userId,
      originId: b.originId,
      destinationId: b.destinationId,
      daysOfWeek: b.daysOfWeek.map((n: number) => Number(n)),
      departureTime: b.departureTime,
      flexMinutes: Number(b.flexMinutes),
      seats: Math.max(1, Math.min(4, Number(b.seats))),
      sameGenderOnly: !!b.sameGenderOnly,
      notes: b.notes ?? null,
      active: true,
    })
    .returning();
  const [o] = await db
    .select()
    .from(neighborhoods)
    .where(eq(neighborhoods.id, inserted.originId));
  const [d] = await db
    .select()
    .from(neighborhoods)
    .where(eq(neighborhoods.id, inserted.destinationId));
  res.status(201).json({
    id: inserted.id,
    driverId: inserted.driverId,
    originId: inserted.originId,
    originName: o?.name ?? "",
    destinationId: inserted.destinationId,
    destinationName: d?.name ?? "",
    daysOfWeek: inserted.daysOfWeek,
    departureTime: inserted.departureTime,
    flexMinutes: inserted.flexMinutes,
    seats: inserted.seats,
    sameGenderOnly: inserted.sameGenderOnly,
    notes: inserted.notes,
    active: inserted.active,
  });
});

router.delete("/recurring-trips/:recurringId", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const [r] = await db
    .select()
    .from(recurringTrips)
    .where(eq(recurringTrips.id, String(req.params.recurringId)));
  if (!r) return res.status(404).json({ error: "Not found" });
  if (r.driverId !== userId) return res.status(403).json({ error: "Forbidden" });
  await db.delete(recurringTrips).where(eq(recurringTrips.id, r.id));
  res.status(204).send();
});

// Matching
function timeToMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

router.get("/matches", requireAuth, requireVerified, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const { originId, destinationId, date, windowStart, windowEnd } = req.query as Record<
    string,
    string
  >;
  const sameGenderOnly = req.query.sameGenderOnly === "true";
  if (!originId || !destinationId || !date || !windowStart || !windowEnd)
    return res.status(400).json({ error: "Missing query params" });
  const [me] = await db.select().from(profiles).where(eq(profiles.userId, userId));

  const candidates = await db
    .select()
    .from(trips)
    .where(
      and(
        eq(trips.originId, originId),
        eq(trips.destinationId, destinationId),
        eq(trips.departureDate, date),
        eq(trips.status, "scheduled"),
        ne(trips.driverId, userId),
      ),
    );

  const wStart = timeToMin(windowStart);
  const wEnd = timeToMin(windowEnd);

  const results: Array<{
    trip: Awaited<ReturnType<typeof tripToApi>>;
    matchScore: number;
    timeOverlapMinutes: number;
  }> = [];

  for (const t of candidates) {
    if (t.seatsRemaining <= 0) continue;
    const [driver] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, t.driverId));
    if (!driver || driver.status !== "verified") continue;
    if (t.sameGenderOnly && me && driver.gender !== me.gender) continue;
    if (sameGenderOnly && me && driver.gender !== me.gender) continue;
    const tMin = timeToMin(t.departureTime);
    const tStart = tMin - t.flexMinutes;
    const tEnd = tMin + t.flexMinutes;
    const overlapStart = Math.max(wStart, tStart);
    const overlapEnd = Math.min(wEnd, tEnd);
    const overlap = overlapEnd - overlapStart;
    if (overlap <= 0) continue;
    const windowSize = Math.max(1, wEnd - wStart);
    const driverStats = await getUserStats(driver.userId);
    const ratingNorm = driverStats.averageRating
      ? driverStats.averageRating / 5
      : 0.6; // unrated drivers get a neutral baseline
    const score = Math.round(
      Math.min(
        100,
        (overlap / windowSize) * 60 +
          (t.seatsRemaining / t.seatsTotal) * 20 +
          ratingNorm * 20,
      ),
    );
    results.push({
      trip: await tripToApi(t),
      matchScore: score,
      timeOverlapMinutes: overlap,
    });
  }
  results.sort((a, b) => b.matchScore - a.matchScore);

  // Nearby suggestions: trips from same origin to other destinations,
  // ranked by how close (in km, via the corridors table) the candidate's
  // destination is to the rider's destination. Useful when there is no
  // exact match — the rider can hop off near their target and walk/moto
  // the rest of the way.
  const NEARBY_LIMIT = 5;
  const nearby: Array<{
    trip: Awaited<ReturnType<typeof tripToApi>>;
    timeOverlapMinutes: number;
    proximityKm: number;
    destinationName: string;
  }> = [];
  const nearbyCandidates = await db
    .select()
    .from(trips)
    .where(
      and(
        eq(trips.originId, originId),
        ne(trips.destinationId, destinationId),
        eq(trips.departureDate, date),
        eq(trips.status, "scheduled"),
        ne(trips.driverId, userId),
      ),
    );
  for (const t of nearbyCandidates) {
    if (t.seatsRemaining <= 0) continue;
    const [driver] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, t.driverId));
    if (!driver || driver.status !== "verified") continue;
    if (t.sameGenderOnly && me && driver.gender !== me.gender) continue;
    if (sameGenderOnly && me && driver.gender !== me.gender) continue;
    const tMin = timeToMin(t.departureTime);
    const overlapStart = Math.max(wStart, tMin - t.flexMinutes);
    const overlapEnd = Math.min(wEnd, tMin + t.flexMinutes);
    const overlap = overlapEnd - overlapStart;
    if (overlap <= 0) continue;
    // Look up corridor distance from candidate's destination to rider's
    // requested destination. Try both directions; if neither exists, skip.
    const [c1] = await db
      .select()
      .from(corridors)
      .where(
        and(
          eq(corridors.originId, t.destinationId),
          eq(corridors.destinationId, destinationId),
        ),
      );
    const [c2] = c1
      ? [null]
      : await db
          .select()
          .from(corridors)
          .where(
            and(
              eq(corridors.originId, destinationId),
              eq(corridors.destinationId, t.destinationId),
            ),
          );
    const c = c1 ?? c2;
    if (!c) continue;
    const proximityKm = Number(c.distanceKm);
    if (!Number.isFinite(proximityKm) || proximityKm < 0 || proximityKm > 6) {
      continue; // only show truly nearby drop-offs with valid distances
    }
    const [destNeigh] = await db
      .select()
      .from(neighborhoods)
      .where(eq(neighborhoods.id, t.destinationId));
    nearby.push({
      trip: await tripToApi(t),
      timeOverlapMinutes: overlap,
      proximityKm,
      destinationName: destNeigh?.name ?? "",
    });
  }
  nearby.sort((a, b) => a.proximityKm - b.proximityKm);

  res.json({ matches: results, nearby: nearby.slice(0, NEARBY_LIMIT) });
});

export default router;
