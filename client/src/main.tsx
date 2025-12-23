import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('PRISMX PWA: Service Worker registered:', registration.scope);
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
        let reloaded = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloaded) return;
          reloaded = true;
          window.location.reload();
        });
      })
      .catch((error) => {
        console.log('PRISMX PWA: Service Worker registration failed:', error);
      });
  });
}

if (typeof window !== 'undefined') {
  const idle = (fn: () => void) => {
    const ric = (window as any).requestIdleCallback;
    if (typeof ric === 'function') ric(fn);
    else setTimeout(fn, 2000);
  };
  idle(() => {
    import('recharts').catch(() => {});
    Promise.all([
      import('@/pages/Dashboard'),
      import('@/pages/Transactions'),
      import('@/pages/Categories'),
      import('@/pages/Wallets'),
      import('@/pages/Budgets'),
      import('@/pages/Savings'),
      import('@/pages/Recurring'),
      import('@/pages/Reminders'),
      import('@/pages/Analytics'),
      import('@/pages/Reports'),
      import('@/pages/Settings'),
      import('@/pages/Exchange'),
      import('@/pages/SubLedgers'),
      import('@/pages/WalletDetail'),
      import('@/pages/Split'),
      import('@/pages/Landing'),
      import('@/pages/Auth'),
      import('@/pages/not-found'),
    ]).catch(() => {});
  });
}
