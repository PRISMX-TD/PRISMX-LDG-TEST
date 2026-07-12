/**
 * Web Push notification helpers.
 *
 * Browser push relies on VAPID keys. Generate them once:
 *    npx web-push generate-vapid-keys
 * and set in env:
 *    VAPID_PUBLIC_KEY=<public>
 *    VAPID_PRIVATE_KEY=<private>
 *    VAPID_SUBJECT=mailto:admin@example.com   (or https://your.site)
 *
 * If keys are not configured we no-op so the rest of the app still works.
 */

import { db } from "./db";
import { pushSubscriptions } from "@shared/schema";
import { and, eq } from "drizzle-orm";

type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

let webpush: any = null;
let initialized = false;
function ensureInit() {
  if (initialized) return webpush;
  initialized = true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (!pub || !priv) {
    console.warn("[push] VAPID keys not set — push notifications disabled.");
    return null;
  }
  try {
    // Lazy require so projects without web-push installed can still build.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    webpush = require("web-push");
    webpush.setVapidDetails(subject, pub, priv);
    return webpush;
  } catch (err) {
    console.warn("[push] web-push module not installed; push notifications disabled.");
    webpush = null;
    return null;
  }
}

export function getPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<{ sent: number; failed: number }> {
  const wp = ensureInit();
  if (!wp) return { sent: 0, failed: 0 };

  const rows = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  if (rows.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  for (const sub of rows) {
    try {
      await wp.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 24 }
      );
      sent++;
    } catch (err: any) {
      // 410 = unsubscribed; remove the dead endpoint so we stop retrying.
      const code = err?.statusCode;
      if (code === 404 || code === 410) {
        try {
          await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.id, sub.id), eq(pushSubscriptions.userId, userId)));
        } catch {}
      } else {
        console.warn(`[push] send failed for sub ${sub.id}:`, err?.message || err);
      }
      failed++;
    }
  }
  return { sent, failed };
}
