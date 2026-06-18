import { Request, Response, NextFunction } from "express";

/**
 * Neon Auth middleware — validates JWT tokens from the Neon Auth client SDK.
 * 
 * NEON_AUTH_URL: base domain for the SDK and JWT issuer
 * NEON_JWKS_URL: full JWKS endpoint URL (includes /neondb/auth path)
 */

const NEON_AUTH_URL = process.env.NEON_AUTH_URL;
const NEON_JWKS_URL = process.env.NEON_JWKS_URL;

async function verifyNeonToken(token: string): Promise<{ sub: string } | null> {
  if (!NEON_AUTH_URL) {
    console.warn("[neon-auth] NEON_AUTH_URL not set — using token as raw userId (dev-only)");
    return { sub: token };
  }

  try {
    const jwksUrl = NEON_JWKS_URL || `${NEON_AUTH_URL}/.well-known/jwks.json`;
    const jwksRes = await fetch(jwksUrl, { signal: AbortSignal.timeout(5000) });
    if (!jwksRes.ok) {
      console.error(`[neon-auth] Failed to fetch JWKS (${jwksUrl}): ${jwksRes.status}`);
      return null;
    }

    const { jwtVerify, createRemoteJWKSet } = await import("jose");
    const JWKS = createRemoteJWKSet(new URL(jwksUrl));
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: NEON_AUTH_URL,
    });
    
    return { sub: payload.sub as string };
  } catch (err: any) {
    console.error("[neon-auth] Token verification failed:", err.message);
    
    if (process.env.NODE_ENV !== "production") {
      console.warn("[neon-auth] Dev fallback: using token as raw userId");
      if (!token.includes(".")) return { sub: token };
    }
    return null;
  }
}

export function isAuthenticated(req: any, res: Response, next: NextFunction) {
  if (process.env.DISABLE_AUTH === "true") {
    req.user = { claims: { sub: req.header("x-user-id") || "demo-user" } };
    req.isAuthenticated = () => true;
    return next();
  }

  const authHeader = req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.slice(7);

  verifyNeonToken(token)
    .then((user) => {
      if (!user) {
        return res.status(401).json({ message: "Invalid token" });
      }
      req.user = { claims: { sub: user.sub } };
      req.isAuthenticated = () => true;
      next();
    })
    .catch(() => {
      res.status(401).json({ message: "Unauthorized" });
    });
}

export function setupAuth(app: any) {
  console.log("[neon-auth] v3 JWT auth: " + (NEON_AUTH_URL ? NEON_AUTH_URL : "DEV-TOKEN-MODE"));
}
