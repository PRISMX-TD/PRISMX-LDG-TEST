import { pool } from "./db";

/**
 * Run `fn` while holding a Postgres session-level advisory lock, so that with an
 * autoscale deployment (the scheduler runs on every instance) only ONE instance
 * actually performs a given periodic job per tick — otherwise recurring transactions
 * and push notifications would be duplicated across instances.
 *
 * If a lock can't be acquired (another instance holds it) the tick is skipped.
 * In mock/no-DB mode `pool.connect()` fails and we simply run `fn` (single process).
 *
 * NOTE: session-level advisory locks are tied to a single connection, so they work
 * with the default direct TCP transport (DB_TRANSPORT=tcp). Behind a transaction-mode
 * pooler (e.g. PgBouncer) they may not behave as expected.
 */
export async function withPgLock(key: number, fn: () => Promise<void>): Promise<void> {
  const anyPool: any = pool as any;

  // Mock storage / no real database: just run it (there is only one process).
  if (process.env.DATABASE_URL == null || process.env.DATABASE_URL.includes("dummy")) {
    await fn();
    return;
  }

  let client: any;
  try {
    client = await anyPool.connect();
  } catch {
    // Couldn't get a connection — skip rather than risk duplicate work.
    return;
  }

  try {
    const res = await client.query("SELECT pg_try_advisory_lock($1) AS locked", [key]);
    const locked = res?.rows?.[0]?.locked === true;
    if (!locked) return; // another instance is running this job
    try {
      await fn();
    } finally {
      try { await client.query("SELECT pg_advisory_unlock($1)", [key]); } catch { /* best effort */ }
    }
  } finally {
    try { client.release(); } catch { /* best effort */ }
  }
}

// Distinct lock keys per periodic job.
export const LOCK_RECURRING = 911001;
export const LOCK_REMINDERS = 911002;
