import { Wallet, CreditCard, Coins, PiggyBank, MoreHorizontal, TrendingUp } from "lucide-react";
import { getCurrencyInfo } from "@shared/schema";

interface MetricsGridProps {
  totalAssets: number;
  monthlyExpense: number;
  monthlyIncome: number;
  prevMonthlyExpense?: number;
  prevMonthlyIncome?: number;
  prevTotalAssets?: number;
  currencyCode?: string;
}

export function MetricsGrid({ 
  totalAssets, 
  monthlyExpense, 
  monthlyIncome, 
  prevMonthlyExpense = 0,
  prevMonthlyIncome = 0,
  prevTotalAssets = 0,
  currencyCode = "MYR" 
}: MetricsGridProps) {
  const currency = getCurrencyInfo(currencyCode);
  const netSavings = monthlyIncome - monthlyExpense;
  const savingsRate = monthlyIncome > 0 ? ((netSavings / monthlyIncome) * 100).toFixed(1) : "0";
  const expenseRate = monthlyIncome > 0 ? ((monthlyExpense / monthlyIncome) * 100).toFixed(1) : "0";

  // Calculate trends
  const calculateTrend = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  const assetTrend = calculateTrend(totalAssets, prevTotalAssets);
  const expenseTrend = calculateTrend(monthlyExpense, prevMonthlyExpense);
  const incomeTrend = calculateTrend(monthlyIncome, prevMonthlyIncome);

  const formatMoney = (amount: number) => {
    return `${currency.symbol} ${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const TrendIndicator = ({ value, inverse = false }: { value: number, inverse?: boolean }) => {
    const isPositive = value > 0;
    const isNeutral = value === 0;
    // For expense, positive trend is bad (usually), but let's keep color logic consistent with math first
    // Or invert color: Green for good.
    // Asset/Income: Increase is Green.
    // Expense: Increase is Red.
    
    let colorClass = "text-gray-400";
    let Icon = TrendingUp;
    
    if (!isNeutral) {
      if (inverse) {
         // Expense logic: Increase (Pos) -> Red, Decrease (Neg) -> Green
         colorClass = isPositive ? "text-red-400" : "text-success";
         Icon = isPositive ? TrendingUp : TrendingUp; // Or TrendingDown icon
      } else {
         // Income/Asset logic: Increase (Pos) -> Green, Decrease (Neg) -> Red
         colorClass = isPositive ? "text-success" : "text-red-400";
      }
    }

    return (
      <div className={`flex items-center text-xs ${colorClass} ${!isNeutral ? 'bg-white/5' : ''} w-fit px-2 py-1 rounded`}>
        <Icon className={`w-3 h-3 mr-1 ${!isPositive && !isNeutral ? 'rotate-180' : ''}`} />
        {value > 0 ? '+' : ''}{value.toFixed(1)}% 与上月
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {/* Total Assets */}
      <div className="glass-card p-5 group">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <Wallet className="w-4 h-4 text-blue-400" />
            总资产估值
          </div>
          <MoreHorizontal className="w-4 h-4 text-gray-600 cursor-pointer hover:text-white" />
        </div>
        <div className="text-2xl lg:text-3xl font-bold text-white mb-1 group-hover:text-blue-200 transition-colors font-mono">
          {formatMoney(totalAssets)}
        </div>
        <TrendIndicator value={assetTrend} />
      </div>

      {/* Monthly Expense */}
      <div className="glass-card p-5 group">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <CreditCard className="w-4 h-4 text-neon-glow" />
            本月支出
          </div>
        </div>
        <div className="text-2xl lg:text-3xl font-bold text-white mb-1 group-hover:text-purple-200 transition-colors font-mono">
          {formatMoney(monthlyExpense)}
        </div>
        <div className="flex items-center justify-between mt-2">
            <div className="flex items-center text-xs text-gray-500 gap-2">
            <div className="h-1.5 w-16 bg-gray-800 rounded-full overflow-hidden">
                <div 
                className="h-full bg-neon-purple" 
                style={{ width: `${Math.min(parseFloat(expenseRate), 100)}%` }}
                ></div>
            </div>
            {expenseRate}%
            </div>
            <TrendIndicator value={expenseTrend} inverse />
        </div>
      </div>

      {/* Monthly Income */}
      <div className="glass-card p-5 group">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <Coins className="w-4 h-4 text-yellow-400" />
            本月收入
          </div>
        </div>
        <div className="text-2xl lg:text-3xl font-bold text-white mb-1 font-mono">
          {formatMoney(monthlyIncome)}
        </div>
        <div className="flex items-center justify-between mt-2">
            <div className="flex items-center text-xs text-gray-500">
            固定工资 + 副业
            </div>
            <TrendIndicator value={incomeTrend} />
        </div>
      </div>

      {/* Net Savings */}
      <div className="glass-card p-5 group relative overflow-hidden">
        <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-success/20 blur-xl rounded-full"></div>
        <div className="flex items-center justify-between mb-4 relative z-10">
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <PiggyBank className="w-4 h-4 text-success" />
            本月结余
          </div>
        </div>
        <div className="text-2xl lg:text-3xl font-bold text-white mb-1 relative z-10 group-hover:text-green-100 transition-colors font-mono">
          {formatMoney(netSavings)}
        </div>
        <div className="text-xs text-success relative z-10">
          储蓄率 {savingsRate}%
        </div>
      </div>
    </div>
  );
}
