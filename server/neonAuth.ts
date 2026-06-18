import { Request, Response, NextFunction } from "express";

/**
 * Neon Auth middleware — validates JWT tokens from the Neon Auth client SDK.
 * 
 * The frontend sends `Authorization: Bearer <token>` header.
 * This middleware validates the JWT against Neon's JWKS endpoint
 * and extracts the user ID into `req.user.claims.sub` for consistency
 * with the existing route handlers.
 */

const NEON_AUTH_URL = process.env.NEON_AUTH_URL;

async function verifyNeonToken(token: string): Promise<{ sub: string } | null> {
  if (!NEON_AUTH_URL) {
    // Fallback: if NEON_AUTH_URL isn't set, treat token as raw user ID (dev mode)
    console.warn("[neon-auth] NEON_AUTH_URL not set — using token as raw userId (dev-only)");
    return { sub: token };
  }

  try {
    // Fetch JWKS from Neon Auth
    const jwksUrl = `${NEON_AUTH_URL}/.well-known/jwks`;
    const jwksRes = await fetch(jwksUrl, { signal: AbortSignal.timeout(5000) });
    if (!jwksRes.ok) {
      console.error(`[neon-auth] Failed to fetch JWKS: ${jwksRes.status}`);
      return null;
    }
    const jwks = await jwksRes.json();

    // Validate JWT with the JWKS
    // Using a simple JWT decode + signature verification
    // For production, use jose or jsonwebtoken library
    const { jwtVerify, createRemoteJWKSet } = await import("jose");
    const JWKS = createRemoteJWKSet(new URL(jwksUrl));
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: NEON_AUTH_URL,
    });
    
    return { sub: payload.sub as string };
  } catch (err: any) {
    console.error("[neon-auth] Token verification failed:", err.message);
    
    // Fallback for dev mode — treat the token as a raw user ID
    if (process.env.NODE_ENV !== "production") {
      console.warn("[neon-auth] Dev fallback: using token as raw userId");
      // Only fall back if token looks like a simple ID (no dots = not a JWT)
      if (!token.includes(".")) return { sub: token };
    }
    return null;
  }
}

export function isAuthenticated(req: any, res: Response, next: NextFunction) {
  // DISABLE_AUTH skips all checks
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
  // No session middleware needed — Neon Auth uses stateless JWT
  // Just ensure the isAuthenticated middleware is available
  console.log("[neon-auth] Using JWT-based authentication" + (NEON_AUTH_URL ? ` (${NEON_AUTH_URL})` : " (dev token mode)"));
}
