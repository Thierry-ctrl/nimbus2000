import { Router, type IRouter } from "express";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { db } from "../lib/db";
import {
  trips,
  rideRequests,
  ratings,
  profiles,
  corridors,
  vehicles,
  ratingDismissals,
} from "@workspace/db";
import { and, asc, count, desc, eq, gte, isNull, lt, ne, sql } from "drizzle-orm";
import { tripToApi, rideRequestToApi, getUserStats } from "../lib/serializers";
import { getConfigValue } from "../lib/config";

const router: IRouter = Router();

async function priceForDriver(driverId: string): Promise<number> {
  const [v] = await db.select().from(vehicles).where(eq(vehicles.userId, driverId));
  if (v?.fuelType === "diesel") {
    return await getConfigValue("dieselPriceRwfPerLitre");
  }
  return await getConfigValue("fuelPriceRwfPerLitre");
}

async function consForDriver(driverId: string): Promise<number> {
  const [v] = await db.select().from(vehicles).where(eq(vehicles.userId, driverId));
  if (v?.consumptionLPer100Km !== null && v?.consumptionLPer100Km !== undefined) {
    return Number(v.consumptionLPer100Km);
  }
  return await getConfigValue("vehicleConsumptionLPer100Km");
}

async function fuelSavedForUser(userId: string, sinceIso: string) {

  // As driver
  const driverRows = await db
    .select({
      tripId: trips.id,
      driverId: trips.driverId,
      originId: trips.originId,
      destinationId: trips.destinationId,
      seatsTotal: trips.seatsTotal,
      seatsRemaining: trips.seatsRemaining,
    })
    .from(trips)
    .where(
      and(
        eq(trips.driverId, userId),
        eq(trips.status, "completed"),
        gte(trips.departureDate, sinceIso),
      ),
    );

  // As rider
  const riderRows = await db
    .select({
      tripId: trips.id,
      driverId: trips.driverId,
      originId: trips.originId,
      destinationId: trips.destinationId,
      seatsTotal: trips.seatsTotal,
      seatsRemaining: trips.seatsRemaining,
    })
    .from(rideRequests)
    .innerJoin(trips, eq(rideRequests.tripId, trips.id))
    .where(
      and(
        eq(rideRequests.riderId, userId),
        eq(rideRequests.status, "completed"),
        gte(trips.departureDate, sinceIso),
      ),
    );

  const all = [...driverRows, ...riderRows];
  let savedRwf = 0;
  let kmShared = 0;
  for (const row of all) {
    const [c] = await db
      .select()
      .from(corridors)
      .where(
        and(
          eq(corridors.originId, row.originId),
          eq(corridors.destinationId, row.destinationId),
        ),
      );
    const distance = c ? Number(c.distanceKm) : 8;
    const sharedSeats = row.seatsTotal - row.seatsRemaining;
    if (sharedSeats <= 0) continue;
    const ratio = sharedSeats / (sharedSeats + 1);
    const fuelPrice = await priceForDriver(row.driverId);
    const cons = await consForDriver(row.driverId);
    savedRwf += (distance * cons / 100) * fuelPrice * ratio;
    kmShared += distance;
  }
  return { savedRwf, kmShared };
}

router.get("/dashboard/summary", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const [me] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  if (!me) return res.status(404).json({ error: "Profile not found" });

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date();
  monthStart.setDate(1);
  const monthStartStr = monthStart.toISOString().slice(0, 10);

  const [drvDone] = await db
    .select({ n: count(trips.id) })
    .from(trips)
    .where(and(eq(trips.driverId, userId), eq(trips.status, "completed")));
  const [rdrDone] = await db
    .select({ n: count(rideRequests.id) })
    .from(rideRequests)
    .where(
      and(eq(rideRequests.riderId, userId), eq(rideRequests.status, "completed")),
    );

  const { savedRwf, kmShared } = await fuelSavedForUser(userId, monthStartStr);

  const pendingForMyTrips = await db
    .select({ n: count(rideRequests.id) })
    .from(rideRequests)
    .innerJoin(trips, eq(rideRequests.tripId, trips.id))
    .where(and(eq(trips.driverId, userId), eq(rideRequests.status, "pending")));

  const upcomingApproved = await db
    .select({ n: count(rideRequests.id) })
    .from(rideRequests)
    .innerJoin(trips, eq(rideRequests.tripId, trips.id))
    .where(
      and(
        eq(rideRequests.riderId, userId),
        eq(rideRequests.status, "approved"),
        gte(trips.departureDate, today),
      ),
    );

  const [nextTripRow] = await db
    .select()
    .from(trips)
    .where(
      and(
        eq(trips.driverId, userId),
        eq(trips.status, "scheduled"),
        gte(trips.departureDate, today),
      ),
    )
    .orderBy(asc(trips.departureDate), asc(trips.departureTime))
    .limit(1);

  const [nextRideRow] = await db
    .select({ r: rideRequests, t: trips })
    .from(rideRequests)
    .innerJoin(trips, eq(rideRequests.tripId, trips.id))
    .where(
      and(
        eq(rideRequests.riderId, userId),
        eq(rideRequests.status, "approved"),
        gte(trips.departureDate, today),
      ),
    )
    .orderBy(asc(trips.departureDate), asc(trips.departureTime))
    .limit(1);

  const stats = await getUserStats(userId);

  res.json({
    profileStatus: me.status,
    role: me.role,
    completedTripsAsDriver: Number(drvDone?.n ?? 0),
    completedTripsAsRider: Number(rdrDone?.n ?? 0),
    fuelSavedRwfThisMonth: Math.round(savedRwf),
    kmSharedThisMonth: Math.round(kmShared * 10) / 10,
    pendingRequestsForMyTrips: Number(pendingForMyTrips[0]?.n ?? 0),
    myUpcomingApprovedRides: Number(upcomingApproved[0]?.n ?? 0),
    nextTrip: nextTripRow ? await tripToApi(nextTripRow) : null,
    nextRide: nextRideRow
      ? await rideRequestToApi(nextRideRow.r, {
          revealPhone: true,
          includeTrip: true,
        })
      : null,
    averageRating: stats.averageRating,
  });
});

router.get("/dashboard/activity", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const items: Array<{
    id: string;
    kind: string;
    title: string;
    subtitle: string | null;
    occurredAt: string;
    relatedTripId: string | null;
  }> = [];

  const myTrips = await db
    .select()
    .from(trips)
    .where(eq(trips.driverId, userId))
    .orderBy(desc(trips.createdAt))
    .limit(20);
  for (const t of myTrips) {
    items.push({
      id: `trip-${t.id}`,
      kind: t.status === "completed" ? "trip_completed" : "trip_posted",
      title: t.status === "completed" ? "Trip completed" : "You posted a trip",
      subtitle: `${t.departureDate} at ${t.departureTime}`,
      occurredAt: t.createdAt.toISOString(),
      relatedTripId: t.id,
    });
  }

  const myReqs = await db
    .select()
    .from(rideRequests)
    .where(eq(rideRequests.riderId, userId))
    .orderBy(desc(rideRequests.createdAt))
    .limit(20);
  for (const r of myReqs) {
    const kind =
      r.status === "approved"
        ? "request_approved"
        : r.status === "declined"
          ? "request_declined"
          : "request_submitted";
    items.push({
      id: `req-${r.id}`,
      kind,
      title:
        r.status === "approved"
          ? "Your seat was approved"
          : r.status === "declined"
            ? "Your request was declined"
            : "You requested a ride",
      subtitle: null,
      occurredAt: r.createdAt.toISOString(),
      relatedTripId: r.tripId,
    });
  }

  const incoming = await db
    .select({ r: rideRequests })
    .from(rideRequests)
    .innerJoin(trips, eq(rideRequests.tripId, trips.id))
    .where(eq(trips.driverId, userId))
    .orderBy(desc(rideRequests.createdAt))
    .limit(20);
  for (const { r } of incoming) {
    items.push({
      id: `inc-${r.id}`,
      kind: "request_received",
      title: "New ride request on your trip",
      subtitle: null,
      occurredAt: r.createdAt.toISOString(),
      relatedTripId: r.tripId,
    });
  }

  const myRatings = await db
    .select()
    .from(ratings)
    .where(eq(ratings.toUserId, userId))
    .orderBy(desc(ratings.createdAt))
    .limit(10);
  for (const rt of myRatings) {
    items.push({
      id: `rate-${rt.id}`,
      kind: "rating_received",
      title: `You received ${rt.stars} stars`,
      subtitle: rt.comment,
      occurredAt: rt.createdAt.toISOString(),
      relatedTripId: rt.tripId,
    });
  }

  items.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  res.json(items.slice(0, 30));
});

// Trips that are completed and not yet rated by this user (and not dismissed)
router.get("/dashboard/rating-prompts", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const driverDone = await db
    .select()
    .from(trips)
    .where(
      and(
        eq(trips.driverId, userId),
        eq(trips.status, "completed"),
        gte(trips.departureDate, since),
      ),
    );
  const riderDone = await db
    .select({ t: trips, r: rideRequests })
    .from(rideRequests)
    .innerJoin(trips, eq(rideRequests.tripId, trips.id))
    .where(
      and(
        eq(rideRequests.riderId, userId),
        eq(rideRequests.status, "completed"),
        gte(trips.departureDate, since),
      ),
    );

  const dismissed = await db
    .select({ tripId: ratingDismissals.tripId })
    .from(ratingDismissals)
    .where(eq(ratingDismissals.userId, userId));
  const dismissedSet = new Set(dismissed.map((d) => d.tripId));

  const prompts: Array<{
    tripId: string;
    rateUserId: string;
    rateUserName: string;
    role: "driver" | "rider";
    departureDate: string;
    departureTime: string;
    routeLabel: string;
  }> = [];

  for (const t of driverDone) {
    if (dismissedSet.has(t.id)) continue;
    const reqs = await db
      .select()
      .from(rideRequests)
      .where(
        and(eq(rideRequests.tripId, t.id), eq(rideRequests.status, "completed")),
      );
    for (const r of reqs) {
      const [existing] = await db
        .select()
        .from(ratings)
        .where(
          and(
            eq(ratings.tripId, t.id),
            eq(ratings.fromUserId, userId),
            eq(ratings.toUserId, r.riderId),
          ),
        );
      if (existing) continue;
      const [rider] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, r.riderId));
      const [o] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, t.driverId));
      prompts.push({
        tripId: t.id,
        rateUserId: r.riderId,
        rateUserName: rider?.fullName ?? "Rider",
        role: "driver",
        departureDate: t.departureDate,
        departureTime: t.departureTime,
        routeLabel: `${t.departureDate} • ${t.departureTime}`,
      });
    }
  }
  for (const { t, r } of riderDone) {
    if (dismissedSet.has(t.id)) continue;
    const [existing] = await db
      .select()
      .from(ratings)
      .where(
        and(
          eq(ratings.tripId, t.id),
          eq(ratings.fromUserId, userId),
          eq(ratings.toUserId, t.driverId),
        ),
      );
    if (existing) continue;
    const [drv] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, t.driverId));
    prompts.push({
      tripId: t.id,
      rateUserId: t.driverId,
      rateUserName: drv?.fullName ?? "Driver",
      role: "rider",
      departureDate: t.departureDate,
      departureTime: t.departureTime,
      routeLabel: `${t.departureDate} • ${t.departureTime}`,
    });
  }
  res.json(prompts.slice(0, 5));
});

router.post("/dashboard/rating-prompts/:tripId/dismiss", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const tripId = String(req.params.tripId);
  await db
    .insert(ratingDismissals)
    .values({ userId, tripId })
    .onConflictDoNothing();
  res.status(204).send();
});

export default router;
