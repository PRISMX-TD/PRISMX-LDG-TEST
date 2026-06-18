import { useCallback } from "react";
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
 * Fetch wrapper that includes our auth token in Authorization header.
 */
function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getSessionToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return fetch(path, { ...options, headers, credentials: "include" });
}

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
 * Hook for login/signup actions.
 */
export function useAuthActions() {
  const queryClient = useQueryClient();

  const login = useCallback(async (email: string, password: string) => {
    const { signIn } = await import("@/lib/neonAuth");
    const result = await signIn(email, password);
    await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    return result;
  }, [queryClient]);

  const signup = useCallback(async (email: string, password: string, name: string) => {
    const { signUp } = await import("@/lib/neonAuth");
    const result = await signUp(email, password, name);
    await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    return result;
  }, [queryClient]);

  return { login, signup };
}
