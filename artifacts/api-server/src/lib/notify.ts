import webpush from "web-push";
import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "./logger";
import { db } from "./db";
import { pushSubscriptions } from "@workspace/db";
import { eq } from "drizzle-orm";

let mailTransport: Transporter | null = null;
let mailConfigured: boolean | null = null;
function ensureMail(): Transporter | null {
  if (mailConfigured !== null) return mailTransport;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    mailConfigured = false;
    return null;
  }
  mailTransport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  mailConfigured = true;
  return mailTransport;
}

async function emailToUser(p: NotificationPayload) {
  if (!p.toEmail) return;
  const t = ensureMail();
  if (!t) {
    logger.info(
      { kind: p.kind, toEmail: p.toEmail, subject: p.subject },
      "email.skipped.smtp_not_configured",
    );
    return;
  }
  try {
    await t.sendMail({
      from:
        process.env.SMTP_FROM || "KigaliWeShare <pilot@kigaliweshare.rw>",
      to: p.toEmail,
      subject: p.subject,
      text: p.body,
    });
  } catch (err) {
    logger.warn({ err, kind: p.kind }, "email.send.failed");
  }
}

let vapidConfigured = false;
function ensureVapid() {
  if (vapidConfigured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT || "mailto:pilot@kigaliweshare.rw";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subj, pub, priv);
  vapidConfigured = true;
  return true;
}

export type NotificationKind =
  | "request.created"
  | "request.approved"
  | "request.declined"
  | "trip.cancelled"
  | "trip.starting_soon"
  | "rating.requested";

export interface NotificationPayload {
  kind: NotificationKind;
  toUserId: string;
  toEmail?: string | null;
  subject: string;
  body: string;
  url?: string;
  meta?: Record<string, string | number | null>;
}

async function pushToUser(userId: string, p: NotificationPayload) {
  if (!ensureVapid()) return;
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        },
        JSON.stringify({
          title: p.subject,
          body: p.body,
          url: p.url ?? "/app",
          kind: p.kind,
          meta: p.meta ?? {},
        }),
      );
    } catch (err: unknown) {
      const e = err as { statusCode?: number };
      if (e.statusCode === 404 || e.statusCode === 410) {
        await db
          .delete(pushSubscriptions)
          .where(eq(pushSubscriptions.endpoint, s.endpoint));
      } else {
        logger.warn({ err, endpoint: s.endpoint }, "push.send.failed");
      }
    }
  }
}

export async function sendNotification(p: NotificationPayload): Promise<void> {
  try {
    logger.info(
      {
        notification: {
          kind: p.kind,
          toUserId: p.toUserId,
          toEmail: p.toEmail ?? null,
          subject: p.subject,
          meta: p.meta ?? {},
        },
      },
      "notification.dispatch",
    );
    await Promise.all([pushToUser(p.toUserId, p), emailToUser(p)]);
  } catch (err) {
    logger.warn({ err }, "notification.dispatch.failed");
  }
}
