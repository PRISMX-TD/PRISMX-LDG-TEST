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

  // Calculate trends
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
    
    let colorClass = "text-gray-400";
    let Icon = TrendingUp;
    
    if (!isNeutral) {
      if (inverse) {
         // Expense logic: Increase (Pos) -> Red, Decrease (Neg) -> Green
         colorClass = isPositive ? "text-red-400" : "text-success";
      } else {
         // Income/Asset logic: Increase (Pos) -> Green, Decrease (Neg) -> Red
         colorClass = isPositive ? "text-success" : "text-red-400";
      }
    }

    return (
      <div className={`flex items-center text-xs font-medium ${colorClass} ${!isNeutral ? 'bg-white/5' : ''} px-2 py-1 rounded-md whitespace-nowrap`}>
        <Icon className={`w-3 h-3 mr-1 ${!isPositive && !isNeutral ? 'rotate-180' : ''}`} />
        <span>{value > 0 ? '+' : ''}{value.toFixed(1)}%</span>
      </div>
    );
  };

  const cards: JSX.Element[] = [];

  if (showTotalAssets) {
    cards.push(
      // 1. Total Assets
      <div className="glass-card p-4 md:p-5 flex flex-col justify-between h-full min-h-[140px] group relative overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-gray-400 text-sm font-medium">
            <Wallet className="w-4 h-4 text-blue-400" />
            总资产估值
          </div>
          <button 
            onClick={togglePrivacyMode}
            className="text-gray-600 hover:text-white transition-colors focus:outline-none"
            title={isPrivacyMode ? "显示金额" : "隐藏金额"}
          >
            {isPrivacyMode ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>
        <div className="mt-auto">
          <div className="text-2xl sm:text-3xl font-bold text-white mb-3 tracking-tight group-hover:text-blue-200 transition-colors font-mono truncate">
            {formatMoney(totalAssets)}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-500 hidden sm:inline-block">与上月相比</span>
            <TrendIndicator value={assetTrend} />
          </div>
        </div>
      </div>
    );
  }

  if (showFlexibleFunds) {
    cards.push(
      // 2. Liquid Assets (Flexible Funds)
      <div className="glass-card p-4 md:p-5 flex flex-col justify-between h-full min-h-[140px] group relative overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-gray-400 text-sm font-medium">
            <CreditCard className="w-4 h-4 text-neon-purple" />
            可灵活调用
          </div>
        </div>
        <div className="mt-auto">
          <div className="text-2xl sm:text-3xl font-bold text-white mb-3 tracking-tight group-hover:text-purple-200 transition-colors font-mono truncate">
            {formatMoney(liquidAssets)}
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center text-xs text-gray-500 truncate min-w-0">
               流动资金
            </div>
            <TrendIndicator value={liquidAssetTrend} />
          </div>
        </div>
      </div>
    );
  }

  if (showMonthlyIncome) {
    cards.push(
      // 3. Monthly Income
      <div className="glass-card p-4 md:p-5 flex flex-col justify-between h-full min-h-[140px] group relative overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-gray-400 text-sm font-medium">
            <Coins className="w-4 h-4 text-yellow-400" />
            本月收入
          </div>
        </div>
        <div className="mt-auto">
          <div className="text-2xl sm:text-3xl font-bold text-white mb-3 tracking-tight font-mono truncate">
            {formatMoney(monthlyIncome)}
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center text-xs text-gray-500 truncate min-w-0">
               固定工资 + 副业
            </div>
            <TrendIndicator value={incomeTrend} />
          </div>
        </div>
      </div>
    );
  }

  if (showMonthlyExpense) {
    cards.push(
      // 4. Monthly Expense
      <div className="glass-card p-4 md:p-5 flex flex-col justify-between h-full min-h-[140px] group relative overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-gray-400 text-sm font-medium">
            <ArrowUpRight className="w-4 h-4 text-red-400" />
            本月支出
          </div>
        </div>
        <div className="mt-auto">
          <div className="text-2xl sm:text-3xl font-bold text-white mb-3 tracking-tight group-hover:text-red-200 transition-colors font-mono truncate">
            {formatMoney(monthlyExpense)}
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center text-xs text-gray-500 gap-2 min-w-0">
              <div className="h-1.5 w-12 bg-gray-800 rounded-full overflow-hidden shrink-0">
                  <div 
                  className="h-full bg-red-500" 
                  style={{ width: `${Math.min(parseFloat(expenseRate), 100)}%` }}
                  ></div>
              </div>
              <span className="truncate">{expenseRate}%</span>
            </div>
            <TrendIndicator value={expenseTrend} inverse />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6 mb-8">
      {cards}
    </div>
  );
}
