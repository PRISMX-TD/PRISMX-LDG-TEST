import { ReactNode } from "react";
import { Flame, Trophy, Sparkles, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

type WinKind = "streak" | "trophy" | "sparkle" | "trend";

/**
 * Amber achievement chip (E aesthetic).
 * Use sparingly to celebrate streaks, goal milestones, savings wins.
 */
export function WinChip({
  kind = "sparkle",
  children,
  className,
}: {
  kind?: WinKind;
  children: ReactNode;
  className?: string;
}) {
  const Icon = kind === "streak" ? Flame
    : kind === "trophy" ? Trophy
    : kind === "trend" ? TrendingUp
    : Sparkles;
  return (
    <span className={cn("win-chip", className)}>
      <Icon className="w-3 h-3" />
      <span>{children}</span>
    </span>
  );
}
