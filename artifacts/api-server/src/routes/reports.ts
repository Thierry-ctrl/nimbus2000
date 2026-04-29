import { Router, type IRouter } from "express";
import { requireAuth, requireAdmin, type AuthedRequest } from "../lib/auth";
import { db } from "../lib/db";
import { userReports, profiles } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";

const router: IRouter = Router();

router.post("/reports", requireAuth, async (req, res) => {
  const reporterId = (req as AuthedRequest).userId;
  const b = req.body ?? {};
  const reportedUserId = String(b.reportedUserId ?? "");
  const reason = String(b.reason ?? "").trim();
  const tripId = b.tripId ? String(b.tripId) : null;
  const details = b.details ? String(b.details).slice(0, 1000) : null;
  if (!reportedUserId || !reason)
    return res.status(400).json({ error: "reportedUserId and reason required" });
  if (reportedUserId === reporterId)
    return res.status(400).json({ error: "Cannot report yourself" });

  const [target] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, reportedUserId));
  if (!target) return res.status(404).json({ error: "User not found" });

  const [row] = await db
    .insert(userReports)
    .values({ reporterId, reportedUserId, tripId, reason, details })
    .returning();
  res.status(201).json({
    id: row.id,
    reportedUserId: row.reportedUserId,
    tripId: row.tripId,
    reason: row.reason,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  });
});

router.get("/admin/reports", requireAdmin, async (req, res) => {
  const status = String(req.query.status ?? "open");
  const allowed = ["open", "reviewing", "resolved", "dismissed", "all"] as const;
  type S = (typeof allowed)[number];
  const conds =
    status !== "all" && (allowed as readonly string[]).includes(status)
      ? [eq(userReports.status, status as Exclude<S, "all">)]
      : [];
  const rows = await db
    .select()
    .from(userReports)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(userReports.createdAt));
  const out = await Promise.all(
    rows.map(async (r) => {
      const [reporter] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, r.reporterId));
      const [reported] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, r.reportedUserId));
      return {
        id: r.id,
        reporterId: r.reporterId,
        reporterName: reporter?.fullName ?? "",
        reportedUserId: r.reportedUserId,
        reportedName: reported?.fullName ?? "",
        tripId: r.tripId,
        reason: r.reason,
        details: r.details,
        status: r.status,
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
        resolvedByUserId: r.resolvedByUserId,
        resolutionNote: r.resolutionNote,
        createdAt: r.createdAt.toISOString(),
      };
    }),
  );
  res.json(out);
});

router.put("/admin/reports/:id", requireAdmin, async (req, res) => {
  const adminId = (req as AuthedRequest).userId;
  const id = String(req.params.id);
  const b = req.body ?? {};
  const allowed = ["open", "reviewing", "resolved", "dismissed"] as const;
  if (!allowed.includes(b.status))
    return res.status(400).json({ error: "Invalid status" });
  const note = b.resolutionNote ? String(b.resolutionNote).slice(0, 1000) : null;
  const isFinal = b.status === "resolved" || b.status === "dismissed";
  const [row] = await db
    .update(userReports)
    .set({
      status: b.status,
      resolutionNote: note,
      resolvedAt: isFinal ? new Date() : null,
      resolvedByUserId: isFinal ? adminId : null,
    })
    .where(eq(userReports.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });

  if (b.blockUser === true && b.status === "resolved") {
    await db
      .update(profiles)
      .set({
        status: "suspended",
        blockedAt: new Date(),
        blockedReason: note ?? "Suspended after report",
      })
      .where(eq(profiles.userId, row.reportedUserId));
  }

  res.json({
    id: row.id,
    status: row.status,
    resolutionNote: row.resolutionNote,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  });
});

export default router;
