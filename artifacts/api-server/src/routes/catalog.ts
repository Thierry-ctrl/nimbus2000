import { Router, type IRouter } from "express";
import { db } from "../lib/db";
import { neighborhoods, corridors } from "@workspace/db";
import { getPublicConfig } from "../lib/config";
import { asc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/catalog/neighborhoods", async (_req, res) => {
  const rows = await db
    .select()
    .from(neighborhoods)
    .orderBy(asc(neighborhoods.name));
  res.json(rows);
});

router.get("/catalog/corridors", async (_req, res) => {
  const rows = await db.select().from(corridors).orderBy(asc(corridors.label));
  res.json(
    rows.map((c) => ({
      id: c.id,
      label: c.label,
      originId: c.originId,
      destinationId: c.destinationId,
      distanceKm: Number(c.distanceKm),
    })),
  );
});

router.get("/catalog/config", async (_req, res) => {
  const cfg = await getPublicConfig();
  res.json(cfg);
});

export default router;
