import { Eye, EyeOff } from "lucide-react";
import { getCurrencyInfo } from "@shared/schema";
import { usePrivacyMode } from "@/hooks/usePrivacyMode";
import { HeroCard } from "@/components/ds/HeroCard";
import { WinChip } from "@/components/ds/WinChip";

interface MetricsGridProps {
  totalAssets: number;
  liquidAssets: number;
  monthlyExpense: number;
  monthlyIncome: number;
  showTotalAssets?: boolean;
  showMonthlyIncome?: boolean;
  showMonthlyExpense?: boolean;
  showFlexibleFunds?: boolean;
  prevMonthlyExpense?: number;
  prevMonthlyIncome?: number;
  prevTotalAssets?: number;
  prevLiquidAssets?: number;
  currencyCode?: string;
}

/**
 * Obsidian theme dashboard metrics — total assets as a frosted hero (B),
 * monthly numbers as calm tiles (D), positive momentum as warm chips (E).
 */
export function MetricsGrid({
  totalAssets,
  liquidAssets,
  monthlyExpense,
  monthlyIncome,
  showTotalAssets = true,
  showMonthlyIncome = true,
  showMonthlyExpense = true,
  showFlexibleFunds = false,
  prevMonthlyExpense = 0,
  prevTotalAssets = 0,
  currencyCode = "MYR",
}: MetricsGridProps) {
  const currency = getCurrencyInfo(currencyCode);
  const { isPrivacyMode, togglePrivacyMode } = usePrivacyMode();
  const netSavings = monthlyIncome - monthlyExpense;
  const savingsRate = monthlyIncome > 0 ? ((netSavings / monthlyIncome) * 100) : 0;
  const assetTrendPct = prevTotalAssets > 0 ? ((totalAssets - prevTotalAssets) / prevTotalAssets) * 100 : null;
  const expenseTrend = prevMonthlyExpense > 0 ? ((monthlyExpense - prevMonthlyExpense) / prevMonthlyExpense) * 100 : null;

  const fmt = (n: number) => {
    if (isPrivacyMode) return "******";
    return n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <section className="space-y-4 mb-6">
      {showTotalAssets && (
        <HeroCard>
          <div className="flex items-start justify-between mb-1.5">
            <p className="text-[11px] tracking-wide uppercase text-foreground/65">总资产</p>
            <button
              onClick={togglePrivacyMode}
              className="text-foreground/40 hover:text-foreground/80 transition-colors -mr-1 -mt-0.5"
              title={isPrivacyMode ? "显示金额" : "隐藏金额"}
            >
              {isPrivacyMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="font-medium tracking-tight leading-none flex items-baseline flex-wrap">
            <span className="text-4xl md:text-[40px]">{currency.symbol} {fmt(totalAssets).split(".")[0]}</span>
            {!isPrivacyMode && (
              <span className="text-2xl text-foreground/55 ml-0.5">.{fmt(totalAssets).split(".")[1]}</span>
            )}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {assetTrendPct !== null && (
              <p className={`text-xs ${assetTrendPct >= 0 ? "text-income" : "text-expense"}`}>
                较上月 {assetTrendPct >= 0 ? "+" : ""}{assetTrendPct.toFixed(1)}%
              </p>
            )}
            {netSavings > 0 && monthlyIncome > 0 && (
              <WinChip kind="trend">
                储蓄率 {savingsRate.toFixed(0)}%
              </WinChip>
            )}
          </div>
        </HeroCard>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {showMonthlyIncome && (
          <Tile
            label="本月收入"
            valueLabel={`+ ${currency.symbol} ${fmt(monthlyIncome)}`}
            tone="income"
          />
        )}
        {showMonthlyExpense && (
          <Tile
            label="本月支出"
            valueLabel={`− ${currency.symbol} ${fmt(monthlyExpense)}`}
            tone="expense"
            sub={expenseTrend !== null
              ? `较上月 ${expenseTrend >= 0 ? "+" : ""}${expenseTrend.toFixed(1)}%`
              : undefined}
            subTone={expenseTrend !== null && expenseTrend > 0 ? "warn" : "muted"}
          />
        )}
        {showFlexibleFunds && (
          <Tile
            label="可灵活调用"
            valueLabel={`${currency.symbol} ${fmt(liquidAssets)}`}
          />
        )}
      </div>
    </section>
  );
}

function Tile({
  label,
  valueLabel,
  tone = "neutral",
  sub,
  subTone = "muted",
}: {
  label: string;
  valueLabel: string;
  tone?: "income" | "expense" | "neutral";
  sub?: string;
  subTone?: "muted" | "warn";
}) {
  const valueClass =
    tone === "income" ? "text-income"
    : tone === "expense" ? "text-expense"
    : "text-foreground";
  return (
    <div className="glass-card p-4">
      <p className="text-[11px] text-muted-foreground mb-1.5">{label}</p>
      <p className={`text-lg md:text-xl font-medium font-mono leading-tight ${valueClass}`}>
        {valueLabel}
      </p>
      {sub && (
        <p className={`text-[11px] mt-1.5 ${subTone === "warn" ? "text-warm" : "text-muted-foreground"}`}>
          {sub}
        </p>
      )}
    </div>
  );
}
