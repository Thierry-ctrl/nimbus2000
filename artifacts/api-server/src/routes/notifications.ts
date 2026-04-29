import { Router, type IRouter } from "express";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { db } from "../lib/db";
import { pushSubscriptions } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const router: IRouter = Router();

router.post("/notifications/subscribe", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const b = req.body ?? {};
  const endpoint = String(b.endpoint ?? "");
  const p256dh = String(b.keys?.p256dh ?? "");
  const auth = String(b.keys?.auth ?? "");
  const userAgent =
    typeof b.userAgent === "string" ? b.userAgent.slice(0, 256) : null;
  if (!endpoint || !p256dh || !auth)
    return res.status(400).json({ error: "Invalid subscription" });

  await db
    .insert(pushSubscriptions)
    .values({ userId, endpoint, p256dh, auth, userAgent })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh, auth, userAgent },
    });
  res.status(201).json({ ok: true });
});

router.delete("/notifications/subscribe", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const endpoint = String(req.body?.endpoint ?? "");
  if (!endpoint) return res.status(400).json({ error: "endpoint required" });
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, endpoint),
      ),
    );
  res.status(204).send();
});

export default router;
