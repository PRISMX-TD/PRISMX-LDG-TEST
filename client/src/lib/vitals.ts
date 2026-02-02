export function startVitalsLogging() {
  if (typeof window === "undefined" || !("PerformanceObserver" in window)) return;
  try {
    const report = (name: string, value: number) => {
      // Simple console logging baseline; can be extended to POST to backend
      console.log(`[WebVitals] ${name}: ${value.toFixed(2)}`);
    };
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if ((entry as any).name === "largest-contentful-paint") {
          report("LCP", entry.startTime);
        }
        if (entry.entryType === "layout-shift") {
          const ls = entry as any;
          if (!ls.hadRecentInput) report("CLS", ls.value);
        }
      }
    });
    po.observe({ type: "largest-contentful-paint", buffered: true } as any);
    po.observe({ type: "layout-shift", buffered: true } as any);
    // INP via EventTiming (experimental)
    try {
      const inp = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as any) {
          if (entry.name === "first-input" || entry.name === "interaction") {
            report("INP", entry.duration || entry.processingEnd - entry.startTime);
          }
        }
      });
      inp.observe({ type: "event", buffered: true } as any);
    } catch {}
  } catch {}
}
