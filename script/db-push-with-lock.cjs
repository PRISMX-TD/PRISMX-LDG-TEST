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

/**
 * Self-heal orphaned sequences.
 *
 * Every identity column in our schema (`id integer generatedAlwaysAsIdentity()`) implicitly
 * creates a Postgres sequence "<table>_id_seq" that is OWNED by the column — in pg_depend
 * this shows up as an auto('a') or internal('i') dependency of the sequence on the column.
 *
 * If a previous push was interrupted (or two instances raced before the lock existed), a
 * sequence can be left behind with NO owning column. Those orphans make every subsequent
 * `drizzle-kit push` fail with 'relation "..._id_seq" already exists' (42P07). Since the
 * container's boot is gated on push, that turned into a hard 502.
 *
 * We drop only sequences that have no owning-column dependency — an attached, legitimate
 * identity sequence always has one, so this can never drop live schema. This is more robust
 * than the previous "base table doesn't exist" heuristic (it also handles the case where the
 * table exists but the sequence got detached).
 */
async function dropOrphanSequences(client) {
  const { rows } = await client.query(`
    SELECT c.relname AS seqname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'S'
      AND n.nspname = 'public'
      AND c.relname LIKE '%\\_id\\_seq'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = c.oid AND d.deptype IN ('a', 'i')
      )
  `);
  for (const { seqname } of rows) {
    console.log(`[db-push] dropping orphan sequence "${seqname}" (not owned by any column)`);
    await client.query(`DROP SEQUENCE IF EXISTS "${seqname}"`);
  }
}

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
      await dropOrphanSequences(client);
      console.log("[db-push] lock acquired — running drizzle-kit push...");
      // --verbose: without it, a run that silently applies nothing (e.g. because it
      // couldn't reach an interactive confirmation in this non-TTY container) looks
      // identical in the logs to a run that applied everything correctly — the only
      // way to tell them apart was to manually inspect the live table columns after
      // the fact. --verbose prints every statement it actually executes, so a "did
      // nothing" run is now visible directly in the deploy logs.
      const result = spawnSync("npx", ["drizzle-kit", "push", "--force", "--verbose"], {
        stdio: "inherit",
        shell: true,
      });
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
      if (result.status !== 0) {
        // IMPORTANT: a failed migration must NOT keep the whole app down (502). Log it
        // loudly (the --verbose output above shows exactly what failed) and continue to
        // boot — schema-dependent features may 500 until it's resolved, but the site stays
        // up and the error is visible in logs instead of an opaque bad gateway.
        console.error("[db-push] drizzle-kit push FAILED — see output above. Booting the app anyway; schema-dependent features may error until this is fixed.");
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
  // Never let a migration-step error (bad connection, lock issue, etc.) block app boot.
  console.error("[db-push] error (continuing to boot the app anyway):", err);
}).finally(() => {
  process.exit(0);
});
