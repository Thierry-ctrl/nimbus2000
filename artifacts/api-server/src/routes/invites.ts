import { Router, type IRouter } from "express";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { clerkClient } from "@clerk/express";
import { db } from "../lib/db";
import { inviteCodes, profiles } from "@workspace/db";
import { and, eq, lt, sql } from "drizzle-orm";

const router: IRouter = Router();

router.post("/invites/redeem", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const code = String(req.body?.code ?? "").trim();
  if (!code) return res.status(400).json({ error: "Code required" });

  const [invite] = await db
    .select()
    .from(inviteCodes)
    .where(eq(inviteCodes.code, code));
  if (!invite) return res.status(400).json({ error: "Invalid code" });

  // Idempotency: if this user already has a profile bound to this invite, or a
  // pending invite stashed in Clerk, return success without consuming a seat.
  const [existing] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId));
  if (existing?.inviteCodeId === invite.id) {
    return res.json({ inviteCodeId: invite.id, label: invite.label });
  }
  if (existing?.inviteCodeId && existing.inviteCodeId !== invite.id) {
    return res
      .status(400)
      .json({ error: "You already redeemed a different invite" });
  }
  if (!existing) {
    try {
      const u = await clerkClient.users.getUser(userId);
      const pending = (
        u.privateMetadata as { pendingInviteCodeId?: string } | null
      )?.pendingInviteCodeId;
      if (pending === invite.id) {
        return res.json({ inviteCodeId: invite.id, label: invite.label });
      }
      if (pending && pending !== invite.id) {
        return res
          .status(400)
          .json({ error: "You already redeemed a different invite" });
      }
    } catch {
      /* ignore */
    }
  }

  // Atomic consume: only succeeds if uses < maxUses at the SQL level.
  const consumed = await db
    .update(inviteCodes)
    .set({ uses: sql`${inviteCodes.uses} + 1` })
    .where(
      and(eq(inviteCodes.id, invite.id), lt(inviteCodes.uses, inviteCodes.maxUses)),
    )
    .returning({ id: inviteCodes.id });
  if (consumed.length === 0)
    return res.status(400).json({ error: "Code already used" });

  if (existing) {
    await db
      .update(profiles)
      .set({ inviteCodeId: invite.id })
      .where(eq(profiles.userId, userId));
  } else {
    try {
      await clerkClient.users.updateUserMetadata(userId, {
        privateMetadata: { pendingInviteCodeId: invite.id },
      });
    } catch {
      /* non-fatal */
    }
  }

  res.json({ inviteCodeId: invite.id, label: invite.label });
});

export default router;
