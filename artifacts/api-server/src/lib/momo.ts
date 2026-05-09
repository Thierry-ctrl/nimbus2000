/**
 * MTN MoMo Collections API client (Rwanda).
 *
 * Used to charge the rider the platform service fee. The rider's fuel share
 * is paid directly to the driver off-platform — this module never touches
 * driver money. See KigaliWeShare_Monetization_Plan.md, Part 3 §3.4.
 *
 * Sandbox: https://sandbox.momodeveloper.mtn.com
 * Production target_environment: rwandamtn
 */
import crypto from "node:crypto";
import { logger } from "./logger";

const SANDBOX_BASE = "https://sandbox.momodeveloper.mtn.com";
const PRODUCTION_BASE = "https://momodeveloper.mtn.co.rw";

export interface MomoConfig {
  primaryKey: string;
  apiUser: string;
  apiKey: string;
  callbackUrl: string;
  targetEnvironment: string; // "sandbox" | "rwandamtn"
  baseUrl: string;
  currency: string;
}

export function loadMomoConfig(): MomoConfig | null {
  const primaryKey = process.env.MOMO_COLLECTION_PRIMARY_KEY;
  const apiUser = process.env.MOMO_COLLECTION_API_USER;
  const apiKey = process.env.MOMO_COLLECTION_API_KEY;
  const callbackUrl = process.env.MOMO_CALLBACK_URL;
  const targetEnvironment = process.env.MOMO_TARGET_ENVIRONMENT ?? "sandbox";
  const currency = process.env.MOMO_CURRENCY ?? "RWF";

  if (!primaryKey || !apiUser || !apiKey || !callbackUrl) return null;

  const baseUrl =
    targetEnvironment === "sandbox" ? SANDBOX_BASE : PRODUCTION_BASE;

  return {
    primaryKey,
    apiUser,
    apiKey,
    callbackUrl,
    targetEnvironment,
    baseUrl,
    currency,
  };
}

interface AccessToken {
  token: string;
  expiresAt: number; // epoch ms
}

let _cachedToken: AccessToken | null = null;

/**
 * Fetch an OAuth2 bearer token. MoMo tokens last ~1 hour; we cache and
 * refresh ~5 minutes before expiry.
 */
export async function getAccessToken(cfg: MomoConfig): Promise<string> {
  const now = Date.now();
  if (_cachedToken && _cachedToken.expiresAt - 5 * 60_000 > now) {
    return _cachedToken.token;
  }

  const basic = Buffer.from(`${cfg.apiUser}:${cfg.apiKey}`).toString("base64");
  const res = await fetch(`${cfg.baseUrl}/collection/token/`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Ocp-Apim-Subscription-Key": cfg.primaryKey,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`momo.token.failed status=${res.status} body=${text}`);
  }

  const body = (await res.json()) as { access_token: string; expires_in: number };
  _cachedToken = {
    token: body.access_token,
    expiresAt: now + body.expires_in * 1000,
  };
  return _cachedToken.token;
}

export interface RequestToPayInput {
  amount: number; // RWF, integer
  externalId: string; // our serviceFees.id
  payerPhone: string; // MSISDN, e.g. 2507XXXXXXXX
  payerMessage: string;
  payeeNote: string;
}

export interface RequestToPayResult {
  referenceId: string; // UUID we generate, used to poll status
}

/**
 * Trigger a RequestToPay against the rider's phone. Returns the referenceId
 * we'll persist on the serviceFees row. The actual payment confirmation
 * arrives later via the callback webhook.
 */
export async function requestToPay(
  cfg: MomoConfig,
  input: RequestToPayInput,
): Promise<RequestToPayResult> {
  const token = await getAccessToken(cfg);
  const referenceId = crypto.randomUUID();

  const res = await fetch(`${cfg.baseUrl}/collection/v1_0/requesttopay`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Reference-Id": referenceId,
      "X-Target-Environment": cfg.targetEnvironment,
      "X-Callback-Url": cfg.callbackUrl,
      "Ocp-Apim-Subscription-Key": cfg.primaryKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: String(input.amount),
      currency: cfg.currency,
      externalId: input.externalId,
      payer: { partyIdType: "MSISDN", partyId: input.payerPhone },
      payerMessage: input.payerMessage.slice(0, 160),
      payeeNote: input.payeeNote.slice(0, 160),
    }),
  });

  if (res.status !== 202) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `momo.requestToPay.failed status=${res.status} body=${text}`,
    );
  }

  return { referenceId };
}

export type MomoTxnStatus = "PENDING" | "SUCCESSFUL" | "FAILED";

export interface RequestToPayStatus {
  status: MomoTxnStatus;
  reason?: string;
  financialTransactionId?: string;
}

export async function getTransactionStatus(
  cfg: MomoConfig,
  referenceId: string,
): Promise<RequestToPayStatus> {
  const token = await getAccessToken(cfg);
  const res = await fetch(
    `${cfg.baseUrl}/collection/v1_0/requesttopay/${referenceId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Target-Environment": cfg.targetEnvironment,
        "Ocp-Apim-Subscription-Key": cfg.primaryKey,
      },
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `momo.status.failed status=${res.status} body=${text}`,
    );
  }

  return (await res.json()) as RequestToPayStatus;
}

/**
 * Validate the MoMo callback signature. MoMo signs callbacks via a shared
 * secret — for now we do a defensive payload-shape check; the user must
 * configure signature validation against their production MoMo setup before
 * going live.
 */
export function validateCallback(
  _headers: Record<string, string | string[] | undefined>,
  body: unknown,
): body is { referenceId: string; status: string } {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return typeof b.referenceId === "string" && typeof b.status === "string";
}

export function logMomoUnavailable(reason: string) {
  logger.warn(
    { reason },
    "momo.disabled — MOMO_* env vars not set; payment flow will reject",
  );
}
