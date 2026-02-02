import { TrendingUp, Wallet, Eye, EyeOff } from "lucide-react";
import type { Wallet as WalletType } from "@shared/schema";
import { getCurrencyInfo } from "@shared/schema";
import { usePrivacyMode } from "@/hooks/usePrivacyMode";

interface TotalAssetsCardProps {
  wallets: WalletType[];
  isLoading?: boolean;
  defaultCurrency?: string;
}

export function TotalAssetsCard({ wallets, isLoading, defaultCurrency = "MYR" }: TotalAssetsCardProps) {
  const currencyInfo = getCurrencyInfo(defaultCurrency);
  const { isPrivacyMode, togglePrivacyMode } = usePrivacyMode();
  
  // Calculate total in default currency using exchange rates
  const totalInDefaultCurrency = wallets.reduce((sum, wallet) => {
    const balance = parseFloat(wallet.balance || "0");
    const walletCurrency = wallet.currency || "MYR";
    
    // If wallet is in default currency, use balance directly
    if (walletCurrency === defaultCurrency) {
      return sum + balance;
    }
    
    // Otherwise, convert using the exchange rate
    const exchangeRate = parseFloat(wallet.exchangeRateToDefault || "1");
    return sum + (balance * exchangeRate);
  }, 0);

  if (isLoading) {
    return (
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <Wallet className="w-4 h-4 text-blue-400" />
            总资产
          </div>
          <div className="w-4 h-4" /> {/* Placeholder for alignment */}
        </div>
        <div className="h-8 w-48 bg-white/10 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="glass-card p-5 group">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Wallet className="w-4 h-4 text-blue-400" />
          总资产
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
      <div className="text-3xl font-bold text-white mb-1 group-hover:text-blue-200 transition-colors font-mono">
        {isPrivacyMode ? (
          "******"
        ) : (
          <>
            {currencyInfo.symbol} {totalInDefaultCurrency.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </>
        )}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <div className="flex items-center text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded">
          <TrendingUp className="w-3 h-3 mr-1" />
          <span>{wallets.length} 个账户</span>
        </div>
      </div>
    </div>
  );
}
