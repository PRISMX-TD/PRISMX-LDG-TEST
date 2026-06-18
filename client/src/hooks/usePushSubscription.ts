import { useEffect, useRef } from "react";
import { apiRequest } from "@/lib/queryClient";

/**
 * Asks the user for notification permission once per session and registers
 * the resulting push subscription with the backend. Silently no-ops if:
 *   - the browser doesn't support service workers or push
 *   - the backend has no VAPID public key configured
 *   - the user has already denied permission
 */
export function usePushSubscription(): void {
  const triedRef = useRef(false);

  useEffect(() => {
    if (triedRef.current) return;
    triedRef.current = true;

    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission === "denied") return;

    const lastAskedRaw = (() => {
      try { return localStorage.getItem("push_last_asked"); } catch { return null; }
    })();
    if (lastAskedRaw && Date.now() - parseInt(lastAskedRaw, 10) < 24 * 60 * 60 * 1000) {
      // Don't pester more than once a day.
      // Re-sync existing subscription if any so the server still knows about us.
      void resyncExistingSubscription();
      return;
    }

    void (async () => {
      try {
        try { localStorage.setItem("push_last_asked", String(Date.now())); } catch {}

        // Lazily fetch the VAPID public key.
        const keyResp = await fetch("/api/push/public-key", { credentials: "include" });
        if (!keyResp.ok) return;
        const { key } = await keyResp.json();
        if (!key) return; // Backend hasn't configured VAPID yet.

        if (Notification.permission === "default") {
          const granted = await Notification.requestPermission();
          if (granted !== "granted") return;
        } else if (Notification.permission !== "granted") {
          return;
        }

        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(key),
          });
        }
        await apiRequest("POST", "/api/push/subscribe", {
          endpoint: sub.endpoint,
          keys: {
            p256dh: arrayBufferToBase64(sub.getKey("p256dh")!),
            auth: arrayBufferToBase64(sub.getKey("auth")!),
          },
          userAgent: navigator.userAgent,
        });
      } catch (err) {
        // Failure is non-fatal — push is a nice-to-have.
        console.warn("[push] subscribe failed", err);
      }
    })();
  }, []);
}

async function resyncExistingSubscription() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await apiRequest("POST", "/api/push/subscribe", {
      endpoint: sub.endpoint,
      keys: {
        p256dh: arrayBufferToBase64(sub.getKey("p256dh")!),
        auth: arrayBufferToBase64(sub.getKey("auth")!),
      },
      userAgent: navigator.userAgent,
    });
  } catch {}
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i);
  return out;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
