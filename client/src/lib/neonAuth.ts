/**
 * Auth client — calls our own /api/auth/* endpoints instead of Neon Auth SDK.
 * Token is stored in localStorage and sent as Bearer header.
 */

const TOKEN_KEY = "prismx_auth_token";
const USER_ID_KEY = "prismx_user_id";

function getCsrfToken(): string | null {
  return document.cookie.split("; ").find((row) => row.startsWith("XSRF-TOKEN="))?.split("=")[1] || null;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const csrf = getCsrfToken();
  if (csrf) headers["x-csrf-token"] = csrf;
  return headers;
}

function saveAuth(token: string, userId: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_ID_KEY, userId);
}

function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_ID_KEY);
}

export async function signIn(email: string, password: string): Promise<{ token: string; userId: string }> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `登录失败 (${res.status})`);
  }
  const data = await res.json();
  saveAuth(data.token, data.userId);
  return { token: data.token, userId: data.userId };
}

export async function signUp(email: string, password: string, name: string): Promise<{ token: string; userId: string }> {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `注册失败 (${res.status})`);
  }
  const data = await res.json();
  saveAuth(data.token, data.userId);
  return { token: data.token, userId: data.userId };
}

export async function signOut(): Promise<void> {
  clearAuth();
}

export function getSessionToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getSessionUserId(): string | null {
  return localStorage.getItem(USER_ID_KEY);
}

export async function forgotPassword(email: string): Promise<void> {
  const res = await fetch("/api/account/forgot-password", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email }),
  });
  // Always return success to not leak user existence
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const res = await fetch("/api/account/reset-password", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ token, password: newPassword }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "重置失败");
  }
}
