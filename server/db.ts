import dns from "dns";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { Pool as PgPool } from "pg";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

dns.setDefaultResultOrder("ipv4first");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const hostname = new URL(databaseUrl).hostname;
const dbTransport = (process.env.DB_TRANSPORT ?? "tcp").toLowerCase();
const useNeonWebsocket = dbTransport === "ws";

const poolMaxRaw = Number(process.env.DB_POOL_MAX ?? "5");
const poolMax = Number.isFinite(poolMaxRaw) && poolMaxRaw > 0 ? poolMaxRaw : 5;
const idleTimeoutRaw = Number(process.env.DB_POOL_IDLE_TIMEOUT_MS ?? "30000");
const idleTimeoutMillis =
  Number.isFinite(idleTimeoutRaw) && idleTimeoutRaw > 0 ? idleTimeoutRaw : 30000;
const connTimeoutRaw = Number(process.env.DB_POOL_CONN_TIMEOUT_MS ?? "30000");
const connectionTimeoutMillis =
  Number.isFinite(connTimeoutRaw) && connTimeoutRaw > 0 ? connTimeoutRaw : 30000;

let pool: PgPool | NeonPool;
let db: unknown;

if (useNeonWebsocket) {
  neonConfig.webSocketConstructor = ws;
  pool = new NeonPool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    max: poolMax,
    idleTimeoutMillis,
    connectionTimeoutMillis,
    keepAlive: true,
    keepAliveInitialDelayMillis: 0,
    allowExitOnIdle: true,
  });
  db = drizzleNeon(pool, { schema });
} else {
  pool = new PgPool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    max: poolMax,
    idleTimeoutMillis,
    connectionTimeoutMillis,
    keepAlive: true,
    keepAliveInitialDelayMillis: 0,
    allowExitOnIdle: true,
  });
  db = drizzleNodePg(pool, { schema });
}

pool.on("error", (err) => {
  console.error("Database pool error:", err);
});

export { pool, db };
