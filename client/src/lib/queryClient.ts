import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getSessionToken } from "./neonAuth";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

function getFallbackHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = getSessionToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function getCsrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const cookie = document.cookie || '';
  const parts = cookie.split(';').map(c => c.trim());
  for (const p of parts) {
    if (p.startsWith('XSRF-TOKEN=')) return decodeURIComponent(p.slice('XSRF-TOKEN='.length));
  }
  return undefined;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const csrf = method === 'GET' ? undefined : getCsrfToken();
  const headers: Record<string, string> = {};
  if (data) headers["Content-Type"] = "application/json";
  if (csrf) headers['x-csrf-token'] = csrf;
  Object.assign(headers, getFallbackHeaders());
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    let base = String(queryKey[0] || "");
    let url = base;

    const rest = queryKey.slice(1);
    let qsObj: Record<string, unknown> | null = null;
    const pathSegments: string[] = [];

    for (const seg of rest) {
      if (seg && typeof seg === "object") {
        qsObj = { ...(qsObj || {}), ...(seg as Record<string, unknown>) };
      } else if (typeof seg === "string" || typeof seg === "number") {
        const s = String(seg);
        if (s.startsWith("?")) {
          url = `${base}${s}`;
        } else {
          pathSegments.push(s);
        }
      }
    }

    if (pathSegments.length) {
      url = `${base}/${pathSegments.join("/")}`;
    }

    if (!url.includes("?") && qsObj) {
      const usp = new URLSearchParams();
      for (const [k, v] of Object.entries(qsObj)) {
        if (v === undefined || v === null) continue;
        usp.append(k, String(v));
      }
      const qs = usp.toString();
      if (qs) url = `${url}?${qs}`;
    }

    let res = await fetch(url, { credentials: "include", headers: getFallbackHeaders() });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

// Parse the leading HTTP status out of errors thrown by getQueryFn /
// throwIfResNotOk (format: "<status>: <body>"). Returns NaN if none.
function statusFromError(error: unknown): number {
  const msg = String((error as any)?.message || "");
  return parseInt(msg.split(":")[0], 10);
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      // Mobile networks are flaky: previously retry:false + staleTime:Infinity
      // meant a single transient fetch failure left that query's data empty for
      // the whole session (no retry, no refetch), so any data-gated module
      // (`data.length > 0 && ...`) silently disappeared. Retry transient/5xx
      // errors with backoff, but never retry client errors (401/403/404).
      retry: (failureCount, error) => {
        const status = statusFromError(error);
        if (status >= 400 && status < 500) return false;
        return failureCount < 3;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      // Let a query that failed earlier recover when the connection returns or
      // the user navigates back to the page.
      refetchOnReconnect: true,
      refetchOnMount: true,
      staleTime: 30_000,
      gcTime: 1000 * 60 * 30,
    },
    mutations: {
      retry: false,
    },
  },
});
