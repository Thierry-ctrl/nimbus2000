import { db } from "./db";
import { recurringTrips, trips } from "@workspace/db";
import { and, eq, gte } from "drizzle-orm";
import { logger } from "./logger";

const HORIZON_DAYS = 14;
const RUN_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6h

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Materialize concrete `trips` rows for the next HORIZON_DAYS days from each
 * active recurring template. Idempotent: skips dates where a trip already
 * exists for that template (matched on recurringId + departureDate).
 */
export async function materializeRecurringTrips(): Promise<{
  created: number;
  scanned: number;
}> {
  const templates = await db
    .select()
    .from(recurringTrips)
    .where(eq(recurringTrips.active, true));

  let created = 0;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (const tmpl of templates) {
    const existing = await db
      .select({
        id: trips.id,
        departureDate: trips.departureDate,
      })
      .from(trips)
      .where(
        and(
          eq(trips.recurringId, tmpl.id),
          gte(trips.departureDate, ymd(today)),
        ),
      );
    const taken = new Set(existing.map((r) => r.departureDate));

    for (let i = 0; i < HORIZON_DAYS; i++) {
      const d = new Date(today);
      d.setUTCDate(today.getUTCDate() + i);
      const dow = d.getUTCDay(); // 0=Sun..6=Sat
      if (!tmpl.daysOfWeek.includes(dow)) continue;
      const dateStr = ymd(d);
      if (taken.has(dateStr)) continue;

      await db.insert(trips).values({
        driverId: tmpl.driverId,
        originId: tmpl.originId,
        destinationId: tmpl.destinationId,
        departureDate: dateStr,
        departureTime: tmpl.departureTime,
        flexMinutes: tmpl.flexMinutes,
        seatsTotal: tmpl.seats,
        seatsRemaining: tmpl.seats,
        sameGenderOnly: tmpl.sameGenderOnly,
        notes: tmpl.notes,
        recurringId: tmpl.id,
      });
      created++;
    }
  }
  return { created, scanned: templates.length };
}

let started = false;
export function startRecurringMaterializer(): void {
  if (started) return;
  started = true;
  const run = async () => {
    try {
      const r = await materializeRecurringTrips();
      logger.info(r, "recurring.materialized");
    } catch (err) {
      logger.error({ err }, "recurring.materialize.failed");
    }
  };
  // Run shortly after boot, then every RUN_INTERVAL_MS.
  setTimeout(run, 5_000);
  setInterval(run, RUN_INTERVAL_MS);
}
