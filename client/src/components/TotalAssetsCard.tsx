import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Wallet } from "lucide-react";
import type { Wallet as WalletType } from "@shared/schema";
import { getCurrencyInfo } from "@shared/schema";

interface TotalAssetsCardProps {
  wallets: WalletType[];
  isLoading?: boolean;
  defaultCurrency?: string;
}

export function TotalAssetsCard({ wallets, isLoading, defaultCurrency = "MYR" }: TotalAssetsCardProps) {
  const currencyInfo = getCurrencyInfo(defaultCurrency);
  
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
      <Card className="bg-primary text-primary-foreground">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2 opacity-90">
            <Wallet className="w-5 h-5" />
            总资产
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-12 w-48 bg-white/20 rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-primary via-primary/90 to-purple-600 text-primary-foreground overflow-visible shadow-xl shadow-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2 opacity-90">
          <Wallet className="w-5 h-5" />
          总资产
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-1">
          <span className="text-lg opacity-80">{currencyInfo.symbol}</span>
          <span
            className="text-4xl font-bold font-mono tracking-tight"
            data-testid="text-total-assets"
          >
            {totalInDefaultCurrency.toLocaleString("zh-CN", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-3 text-sm opacity-80">
          <TrendingUp className="w-4 h-4" />
          <span>{wallets.length} 个账户</span>
        </div>
      </CardContent>
    </Card>
  );
}
