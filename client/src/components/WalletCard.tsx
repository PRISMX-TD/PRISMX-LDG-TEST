import type { Wallet } from "@shared/schema";
import { getCurrencyInfo } from "@shared/schema";
import {
  Wallet as WalletIcon,
  CreditCard,
  Banknote,
  Smartphone,
  TrendingUp,
} from "lucide-react";
import { IconChip } from "@/components/ds/IconChip";

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
  investment: "投资账户",
  savings: "储蓄",
};

const walletTypeIcons: Record<string, typeof WalletIcon> = {
  cash: Banknote,
  bank_card: CreditCard,
  digital_wallet: Smartphone,
  credit_card: CreditCard,
  investment: TrendingUp,
};

export function WalletCard({ wallet, onClick, className = "" }: WalletCardProps) {
  const Icon = walletTypeIcons[wallet.type] || WalletIcon;
  const balance = parseFloat(wallet.balance || "0");
  const currencyInfo = getCurrencyInfo(wallet.currency || "MYR");

  const balanceTone =
    balance < 0 ? "text-expense"
    : wallet.isFlexible ? "text-foreground"
    : "text-foreground/65";

  return (
    <>
      {/* Desktop / md+ */}
      <div className={`hidden md:block ${className}`} onClick={onClick} data-testid={`card-wallet-${wallet.id}`}>
        <div className="glass-card p-4 hover:border-strong cursor-pointer transition-colors h-full flex flex-col justify-between min-h-[140px]">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-3 min-w-0">
              <IconChip>
                <Icon className="w-4 h-4" style={{ color: wallet.color || undefined }} />
              </IconChip>
              <p className="font-medium text-sm truncate">{wallet.name}</p>
            </div>
            {wallet.isDefault && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/15 text-primary border border-primary/20 shrink-0">
                默认
              </span>
            )}
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground mb-1.5">
              {walletTypeLabels[wallet.type] || wallet.type} · {wallet.currency || "MYR"}
            </p>
            <p
              className={`text-[22px] font-medium font-mono tracking-tight leading-none ${balanceTone}`}
              data-testid={`text-balance-desktop-${wallet.id}`}
            >
              {currencyInfo.symbol} {balance.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      {/* Mobile */}
      <div
        className={`md:hidden glass-card flex items-center justify-between p-4 cursor-pointer transition-all active:scale-[0.98] ${className}`}
        onClick={onClick}
        data-testid={`card-wallet-mobile-${wallet.id}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <IconChip>
            <Icon className="w-4 h-4" style={{ color: wallet.color || undefined }} />
          </IconChip>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">{wallet.name}</span>
              {wallet.isDefault && (
                <span className="text-[10px] px-1.5 py-0 rounded-md bg-primary/15 text-primary shrink-0">默认</span>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground">
              {walletTypeLabels[wallet.type] || wallet.type} · {wallet.currency || "MYR"}
            </span>
          </div>
        </div>
        <p className={`text-base font-medium font-mono shrink-0 ${balanceTone}`} data-testid={`text-balance-${wallet.id}`}>
          {currencyInfo.symbol} {balance.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>
    </>
  );
}

export function WalletCardSkeleton() {
  return (
    <div className="glass-card p-4 animate-pulse h-[140px] flex flex-col justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-surface-2" />
        <div className="h-3.5 w-24 bg-surface-2 rounded" />
      </div>
      <div className="space-y-2">
        <div className="h-2.5 w-20 bg-surface-2 rounded" />
        <div className="h-6 w-32 bg-surface-2 rounded" />
      </div>
    </div>
  );
}
