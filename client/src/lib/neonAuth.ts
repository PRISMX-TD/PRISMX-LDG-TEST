/**
 * Auth client — calls our own /api/auth/* endpoints.
 *
 * The session token now lives in an httpOnly cookie set by the server, so page
 * JavaScript cannot read it (mitigates XSS token theft) and there is nothing to
 * persist on the client. Requests authenticate via that cookie (credentials are
 * sent automatically for same-origin requests; we set them explicitly to be safe).
 */

function getCsrfToken(): string | null {
  return document.cookie.split("; ").find((row) => row.startsWith("XSRF-TOKEN="))?.split("=")[1] || null;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const csrf = getCsrfToken();
  if (csrf) headers["x-csrf-token"] = csrf;
  return headers;
}

export async function signIn(email: string, password: string): Promise<{ userId: string }> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: authHeaders(),
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `登录失败 (${res.status})`);
  }
  const data = await res.json();
  return { userId: data.userId };
}

export async function signUp(email: string, password: string, name: string): Promise<{ userId: string }> {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: authHeaders(),
    credentials: "include",
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `注册失败 (${res.status})`);
  }
  const data = await res.json();
  return { userId: data.userId };
}

export async function signOut(): Promise<void> {
  // Ask the server to clear the httpOnly session cookie.
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: authHeaders(),
      credentials: "include",
    });
  } catch {
    /* best effort — the query cache is cleared by the caller regardless */
  }
}

// Deprecated shims: the token is now an httpOnly cookie unreadable by JS. These remain
// so existing callers keep compiling; they no longer attach an Authorization header —
// the cookie (sent with credentials: "include") carries the session instead.
export function getSessionToken(): string | null {
  return null;
}

export function getSessionUserId(): string | null {
  return null;
}

export async function forgotPassword(email: string): Promise<void> {
  await fetch("/api/account/forgot-password", {
    method: "POST",
    headers: authHeaders(),
    credentials: "include",
    body: JSON.stringify({ email }),
  });
  // Always resolve — the endpoint intentionally does not reveal whether the email exists.
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const res = await fetch("/api/account/reset-password", {
    method: "POST",
    headers: authHeaders(),
    credentials: "include",
    body: JSON.stringify({ token, password: newPassword }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "重置失败");
  }
}
