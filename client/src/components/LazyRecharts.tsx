import { useEffect, useRef, useState } from "react";

interface LazyRechartsProps {
  children: (Recharts: any) => JSX.Element;
  rootMargin?: string;
  className?: string;
}

export function LazyRecharts({ children, rootMargin = "200px", className }: LazyRechartsProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [Recharts, setRecharts] = useState<any>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setIsVisible(true);
    }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);

  useEffect(() => {
    if (!isVisible || Recharts) return;
    import("recharts").then((mod) => setRecharts(mod));
  }, [isVisible, Recharts]);

  return (
    <div ref={ref} className={className}>
      {Recharts && isVisible ? children(Recharts) : (
        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">加载中...</div>
      )}
    </div>
  );
}

