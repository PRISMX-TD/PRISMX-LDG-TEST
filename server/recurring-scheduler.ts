import { storage } from "./storage";
import type { RecurringTransaction } from "@shared/schema";
import { withPgLock, LOCK_RECURRING } from "./pg-lock";

// How often the scheduler wakes up to look for due recurring transactions.
const SCHEDULER_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

function log(msg: string) {
  console.log(`[recurring-scheduler] ${msg}`);
}

/**
 * Given a recurring transaction definition, compute the *next* execution date after a given anchor.
 * We deliberately advance step by step so we never skip a missed period — if the server was offline
 * for 3 days on a daily schedule, we'll still mark the next due date forward properly.
 */
function advanceDate(current: Date, frequency: string, dayOfMonth: number | null, dayOfWeek: number | null): Date {
  const d = new Date(current);
  switch (frequency) {
    case "daily":
      d.setDate(d.getDate() + 1);
      break;
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      if (dayOfMonth && dayOfMonth >= 1 && dayOfMonth <= 31) {
        // Clamp to last day of the new month if necessary (e.g., Jan 31 + 1 month = Feb 28/29)
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        d.setDate(Math.min(dayOfMonth, lastDay));
      }
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      // Unknown frequency: nudge forward 1 day to avoid an infinite loop.
      d.setDate(d.getDate() + 1);
  }
  return d;
}

/**
 * Materialize one recurring transaction into a real ledger transaction.
 * Mirrors the create-transaction balance handling in routes.ts but is intentionally simpler:
 * we don't support cross-currency on recurring entries (the schema doesn't carry currency
 * or exchange rate on the recurring template).
 */
async function materialize(rt: RecurringTransaction, executeAt: Date): Promise<boolean> {
  try {
    const wallet = await storage.getWallet(rt.walletId, rt.userId);
    if (!wallet) {
      log(`skip rt#${rt.id}: wallet ${rt.walletId} no longer exists`);
      return false;
    }
    const amount = parseFloat(rt.amount);
    if (isNaN(amount) || amount <= 0) {
      log(`skip rt#${rt.id}: invalid amount ${rt.amount}`);
      return false;
    }
    const walletCurrency = wallet.currency || "MYR";

    // Insert the transaction and move the balance atomically (no drift on failure).
    const delta = rt.type === "expense" ? -amount : rt.type === "income" ? amount : 0;
    await storage.createTransactionWithEffects({
      userId: rt.userId,
      type: rt.type,
      amount: amount.toFixed(2),
      currency: walletCurrency,
      walletId: rt.walletId,
      categoryId: rt.categoryId || null,
      description: rt.description ? `[定期] ${rt.description}` : "[定期] 自动生成",
      tags: [`recurring:${rt.id}`],
      date: executeAt,
    }, delta !== 0 ? [{ walletId: rt.walletId, delta }] : []);
    return true;
  } catch (err) {
    log(`error materializing rt#${rt.id}: ${(err as Error).message}`);
    return false;
  }
}

async function tick(): Promise<void> {
  // Only one instance runs the job per tick (autoscale-safe).
  await withPgLock(LOCK_RECURRING, runTick);
}

async function runTick(): Promise<void> {
  const now = new Date();
  // We don't have a "list all users" endpoint and recurring rows aren't indexed across users
  // in our storage interface; instead each tick we walk *every* recurring row via a low-level scan.
  // For the current scale (single-digit users on Replit) this is fine; revisit if usage grows.
  try {
    // We have to enumerate users via a coarse trick: pull all unique userIds from recurring rows.
    // Storage doesn't expose that directly, so we use Drizzle to query — but to avoid importing
    // drizzle/db here, we expose this through storage in a follow-up. For now, fall back to
    // scanning per-user only when a recurring row is touched (best effort).
    const allUserIds = await collectUserIdsWithRecurring();
    for (const userId of allUserIds) {
      const items = await storage.getRecurringTransactions(userId);
      for (const rt of items) {
        if (!rt.isActive) continue;
        if (!rt.nextExecutionDate) continue;
        // Execute all overdue periods up to "now" to handle outages.
        let next = new Date(rt.nextExecutionDate);
        let safety = 0;
        while (next <= now && safety < 120) { // hard cap: at most 120 catch-ups per tick per row
          const ok = await materialize(rt, next);
          if (!ok) break;
          next = advanceDate(next, rt.frequency, rt.dayOfMonth ?? null, rt.dayOfWeek ?? null);
          safety++;
          // Persist progress immediately after each generated period so a crash mid-loop
          // cannot replay an already-materialized period (would double-charge the wallet).
          await storage.updateRecurringTransaction(rt.id, userId, { nextExecutionDate: next });
        }
      }
    }
  } catch (err) {
    log(`tick error: ${(err as Error).message}`);
  }
}

// Helper that uses the storage layer indirectly via Drizzle. We import lazily to avoid cycles.
async function collectUserIdsWithRecurring(): Promise<string[]> {
  try {
    const { db } = await import("./db");
    const { recurringTransactions } = await import("@shared/schema");
    const rows = await (db as any)
      .selectDistinct({ userId: recurringTransactions.userId })
      .from(recurringTransactions);
    return rows.map((r: any) => r.userId).filter(Boolean);
  } catch (err) {
    log(`could not enumerate users (probably mock storage): ${(err as Error).message}`);
    return [];
  }
}

let timerHandle: NodeJS.Timeout | null = null;

export function startRecurringScheduler(): void {
  if (timerHandle) return; // already running
  if (process.env.DISABLE_RECURRING_SCHEDULER === "true") {
    log("disabled via DISABLE_RECURRING_SCHEDULER");
    return;
  }
  log(`starting, interval=${SCHEDULER_INTERVAL_MS}ms`);
  // Run once shortly after boot, then on the interval.
  setTimeout(() => { void tick(); }, 10_000).unref();
  timerHandle = setInterval(() => { void tick(); }, SCHEDULER_INTERVAL_MS);
  timerHandle.unref?.();
}

export function stopRecurringScheduler(): void {
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
}
