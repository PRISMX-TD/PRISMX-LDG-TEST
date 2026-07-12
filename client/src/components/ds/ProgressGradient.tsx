import { cn } from "@/lib/utils";

/**
 * Signature purple → amber progress bar (E aesthetic).
 * If `value` > `max`, the bar fills 100% and flips to amber → red.
 */
export function ProgressGradient({
  value,
  max,
  className,
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  const over = value > max && max > 0;
  return (
    <div className={cn("progress-gradient", over && "over", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
