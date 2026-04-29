import { Router, type IRouter } from "express";
import { requireAdmin } from "../lib/auth";
import { db } from "../lib/db";
import {
  profiles,
  trips,
  rideRequests,
  inviteCodes,
  neighborhoods,
  corridors,
  vehicles,
  ratings,
} from "@workspace/db";
import { and, count, desc, eq, gte, sql, lt } from "drizzle-orm";
import { getConfigValue, getPublicConfig, setConfigValue } from "../lib/config";
import { getUserStats } from "../lib/serializers";

const router: IRouter = Router();

router.get("/admin/stats", requireAdmin, async (_req, res) => {
  const [total] = await db.select({ n: count(profiles.userId) }).from(profiles);
  const [verified] = await db
    .select({ n: count(profiles.userId) })
    .from(profiles)
    .where(eq(profiles.status, "verified"));
  const [pending] = await db
    .select({ n: count(profiles.userId) })
    .from(profiles)
    .where(eq(profiles.status, "pending"));

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [completedThisWeek] = await db
    .select({ n: count(trips.id) })
    .from(trips)
    .where(and(eq(trips.status, "completed"), gte(trips.departureDate, weekAgo)));

  const wauRows = await db
    .select({ id: trips.driverId })
    .from(trips)
    .where(gte(trips.departureDate, weekAgo))
    .groupBy(trips.driverId);
  const riderWauRows = await db
    .select({ id: rideRequests.riderId })
    .from(rideRequests)
    .innerJoin(trips, eq(rideRequests.tripId, trips.id))
    .where(gte(trips.departureDate, weekAgo))
    .groupBy(rideRequests.riderId);
  const wauSet = new Set([
    ...wauRows.map((r) => r.id),
    ...riderWauRows.map((r) => r.id),
  ]);

  const [matchesPerDay] = await db
    .select({ n: count(rideRequests.id) })
    .from(rideRequests)
    .where(
      and(
        gte(rideRequests.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
      ),
    );

  const [cancelledRequests] = await db
    .select({ n: count(rideRequests.id) })
    .from(rideRequests)
    .where(eq(rideRequests.status, "cancelled"));
  const [approvedRequests] = await db
    .select({ n: count(rideRequests.id) })
    .from(rideRequests)
    .where(eq(rideRequests.status, "approved"));
  const noShowRate =
    Number(approvedRequests?.n ?? 0) > 0
      ? (Number(cancelledRequests?.n ?? 0) /
          (Number(cancelledRequests?.n ?? 0) +
            Number(approvedRequests?.n ?? 0))) *
        100
      : 0;

  // Total fuel saved across all completed trips
  const allCompleted = await db
    .select()
    .from(trips)
    .where(eq(trips.status, "completed"));
  const petrolPrice = await getConfigValue("fuelPriceRwfPerLitre");
  const dieselPrice = await getConfigValue("dieselPriceRwfPerLitre");
  const defaultCons = await getConfigValue("vehicleConsumptionLPer100Km");
  let totalSaved = 0;
  const corridorMap = new Map<string, { label: string; rides: number }>();
  for (const t of allCompleted) {
    const [c] = await db
      .select()
      .from(corridors)
      .where(
        and(
          eq(corridors.originId, t.originId),
          eq(corridors.destinationId, t.destinationId),
        ),
      );
    const distance = c ? Number(c.distanceKm) : 8;
    const sharedSeats = t.seatsTotal - t.seatsRemaining;
    if (sharedSeats > 0) {
      const [v] = await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.userId, t.driverId));
      const fuel = v?.fuelType === "diesel" ? dieselPrice : petrolPrice;
      const cons =
        v?.consumptionLPer100Km !== null && v?.consumptionLPer100Km !== undefined
          ? Number(v.consumptionLPer100Km)
          : defaultCons;
      const ratio = sharedSeats / (sharedSeats + 1);
      totalSaved += (distance * cons / 100) * fuel * ratio * (sharedSeats + 1);
    }
    if (c) {
      const ex = corridorMap.get(c.id);
      corridorMap.set(c.id, {
        label: c.label,
        rides: (ex?.rides ?? 0) + 1,
      });
    }
  }

  // Rides per day for last 14 days
  const ridesByDayMap = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    ridesByDayMap.set(d, 0);
  }
  for (const t of allCompleted) {
    if (ridesByDayMap.has(t.departureDate)) {
      ridesByDayMap.set(t.departureDate, (ridesByDayMap.get(t.departureDate) ?? 0) + 1);
    }
  }

  res.json({
    totalUsers: Number(total?.n ?? 0),
    verifiedUsers: Number(verified?.n ?? 0),
    pendingUsers: Number(pending?.n ?? 0),
    weeklyActiveUsers: wauSet.size,
    ridesCompletedThisWeek: Number(completedThisWeek?.n ?? 0),
    matchesPerDay: Math.round((Number(matchesPerDay?.n ?? 0) / 7) * 10) / 10,
    noShowRatePct: Math.round(noShowRate * 10) / 10,
    totalFuelSavedRwf: Math.round(totalSaved),
    ridesByCorridor: Array.from(corridorMap.values()).map((v) => ({
      corridorLabel: v.label,
      rides: v.rides,
    })),
    ridesByDay: Array.from(ridesByDayMap.entries()).map(([date, rides]) => ({
      date,
      rides,
    })),
  });
});

router.get("/admin/users", requireAdmin, async (req, res) => {
  const statusRaw = String(req.query.status ?? "all");
  const allowed = ["pending", "verified", "suspended"] as const;
  type Status = (typeof allowed)[number];
  const conds = [];
  if (statusRaw !== "all" && (allowed as readonly string[]).includes(statusRaw)) {
    conds.push(eq(profiles.status, statusRaw as Status));
  }
  const rows = await db
    .select()
    .from(profiles)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(profiles.createdAt));
  const out = await Promise.all(
    rows.map(async (p) => {
      const [n] = await db
        .select()
        .from(neighborhoods)
        .where(eq(neighborhoods.id, p.neighborhoodId));
      let inviteLabel: string | null = null;
      if (p.inviteCodeId) {
        const [inv] = await db
          .select()
          .from(inviteCodes)
          .where(eq(inviteCodes.id, p.inviteCodeId));
        inviteLabel = inv?.label ?? null;
      }
      const stats = await getUserStats(p.userId);
      return {
        userId: p.userId,
        fullName: p.fullName,
        role: p.role,
        status: p.status,
        neighborhoodName: n?.name ?? null,
        employer: p.employer,
        phone: p.phone,
        inviteLabel,
        completedTrips: stats.completedTrips,
        averageRating: stats.averageRating,
        idVerified: p.idVerified,
        preferredLanguage: p.preferredLanguage,
        createdAt: p.createdAt.toISOString(),
      };
    }),
  );
  res.json(out);
});

router.post("/admin/users/:userId/id-verified", requireAdmin, async (req, res) => {
  const target = String(req.params.userId);
  const idVerified = !!req.body?.idVerified;
  const [updated] = await db
    .update(profiles)
    .set({ idVerified })
    .where(eq(profiles.userId, target))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json({ userId: updated.userId, idVerified: updated.idVerified });
});

router.post("/admin/users/:userId/verify", requireAdmin, async (req, res) => {
  const target = String(req.params.userId);
  const status = req.body?.status;
  if (!["pending", "verified", "suspended"].includes(status))
    return res.status(400).json({ error: "Invalid status" });
  const [updated] = await db
    .update(profiles)
    .set({ status })
    .where(eq(profiles.userId, target))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  const [n] = await db
    .select()
    .from(neighborhoods)
    .where(eq(neighborhoods.id, updated.neighborhoodId));
  const stats = await getUserStats(updated.userId);
  let inviteLabel: string | null = null;
  if (updated.inviteCodeId) {
    const [inv] = await db
      .select()
      .from(inviteCodes)
      .where(eq(inviteCodes.id, updated.inviteCodeId));
    inviteLabel = inv?.label ?? null;
  }
  res.json({
    userId: updated.userId,
    fullName: updated.fullName,
    role: updated.role,
    status: updated.status,
    neighborhoodName: n?.name ?? null,
    employer: updated.employer,
    phone: updated.phone,
    inviteLabel,
    completedTrips: stats.completedTrips,
    averageRating: stats.averageRating,
    createdAt: updated.createdAt.toISOString(),
  });
});

router.get("/admin/invites", requireAdmin, async (_req, res) => {
  const rows = await db
    .select()
    .from(inviteCodes)
    .orderBy(desc(inviteCodes.createdAt));
  res.json(
    rows.map((r) => ({
      id: r.id,
      code: r.code,
      label: r.label,
      maxUses: r.maxUses,
      uses: r.uses,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

function generateCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++)
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `KGL-${s}`;
}

router.post("/admin/invites", requireAdmin, async (req, res) => {
  const label = String(req.body?.label ?? "").trim();
  const count = Math.max(1, Math.min(100, Number(req.body?.count ?? 1)));
  const maxUses = Math.max(1, Number(req.body?.maxUses ?? 1));
  if (!label) return res.status(400).json({ error: "Label required" });

  const inserted = [];
  for (let i = 0; i < count; i++) {
    const [row] = await db
      .insert(inviteCodes)
      .values({ code: generateCode(), label, maxUses })
      .returning();
    inserted.push(row);
  }
  res.status(201).json(
    inserted.map((r) => ({
      id: r.id,
      code: r.code,
      label: r.label,
      maxUses: r.maxUses,
      uses: r.uses,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

// Neighborhoods CRUD
router.post("/admin/neighborhoods", requireAdmin, async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const sector = req.body?.sector ? String(req.body.sector).trim() : null;
  if (!name) return res.status(400).json({ error: "name required" });
  const [row] = await db
    .insert(neighborhoods)
    .values({ name, sector })
    .onConflictDoNothing({ target: neighborhoods.name })
    .returning();
  if (!row) return res.status(409).json({ error: "Neighborhood already exists" });
  res.status(201).json(row);
});

router.put("/admin/neighborhoods/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const patch: { name?: string; sector?: string | null } = {};
  if (req.body?.name !== undefined) patch.name = String(req.body.name).trim();
  if (req.body?.sector !== undefined)
    patch.sector = req.body.sector ? String(req.body.sector).trim() : null;
  if (Object.keys(patch).length === 0)
    return res.status(400).json({ error: "Nothing to update" });
  const [row] = await db
    .update(neighborhoods)
    .set(patch)
    .where(eq(neighborhoods.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

router.delete("/admin/neighborhoods/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  try {
    const [row] = await db
      .delete(neighborhoods)
      .where(eq(neighborhoods.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.status(204).end();
  } catch {
    res
      .status(409)
      .json({ error: "Neighborhood is referenced by trips or corridors" });
  }
});

// Corridors CRUD
router.post("/admin/corridors", requireAdmin, async (req, res) => {
  const label = String(req.body?.label ?? "").trim();
  const originId = String(req.body?.originId ?? "");
  const destinationId = String(req.body?.destinationId ?? "");
  const distanceKm = String(req.body?.distanceKm ?? "");
  if (!label || !originId || !destinationId || !distanceKm)
    return res.status(400).json({ error: "Missing fields" });
  if (originId === destinationId)
    return res.status(400).json({ error: "Origin and destination must differ" });
  const [row] = await db
    .insert(corridors)
    .values({ label, originId, destinationId, distanceKm })
    .onConflictDoNothing()
    .returning();
  if (!row)
    return res.status(409).json({ error: "Corridor already exists" });
  res.status(201).json(row);
});

router.put("/admin/corridors/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const patch: { label?: string; distanceKm?: string } = {};
  if (req.body?.label !== undefined) patch.label = String(req.body.label).trim();
  if (req.body?.distanceKm !== undefined)
    patch.distanceKm = String(req.body.distanceKm);
  if (Object.keys(patch).length === 0)
    return res.status(400).json({ error: "Nothing to update" });
  const [row] = await db
    .update(corridors)
    .set(patch)
    .where(eq(corridors.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

router.delete("/admin/corridors/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const [row] = await db
    .delete(corridors)
    .where(eq(corridors.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

router.put("/admin/config", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  if (b.fuelPriceRwfPerLitre !== undefined)
    await setConfigValue("fuelPriceRwfPerLitre", Number(b.fuelPriceRwfPerLitre));
  if (b.dieselPriceRwfPerLitre !== undefined)
    await setConfigValue(
      "dieselPriceRwfPerLitre",
      Number(b.dieselPriceRwfPerLitre),
    );
  if (b.vehicleConsumptionLPer100Km !== undefined)
    await setConfigValue(
      "vehicleConsumptionLPer100Km",
      Number(b.vehicleConsumptionLPer100Km),
    );
  res.json(await getPublicConfig());
});

// Invite-code analytics
router.get("/admin/invite-analytics", requireAdmin, async (_req, res) => {
  const invites = await db
    .select()
    .from(inviteCodes)
    .orderBy(desc(inviteCodes.createdAt));
  const out = await Promise.all(
    invites.map(async (inv) => {
      const profilesForInvite = await db
        .select()
        .from(profiles)
        .where(eq(profiles.inviteCodeId, inv.id));
      const userIds = profilesForInvite.map((p) => p.userId);
      let firstTripUsers = 0;
      const corridorCounts = new Map<string, { label: string; n: number }>();
      for (const uid of userIds) {
        const [drv] = await db
          .select({ n: count(trips.id) })
          .from(trips)
          .where(and(eq(trips.driverId, uid), eq(trips.status, "completed")));
        const [rdr] = await db
          .select({ n: count(rideRequests.id) })
          .from(rideRequests)
          .where(
            and(
              eq(rideRequests.riderId, uid),
              eq(rideRequests.status, "completed"),
            ),
          );
        if (Number(drv?.n ?? 0) + Number(rdr?.n ?? 0) > 0) firstTripUsers += 1;

        const userTrips = await db
          .select({
            originId: trips.originId,
            destinationId: trips.destinationId,
          })
          .from(trips)
          .where(eq(trips.driverId, uid));
        for (const t of userTrips) {
          const [c] = await db
            .select()
            .from(corridors)
            .where(
              and(
                eq(corridors.originId, t.originId),
                eq(corridors.destinationId, t.destinationId),
              ),
            );
          if (c) {
            const ex = corridorCounts.get(c.id);
            corridorCounts.set(c.id, {
              label: c.label,
              n: (ex?.n ?? 0) + 1,
            });
          }
        }
      }
      return {
        id: inv.id,
        code: inv.code,
        label: inv.label,
        maxUses: inv.maxUses,
        uses: inv.uses,
        signups: profilesForInvite.length,
        firstTripUsers,
        conversionPct: profilesForInvite.length
          ? Math.round((firstTripUsers / profilesForInvite.length) * 1000) / 10
          : 0,
        topCorridors: Array.from(corridorCounts.values())
          .sort((a, b) => b.n - a.n)
          .slice(0, 3)
          .map((c) => ({ corridorLabel: c.label, rides: c.n })),
        createdAt: inv.createdAt.toISOString(),
      };
    }),
  );
  res.json(out);
});

// CSV exports
function toCsv(headers: string[], rows: string[][]): string {
  const esc = (v: string) => {
    if (v == null) return "";
    if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  return [headers.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

router.get("/admin/export/users.csv", requireAdmin, async (_req, res) => {
  const rows = await db.select().from(profiles).orderBy(desc(profiles.createdAt));
  const out = await Promise.all(
    rows.map(async (p) => {
      const [n] = await db
        .select()
        .from(neighborhoods)
        .where(eq(neighborhoods.id, p.neighborhoodId));
      const stats = await getUserStats(p.userId);
      return [
        p.userId,
        p.fullName,
        p.role,
        p.status,
        p.idVerified ? "yes" : "no",
        n?.name ?? "",
        p.phone ?? "",
        String(stats.completedTrips),
        stats.averageRating ? stats.averageRating.toFixed(2) : "",
        p.createdAt.toISOString(),
      ];
    }),
  );
  const csv = toCsv(
    [
      "userId",
      "fullName",
      "role",
      "status",
      "idVerified",
      "neighborhood",
      "phone",
      "completedTrips",
      "averageRating",
      "createdAt",
    ],
    out,
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=users.csv");
  res.send(csv);
});

router.get("/admin/export/trips.csv", requireAdmin, async (_req, res) => {
  const rows = await db.select().from(trips).orderBy(desc(trips.departureDate));
  const out = await Promise.all(
    rows.map(async (t) => {
      const [o] = await db
        .select()
        .from(neighborhoods)
        .where(eq(neighborhoods.id, t.originId));
      const [d] = await db
        .select()
        .from(neighborhoods)
        .where(eq(neighborhoods.id, t.destinationId));
      const [c] = await db
        .select()
        .from(corridors)
        .where(
          and(
            eq(corridors.originId, t.originId),
            eq(corridors.destinationId, t.destinationId),
          ),
        );
      return [
        t.id,
        t.driverId,
        o?.name ?? "",
        d?.name ?? "",
        t.departureDate,
        t.departureTime,
        t.windowEndTime ?? "",
        String(t.seatsTotal),
        String(t.seatsTotal - t.seatsRemaining),
        c ? String(c.distanceKm) : "",
        t.status,
        t.cancelReason ?? "",
        t.createdAt.toISOString(),
      ];
    }),
  );
  const csv = toCsv(
    [
      "tripId",
      "driverId",
      "origin",
      "destination",
      "departureDate",
      "departureTime",
      "windowEnd",
      "seatsTotal",
      "seatsFilled",
      "distanceKm",
      "status",
      "cancelReason",
      "createdAt",
    ],
    out,
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=trips.csv");
  res.send(csv);
});

export default router;
