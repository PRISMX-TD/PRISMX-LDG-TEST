/**
 * Simple HMAC-signed auth token — replaces Neon Auth JWT.
 * 
 * Token format: base64({userId, exp}) . HMAC-SHA256
 * Server secret from AUTH_SECRET env var (or random fallback).
 */
import crypto from "crypto";

// SECURITY: In production the secret MUST be provided via AUTH_SECRET and be stable
// across instances/restarts. A random per-process fallback would make tokens issued by
// one autoscale instance fail on another (random 401/logout) — so we fail fast instead.
function resolveSecret(): string {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET is required in production. Set a stable, high-entropy value " +
      "(e.g. `openssl rand -hex 32`) so auth tokens survive restarts and work across instances."
    );
  }
  console.warn(
    "[authToken] AUTH_SECRET not set — using a random per-process secret (dev only). " +
    "Tokens will be invalidated on restart."
  );
  return crypto.randomBytes(32).toString("hex");
}

const SECRET = resolveSecret();
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function signToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, exp: Date.now() + TOKEN_TTL_MS })
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", SECRET)
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
      .createHmac("sha256", SECRET)
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
