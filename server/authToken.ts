/**
 * Simple HMAC-signed auth token — replaces Neon Auth JWT.
 * 
 * Token format: base64({userId, exp}) . HMAC-SHA256
 * Server secret from AUTH_SECRET env var (or random fallback).
 */
import crypto from "crypto";

const SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString("hex");
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
