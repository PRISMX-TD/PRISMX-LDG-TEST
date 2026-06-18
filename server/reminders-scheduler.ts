/**
 * Background tick that:
 *   1. Looks for due / soon-due bill reminders and sends a push notification.
 *   2. On the 1st of every month, snapshots each user's net assets.
 *
 * Runs every 30 minutes. Push delivery is no-op if VAPID isn't configured.
 */

import { db } from "./db";
import { billReminders, monthlyBalanceSnapshots, users, wallets } from "@shared/schema";
import { and, desc, eq, gt, lt } from "drizzle-orm";
import { sendPushToUser } from "./push";

const TICK_INTERVAL_MS = 30 * 60 * 1000;
const NOTIFY_LOOKAHEAD_DAYS = 3;

function log(msg: string) {
  console.log(`[reminders-scheduler] ${msg}`);
}

let timer: NodeJS.Timeout | null = null;
const lastNotifiedAt = new Map<number, number>();

async function notifyDueReminders(): Promise<void> {
  try {
    const lookahead = Date.now() + NOTIFY_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000;
    const rows = await db
      .select()
      .from(billReminders)
      .where(and(eq(billReminders.isPaid, false), lt(billReminders.dueDate, new Date(lookahead))));

    for (const r of rows) {
      // Re-notify at most once per 18h per reminder to avoid spamming.
      const last = lastNotifiedAt.get(r.id) || 0;
      if (Date.now() - last < 18 * 60 * 60 * 1000) continue;

      const daysLeft = Math.ceil((new Date(r.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const when =
        daysLeft < 0
          ? `已逾期 ${Math.abs(daysLeft)} 天`
          : daysLeft === 0
          ? "今天到期"
          : `还有 ${daysLeft} 天到期`;
      await sendPushToUser(r.userId, {
        title: `账单提醒：${r.name}`,
        body: `${when}${r.amount ? ` · 金额 ${r.amount}` : ""}`,
        url: "/reminders",
        tag: `bill-reminder-${r.id}`,
      });
      lastNotifiedAt.set(r.id, Date.now());
    }
  } catch (err) {
    log(`notifyDueReminders error: ${(err as Error).message}`);
  }
}

async function snapshotMonthlyBalances(): Promise<void> {
  // Only run on day 1, between 00:00 and 01:00 UTC, to keep it cheap.
  const now = new Date();
  if (now.getUTCDate() !== 1 || now.getUTCHours() !== 0) return;

  try {
    const userRows = await db.selectDistinct({ id: users.id, currency: users.defaultCurrency }).from(users);
    const year = now.getUTCFullYear();
    const monthOneBased = now.getUTCMonth() + 1; // capturing prior month-end totals
    const targetYear = monthOneBased === 1 ? year - 1 : year;
    const targetMonth = monthOneBased === 1 ? 12 : monthOneBased - 1;

    for (const u of userRows) {
      const walletsRows = await db.select().from(wallets).where(eq(wallets.userId, u.id));
      let total = 0;
      let liquid = 0;
      for (const w of walletsRows) {
        const bal = parseFloat(w.balance || "0");
        const rate = parseFloat(w.exchangeRateToDefault || "1");
        const value = bal * (isNaN(rate) || rate <= 0 ? 1 : rate);
        total += value;
        if (w.isFlexible) liquid += value;
      }
      await db
        .insert(monthlyBalanceSnapshots)
        .values({
          userId: u.id,
          year: targetYear,
          month: targetMonth,
          totalAssets: total.toFixed(2),
          liquidAssets: liquid.toFixed(2),
          currency: u.currency || "MYR",
        })
        .onConflictDoNothing();
    }
    log(`snapshotted ${userRows.length} users for ${targetYear}-${targetMonth}`);
  } catch (err) {
    log(`snapshotMonthlyBalances error: ${(err as Error).message}`);
  }
}

async function tick(): Promise<void> {
  await notifyDueReminders();
  await snapshotMonthlyBalances();
}

export function startRemindersScheduler(): void {
  if (timer) return;
  if (process.env.DISABLE_REMINDERS_SCHEDULER === "true") {
    log("disabled via DISABLE_REMINDERS_SCHEDULER");
    return;
  }
  log(`starting, interval=${TICK_INTERVAL_MS}ms`);
  setTimeout(() => { void tick(); }, 15_000).unref();
  timer = setInterval(() => { void tick(); }, TICK_INTERVAL_MS);
  timer.unref?.();
}

export function stopRemindersScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
