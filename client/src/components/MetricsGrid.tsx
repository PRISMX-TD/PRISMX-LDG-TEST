import { Wallet, CreditCard, Coins, TrendingUp, ArrowUpRight, Eye, EyeOff } from "lucide-react";
import { getCurrencyInfo } from "@shared/schema";
import { usePrivacyMode } from "@/hooks/usePrivacyMode";

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
  prevMonthlyIncome = 0,
  prevTotalAssets = 0,
  prevLiquidAssets = 0,
  currencyCode = "MYR" 
}: MetricsGridProps) {
  const currency = getCurrencyInfo(currencyCode);
  const { isPrivacyMode, togglePrivacyMode } = usePrivacyMode();
  const netSavings = monthlyIncome - monthlyExpense;
  const savingsRate = monthlyIncome > 0 ? ((netSavings / monthlyIncome) * 100).toFixed(1) : "0";
  const expenseRate = monthlyIncome > 0 ? ((monthlyExpense / monthlyIncome) * 100).toFixed(1) : "0";

  const calculateTrend = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  const assetTrend = calculateTrend(totalAssets, prevTotalAssets);
  const liquidAssetTrend = calculateTrend(liquidAssets, prevLiquidAssets);
  const expenseTrend = calculateTrend(monthlyExpense, prevMonthlyExpense);
  const incomeTrend = calculateTrend(monthlyIncome, prevMonthlyIncome);

  const formatMoney = (amount: number) => {
    if (isPrivacyMode) return "******";
    return `${currency.symbol} ${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const TrendIndicator = ({ value, inverse = false }: { value: number, inverse?: boolean }) => {
    const isPositive = value > 0;
    const isNeutral = value === 0;
    
    let colorClass = "text-muted-foreground";
    let Icon = TrendingUp;
    
    if (!isNeutral) {
      if (inverse) {
         colorClass = isPositive ? "text-red-400" : "text-success";
      } else {
         colorClass = isPositive ? "text-success" : "text-red-400";
      }
    }

    return (
      <div className={`flex items-center text-xs font-medium ${colorClass} ${!isNeutral ? 'bg-primary/10 border border-primary/20' : 'bg-muted/20 border border-transparent'} px-2 py-1 rounded-md whitespace-nowrap`}>
        <Icon className={`w-3 h-3 mr-1 ${!isPositive && !isNeutral ? 'rotate-180' : ''}`} />
        <span>{value > 0 ? '+' : ''}{value.toFixed(1)}%</span>
      </div>
    );
  };

  const metrics: Array<{
    key: string;
    label: string;
    value: number;
    icon: typeof Wallet;
    trend: number;
    inverseTrend?: boolean;
    accentClass: string;
    helper: string;
  }> = [];

  if (showTotalAssets) {
    metrics.push({
      key: "total-assets",
      label: "总资产估值",
      value: totalAssets,
      icon: Wallet,
      trend: assetTrend,
      accentClass: "text-neon-glow",
      helper: "跨钱包实时估值",
    });
  }

  if (showMonthlyIncome) {
    metrics.push({
      key: "monthly-income",
      label: "本月收入",
      value: monthlyIncome,
      icon: Coins,
      trend: incomeTrend,
      accentClass: "text-cyan-300",
      helper: "现金流入",
    });
  }

  if (showMonthlyExpense) {
    metrics.push({
      key: "monthly-expense",
      label: "本月支出",
      value: monthlyExpense,
      icon: ArrowUpRight,
      trend: expenseTrend,
      inverseTrend: true,
      accentClass: "text-red-400",
      helper: `支出占比 ${expenseRate}%`,
    });
  }

  if (showFlexibleFunds) {
    metrics.push({
      key: "flexible-funds",
      label: "可灵活调用",
      value: liquidAssets,
      icon: CreditCard,
      trend: liquidAssetTrend,
      accentClass: "text-violet-300",
      helper: "应急可用资金",
    });
  }

  return (
    <section className="mb-6 rounded-[22px] border border-white/10 bg-gradient-to-br from-[#161024] via-[#0d0a16] to-[#09070f] overflow-hidden shadow-[0_20px_60px_-38px_rgba(139,92,246,0.7)]">
      <div className="px-5 md:px-7 py-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <TrendingUp className="w-4 h-4 text-neon-glow" />
          <span className="text-sm font-medium tracking-[0.06em]">资产脉冲</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className={`text-xs ${netSavings >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
            净储蓄 {netSavings >= 0 ? "+" : "-"}{formatMoney(Math.abs(netSavings))}
          </span>
          <button onClick={togglePrivacyMode} className="text-muted-foreground hover:text-white transition-colors bg-black/35 border border-white/10 rounded-md p-1.5" title={isPrivacyMode ? "显示金额" : "隐藏金额"}>
            {isPrivacyMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="px-5 md:px-7 py-3 border-b border-white/10 flex items-center gap-5 text-xs">
        <span className="text-cyan-200">储蓄率 {savingsRate}%</span>
        <span className="text-rose-200">支出占比 {expenseRate}%</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-0">
        {metrics.map((item, index) => (
          <div
            key={item.key}
            className={`px-5 md:px-6 py-6 ${index < metrics.length - 1 ? "xl:border-r xl:border-white/10" : ""} ${index % 2 === 0 ? "md:border-r md:border-white/10 xl:border-r" : ""} ${index < 2 ? "md:border-b md:border-white/10 xl:border-b-0 border-b border-white/10" : ""}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground inline-flex items-center gap-2">
                <item.icon className={`w-3.5 h-3.5 ${item.accentClass}`} />
                {item.label}
              </div>
              <TrendIndicator value={item.trend} inverse={item.inverseTrend} />
            </div>
            <p className="text-[30px] leading-none font-semibold text-white font-mono mt-4">{formatMoney(item.value)}</p>
            <div className="mt-3 h-px bg-gradient-to-r from-primary/40 via-white/15 to-transparent" />
            <p className="text-xs text-muted-foreground mt-2">{item.helper}</p>
          </div>
        ))}
      </div>

      {metrics.length === 0 && (
        <div className="px-5 md:px-7 py-8 text-sm text-muted-foreground">暂无可展示指标</div>
      )}
    </section>
  );
}
