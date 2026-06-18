import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Frosted glass hero card — used SPARINGLY (B aesthetic).
 *
 * Use for ONE card per page max: total assets, savings hero, etc.
 * Ordinary cards should use `glass-card` (D aesthetic) instead.
 */
export function HeroCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("hero-glass p-5 md:p-6", className)}>
      {children}
    </div>
  );
}
