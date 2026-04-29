import { Router, type IRouter } from "express";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { db } from "../lib/db";
import { ratings, trips, rideRequests } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const router: IRouter = Router();

router.post("/ratings", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const { tripId, toUserId, stars, comment } = req.body ?? {};
  if (!tripId || !toUserId || !stars)
    return res.status(400).json({ error: "Missing fields" });
  const n = Number(stars);
  if (n < 1 || n > 5)
    return res.status(400).json({ error: "Stars must be 1-5" });

  const [t] = await db.select().from(trips).where(eq(trips.id, tripId));
  if (!t) return res.status(404).json({ error: "Trip not found" });
  if (t.status !== "completed")
    return res.status(400).json({ error: "Trip not completed" });

  // Verify either user is driver and other is approved rider, or vice versa
  let allowed = false;
  if (t.driverId === userId) {
    const [rr] = await db
      .select()
      .from(rideRequests)
      .where(and(eq(rideRequests.tripId, tripId), eq(rideRequests.riderId, toUserId)));
    if (rr && (rr.status === "approved" || rr.status === "completed")) allowed = true;
  } else if (t.driverId === toUserId) {
    const [rr] = await db
      .select()
      .from(rideRequests)
      .where(and(eq(rideRequests.tripId, tripId), eq(rideRequests.riderId, userId)));
    if (rr && (rr.status === "approved" || rr.status === "completed")) allowed = true;
  }
  if (!allowed) return res.status(403).json({ error: "Not allowed to rate" });

  try {
    const [inserted] = await db
      .insert(ratings)
      .values({
        tripId,
        fromUserId: userId,
        toUserId,
        stars: n,
        comment: comment ?? null,
      })
      .returning();
    res.status(201).json({
      id: inserted.id,
      tripId: inserted.tripId,
      fromUserId: inserted.fromUserId,
      toUserId: inserted.toUserId,
      stars: inserted.stars,
      comment: inserted.comment,
      createdAt: inserted.createdAt.toISOString(),
    });
  } catch (e) {
    res.status(400).json({ error: "Already rated" });
  }
});

export default router;
