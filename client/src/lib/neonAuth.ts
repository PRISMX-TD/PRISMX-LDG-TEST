/**
 * Neon Auth client — provides auth methods via @neondatabase/auth SDK.
 * 
 * Falls back to a simple token-as-userId mode when NEON_AUTH_URL is not set,
 * so the app works in development without Neon Auth enabled.
 */

import { createAuthClient } from "@neondatabase/auth";

const NEON_AUTH_URL = import.meta.env.VITE_NEON_AUTH_URL || "";

export const neonAuth = createAuthClient(NEON_AUTH_URL || "https://localhost:5005");

/**
 * Sign in with email and password.
 * Returns the JWT token on success.
 */
export async function signIn(email: string, password: string): Promise<{ token: string; userId: string }> {
  if (!NEON_AUTH_URL) {
    // Dev fallback: use email as userId (the server will accept raw tokens)
    console.warn("[neon-auth] NEON_AUTH_URL not set — using email as userId (dev only)");
    return { token: email, userId: email };
  }

  const result = await neonAuth.signIn.email({ email, password });
  if (result.error) throw new Error(result.error.message);
  
  const session = await neonAuth.getSession();
  if (!session.data?.session?.token) throw new Error("No session token");
  
  return { token: session.data.session.token, userId: session.data.user?.id || "" };
}

/**
 * Sign up with email and password.
 */
export async function signUp(email: string, password: string, name: string): Promise<{ token: string; userId: string }> {
  if (!NEON_AUTH_URL) {
    console.warn("[neon-auth] NEON_AUTH_URL not set — using email as userId (dev only)");
    return { token: email, userId: email };
  }

  const result = await neonAuth.signUp.email({ email, password, name });
  if (result.error) throw new Error(result.error.message);

  const session = await neonAuth.getSession();
  if (!session.data?.session?.token) throw new Error("No session token");

  return { token: session.data.session.token, userId: session.data.user?.id || "" };
}

/**
 * Sign out the current user.
 */
export async function signOut(): Promise<void> {
  if (!NEON_AUTH_URL) return;
  await neonAuth.signOut();
}

/**
 * Get the current session token (JWT) for API requests.
 */
export async function getSessionToken(): Promise<string | null> {
  if (!NEON_AUTH_URL) {
    // Dev: return userId from localStorage
    return localStorage.getItem("devUserId");
  }
  const session = await neonAuth.getSession();
  return session.data?.session?.token || null;
}

/**
 * Send a password reset email.
 */
export async function forgotPassword(email: string): Promise<void> {
  if (!NEON_AUTH_URL) {
    console.warn("[neon-auth] NEON_AUTH_URL not set — cannot send password reset email");
    throw new Error("NEON_AUTH_URL not configured");
  }
  const result = await neonAuth.forgotPassword.email({ email });
  if (result.error) throw new Error(result.error.message);
}

/**
 * Reset password using the token from the email.
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  if (!NEON_AUTH_URL) {
    throw new Error("NEON_AUTH_URL not configured");
  }
  const result = await neonAuth.resetPassword.email({ token, password: newPassword });
  if (result.error) throw new Error(result.error.message);
}
