import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

let isLoggingOut = false;

export function setIsLoggingOut(value: boolean) {
  isLoggingOut = value;
}

export function getIsLoggingOut(): boolean {
  return isLoggingOut;
}

export function useAuth() {
  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/api/auth/user"],
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