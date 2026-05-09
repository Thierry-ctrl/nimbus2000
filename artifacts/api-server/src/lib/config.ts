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
  // Monetization — kill switch defaults to OFF. When false, the API and UI
  // must behave identically to pre-monetization (no fee fields, no fee UI).
  serviceFeeEnabled: false,
  serviceFeePct: 25,
  serviceFeeMinRwf: 50,
  serviceFeeMaxRwf: 5000,
  serviceFeeFreeKm: 3,
};

export async function getConfigValue<K extends keyof typeof DEFAULTS>(
  key: K,
): Promise<(typeof DEFAULTS)[K]> {
  const [row] = await db.select().from(config).where(eq(config.key, key));
  if (!row) return DEFAULTS[key];
  const v = row.value;
  const def = DEFAULTS[key];
  if (typeof def === "number") {
    return Number(v) as (typeof DEFAULTS)[K];
  }
  if (typeof def === "boolean") {
    return (v === "true" || v === "1") as (typeof DEFAULTS)[K];
  }
  return v as (typeof DEFAULTS)[K];
}

export interface ServiceFeeConfig {
  enabled: boolean;
  pct: number;
  minRwf: number;
  maxRwf: number;
  freeKm: number;
}

export async function getServiceFeeConfig(): Promise<ServiceFeeConfig> {
  const [enabled, pct, minRwf, maxRwf, freeKm] = await Promise.all([
    getConfigValue("serviceFeeEnabled"),
    getConfigValue("serviceFeePct"),
    getConfigValue("serviceFeeMinRwf"),
    getConfigValue("serviceFeeMaxRwf"),
    getConfigValue("serviceFeeFreeKm"),
  ]);
  return { enabled, pct, minRwf, maxRwf, freeKm };
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
  const feeEnabled = await getConfigValue("serviceFeeEnabled");
  const feePct = await getConfigValue("serviceFeePct");
  return {
    fuelPriceRwfPerLitre: fuel,
    dieselPriceRwfPerLitre: diesel,
    vehicleConsumptionLPer100Km: cons,
    currencyCode: DEFAULTS.currencyCode,
    rnpEmergencyNumber: DEFAULTS.rnpEmergencyNumber,
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
    // Frontend uses these to decide whether to render fee UI. When false,
    // the entire fee surface area must be hidden.
    serviceFeeEnabled: feeEnabled,
    serviceFeePct: feePct,
  };
}
