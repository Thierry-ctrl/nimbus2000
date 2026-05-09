import { Router, type IRouter } from "express";
import { requireAuth, requireAdmin, type AuthedRequest } from "../lib/auth";
import { db } from "../lib/db";
import {
  rideRequests,
  serviceFees,
  trips,
  vehicles,
  corridors,
} from "@workspace/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getConfigValue, getServiceFeeConfig } from "../lib/config";
import { computeFuelShare } from "../lib/fuel-share";
import { sendNotification } from "../lib/notify";
import {
  loadMomoConfig,
  requestToPay,
  validateCallback,
  type MomoTxnStatus,
} from "../lib/momo";
import { clerkClient } from "@clerk/express";

/**
 * Compute the per-rider fuel share for an existing trip at *current* config.
 * Used for audit-trail accounting on the serviceFees row — never combined
 * with the service fee in any user-facing total.
 */
async function fuelShareForTrip(
  t: typeof trips.$inferSelect,
): Promise<number> {
  const [c] = await db
    .select()
    .from(corridors)
    .where(
      and(
        eq(corridors.originId, t.originId),
        eq(corridors.destinationId, t.destinationId),
      ),
    );
  if (!c) return 0;
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
  const share = computeFuelShare({
    distanceKm: Number(c.distanceKm),
    consumptionLPer100Km: cons,
    pricePerLitreRwf: price,
    numPassengers: 0,
    seatsTotal: t.seatsTotal,
  });
  return share.perPassengerRwf;
}

const router: IRouter = Router();

// Map MoMo's response status to our internal momo_status enum.
function mapMomoStatus(s: string): "pending" | "success" | "failed" {
  const up = s.toUpperCase();
  if (up === "SUCCESSFUL" || up === "SUCCESS") return "success";
  if (up === "FAILED" || up === "REJECTED" || up === "TIMEOUT") return "failed";
  return "pending";
}

async function emailFor(userId: string): Promise<string | null> {
  try {
    const u = await clerkClient.users.getUser(userId);
    return u.primaryEmailAddress?.emailAddress ?? null;
  } catch {
    return null;
  }
}

function feeRecordToApi(f: typeof serviceFees.$inferSelect) {
  return {
    id: f.id,
    tripId: f.tripId,
    rideRequestId: f.rideRequestId,
    riderId: f.riderId,
    amountRwf: f.amount,
    feePct: f.feePct,
    baseFuelShareRwf: f.baseFuelShare,
    momoTransactionId: f.momoTransactionId,
    momoReferenceId: f.momoReferenceId,
    momoStatus: f.momoStatus,
    paymentMethod: f.paymentMethod,
    failureReason: f.failureReason,
    paidAt: f.paidAt?.toISOString() ?? null,
    refundedAt: f.refundedAt?.toISOString() ?? null,
    createdAt: f.createdAt.toISOString(),
  };
}

// ─── Initiate ─────────────────────────────────────────────────────────────────
router.post("/payments/initiate", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const cfg = await getServiceFeeConfig();
  if (!cfg.enabled)
    return res.status(503).json({ error: "Service fee not enabled" });

  const { rideRequestId, payerPhone, paymentMethod } = req.body ?? {};
  if (!rideRequestId || typeof rideRequestId !== "string")
    return res.status(400).json({ error: "rideRequestId required" });
  if (!payerPhone || typeof payerPhone !== "string")
    return res.status(400).json({ error: "payerPhone required" });

  const [r] = await db
    .select()
    .from(rideRequests)
    .where(eq(rideRequests.id, rideRequestId));
  if (!r) return res.status(404).json({ error: "Ride request not found" });
  if (r.riderId !== userId)
    return res.status(403).json({ error: "Forbidden" });
  if (r.status !== "approved")
    return res
      .status(400)
      .json({ error: "Ride request must be approved before paying" });
  if (r.serviceFeeStatus === "paid" || r.serviceFeeStatus === "refunded")
    return res.status(409).json({ error: "Fee already settled" });
  if (r.serviceFeeAmount <= 0)
    return res.status(400).json({ error: "No fee due for this request" });

  const [t] = await db.select().from(trips).where(eq(trips.id, r.tripId));
  if (!t) return res.status(404).json({ error: "Trip not found" });

  // Snapshot the fuel share for the audit trail. Stored separately from the
  // fee — the two amounts must never be combined into a single charge.
  const baseFuelShare = await fuelShareForTrip(t);

  const method =
    paymentMethod === "momo_airtel" ? "momo_airtel" : "momo_mtn";

  const momo = loadMomoConfig();
  if (!momo) {
    logger.warn(
      { rideRequestId },
      "payments.initiate.momo_not_configured",
    );
    return res
      .status(503)
      .json({ error: "MoMo not configured on this server" });
  }

  // Insert the pending fee record FIRST so we have an externalId to send to
  // MoMo. If MoMo's call fails, we mark this fee as 'failed' and return.
  const [fee] = await db
    .insert(serviceFees)
    .values({
      tripId: r.tripId,
      rideRequestId: r.id,
      riderId: userId,
      amount: r.serviceFeeAmount,
      feePct: cfg.pct,
      baseFuelShare,
      momoStatus: "pending",
      paymentMethod: method,
    })
    .returning();

  try {
    const { referenceId } = await requestToPay(momo, {
      amount: r.serviceFeeAmount,
      externalId: fee.id,
      payerPhone,
      payerMessage: `KigaliWeShare service fee for trip ${t.id.slice(0, 8)}`,
      payeeNote: `Service fee ${r.serviceFeeAmount} RWF`,
    });
    await db
      .update(serviceFees)
      .set({ momoReferenceId: referenceId, updatedAt: new Date() })
      .where(eq(serviceFees.id, fee.id));
    return res.json({
      feeId: fee.id,
      momoReferenceId: referenceId,
      status: "pending",
      amountRwf: r.serviceFeeAmount,
    });
  } catch (err) {
    logger.error({ err, feeId: fee.id }, "payments.initiate.momo_failed");
    await db
      .update(serviceFees)
      .set({
        momoStatus: "failed",
        failureReason: (err as Error).message,
        updatedAt: new Date(),
      })
      .where(eq(serviceFees.id, fee.id));
    return res
      .status(502)
      .json({ error: "Failed to initiate MoMo payment" });
  }
});

// ─── MoMo callback webhook ────────────────────────────────────────────────────
router.post("/payments/callback", async (req, res) => {
  if (!validateCallback(req.headers, req.body)) {
    return res.status(400).json({ error: "Invalid payload" });
  }
  const { referenceId, status, financialTransactionId, reason } = req.body as {
    referenceId: string;
    status: string;
    financialTransactionId?: string;
    reason?: string;
  };

  const [fee] = await db
    .select()
    .from(serviceFees)
    .where(eq(serviceFees.momoReferenceId, referenceId));
  if (!fee) {
    // Webhook for a fee we don't know about — ack to avoid retry storms.
    logger.warn({ referenceId }, "payments.callback.unknown_reference");
    return res.json({ ok: true });
  }

  const mapped = mapMomoStatus(status);
  const now = new Date();
  await db
    .update(serviceFees)
    .set({
      momoStatus: mapped,
      momoTransactionId: financialTransactionId ?? fee.momoTransactionId,
      failureReason: mapped === "failed" ? reason ?? null : null,
      paidAt: mapped === "success" ? now : fee.paidAt,
      updatedAt: now,
    })
    .where(eq(serviceFees.id, fee.id));

  if (mapped === "success") {
    await db
      .update(rideRequests)
      .set({ serviceFeeStatus: "paid" })
      .where(eq(rideRequests.id, fee.rideRequestId));
    await sendNotification({
      kind: "request.created",
      toUserId: fee.riderId,
      toEmail: await emailFor(fee.riderId),
      subject: "Service fee paid",
      body: `Your KigaliWeShare service fee of ${fee.amount} RWF has been received. Have a great trip!`,
      meta: { feeId: fee.id, rideRequestId: fee.rideRequestId },
    });
  }
  return res.json({ ok: true });
});

// ─── Status ───────────────────────────────────────────────────────────────────
router.get(
  "/payments/:rideRequestId/status",
  requireAuth,
  async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const rideRequestId = String(req.params.rideRequestId);
    const [r] = await db
      .select()
      .from(rideRequests)
      .where(eq(rideRequests.id, rideRequestId));
    if (!r) return res.status(404).json({ error: "Not found" });
    // Only the rider OR the trip's driver may read fee status.
    const [t] = await db.select().from(trips).where(eq(trips.id, r.tripId));
    if (r.riderId !== userId && t?.driverId !== userId)
      return res.status(403).json({ error: "Forbidden" });

    const [fee] = await db
      .select()
      .from(serviceFees)
      .where(eq(serviceFees.rideRequestId, r.id))
      .orderBy(desc(serviceFees.createdAt))
      .limit(1);

    return res.json({
      rideRequestId: r.id,
      feeId: fee?.id ?? null,
      serviceFeeStatus: r.serviceFeeStatus,
      momoStatus: fee?.momoStatus ?? null,
      paymentMethod: fee?.paymentMethod ?? null,
      amountRwf: r.serviceFeeAmount,
      failureReason: fee?.failureReason ?? null,
      paidAt: fee?.paidAt?.toISOString() ?? null,
    });
  },
);

// ─── Cash fallback ────────────────────────────────────────────────────────────
router.post(
  "/payments/cash-fee/:rideRequestId",
  requireAuth,
  async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const rideRequestId = String(req.params.rideRequestId);
    const cfg = await getServiceFeeConfig();
    if (!cfg.enabled)
      return res.status(503).json({ error: "Service fee not enabled" });

    const [r] = await db
      .select()
      .from(rideRequests)
      .where(eq(rideRequests.id, rideRequestId));
    if (!r) return res.status(404).json({ error: "Not found" });
    // Only the trip's driver may record a cash fee — they collected the cash.
    const [t] = await db.select().from(trips).where(eq(trips.id, r.tripId));
    if (!t || t.driverId !== userId)
      return res.status(403).json({ error: "Only the driver may record cash fees" });
    if (r.serviceFeeStatus === "paid" || r.serviceFeeStatus === "refunded")
      return res.status(409).json({ error: "Already settled" });
    if (r.serviceFeeAmount <= 0)
      return res.status(400).json({ error: "No fee due" });

    const baseFuelShare = await fuelShareForTrip(t);
    const now = new Date();
    const [fee] = await db
      .insert(serviceFees)
      .values({
        tripId: r.tripId,
        rideRequestId: r.id,
        riderId: r.riderId,
        amount: r.serviceFeeAmount,
        feePct: cfg.pct,
        baseFuelShare,
        momoStatus: "success",
        paymentMethod: "cash_fee",
        paidAt: now,
      })
      .returning();
    await db
      .update(rideRequests)
      .set({ serviceFeeStatus: "paid" })
      .where(eq(rideRequests.id, r.id));

    return res.json({
      rideRequestId: r.id,
      feeId: fee.id,
      serviceFeeStatus: "paid" as const,
      momoStatus: "success" as const,
      paymentMethod: "cash_fee" as const,
      amountRwf: r.serviceFeeAmount,
      failureReason: null,
      paidAt: now.toISOString(),
    });
  },
);

// ─── Refund (admin) ───────────────────────────────────────────────────────────
router.post(
  "/admin/payments/:feeId/refund",
  requireAdmin,
  async (req, res) => {
    const feeId = String(req.params.feeId);
    const [fee] = await db
      .select()
      .from(serviceFees)
      .where(eq(serviceFees.id, feeId));
    if (!fee) return res.status(404).json({ error: "Not found" });

    const now = new Date();
    const [updated] = await db
      .update(serviceFees)
      .set({
        momoStatus: "refunded",
        refundedAt: now,
        failureReason: req.body?.reason ?? null,
        updatedAt: now,
      })
      .where(eq(serviceFees.id, feeId))
      .returning();
    await db
      .update(rideRequests)
      .set({ serviceFeeStatus: "refunded" })
      .where(eq(rideRequests.id, fee.rideRequestId));
    return res.json(feeRecordToApi(updated));
  },
);

// ─── Revenue stats (admin) ────────────────────────────────────────────────────
router.get("/admin/revenue", requireAdmin, async (_req, res) => {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 7);
  const startOfMonth = new Date(now);
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const baseSum = (since?: Date) =>
    db
      .select({ total: sql<number>`COALESCE(SUM(${serviceFees.amount}), 0)::int` })
      .from(serviceFees)
      .where(
        and(
          eq(serviceFees.momoStatus, "success"),
          since ? gte(serviceFees.paidAt, since) : sql`true`,
        ),
      );

  const [allTime] = await baseSum();
  const [today] = await baseSum(startOfDay);
  const [week] = await baseSum(startOfWeek);
  const [month] = await baseSum(startOfMonth);

  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      success: sql<number>`count(*) filter (where ${serviceFees.momoStatus} = 'success')::int`,
      pending: sql<number>`count(*) filter (where ${serviceFees.momoStatus} = 'pending')::int`,
      failed: sql<number>`count(*) filter (where ${serviceFees.momoStatus} = 'failed')::int`,
      refundsRwf: sql<number>`COALESCE(SUM(${serviceFees.amount}) filter (where ${serviceFees.momoStatus} = 'refunded'), 0)::int`,
      avgFee: sql<number>`COALESCE(AVG(${serviceFees.amount}) filter (where ${serviceFees.momoStatus} = 'success'), 0)::int`,
    })
    .from(serviceFees);

  const successRate =
    counts.total > 0 ? (counts.success / counts.total) * 100 : 0;

  // Revenue by corridor — join through trips.
  const byCorridorRows = await db
    .select({
      label: corridors.label,
      rides: sql<number>`count(*)::int`,
      revenueRwf: sql<number>`COALESCE(SUM(${serviceFees.amount}), 0)::int`,
    })
    .from(serviceFees)
    .innerJoin(trips, eq(serviceFees.tripId, trips.id))
    .innerJoin(
      corridors,
      and(
        eq(corridors.originId, trips.originId),
        eq(corridors.destinationId, trips.destinationId),
      ),
    )
    .where(eq(serviceFees.momoStatus, "success"))
    .groupBy(corridors.label)
    .orderBy(desc(sql`SUM(${serviceFees.amount})`));

  res.json({
    totalCollectedRwf: allTime.total,
    todayRwf: today.total,
    weekRwf: week.total,
    monthRwf: month.total,
    paymentSuccessRatePct: Number(successRate.toFixed(1)),
    pendingPayments: counts.pending,
    failedPayments: counts.failed,
    refundsIssuedRwf: counts.refundsRwf,
    averageFeeRwf: counts.avgFee,
    byCorridor: byCorridorRows.map((r) => ({
      corridorLabel: r.label,
      rides: r.rides,
      revenueRwf: r.revenueRwf,
    })),
  });
});

export default router;
// Suppress unused warning for the type we may import elsewhere
export type { MomoTxnStatus };
