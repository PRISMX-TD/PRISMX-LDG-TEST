import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const isAuthDisabled = process.env.DISABLE_AUTH === "true";
const isLocalAuth = process.env.LOCAL_AUTH === "true";

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
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be set");
  }
  
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  let sessionStore: session.Store;
  const storeType = (process.env.SESSION_STORE || (process.env.LOCAL_AUTH === "true" ? "memory" : "pg")).toLowerCase();
  if (storeType === "pg" && process.env.DATABASE_URL) {
    const PgStore = connectPg(session);
    sessionStore = new PgStore({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: true,
      ttl: sessionTtl,
      tableName: "sessions",
    });
  } else {
    sessionStore = new session.MemoryStore();
  }
  
  const isProduction = process.env.NODE_ENV === "production";
  
  return session({
    secret: process.env.SESSION_SECRET,
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
  app.set("trust proxy", 1);

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
    app.use((req, _res, next) => {
      (req as any).user = { claims: { sub: req.header("x-user-id") || "demo-user" } };
      (req as any).isAuthenticated = () => true;
      next();
    });

    app.get("/api/login", (_req, res) => res.redirect("/"));
    app.get("/api/callback", (_req, res) => res.redirect("/"));
    app.get("/api/logout", (_req, res) => res.redirect("/"));
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
    const sid = (req as any).session?.userId;
    if (!sid) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    (req as any).user = { claims: { sub: sid } };
    return next();
  }
  if (isAuthDisabled) {
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
