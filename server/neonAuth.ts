import { Request, Response, NextFunction } from "express";
import { verifyToken } from "./authToken";

/**
 * Auth middleware — verifies HMAC-signed tokens issued by our own /api/auth/login & register.
 * No longer depends on Neon Auth / JWKS.
 *
 * The token is delivered as an httpOnly cookie (`prismx_session`) so page JavaScript
 * cannot read it (mitigates XSS token theft). A legacy `Authorization: Bearer` header
 * is still accepted as a fallback for older clients / API tooling.
 */

export const SESSION_COOKIE = "prismx_session";

// SECURITY: the x-user-id impersonation backdoor is dev-only. It is hard-disabled in
// production regardless of the DISABLE_AUTH env var so a stray setting can't bypass auth.
export function isAuthDisabled(): boolean {
  return process.env.DISABLE_AUTH === "true" && process.env.NODE_ENV !== "production";
}

export function readSessionCookie(req: any): string | undefined {
  const raw = req.headers?.cookie || "";
  for (const part of raw.split(";")) {
    const p = part.trim();
    if (p.startsWith(SESSION_COOKIE + "=")) {
      return decodeURIComponent(p.substring(SESSION_COOKIE.length + 1));
    }
  }
  return undefined;
}

export function isAuthenticated(req: any, res: Response, next: NextFunction) {
  if (isAuthDisabled()) {
    req.user = { claims: { sub: req.header("x-user-id") || "demo-user" } };
    req.isAuthenticated = () => true;
    return next();
  }

  // Prefer the httpOnly cookie; fall back to the Bearer header for compatibility.
  let token = readSessionCookie(req);
  if (!token) {
    const authHeader = req.header("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }
  }

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const result = verifyToken(token);
  if (!result) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  req.user = { claims: { sub: result.userId } };
  req.isAuthenticated = () => true;
  next();
}

export function setupAuth(app: any) {
  console.log("[auth] HMAC token auth ready");
}
