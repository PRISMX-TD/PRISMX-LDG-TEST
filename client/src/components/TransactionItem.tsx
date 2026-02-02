import type { Transaction, Category, Wallet } from "@shared/schema";
import { memo } from "react";
import { getCurrencyInfo } from "@shared/schema";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  TrendingDown,
  TrendingUp,
  ArrowRightLeft,
  ShoppingBag,
  Utensils,
  Car,
  Home,
  Gamepad2,
  Gift,
  Heart,
  BookOpen,
  Briefcase,
  DollarSign,
  MoreHorizontal,
} from "lucide-react";

interface TransactionItemProps {
  transaction: Transaction;
  category?: Category | null;
  wallet?: Wallet | null;
  toWallet?: Wallet | null;
  onClick?: (transaction: Transaction) => void;
}

const categoryIcons: Record<string, typeof ShoppingBag> = {
  shopping: ShoppingBag,
  food: Utensils,
  transport: Car,
  housing: Home,
  entertainment: Gamepad2,
  gift: Gift,
  health: Heart,
  education: BookOpen,
  work: Briefcase,
  salary: DollarSign,
  other: MoreHorizontal,
};

function TransactionItemInner({
  transaction,
  category,
  wallet,
  toWallet,
  onClick,
}: TransactionItemProps) {
  const amount = parseFloat(transaction.amount || "0");
  const isExpense = transaction.type === "expense";
  const isIncome = transaction.type === "income";
  const isTransfer = transaction.type === "transfer";

  const getTypeIcon = () => {
    if (isExpense) return TrendingDown;
    if (isIncome) return TrendingUp;
    return ArrowRightLeft;
  };

  const getTypeColor = () => {
    if (isExpense) return "text-expense";
    if (isIncome) return "text-income";
    return "text-transfer";
  };

  const getBorderColor = () => {
    if (isExpense) return "border-l-expense";
    if (isIncome) return "border-l-income";
    return "border-l-transfer";
  };

  const getAmountPrefix = () => {
    if (isExpense) return "-";
    if (isIncome) return "+";
    return "";
  };

  const TypeIcon = getTypeIcon();
  const CategoryIcon = category?.icon
    ? categoryIcons[category.icon] || MoreHorizontal
    : TypeIcon;

  const getDescription = () => {
    if (isTransfer && wallet && toWallet) {
      return `${wallet.name} → ${toWallet.name}`;
    }
    if (transaction.description) {
      return transaction.description;
    }
    if (category) {
      return category.name;
    }
    if (isExpense) return "支出";
    if (isIncome) return "收入";
    return "转账";
  };

  const getBgColor = () => {
    if (isExpense) return "bg-expense/5 hover:bg-expense/10";
    if (isIncome) return "bg-income/5 hover:bg-income/10";
    return "bg-transfer/5 hover:bg-transfer/10";
  };

  return (
    <div
      className={`flex items-center gap-3 py-3 px-4 rounded-xl border transition-colors cursor-pointer ${getBgColor()} ${
        isExpense ? "border-expense/10" : isIncome ? "border-income/10" : "border-transfer/10"
      }`}
      data-testid={`item-transaction-${transaction.id}`}
      onClick={() => onClick?.(transaction)}
    >
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
          isExpense
            ? "bg-expense/15"
            : isIncome
            ? "bg-income/15"
            : "bg-transfer/15"
        }`}
      >
        <CategoryIcon className={`w-5 h-5 ${getTypeColor()}`} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate" data-testid={`text-description-${transaction.id}`}>
          {getDescription()}
        </p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
          <span className="truncate max-w-[80px]">{wallet?.name || "未知"}</span>
          <span>·</span>
          <span className="whitespace-nowrap">
            {format(new Date(transaction.date), "M月d日 HH:mm", {
              locale: zhCN,
            })}
          </span>
        </div>
      </div>

      <div className="text-right flex-shrink-0">
        <p
          className={`font-semibold font-mono ${getTypeColor()}`}
          data-testid={`text-amount-${transaction.id}`}
        >
          {getAmountPrefix()}{getCurrencyInfo(wallet?.currency || "MYR").symbol}
          {amount.toLocaleString("zh-CN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </p>
        {transaction.currency && transaction.currency !== (wallet?.currency || "MYR") && transaction.originalAmount ? (
          <p className="text-xs text-muted-foreground mt-0.5">
            原: {getCurrencyInfo(transaction.currency).symbol}{parseFloat(transaction.originalAmount).toLocaleString("zh-CN", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        ) : category && !isTransfer ? (
          <p className="text-xs text-muted-foreground mt-0.5">{category.name}</p>
        ) : null}
      </div>
    </div>
  );
}

function TransactionItemSkeletonInner() {
  return (
    <div className="flex items-center gap-3 py-3 px-4 rounded-xl border border-border/50 bg-muted/5 animate-pulse">
      <div className="w-10 h-10 rounded-full bg-muted/20 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="h-4 w-24 bg-muted/20 rounded mb-1.5" />
        <div className="h-3 w-32 bg-muted/20 rounded" />
      </div>
      <div className="text-right flex-shrink-0">
        <div className="h-4 w-20 bg-muted/20 rounded mb-1" />
        <div className="h-3 w-10 bg-muted/20 rounded ml-auto" />
      </div>
    </div>
  );
}

export const TransactionItem = memo(TransactionItemInner);
export const TransactionItemSkeleton = memo(TransactionItemSkeletonInner);
