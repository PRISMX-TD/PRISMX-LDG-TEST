import express, { type Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { isDbUnavailableError } from "./errors";
import { pool } from "./db";
import { startRecurringScheduler, stopRecurringScheduler } from "./recurring-scheduler";
import { startRemindersScheduler, stopRemindersScheduler } from "./reminders-scheduler";
import { ensureAuthSecret } from "./authToken";

const app = express();
const httpServer = createServer(app);
app.set("etag", "strong");
// Trust the first proxy hop (Replit / load balancer). Without this, req.ip is the proxy's
// address so every client shares one bucket and per-IP rate limiting is meaningless.
app.set("trust proxy", 1);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "10mb" }));

// Security headers
app.use((req, res, next) => {
  const isProd = process.env.NODE_ENV === "production";
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), fullscreen=(self)"
  );
  // connect-src is 'self' — the client only talks to our own API. External calls
  // (exchange rates, exchange APIs, DeepSeek) all happen server-side.
  // 'unsafe-eval' is only needed by Vite's dev transform; drop it in production
  // (tesseract's WASM worker uses 'wasm-unsafe-eval', which we keep).
  const scriptSrc = isProd
    ? "script-src 'self' 'unsafe-inline' blob: data: 'wasm-unsafe-eval'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: 'wasm-unsafe-eval'";
  const csp = [
    "default-src 'self' blob: data:",
    "connect-src 'self' blob: data:",
    "img-src 'self' data: https: blob:",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "worker-src 'self' blob: data:",
    "frame-ancestors 'none'",
  ].join("; ");
  res.setHeader("Content-Security-Policy", csp);
  if (isProd && req.protocol === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
  next();
});

// CSRF (double-submit cookie)
const CSRF_COOKIE = "XSRF-TOKEN";
function getCookie(req: Request, name: string): string | undefined {
  const cookie = req.headers.cookie || "";
  const parts = cookie.split(";").map((c) => c.trim());
  for (const p of parts) {
    if (p.startsWith(name + "=")) return decodeURIComponent(p.substring(name.length + 1));
  }
  return undefined;
}

app.use((req, res, next) => {
  const isProd = process.env.NODE_ENV === "production";
  const existing = getCookie(req, CSRF_COOKIE);
  if (!existing) {
    const token = crypto.randomBytes(20).toString("hex");
    // exposed to client JS by design (double submit), keep HttpOnly false
    (res as any).cookie?.(CSRF_COOKIE, token, {
      httpOnly: false,
      sameSite: "lax",
      secure: isProd,
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    }) || res.setHeader(
      "Set-Cookie",
      `${CSRF_COOKIE}=${token}; Path=/; SameSite=Lax${isProd ? "; Secure" : ""}`
    );
  }
  next();
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/") && ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const header = (req.headers["x-csrf-token"] || "") as string;
    const cookieVal = getCookie(req, CSRF_COOKIE);
    if (!header || !cookieVal || header !== cookieVal) {
      return res.status(403).json({ message: "CSRF token invalid" });
    }
  }
  next();
});

const rateMap = new Map<string, number[]>();
function checkRate(key: string, max: number) {
  const now = Date.now();
  const windowMs = 60000;
  const list = rateMap.get(key) || [];
  const filtered = list.filter((t) => now - t < windowMs);
  if (filtered.length === 0) {
    rateMap.delete(key);
  }
  filtered.push(now);
  rateMap.set(key, filtered);
  return filtered.length <= max;
}

setInterval(() => {
  const now = Date.now();
  const windowMs = 60000;
  for (const [key, list] of rateMap.entries()) {
    const fresh = list.filter((t) => now - t < windowMs);
    if (fresh.length === 0) rateMap.delete(key);
    else if (fresh.length !== list.length) rateMap.set(key, fresh);
  }
}, 5 * 60_000).unref();

app.use((req, res, next) => {
  if (req.path.startsWith("/api/") && ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    // SECURITY: do not trust client-supplied x-user-id as a rate-limit key.
    const key = `req:${req.ip}`;
    if (!checkRate(key, 120)) {
      return res.status(429).json({ message: "Too many requests" });
    }
  }
  next();
});

// Stricter limiter for the auth-sensitive endpoints. NOTE: these are the REAL paths
// (/api/auth/login, /api/auth/register, /api/account/forgot-password, /api/account/reset-password)
// — an earlier version checked /api/login & /api/register, which never matched, so this
// limiter effectively did nothing.
const AUTH_SENSITIVE_PATHS = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/account/forgot-password",
  "/api/account/reset-password",
];
app.use((req, res, next) => {
  if (AUTH_SENSITIVE_PATHS.some((p) => req.path.startsWith(p))) {
    const key = `auth:${req.ip}`;
    if (!checkRate(key, 20)) {
      return res.status(429).json({ message: "Too many auth attempts" });
    }
  }
  next();
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    if (req.method === "GET") {
      res.setHeader("Cache-Control", "no-cache");
    } else {
      res.setHeader("Cache-Control", "no-store");
    }
  }
  next();
});

// Keep /health minimal — it's public. Don't leak port/env/auth configuration.
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Keys whose values must never hit the logs (auth tokens, passwords, exchange secrets).
const SENSITIVE_LOG_KEYS = new Set([
  "token", "password", "passwordHash", "apiKey", "apiSecret",
  "currentPassword", "newPassword", "confirmPassword", "confirmPassword",
  "p256dh", "auth",
]);

function redactForLog(value: any, depth = 0): any {
  if (value == null || depth > 4) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redactForLog(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_LOG_KEYS.has(k) ? "***" : redactForLog(v, depth + 1);
    }
    return out;
  }
  return value;
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        let body = JSON.stringify(redactForLog(capturedJsonResponse));
        if (body.length > 500) body = body.slice(0, 500) + "…";
        logLine += ` :: ${body}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Must resolve before any route runs — signToken/verifyToken (used inside
  // registerRoutes' handlers) throw until this completes.
  await ensureAuthSecret();

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const dbUnavailable = isDbUnavailableError(err);
    const status = dbUnavailable ? 503 : err.status || err.statusCode || 500;
    const message = dbUnavailable ? "Database unavailable" : err.message || "Internal Server Error";
    console.error("Server error:", err);
    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 (matches .replit) if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: process.env.HOST || "0.0.0.0",
    },
    () => {
      log(`serving on port ${port}`);
      try { startRecurringScheduler(); } catch (e) { console.error("recurring scheduler failed to start:", e); }
      try { startRemindersScheduler(); } catch (e) { console.error("reminders scheduler failed to start:", e); }
    },
  );

  async function shutdown() {
    try { stopRecurringScheduler(); } catch {}
    try { stopRemindersScheduler(); } catch {}
    try {
      await (pool as any)?.end?.();
    } catch (e) {
      console.error("Error closing database pool:", e);
    }
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  }

  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
})();
