#!/usr/bin/env node
/**
 * Guards `drizzle-kit push` behind a Postgres advisory lock.
 *
 * The Dockerfile runs schema push on every container boot. If multiple instances
 * start concurrently (rolling deploy, autoscale, a redeploy racing a still-shutting-
 * down old container), they'd all run DDL at once and can fail with errors like
 * "relation ... already exists" — leaving the app unable to boot.
 *
 * With this wrapper: whichever instance grabs the lock first actually runs the push;
 * every other instance blocks on the same lock (meaning "wait for the migrator to
 * finish"), then continues to start the app once it's released — no DDL race.
 */
const { Client } = require("pg");
const { spawnSync } = require("child_process");

// Distinct from the scheduler lock keys in server/pg-lock.ts (911001/911002).
const LOCK_KEY = 911003;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.includes("dummy")) {
    console.log("[db-push] DATABASE_URL not set — skipping schema push (mock/dev mode).");
    return;
  }

  const sslInsecure = process.env.DB_SSL_INSECURE === "true";
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: !sslInsecure },
  });

  await client.connect();
  try {
    const { rows } = await client.query("SELECT pg_try_advisory_lock($1) AS locked", [LOCK_KEY]);

    if (rows[0].locked) {
      console.log("[db-push] lock acquired — running drizzle-kit push...");
      const result = spawnSync("npx", ["drizzle-kit", "push", "--force"], {
        stdio: "inherit",
        shell: true,
      });
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
      if (result.status !== 0) {
        console.error("[db-push] drizzle-kit push failed");
        process.exit(result.status || 1);
      }
    } else {
      console.log("[db-push] another instance is migrating — waiting for it to finish...");
      // Blocks until the migrating instance releases the lock, then we release our
      // own hold immediately (we don't need to run push ourselves).
      await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
      console.log("[db-push] migration finished elsewhere — continuing startup.");
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[db-push] error:", err);
  process.exit(1);
});
