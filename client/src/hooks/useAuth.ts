import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

let isLoggingOut = false;
const AUTH_TIMEOUT_MS = 3000;
const PREVIEW_USER = {
  id: "preview-user",
  email: "preview@prismx.local",
  passwordHash: null,
  firstName: "Preview",
  lastName: "User",
  profileImageUrl: null,
  defaultCurrency: "MYR",
  createdAt: null,
  updatedAt: null,
} as User;

export function setIsLoggingOut(value: boolean) {
  isLoggingOut = value;
}

export function getIsLoggingOut(): boolean {
  return isLoggingOut;
}

export function useAuth() {
  const isDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;
  const isPreviewMode =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("preview") === "1";

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      if (isPreviewMode) return PREVIEW_USER;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
      try {
        const res = await fetch("/api/auth/user", {
          credentials: "include",
          signal: controller.signal,
        });
        if (res.status === 401) return isDev ? PREVIEW_USER : null;
        if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
        return (await res.json()) as User;
      } catch {
        return isDev ? PREVIEW_USER : null;
      } finally {
        clearTimeout(timer);
      }
    },
    retry: false,
  });

  useEffect(() => {
    if (user?.id && !getIsLoggingOut()) {
      try { localStorage.setItem("PRISMX_USER_ID", user.id); } catch {}
    }
  }, [user?.id]);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
  };
}
