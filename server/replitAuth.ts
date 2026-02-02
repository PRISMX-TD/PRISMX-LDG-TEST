import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { db, pool } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { isDbUnavailableError } from "./errors";

const isAuthDisabled = process.env.DISABLE_AUTH === "true";
const isLocalAuth = process.env.LOCAL_AUTH === "true" || !process.env.REPL_ID;
const NO_DEMO_COOKIE = "NO_DEMO";
function getCookie(req: any, name: string): string | undefined {
  const cookie = req.headers?.cookie || "";
  const parts = cookie.split(";").map((c: string) => c.trim());
  for (const p of parts) {
    if (p.startsWith(name + "=")) return decodeURIComponent(p.substring(name.length + 1));
  }
  return undefined;
}

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

function verifyPassword(password: string, stored: string) {
  const [method, saltHex, hashHex] = stored.split(":");
  if (method !== "scrypt" || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, salt, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}
const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const secret = process.env.SESSION_SECRET || "default_local_secret";
  
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  let sessionStore: session.Store;
  const storeType = (process.env.SESSION_STORE || (isLocalAuth ? "memory" : "memory")).toLowerCase();
  if (storeType === "pg" && process.env.DATABASE_URL) {
    // Force use memory store to avoid connection issues on Railway
    console.warn("Using MemoryStore for sessions to avoid PG connection issues");
    sessionStore = new session.MemoryStore();
  } else {
    sessionStore = new session.MemoryStore();
  }
  
  const isProduction = process.env.NODE_ENV === "production";
  
  return session({
    secret: secret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1); // Trust first proxy (Railway/Nginx)

  if (isLocalAuth) {
    app.use(getSession());
    app.get("/api/login", (_req, res) => {
      res.redirect("/auth");
    });
    app.post("/api/register", async (req, res) => {
      try {
        const { email, password, firstName, lastName } = req.body || {};
        if (!email || !password || typeof email !== "string" || typeof password !== "string") {
          return res.status(400).json({ message: "Email and password required" });
        }
        const existing = await db.select().from(users).where(eq(users.email, email));
        if (existing.length > 0) {
          return res.status(409).json({ message: "Email already registered" });
        }
        const passwordHash = hashPassword(password);
        const id = crypto.randomUUID();
        const [created] = await db.insert(users).values({ id, email, passwordHash, firstName, lastName }).returning();
        await storage.initializeUserDefaults(created.id, created.defaultCurrency);
        res.status(201).json(created);
      } catch (e) {
        if (isDbUnavailableError(e)) {
          return res.status(503).json({ message: "Database unavailable" });
        }
        res.status(500).json({ message: "Registration failed" });
      }
    });

    app.post("/api/login", async (req, res) => {
      try {
        const { email, password } = req.body || {};
        if (!email || !password) {
          return res.status(400).json({ message: "Email and password required" });
        }
        const rows = await db.select().from(users).where(eq(users.email, email));
        const user = rows[0];
        if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
          return res.status(401).json({ message: "Invalid credentials" });
        }
        (req as any).session.userId = user.id;
        await storage.initializeUserDefaults(user.id, user.defaultCurrency);
        res.json(user);
      } catch (e) {
        console.error("Login error:", e);
        if (isDbUnavailableError(e)) {
          return res.status(503).json({ message: "Database unavailable" });
        }
        res.status(500).json({ message: "Login failed" });
      }
    });

    app.post("/api/logout", (req, res) => {
      (req as any).session?.destroy(() => res.status(204).send());
    });
    app.get("/api/logout", (req, res) => {
      (req as any).session?.destroy(() => res.redirect("/"));
    });
    return;
  }

  if (isAuthDisabled) {
    app.use((req, res, next) => {
      const noDemo = getCookie(req, NO_DEMO_COOKIE);
      if (!noDemo) {
        (req as any).user = { claims: { sub: req.header("x-user-id") || "demo-user" } };
        (req as any).isAuthenticated = () => true;
      } else {
        (req as any).isAuthenticated = () => false;
      }
      next();
    });

    app.get("/api/login", (req, res) => {
      const isProd = process.env.NODE_ENV === "production";
      res.setHeader(
        "Set-Cookie",
        `${NO_DEMO_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0${isProd ? "; Secure" : ""}`
      );
      res.redirect("/");
    });
    app.get("/api/callback", (_req, res) => res.redirect("/"));
    app.get("/api/logout", (req, res) => {
      const isProd = process.env.NODE_ENV === "production";
      res.setHeader(
        "Set-Cookie",
        `${NO_DEMO_COOKIE}=1; Path=/; SameSite=Lax${isProd ? "; Secure" : ""}`
      );
      res.redirect("/auth");
    });
    return;
  }

  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  // Keep track of registered strategies
  const registeredStrategies = new Set<string>();

  // Helper function to ensure strategy exists for a domain
  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify,
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (isLocalAuth) {
    const headerUid = (req.headers["x-user-id"] || "") as string;
    if (headerUid) {
      (req as any).user = { claims: { sub: headerUid } };
      return next();
    }
    const sid = (req as any).session?.userId;
    if (!sid) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    (req as any).user = { claims: { sub: sid } };
    return next();
  }
  const noDemoGlobal = getCookie(req, NO_DEMO_COOKIE);
  if (noDemoGlobal) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (isAuthDisabled) {
    return next();
  }
  const headerUid = (req.headers["x-user-id"] || "") as string;
  if (headerUid) {
    (req as any).user = { claims: { sub: headerUid } };
    return next();
  }
  const user = req.user as any;
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  // Fallback support: when open-access fallback sets req.user without expires_at
  if (!user?.expires_at && user?.claims?.sub) {
    return next();
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
