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
 * Self-heal: every identity column in our schema (id integer generatedAlwaysAsIdentity())
 * implicitly creates a Postgres sequence named "<table>_id_seq". If a previous push was
 * interrupted right after the sequence was created but before the table finished (or two
 * instances raced before this lock existed), the leftover sequence makes every subsequent
 * `drizzle-kit push` fail with "relation ... already exists" (42P07) and the container can
 * never boot. Drop any "<table>_id_seq" whose table doesn't actually exist — that state is
 * unambiguously orphaned garbage, never legitimate schema.
 */
async function dropOrphanIdentitySequences(client) {
  const { rows } = await client.query(`
    SELECT c.relname AS seqname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'S' AND n.nspname = 'public' AND c.relname LIKE '%\\_id\\_seq'
  `);
  for (const { seqname } of rows) {
    const baseTable = seqname.replace(/_id_seq$/, "");
    const check = await client.query("SELECT to_regclass($1) AS exists", [`public.${baseTable}`]);
    if (!check.rows[0].exists) {
      console.log(`[db-push] dropping orphan sequence "${seqname}" (table "${baseTable}" does not exist)`);
      await client.query(`DROP SEQUENCE IF EXISTS "${seqname}"`);
    }
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
      await dropOrphanIdentitySequences(client);
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
