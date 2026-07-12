/**
 * Simple HMAC-signed auth token — replaces Neon Auth JWT.
 *
 * Token format: base64({userId, exp}) . HMAC-SHA256
 *
 * Secret resolution order:
 *   1. AUTH_SECRET env var (explicit, recommended).
 *   2. Production without the env var: a secret persisted in the `app_secrets`
 *      table. Generated once on first boot; every instance/restart reads the same
 *      row from the database, so tokens stay valid across restarts and multiple
 *      instances without requiring a manual dashboard step.
 *   3. Development without either: a random per-process secret (fine locally —
 *      tokens just don't survive a restart).
 *
 * `ensureAuthSecret()` MUST be awaited once at server boot, before the app starts
 * accepting requests (see server/index.ts). signToken/verifyToken throw if called
 * before that.
 */
import crypto from "crypto";

let SECRET: string | null = null;

export async function ensureAuthSecret(): Promise<void> {
  if (process.env.AUTH_SECRET) {
    SECRET = process.env.AUTH_SECRET;
    return;
  }

  if (process.env.NODE_ENV === "production") {
    const noRealDb = !process.env.DATABASE_URL || process.env.DATABASE_URL.includes("dummy");
    if (noRealDb) {
      throw new Error(
        "AUTH_SECRET is required in production when no database is configured. " +
        "Set a stable, high-entropy value (e.g. `openssl rand -hex 32`)."
      );
    }
    SECRET = await loadOrCreatePersistedSecret();
    console.warn(
      "[authToken] AUTH_SECRET env var not set — using a secret persisted in the " +
      "database (app_secrets table) instead. This works across restarts/instances, " +
      "but setting AUTH_SECRET explicitly is still recommended."
    );
    return;
  }

  console.warn(
    "[authToken] AUTH_SECRET not set — using a random per-process secret (dev only). " +
    "Tokens will be invalidated on restart."
  );
  SECRET = crypto.randomBytes(32).toString("hex");
}

async function loadOrCreatePersistedSecret(): Promise<string> {
  // Lazy import to avoid a hard dependency on the DB module for dev/mock boots.
  const { db } = await import("./db");
  const { sql } = await import("drizzle-orm");

  const candidate = crypto.randomBytes(32).toString("hex");
  // Race-safe: if two instances boot at once, only one INSERT wins; both then
  // SELECT and get the same authoritative value.
  await db.execute(sql`
    INSERT INTO app_secrets (key, value)
    VALUES ('AUTH_SECRET', ${candidate})
    ON CONFLICT (key) DO NOTHING
  `);
  const result: any = await db.execute(sql`SELECT value FROM app_secrets WHERE key = 'AUTH_SECRET'`);
  const row = result?.rows?.[0] ?? result?.[0];
  if (!row?.value) {
    throw new Error("Failed to load or create a persisted AUTH_SECRET (app_secrets table missing? run drizzle push).");
  }
  return row.value as string;
}

function getSecret(): string {
  if (!SECRET) {
    throw new Error(
      "Auth secret not initialized — ensureAuthSecret() must be awaited before handling requests."
    );
  }
  return SECRET;
}

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function signToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, exp: Date.now() + TOKEN_TTL_MS })
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    const dot = token.lastIndexOf(".");
    if (dot < 0) return null;
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = crypto
      .createHmac("sha256", getSecret())
      .update(payload)
      .digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return null;
    }
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!data.userId || typeof data.exp !== "number") return null;
    if (data.exp < Date.now()) return null;
    return { userId: data.userId };
  } catch {
    return null;
  }
}
