/**
 * Neon Auth client — provides auth methods via @neondatabase/auth SDK.
 * 
 * Fetches NEON_AUTH_URL from /api/config at runtime so it works even when
 * VITE_* build-time vars aren't available.
 * Falls back to a simple token-as-userId mode when no URL is configured.
 */

import { createAuthClient } from "@neondatabase/auth";

let _neonAuthUrl: string | null = null;
let _neonAuth: ReturnType<typeof createAuthClient> | null = null;

async function getAuthUrl(): Promise<string> {
  if (_neonAuthUrl !== null) return _neonAuthUrl;

  // Try Vite env first (build-time)
  const viteUrl = import.meta.env.VITE_NEON_AUTH_URL;
  if (viteUrl) {
    _neonAuthUrl = viteUrl;
    return _neonAuthUrl;
  }

  // Fallback: fetch from server at runtime
  try {
    const res = await fetch("/api/config");
    if (res.ok) {
      const data = await res.json();
      _neonAuthUrl = data.neonAuthUrl || "";
      return _neonAuthUrl;
    }
  } catch {}

  _neonAuthUrl = "";
  return _neonAuthUrl;
}

function getClient(url: string) {
  if (!_neonAuth) {
    _neonAuth = createAuthClient(url || "https://localhost:5005");
  }
  return _neonAuth;
}

export async function signIn(email: string, password: string): Promise<{ token: string; userId: string }> {
  const url = await getAuthUrl();
  if (!url) {
    console.warn("[neon-auth] NEON_AUTH_URL not set — using email as userId (dev only)");
    return { token: email, userId: email };
  }

  const client = getClient(url);
  const result = await client.signIn.email({ email, password });
  if (result.error) throw new Error(result.error.message);

  const session = await client.getSession();
  if (!session.data?.session?.token) throw new Error("No session token");

  return { token: session.data.session.token, userId: session.data.user?.id || "" };
}

export async function signUp(email: string, password: string, name: string): Promise<{ token: string; userId: string }> {
  const url = await getAuthUrl();
  if (!url) {
    console.warn("[neon-auth] NEON_AUTH_URL not set — using email as userId (dev only)");
    return { token: email, userId: email };
  }

  const client = getClient(url);
  const result = await client.signUp.email({ email, password, name });
  if (result.error) throw new Error(result.error.message);

  const session = await client.getSession();
  if (!session.data?.session?.token) throw new Error("No session token");

  return { token: session.data.session.token, userId: session.data.user?.id || "" };
}

export async function signOut(): Promise<void> {
  const url = await getAuthUrl();
  if (!url) return;
  const client = getClient(url);
  await client.signOut();
}

export async function getSessionToken(): Promise<string | null> {
  const url = await getAuthUrl();
  if (!url) {
    return localStorage.getItem("devUserId");
  }
  const client = getClient(url);
  const session = await client.getSession();
  return session.data?.session?.token || null;
}

export async function forgotPassword(email: string): Promise<void> {
  const url = await getAuthUrl();
  if (!url) {
    console.warn("[neon-auth] NEON_AUTH_URL not set — cannot send password reset email");
    throw new Error("NEON_AUTH_URL not configured");
  }
  const client = getClient(url);
  const result = await client.forgotPassword.email({ email });
  if (result.error) throw new Error(result.error.message);
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const url = await getAuthUrl();
  if (!url) {
    throw new Error("NEON_AUTH_URL not configured");
  }
  const client = getClient(url);
  const result = await client.resetPassword.email({ token, password: newPassword });
  if (result.error) throw new Error(result.error.message);
}
