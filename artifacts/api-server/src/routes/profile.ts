import { Router, type IRouter } from "express";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { clerkClient } from "@clerk/express";
import { db } from "../lib/db";
import { profiles, vehicles, inviteCodes, neighborhoods } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getUserStats, vehicleToApi } from "../lib/serializers";

async function getIsAdmin(userId: string): Promise<boolean> {
  try {
    const u = await clerkClient.users.getUser(userId);
    const role =
      (u.publicMetadata as { role?: string } | null)?.role ||
      (u.privateMetadata as { role?: string } | null)?.role;
    return role === "admin";
  } catch {
    return false;
  }
}

async function getPendingInviteCodeId(userId: string): Promise<string | null> {
  try {
    const u = await clerkClient.users.getUser(userId);
    const id = (u.privateMetadata as { pendingInviteCodeId?: string } | null)
      ?.pendingInviteCodeId;
    return id || null;
  } catch {
    return null;
  }
}

async function clearPendingInvite(userId: string) {
  try {
    await clerkClient.users.updateUserMetadata(userId, {
      privateMetadata: { pendingInviteCodeId: null },
    });
  } catch {
    /* ignore */
  }
}

const router: IRouter = Router();

async function fullProfile(userId: string) {
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  if (!p) return null;
  const [v] = await db.select().from(vehicles).where(eq(vehicles.userId, userId));
  let inviteLabel: string | null = null;
  if (p.inviteCodeId) {
    const [inv] = await db
      .select()
      .from(inviteCodes)
      .where(eq(inviteCodes.id, p.inviteCodeId));
    inviteLabel = inv?.label ?? null;
  }
  const stats = await getUserStats(p.userId);
  const isAdmin = await getIsAdmin(p.userId);
  return {
    userId: p.userId,
    fullName: p.fullName,
    gender: p.gender,
    role: p.role,
    neighborhoodId: p.neighborhoodId,
    homePickupPoint: p.homePickupPoint,
    employer: p.employer,
    phone: p.phone,
    emergencyContactName: p.emergencyContactName,
    emergencyContactPhone: p.emergencyContactPhone,
    status: p.status,
    avatarUrl: p.avatarUrl,
    averageRating: stats.averageRating,
    completedTrips: stats.completedTrips,
    vehicle: vehicleToApi(v ?? null, { includePrivate: true }),
    inviteLabel,
    isAdmin,
    idVerified: p.idVerified,
    preferredLanguage: p.preferredLanguage,
    blockedAt: p.blockedAt?.toISOString() ?? null,
    blockedReason: p.blockedReason,
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/profile/me", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const fp = await fullProfile(userId);
  if (!fp) return res.status(404).json({ error: "Profile not found" });
  res.json(fp);
});

router.put("/profile/me", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const b = req.body ?? {};
  const required = ["fullName", "gender", "role", "neighborhoodId", "phone"];
  for (const k of required) {
    if (!b[k]) return res.status(400).json({ error: `${k} required` });
  }
  const [neigh] = await db
    .select()
    .from(neighborhoods)
    .where(eq(neighborhoods.id, b.neighborhoodId));
  if (!neigh) return res.status(400).json({ error: "Invalid neighborhood" });

  // Enforce invite-only on first profile creation
  const [existingProfile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId));
  let inviteCodeIdToSet: string | null = existingProfile?.inviteCodeId ?? null;
  if (!existingProfile) {
    const pending = await getPendingInviteCodeId(userId);
    if (!pending) {
      return res
        .status(403)
        .json({ error: "Invite required. Redeem an invite code first." });
    }
    inviteCodeIdToSet = pending;
  }

  const values = {
    userId,
    fullName: String(b.fullName),
    gender: b.gender,
    role: b.role,
    neighborhoodId: b.neighborhoodId,
    homePickupPoint: b.homePickupPoint ?? null,
    employer: b.employer ?? null,
    phone: String(b.phone),
    emergencyContactName: b.emergencyContactName ?? null,
    emergencyContactPhone: b.emergencyContactPhone ?? null,
  };

  const allowedLangs = ["en", "fr", "rw"] as const;
  const preferredLanguage = allowedLangs.includes(b.preferredLanguage)
    ? (b.preferredLanguage as (typeof allowedLangs)[number])
    : undefined;

  await db
    .insert(profiles)
    .values({
      ...values,
      inviteCodeId: inviteCodeIdToSet,
      ...(preferredLanguage ? { preferredLanguage } : {}),
    })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
        fullName: values.fullName,
        gender: values.gender,
        role: values.role,
        neighborhoodId: values.neighborhoodId,
        homePickupPoint: values.homePickupPoint,
        employer: values.employer,
        phone: values.phone,
        emergencyContactName: values.emergencyContactName,
        emergencyContactPhone: values.emergencyContactPhone,
        ...(preferredLanguage ? { preferredLanguage } : {}),
      },
    });

  if (!existingProfile) {
    await clearPendingInvite(userId);
  }

  const fp = await fullProfile(userId);
  res.json(fp);
});

router.put("/profile/me/vehicle", requireAuth, async (req, res) => {
  const userId = (req as AuthedRequest).userId;
  const b = req.body ?? {};
  for (const k of ["make", "model", "color", "plate", "seats"]) {
    if (b[k] === undefined || b[k] === null || b[k] === "")
      return res.status(400).json({ error: `${k} required` });
  }
  const seats = Math.max(1, Math.min(4, Number(b.seats)));

  const [existingProfile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId));
  if (!existingProfile)
    return res.status(400).json({ error: "Create profile first" });

  const fuelType = b.fuelType === "diesel" ? "diesel" : "petrol";
  const consumption =
    b.consumptionLPer100Km !== undefined &&
    b.consumptionLPer100Km !== null &&
    b.consumptionLPer100Km !== ""
      ? String(Number(b.consumptionLPer100Km))
      : null;
  const values = {
    userId,
    make: String(b.make),
    model: String(b.model),
    color: String(b.color),
    plate: String(b.plate).toUpperCase(),
    seats,
    photoUrl: b.photoUrl ?? null,
    nationalId: b.nationalId ?? null,
    fuelType: fuelType as "petrol" | "diesel",
    consumptionLPer100Km: consumption,
  };
  const [existingVehicle] = await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.userId, userId));
  let saved;
  if (existingVehicle) {
    [saved] = await db
      .update(vehicles)
      .set(values)
      .where(eq(vehicles.userId, userId))
      .returning();
  } else {
    [saved] = await db.insert(vehicles).values(values).returning();
  }
  res.json(vehicleToApi(saved));
});

router.get("/profile/:userId", requireAuth, async (req, res) => {
  const target = String(req.params.userId);
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, target));
  if (!p) return res.status(404).json({ error: "Not found" });
  const [v] = await db.select().from(vehicles).where(eq(vehicles.userId, target));
  const [n] = await db
    .select()
    .from(neighborhoods)
    .where(eq(neighborhoods.id, p.neighborhoodId));
  const stats = await getUserStats(p.userId);
  res.json({
    userId: p.userId,
    fullName: p.fullName,
    role: p.role,
    avatarUrl: p.avatarUrl,
    averageRating: stats.averageRating,
    completedTrips: stats.completedTrips,
    neighborhoodName: n?.name ?? null,
    gender: p.gender,
    vehicle: vehicleToApi(v ?? null),
    idVerified: p.idVerified,
  });
});

export default router;
