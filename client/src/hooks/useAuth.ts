import { useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSessionToken, signOut as neonSignOut } from "@/lib/neonAuth";

export interface User {
  id: string;
  username: string;
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  [key: string]: any;
}

const AUTH_TIMEOUT_MS = 8000;

/**
 * Determine if we're running in development mode with a simple token.
 * In production with NEON_AUTH_URL configured, proper JWT is used.
 */
const isDev = import.meta.env.DEV;

/**
 * Fetch wrapper that includes the Neon Auth JWT token in Authorization header.
 */
async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getSessionToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return fetch(path, { ...options, headers, credentials: "include" });
}

/**
 * React hook for authentication state and actions.
 * 
 * In production with Neon Auth: uses JWT tokens from the Neon Auth SDK.
 * In development without Neon Auth: falls back to localStorage devUserId.
 */
export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading, error } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
      try {
        const res = await authFetch("/api/auth/user", { signal: controller.signal });
        if (res.status === 401) return null;
        if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
        return (await res.json()) as User;
      } catch (err: any) {
        if (err?.name === "AbortError") {
          console.warn("[useAuth] /api/auth/user timed out");
          return null;
        }
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  const isAuthenticated = !!user;
  const isChecking = isLoading;

  const logout = useCallback(async () => {
    await neonSignOut();
    localStorage.removeItem("devUserId");
    // Clear all queries so the UI reflects the new auth state
    queryClient.clear();
  }, [queryClient]);

  return {
    user,
    isLoading: isChecking,
    isAuthenticated,
    error,
    logout,
  };
}

/**
 * Set dev mode user ID (only used when NEON_AUTH_URL is not configured).
 */
export function setDevUser(email: string) {
  localStorage.setItem("devUserId", email);
}

/**
 * Hook for login/signup actions.
 */
export function useAuthActions() {
  const queryClient = useQueryClient();

  const login = useCallback(async (email: string, password: string) => {
    const { signIn } = await import("@/lib/neonAuth");
    const result = await signIn(email, password);
    // In dev mode, store the email as userId for subsequent requests
    if (!import.meta.env.VITE_NEON_AUTH_URL) {
      localStorage.setItem("devUserId", result.userId);
    }
    await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    return result;
  }, [queryClient]);

  const signup = useCallback(async (email: string, password: string, name: string) => {
    const { signUp } = await import("@/lib/neonAuth");
    const result = await signUp(email, password, name);
    if (!import.meta.env.VITE_NEON_AUTH_URL) {
      localStorage.setItem("devUserId", result.userId);
    }
    await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    return result;
  }, [queryClient]);

  return { login, signup };
}
