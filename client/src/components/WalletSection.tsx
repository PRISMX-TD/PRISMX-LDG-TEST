import { Wifi, ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { usePrivacyMode } from "@/hooks/usePrivacyMode";

interface WalletSectionProps {
  userName?: string;
  defaultWalletBalance?: number;
  currency?: string;
}

export function WalletSection({ userName = "USER", defaultWalletBalance = 0, currency = "MYR" }: WalletSectionProps) {
  const { isPrivacyMode } = usePrivacyMode();
  
  // Fetch exchange rate (USD to CNY for demo, or based on user prefs)
  const { data: exchangeRate } = useQuery({
    queryKey: [`/api/exchange-rate?from=USD&to=${currency}`],
    staleTime: 3600000, // 1 hour
  });

  const rate = exchangeRate?.rate || 4.45;

  return (
    <div className="flex-1 flex flex-col gap-4 w-full lg:min-w-[300px] xl:min-w-[350px]">
      {/* Virtual Credit Card */}
      <div className="h-48 rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden credit-card-bg shadow-2xl group transition-transform hover:scale-[1.02]">
        <div className="absolute top-0 right-0 w-32 h-32 holo-sticker rounded-full -translate-y-1/2 translate-x-1/2"></div>
        
        <div className="relative z-10 flex justify-between items-start">
          <div className="text-xs font-bold tracking-widest text-gray-400">PRISMX PLATINUM</div>
          <Wifi className="text-gray-400 w-5 h-5 rotate-90" />
        </div>
        
        <div className="relative z-10">
          <div className="text-2xl font-mono text-white tracking-widest mb-4 drop-shadow-md">
            {isPrivacyMode ? (
              "**** **** ****"
            ) : (
              <>
                {currency} {defaultWalletBalance.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </>
            )}
          </div>
          <div className="flex justify-between items-end">
            <div>
              <div className="text-[10px] text-gray-400 uppercase">Card Holder</div>
              <div className="text-sm text-gray-200 uppercase">{userName}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-gray-400 uppercase">Expires</div>
              <div className="text-sm text-gray-200">12/28</div>
            </div>
            <div className="w-8 h-8 opacity-80">
              <svg viewBox="0 0 36 24" fill="none" className="w-full h-full">
                <circle cx="12" cy="12" r="12" fill="#EB001B" fillOpacity="0.8"/>
                <circle cx="24" cy="12" r="12" fill="#F79E1B" fillOpacity="0.8"/>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Exchange Rate Card */}
      <div className="flex-1 glass-card p-4 flex flex-col justify-center">
        <div className="flex justify-between items-center text-sm text-gray-400 mb-2">
          <span>Exchange Rate (USD/{currency})</span>
          <span className="text-success text-xs">+0.02%</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center p-1.5">
              <span className="text-xs font-bold text-white">USD</span>
            </div>
            <span className="text-xl font-bold text-white">1</span>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-600" />
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-white">{rate}</span>
            <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center p-1.5">
              <span className="text-xs font-bold text-white">{currency}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
