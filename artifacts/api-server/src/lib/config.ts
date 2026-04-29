import { db } from "./db";
import { config } from "@workspace/db";
import { eq } from "drizzle-orm";

export const DEFAULTS = {
  fuelPriceRwfPerLitre: 2938,
  dieselPriceRwfPerLitre: 2205,
  vehicleConsumptionLPer100Km: 8,
  currencyCode: "RWF",
  rnpEmergencyNumber: "112",
  vapidPublicKey: "",
};

export async function getConfigValue<K extends keyof typeof DEFAULTS>(
  key: K,
): Promise<(typeof DEFAULTS)[K]> {
  const [row] = await db.select().from(config).where(eq(config.key, key));
  if (!row) return DEFAULTS[key];
  const v = row.value;
  if (typeof DEFAULTS[key] === "number") {
    return Number(v) as (typeof DEFAULTS)[K];
  }
  return v as (typeof DEFAULTS)[K];
}

export async function setConfigValue(key: string, value: string | number) {
  const v = String(value);
  await db
    .insert(config)
    .values({ key, value: v })
    .onConflictDoUpdate({
      target: config.key,
      set: { value: v, updatedAt: new Date() },
    });
}

export async function getPublicConfig() {
  const fuel = await getConfigValue("fuelPriceRwfPerLitre");
  const diesel = await getConfigValue("dieselPriceRwfPerLitre");
  const cons = await getConfigValue("vehicleConsumptionLPer100Km");
  return {
    fuelPriceRwfPerLitre: fuel,
    dieselPriceRwfPerLitre: diesel,
    vehicleConsumptionLPer100Km: cons,
    currencyCode: DEFAULTS.currencyCode,
    rnpEmergencyNumber: DEFAULTS.rnpEmergencyNumber,
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
  };
}
