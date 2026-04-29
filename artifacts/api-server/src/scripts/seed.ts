import { db } from "../lib/db";
import {
  neighborhoods,
  corridors,
  config,
  inviteCodes,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const NEIGHBORHOODS: Array<{ name: string; sector?: string }> = [
  { name: "Remera", sector: "Gasabo" },
  { name: "Kimihurura", sector: "Gasabo" },
  { name: "Kacyiru", sector: "Gasabo" },
  { name: "Nyarutarama", sector: "Gasabo" },
  { name: "Kimironko", sector: "Gasabo" },
  { name: "Gisozi", sector: "Gasabo" },
  { name: "Kibagabaga", sector: "Gasabo" },
  { name: "CBD (Nyarugenge)", sector: "Nyarugenge" },
  { name: "Kiyovu", sector: "Nyarugenge" },
  { name: "Nyamirambo", sector: "Nyarugenge" },
  { name: "Kicukiro", sector: "Kicukiro" },
  { name: "Niboye", sector: "Kicukiro" },
  { name: "Kanombe", sector: "Kicukiro" },
];

const CORRIDORS: Array<{ origin: string; destination: string; km: string }> = [
  { origin: "Remera", destination: "CBD (Nyarugenge)", km: "7.50" },
  { origin: "CBD (Nyarugenge)", destination: "Remera", km: "7.50" },
  { origin: "Kimihurura", destination: "Kacyiru", km: "3.20" },
  { origin: "Kacyiru", destination: "Kimihurura", km: "3.20" },
  { origin: "Nyarutarama", destination: "Kiyovu", km: "6.10" },
  { origin: "Kiyovu", destination: "Nyarutarama", km: "6.10" },
  { origin: "Kicukiro", destination: "CBD (Nyarugenge)", km: "8.00" },
  { origin: "CBD (Nyarugenge)", destination: "Kicukiro", km: "8.00" },
  { origin: "Kimironko", destination: "CBD (Nyarugenge)", km: "9.20" },
  { origin: "CBD (Nyarugenge)", destination: "Kimironko", km: "9.20" },
  { origin: "Kanombe", destination: "CBD (Nyarugenge)", km: "11.50" },
  { origin: "CBD (Nyarugenge)", destination: "Kanombe", km: "11.50" },
];

const INVITES: Array<{ code: string; label: string; maxUses: number }> = [
  { code: "KGL-PILOT01", label: "Pilot 01", maxUses: 10 },
  { code: "KGL-PILOT02", label: "Pilot 02", maxUses: 10 },
  { code: "KGL-PILOT03", label: "Pilot 03", maxUses: 10 },
  { code: "KGL-PILOT04", label: "Pilot 04", maxUses: 10 },
  { code: "KGL-DEMO", label: "Demo", maxUses: 50 },
];

const CONFIG: Array<{ key: string; value: string }> = [
  { key: "fuelPriceRwfPerLitre", value: "2938" },
  { key: "dieselPriceRwfPerLitre", value: "2205" },
  { key: "vehicleConsumptionLPer100Km", value: "8" },
  { key: "currency", value: "RWF" },
];

async function upsertNeighborhoods() {
  for (const n of NEIGHBORHOODS) {
    await db
      .insert(neighborhoods)
      .values({ name: n.name, sector: n.sector ?? null })
      .onConflictDoNothing({ target: neighborhoods.name });
  }
}

async function nameToId(): Promise<Map<string, string>> {
  const rows = await db.select().from(neighborhoods);
  return new Map(rows.map((r) => [r.name, r.id]));
}

async function upsertCorridors(map: Map<string, string>) {
  for (const c of CORRIDORS) {
    const o = map.get(c.origin);
    const d = map.get(c.destination);
    if (!o || !d) continue;
    await db
      .insert(corridors)
      .values({
        label: `${c.origin} → ${c.destination}`,
        originId: o,
        destinationId: d,
        distanceKm: c.km,
      })
      .onConflictDoNothing();
  }
}

async function upsertInvites() {
  for (const i of INVITES) {
    await db
      .insert(inviteCodes)
      .values({ code: i.code, label: i.label, maxUses: i.maxUses })
      .onConflictDoNothing({ target: inviteCodes.code });
  }
}

async function upsertConfig() {
  for (const c of CONFIG) {
    await db
      .insert(config)
      .values({ key: c.key, value: c.value })
      .onConflictDoUpdate({
        target: config.key,
        set: { value: sql`EXCLUDED.value`, updatedAt: new Date() },
      });
  }
}

async function main() {
  console.log("Seeding KigaliWeShare reference data...");
  await upsertNeighborhoods();
  const map = await nameToId();
  await upsertCorridors(map);
  await upsertInvites();
  await upsertConfig();
  const [{ n: nCount }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(neighborhoods);
  const [{ n: cCount }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(corridors);
  const [{ n: iCount }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(inviteCodes);
  console.log(
    `Done. neighborhoods=${nCount} corridors=${cCount} invites=${iCount}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
