import type { Transaction, Category, Wallet } from "@shared/schema";
import { memo } from "react";
import { getCurrencyInfo } from "@shared/schema";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  TrendingDown, TrendingUp, ArrowRightLeft,
  ShoppingBag, Utensils, Car, Home, Gamepad2, Gift, Heart,
  BookOpen, Briefcase, DollarSign, MoreHorizontal, Coffee, Plane,
} from "lucide-react";
import { IconChip } from "@/components/ds/IconChip";

interface TransactionItemProps {
  transaction: Transaction;
  category?: Category | null;
  wallet?: Wallet | null;
  toWallet?: Wallet | null;
  onClick?: (transaction: Transaction) => void;
}

const categoryIcons: Record<string, any> = {
  shopping: ShoppingBag, "shopping-bag": ShoppingBag,
  food: Utensils, utensils: Utensils, coffee: Coffee,
  transport: Car, car: Car,
  housing: Home, home: Home,
  entertainment: Gamepad2, gamepad: Gamepad2,
  gift: Gift, health: Heart, heart: Heart,
  education: BookOpen, "graduation-cap": BookOpen,
  work: Briefcase, briefcase: Briefcase,
  salary: DollarSign, "dollar-sign": DollarSign,
  plane: Plane,
  other: MoreHorizontal,
};

function TransactionItemInner({ transaction, category, wallet, toWallet, onClick }: TransactionItemProps) {
  const amount = parseFloat(transaction.amount || "0");
  const isExpense = transaction.type === "expense";
  const isIncome = transaction.type === "income";
  const isTransfer = transaction.type === "transfer";

  const TypeIcon = isExpense ? TrendingDown : isIncome ? TrendingUp : ArrowRightLeft;
  const CategoryIcon = category?.icon ? (categoryIcons[category.icon] || TypeIcon) : TypeIcon;

  const amountTone = isExpense ? "text-expense" : isIncome ? "text-income" : "text-foreground";
  const sign = isExpense ? "−" : isIncome ? "+" : "";

  const title =
    isTransfer && wallet && toWallet ? `${wallet.name} → ${toWallet.name}` :
    transaction.description || category?.name ||
    (isExpense ? "支出" : isIncome ? "收入" : "转账");

  return (
    <div
      className="flex items-center gap-3 py-3 px-3 rounded-xl glass-card hover:bg-surface-2 cursor-pointer transition-colors"
      data-testid={`item-transaction-${transaction.id}`}
      onClick={() => onClick?.(transaction)}
    >
      <IconChip>
        <CategoryIcon className="w-4 h-4" />
      </IconChip>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate" data-testid={`text-description-${transaction.id}`}>
          {title}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
          <span>{wallet?.name || "未知"}</span>
          {category && !isTransfer && <> · <span>{category.name}</span></>}
          {" · "}
          <span className="whitespace-nowrap">{format(new Date(transaction.date), "M月d日 HH:mm", { locale: zhCN })}</span>
        </p>
      </div>

      <div className="text-right shrink-0">
        <p className={`font-medium font-mono ${amountTone}`} data-testid={`text-amount-${transaction.id}`}>
          {sign}{getCurrencyInfo(wallet?.currency || "MYR").symbol} {amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        {transaction.currency && transaction.currency !== (wallet?.currency || "MYR") && transaction.originalAmount && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            原: {getCurrencyInfo(transaction.currency).symbol}{parseFloat(transaction.originalAmount).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
          </p>
        )}
      </div>
    </div>
  );
}

function TransactionItemSkeletonInner() {
  return (
    <div className="flex items-center gap-3 py-3 px-3 rounded-xl glass-card animate-pulse">
      <div className="w-10 h-10 rounded-xl bg-surface-2 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="h-4 w-24 bg-surface-2 rounded mb-1.5" />
        <div className="h-3 w-32 bg-surface-2 rounded" />
      </div>
      <div className="text-right shrink-0">
        <div className="h-4 w-20 bg-surface-2 rounded mb-1 ml-auto" />
      </div>
    </div>
  );
}

export const TransactionItem = memo(TransactionItemInner);
export const TransactionItemSkeleton = memo(TransactionItemSkeletonInner);
