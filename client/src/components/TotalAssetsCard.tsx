import { Eye, EyeOff } from "lucide-react";
import type { Wallet as WalletType } from "@shared/schema";
import { getCurrencyInfo } from "@shared/schema";
import { usePrivacyMode } from "@/hooks/usePrivacyMode";
import { HeroCard } from "@/components/ds/HeroCard";

interface TotalAssetsCardProps {
  wallets: WalletType[];
  isLoading?: boolean;
  defaultCurrency?: string;
  trendPct?: number | null;
}

/**
 * The single "hero" card of the dashboard — B aesthetic.
 * Frosted glass + soft purple light source + big number + tiny sparkline-like footer.
 */
export function TotalAssetsCard({ wallets, isLoading, defaultCurrency = "MYR", trendPct = null }: TotalAssetsCardProps) {
  const currencyInfo = getCurrencyInfo(defaultCurrency);
  const { isPrivacyMode, togglePrivacyMode } = usePrivacyMode();

  const total = wallets.reduce((sum, w) => {
    const balance = parseFloat(w.balance || "0");
    const rate = parseFloat(w.exchangeRateToDefault || "1");
    return sum + balance * (w.currency === defaultCurrency ? 1 : (isNaN(rate) || rate <= 0 ? 1 : rate));
  }, 0);

  if (isLoading) {
    return (
      <HeroCard>
        <p className="text-xs text-foreground/65 mb-2">总资产</p>
        <div className="h-10 w-56 bg-surface-2 rounded animate-pulse" />
      </HeroCard>
    );
  }

  const trendStr =
    trendPct === null || trendPct === undefined ? null
    : trendPct >= 0 ? `较上月 +${trendPct.toFixed(1)}%`
    : `较上月 ${trendPct.toFixed(1)}%`;

  // Split integer and decimal for typographic contrast.
  const [intPart, decPart] = total
    .toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .split(".");

  return (
    <HeroCard>
      <div className="flex items-start justify-between mb-1.5">
        <p className="text-[11px] text-foreground/65 tracking-wide uppercase">总资产</p>
        <button
          onClick={togglePrivacyMode}
          className="text-foreground/40 hover:text-foreground/80 transition-colors -mr-1 -mt-0.5"
          title={isPrivacyMode ? "显示金额" : "隐藏金额"}
        >
          {isPrivacyMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      <p className="font-medium tracking-tight leading-none flex items-baseline">
        {isPrivacyMode ? (
          <span className="text-4xl md:text-[40px]">{currencyInfo.symbol} ******</span>
        ) : (
          <>
            <span className="text-4xl md:text-[40px]">{currencyInfo.symbol} {intPart}</span>
            <span className="text-2xl text-foreground/55 ml-0.5">.{decPart}</span>
          </>
        )}
      </p>
      {trendStr ? (
        <p className={`text-xs mt-2 ${trendPct! >= 0 ? "text-income" : "text-expense"}`}>{trendStr}</p>
      ) : (
        <p className="text-xs mt-2 text-foreground/55">{wallets.length} 个账户</p>
      )}
    </HeroCard>
  );
}
