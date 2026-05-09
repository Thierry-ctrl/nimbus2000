import { Router, type IRouter } from "express";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { db } from "../lib/db";
import { rideRequests, trips, profiles } from "@workspace/db";
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { rideRequestToApi } from "../lib/serializers";
import { sendNotification } from "../lib/notify";
import { clerkClient } from "@clerk/express";

async function emailFor(userId: string): Promise<string | null> {
  try {
    const u = await clerkClient.users.getUser(userId);
    return u.primaryEmailAddress?.emailAddress ?? null;
  } catch {
    return null;
  }
}

const router: IRouter = Router();

router.get("/requests", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const scope = (req.query.scope as string) || "upcoming";
  const today = new Date().toISOString().slice(0, 10);

  const rows = await db
    .select({ r: rideRequests, t: trips })
    .from(rideRequests)
    .innerJoin(trips, eq(rideRequests.tripId, trips.id))
    .where(eq(rideRequests.riderId, userId))
    .orderBy(desc(rideRequests.createdAt));

  const filtered = rows.filter(({ t }) => {
    if (scope === "upcoming") return t.departureDate >= today;
    if (scope === "past") return t.departureDate < today;
    return true;
  });

  const out = await Promise.all(
    filtered.map(({ r }) =>
      rideRequestToApi(r, { revealPhone: r.status === "approved", includeTrip: true }),
    ),
  );
  res.json(out);
});

router.post("/requests", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const tripId = req.body?.tripId;
  if (!tripId) return res.status(400).json({ error: "tripId required" });
  const [t] = await db.select().from(trips).where(eq(trips.id, tripId));
  if (!t) return res.status(404).json({ error: "Trip not found" });
  if (t.driverId === userId)
    return res.status(400).json({ error: "Cannot request your own trip" });
  if (t.status !== "scheduled")
    return res.status(400).json({ error: "Trip is no longer accepting riders" });
  if (t.seatsRemaining <= 0)
    return res.status(400).json({ error: "No seats remaining" });

  const [me] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  if (!me) return res.status(400).json({ error: "Complete onboarding first" });
  if (me.status !== "verified")
    return res
      .status(403)
      .json({ error: "Your account is pending verification" });

  if (t.sameGenderOnly) {
    const [driver] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, t.driverId));
    if (!driver || driver.gender !== me.gender)
      return res
        .status(403)
        .json({ error: "This trip is restricted to riders of the same gender" });
  }

  const [existing] = await db
    .select()
    .from(rideRequests)
    .where(and(eq(rideRequests.tripId, tripId), eq(rideRequests.riderId, userId)));
  if (existing)
    return res.status(400).json({ error: "You already requested this trip" });

  const [inserted] = await db
    .insert(rideRequests)
    .values({
      tripId,
      riderId: userId,
      pickupPoint: req.body?.pickupPoint ?? null,
      notes: req.body?.notes ?? null,
      // Snapshot the fee from the trip so the rider's quote can't shift if
      // platformConfig changes later. Stored separately from approval state
      // — fee status is managed by the payments flow, never gates seat
      // approval.
      serviceFeeAmount: t.serviceFeePerRider ?? 0,
    })
    .returning();
  await sendNotification({
    kind: "request.created",
    toUserId: t.driverId,
    toEmail: await emailFor(t.driverId),
    subject: "New seat request on your KigaliWeShare trip",
    body: `${me.fullName} requested a seat on your trip on ${t.departureDate} at ${t.departureTime}.`,
    meta: { tripId: t.id, requestId: inserted.id },
  });
  res.status(201).json(await rideRequestToApi(inserted, { includeTrip: true }));
});

type AuthResult =
  | { error: 404 | 403; r?: undefined; t?: undefined }
  | {
      error?: undefined;
      r: typeof rideRequests.$inferSelect;
      t: typeof trips.$inferSelect;
    };

async function authorizeAsDriver(
  reqId: string,
  userId: string,
): Promise<AuthResult> {
  const [r] = await db.select().from(rideRequests).where(eq(rideRequests.id, reqId));
  if (!r) return { error: 404 };
  const [t] = await db.select().from(trips).where(eq(trips.id, r.tripId));
  if (!t) return { error: 404 };
  if (t.driverId !== userId) return { error: 403 };
  return { r, t };
}

router.post("/requests/:requestId/approve", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const auth = await authorizeAsDriver(String(req.params.requestId), userId);
  if (auth.error) return res.status(auth.error).json({ error: "Forbidden" });
  if (auth.r.status !== "pending")
    return res.status(400).json({ error: "Request is not pending" });
  if (auth.t.status !== "scheduled")
    return res.status(400).json({ error: "Trip is not scheduled — cannot approve" });
  if (auth.t.seatsRemaining <= 0)
    return res.status(400).json({ error: "No seats remaining" });

  // Atomic two-phase approval, in a transaction:
  //   1) Flip request pending→approved ONLY if still pending. If two
  //      drivers (or two clicks) race, only one row is returned.
  //   2) Decrement seats ONLY if seatsRemaining > 0 AND trip still
  //      scheduled. If either guard fails, throw to roll back step 1.
  // This prevents both double-decrement on the same request and
  // approval into a cancelled/in-progress trip.
  let updated: typeof rideRequests.$inferSelect | undefined;
  try {
    updated = await db.transaction(async (tx) => {
      const [updatedReq] = await tx
        .update(rideRequests)
        .set({ status: "approved" })
        .where(
          and(
            eq(rideRequests.id, auth.r.id),
            eq(rideRequests.status, "pending"),
          ),
        )
        .returning();
      if (!updatedReq) {
        throw new Error("REQUEST_NOT_PENDING");
      }
      const seatRows = await tx
        .update(trips)
        .set({ seatsRemaining: sql`${trips.seatsRemaining} - 1` })
        .where(
          and(
            eq(trips.id, auth.t.id),
            sql`${trips.seatsRemaining} > 0`,
            eq(trips.status, "scheduled"),
          ),
        )
        .returning({ id: trips.id });
      if (seatRows.length === 0) {
        throw new Error("NO_SEATS_OR_NOT_SCHEDULED");
      }
      return updatedReq;
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "REQUEST_NOT_PENDING")
      return res.status(409).json({ error: "Request is no longer pending" });
    if (msg === "NO_SEATS_OR_NOT_SCHEDULED")
      return res
        .status(409)
        .json({ error: "Trip is full or no longer scheduled" });
    throw e;
  }
  if (!updated) return res.status(500).json({ error: "Approval failed" });
  await sendNotification({
    kind: "request.approved",
    toUserId: auth.r.riderId,
    toEmail: await emailFor(auth.r.riderId),
    subject: "Your KigaliWeShare seat was approved",
    body: `Your seat is confirmed for ${auth.t.departureDate} at ${auth.t.departureTime}. The driver's phone is now visible in the app.`,
    meta: { tripId: auth.t.id, requestId: auth.r.id },
  });
  res.json(await rideRequestToApi(updated, { revealPhone: true, includeTrip: true }));
});

router.post("/requests/:requestId/decline", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const auth = await authorizeAsDriver(String(req.params.requestId), userId);
  if (auth.error) return res.status(auth.error).json({ error: "Forbidden" });
  if (auth.r.status !== "pending")
    return res.status(400).json({ error: "Request is not pending" });
  const [updated] = await db
    .update(rideRequests)
    .set({ status: "declined" })
    .where(eq(rideRequests.id, auth.r.id))
    .returning();
  await sendNotification({
    kind: "request.declined",
    toUserId: auth.r.riderId,
    toEmail: await emailFor(auth.r.riderId),
    subject: "Your KigaliWeShare seat request was declined",
    body: `The driver could not fit your request for ${auth.t.departureDate} at ${auth.t.departureTime}. You can search for other matches.`,
    meta: { tripId: auth.t.id, requestId: auth.r.id },
  });
  res.json(await rideRequestToApi(updated, { includeTrip: true }));
});

router.post("/requests/:requestId/cancel", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const [r] = await db
    .select()
    .from(rideRequests)
    .where(eq(rideRequests.id, String(req.params.requestId)));
  if (!r) return res.status(404).json({ error: "Not found" });
  if (r.riderId !== userId) return res.status(403).json({ error: "Forbidden" });
  if (r.status === "completed")
    return res.status(400).json({ error: "Cannot cancel completed request" });
  if (r.status === "cancelled")
    return res.status(400).json({ error: "Already cancelled" });
  // Block cancellation once the trip has started — riders must contact the
  // driver directly after departure.
  const [parentTrip] = await db
    .select({ status: trips.status })
    .from(trips)
    .where(eq(trips.id, r.tripId));
  if (parentTrip && parentTrip.status === "in_progress")
    return res
      .status(400)
      .json({ error: "Trip already started — cannot cancel" });
  const wasApproved = r.status === "approved";
  const [updated] = await db
    .update(rideRequests)
    .set({ status: "cancelled" })
    .where(eq(rideRequests.id, r.id))
    .returning();
  if (wasApproved) {
    await db
      .update(trips)
      .set({ seatsRemaining: sql`${trips.seatsRemaining} + 1` })
      .where(eq(trips.id, r.tripId));
  }
  res.json(await rideRequestToApi(updated, { includeTrip: true }));
});

export default router;
