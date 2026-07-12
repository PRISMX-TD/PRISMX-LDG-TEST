import { useEffect } from "react";

const HOME_PATHS = ["/", "/dashboard"];

/**
 * Stop the installed PWA from closing unexpectedly on the OS back gesture/button.
 *
 * In standalone (installed) mode the back gesture closes the app the instant the
 * history stack is empty. On a cold start the app lands on the home screen with a
 * single history entry, so one back press quit PRISMX entirely.
 *
 * This guard seeds an extra history entry and, whenever the user is on the home
 * screen, re-absorbs the back press so they stay in the app (they can leave via
 * the phone's home/recents). On every inner page the back gesture still
 * navigates normally — only the "about to exit" case at the root is caught.
 *
 * No-op in a normal browser tab (where back should behave like the browser's).
 */
export function useExitGuard() {
  useEffect(() => {
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;
    if (!isStandalone) return;

    // Seed one guard entry so the first back press at the root is caught here
    // instead of closing the PWA. URL is left unchanged.
    window.history.pushState({ __exitGuard: true }, "");

    const onPopState = () => {
      if (HOME_PATHS.includes(window.location.pathname)) {
        // Back pressed at the home screen → keep the app open.
        window.history.pushState({ __exitGuard: true }, "");
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
}
