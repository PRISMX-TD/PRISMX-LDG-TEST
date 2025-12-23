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
        <Card className="glass-card hover:purple-glow-sm cursor-pointer transition-all duration-300">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: wallet.color
                      ? `${wallet.color}20`
                      : "hsl(var(--primary) / 0.1)",
                  }}
                >
                  <Icon
                    className="w-5 h-5"
                    style={{ color: wallet.color || "hsl(var(--primary))" }}
                  />
                </div>
                <h3 className="font-semibold text-base truncate">{wallet.name}</h3>
              </div>
              {wallet.isDefault && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0.5 flex-shrink-0">
                  默认
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {walletTypeLabels[wallet.type] || wallet.type} · {wallet.currency || "MYR"}
            </p>
            <p
              className={`text-2xl font-semibold font-mono ${
                balance < 0 ? "text-expense" : wallet.isFlexible ? "" : "text-muted-foreground/70"
              }`}
              data-testid={`text-balance-desktop-${wallet.id}`}
            >
              {currencyInfo.symbol}{balance.toLocaleString("zh-CN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </CardContent>
        </Card>
      </div>

      <div
        className={`md:hidden flex items-center justify-between p-3 glass-card rounded-lg cursor-pointer transition-all duration-300 ${className}`}
        onClick={onClick}
        data-testid={`card-wallet-mobile-${wallet.id}`}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: wallet.color
                ? `${wallet.color}20`
                : "hsl(var(--primary) / 0.1)",
            }}
          >
            <Icon
              className="w-4 h-4"
              style={{ color: wallet.color || "hsl(var(--primary))" }}
            />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">{wallet.name}</span>
              {wallet.isDefault && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                  默认
                </Badge>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground">
              {walletTypeLabels[wallet.type] || wallet.type} · {wallet.currency || "MYR"}
            </span>
          </div>
        </div>
        <p
          className={`text-sm font-semibold font-mono flex-shrink-0 ${
            balance < 0 ? "text-expense" : wallet.isFlexible ? "" : "text-muted-foreground/70"
          }`}
          data-testid={`text-balance-${wallet.id}`}
        >
          {currencyInfo.symbol}{balance.toLocaleString("zh-CN", {
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
      <Card className="hidden md:block animate-pulse">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-muted flex-shrink-0" />
              <div className="h-4 w-20 bg-muted rounded" />
            </div>
          </div>
          <div className="h-3 w-20 bg-muted rounded mb-3" />
          <div className="h-8 w-28 bg-muted rounded" />
        </CardContent>
      </Card>

      <div className="md:hidden flex items-center justify-between p-3 bg-card rounded-lg animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-muted flex-shrink-0" />
          <div className="flex flex-col gap-1">
            <div className="h-4 w-16 bg-muted rounded" />
            <div className="h-3 w-20 bg-muted rounded" />
          </div>
        </div>
        <div className="h-4 w-20 bg-muted rounded" />
      </div>
    </>
  );
}
