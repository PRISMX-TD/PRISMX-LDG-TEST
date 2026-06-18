import { useMemo } from "react";
import { Flame, Sparkles } from "lucide-react";
import { getCurrencyInfo } from "@shared/schema";

interface TodayCardProps {
  todayExpense: number;
  dailyBudget: number | null; // null when no monthly budget set
  streak: number;             // consecutive days with at least one transaction
  defaultCurrency?: string;
  isPrivate?: boolean;
}

/**
 * Today panel — the answer to "how am I doing today?", which is the question
 * a daily user opens the app to answer. Big number, gentle comparison, single
 * emotional cue.
 */
export function TodayCard({
  todayExpense, dailyBudget, streak, defaultCurrency = "MYR", isPrivate = false,
}: TodayCardProps) {
  const c = getCurrencyInfo(defaultCurrency);
  const remaining = dailyBudget !== null ? Math.max(0, dailyBudget - todayExpense) : null;
  const pct = dailyBudget && dailyBudget > 0
    ? Math.min(100, Math.max(0, (todayExpense / dailyBudget) * 100))
    : 0;
  const over = dailyBudget !== null && todayExpense > dailyBudget;

  const status = useMemo(() => {
    if (dailyBudget === null) return null;
    if (over) return { tone: "expense" as const, label: `已超日预算 ${c.symbol}${(todayExpense - dailyBudget).toFixed(0)}` };
    if (pct < 50)  return { tone: "income" as const,  label: "节奏很稳" };
    if (pct < 80)  return { tone: "neutral" as const, label: "处于安全区间" };
    return            { tone: "warm" as const,   label: "今日花得快了" };
  }, [pct, over, dailyBudget, todayExpense, c.symbol]);

  return (
    <section className="rounded-2xl bg-surface-1 border border-border p-5 md:p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs text-foreground-muted tracking-wider uppercase">今日花费</p>
          <p className="font-mono font-medium tracking-tight mt-1 leading-none flex items-baseline">
            <span className="text-foreground-muted text-base mr-2">{c.symbol}</span>
            <span className="text-[44px] md:text-[56px]">
              {isPrivate ? "***" : todayExpense.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
            {!isPrivate && (
              <span className="text-2xl text-foreground-muted">.{(todayExpense % 1).toFixed(2).slice(2)}</span>
            )}
          </p>
        </div>
        {streak >= 3 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-warm/15 text-warm border border-warm/25 text-[11px] font-medium shrink-0">
            <Flame className="w-3 h-3" />
            连续 {streak} 天
          </span>
        )}
      </div>

      {dailyBudget !== null ? (
        <>
          <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                background: over
                  ? "linear-gradient(90deg, hsl(var(--warm)), hsl(var(--destructive)))"
                  : "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--warm)))",
              }}
            />
          </div>
          <div className="flex items-center justify-between mt-2.5">
            <p className="text-xs text-foreground-muted">
              {over
                ? `日预算 ${c.symbol}${dailyBudget.toFixed(0)}`
                : `日预算还剩 ${c.symbol}${remaining!.toFixed(0)} / ${c.symbol}${dailyBudget.toFixed(0)}`}
            </p>
            {status && (
              <p className={`text-xs font-medium ${
                status.tone === "expense" ? "text-expense"
                : status.tone === "income"  ? "text-income"
                : status.tone === "warm"    ? "text-warm"
                : "text-foreground-muted"
              }`}>{status.label}</p>
            )}
          </div>
        </>
      ) : (
        <p className="text-xs text-foreground-muted inline-flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          设个月度预算，每日就有"还能花多少"的参考线
        </p>
      )}
    </section>
  );
}
