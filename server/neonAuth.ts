import { Request, Response, NextFunction } from "express";
import { verifyToken } from "./authToken";

/**
 * Auth middleware — verifies HMAC-signed tokens issued by our own /api/auth/login & register.
 * No longer depends on Neon Auth / JWKS.
 */

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
