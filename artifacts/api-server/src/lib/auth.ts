import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db } from "./db";
import { profiles } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface AuthedRequest extends Request {
  userId: string;
  isAdmin?: boolean;
  profile?: typeof profiles.$inferSelect;
}

export const requireVerified = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const userId = (req as AuthedRequest).userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  if (!p)
    return res.status(403).json({ error: "Complete onboarding first" });
  if (p.status !== "verified")
    return res
      .status(403)
      .json({ error: "Your account is pending verification" });
  (req as AuthedRequest).profile = p;
  next();
};

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  (req as AuthedRequest).userId = userId as string;
  next();
};

export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const user = await clerkClient.users.getUser(userId as string);
    const role =
      (user.publicMetadata as { role?: string } | null)?.role ||
      (user.privateMetadata as { role?: string } | null)?.role;
    if (role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }
    (req as AuthedRequest).userId = userId as string;
    (req as AuthedRequest).isAdmin = true;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Forbidden" });
  }
};
