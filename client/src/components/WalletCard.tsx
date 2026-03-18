import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Wallet } from "@shared/schema";
import { getCurrencyInfo } from "@shared/schema";
import {
  Wallet as WalletIcon,
  CreditCard,
  Banknote,
  Smartphone,
} from "lucide-react";

interface WalletCardProps {
  wallet: Wallet;
  onClick?: () => void;
  className?: string;
}

const walletTypeLabels: Record<string, string> = {
  cash: "现金",
  bank_card: "银行卡",
  digital_wallet: "数字钱包",
  credit_card: "信用卡",
};

const walletTypeIcons: Record<string, typeof WalletIcon> = {
  cash: Banknote,
  bank_card: CreditCard,
  digital_wallet: Smartphone,
  credit_card: CreditCard,
};

export function WalletCard({ wallet, onClick, className = "" }: WalletCardProps) {
  const Icon = walletTypeIcons[wallet.type] || WalletIcon;
  const balance = parseFloat(wallet.balance || "0");
  const currencyInfo = getCurrencyInfo(wallet.currency || "MYR");
  
  return (
    <>
      <div
        className={`hidden md:block ${className}`}
        onClick={onClick}
        data-testid={`card-wallet-${wallet.id}`}
      >
        <div className="glass-card p-4 hover:purple-glow-sm cursor-pointer transition-all duration-300 group h-full flex flex-col justify-between">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110"
                style={{
                  backgroundColor: wallet.color
                    ? `${wallet.color}20`
                    : "rgba(255, 255, 255, 0.05)",
                  border: `1px solid ${wallet.color ? `${wallet.color}40` : "rgba(255, 255, 255, 0.1)"}`
                }}
              >
                <Icon
                  className="w-5 h-5"
                  style={{ color: wallet.color || "#a1a1aa" }}
                />
              </div>
              <h3 className="font-semibold text-base truncate text-white group-hover:text-neon-purple transition-colors">{wallet.name}</h3>
            </div>
            {wallet.isDefault && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 flex-shrink-0 bg-white/10 text-gray-300 border-white/5 hover:bg-white/20">
                默认
              </Badge>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-2">
              {walletTypeLabels[wallet.type] || wallet.type} · {wallet.currency || "MYR"}
            </p>
            <p
              className={`text-2xl font-bold font-mono tracking-tight ${
                balance < 0 ? "text-red-400" : wallet.isFlexible ? "text-white" : "text-gray-400"
              }`}
              data-testid={`text-balance-desktop-${wallet.id}`}
            >
              {currencyInfo.symbol} {balance.toLocaleString("zh-CN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>
        </div>
      </div>

      <div
        className={`md:hidden flex items-center justify-between p-4 glass-card rounded-xl cursor-pointer transition-all duration-300 active:scale-[0.98] ${className}`}
        onClick={onClick}
        data-testid={`card-wallet-mobile-${wallet.id}`}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: wallet.color
                ? `${wallet.color}20`
                : "rgba(255, 255, 255, 0.05)",
              border: `1px solid ${wallet.color ? `${wallet.color}40` : "rgba(255, 255, 255, 0.1)"}`
            }}
          >
            <Icon
              className="w-5 h-5"
              style={{ color: wallet.color || "#a1a1aa" }}
            />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate text-white">{wallet.name}</span>
              {wallet.isDefault && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 flex-shrink-0 bg-white/10 text-gray-300 border-white/5">
                  默认
                </Badge>
              )}
            </div>
            <span className="text-[11px] text-gray-500">
              {walletTypeLabels[wallet.type] || wallet.type} · {wallet.currency || "MYR"}
            </span>
          </div>
        </div>
        <p
          className={`text-base font-bold font-mono flex-shrink-0 ${
            balance < 0 ? "text-red-400" : wallet.isFlexible ? "text-white" : "text-gray-400"
          }`}
          data-testid={`text-balance-${wallet.id}`}
        >
          {currencyInfo.symbol} {balance.toLocaleString("zh-CN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </p>
      </div>
    </>
  );
}

export function WalletCardSkeleton() {
  return (
    <>
      <div className="hidden md:block glass-card p-4 animate-pulse h-[140px]">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/10 flex-shrink-0" />
            <div className="h-4 w-24 bg-white/10 rounded" />
          </div>
        </div>
        <div className="mt-auto">
          <div className="h-3 w-20 bg-white/10 rounded mb-3" />
          <div className="h-8 w-32 bg-white/10 rounded" />
        </div>
      </div>

      <div className="md:hidden flex items-center justify-between p-4 glass-card rounded-xl animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white/10 flex-shrink-0" />
          <div className="flex flex-col gap-1.5">
            <div className="h-4 w-20 bg-white/10 rounded" />
            <div className="h-3 w-24 bg-white/10 rounded" />
          </div>
        </div>
        <div className="h-5 w-24 bg-white/10 rounded" />
      </div>
    </>
  );
}
