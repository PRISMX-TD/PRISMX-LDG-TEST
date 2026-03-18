import { useState, useMemo } from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BalanceCorrectionModal } from "@/components/BalanceCorrectionModal";
import { WalletBalanceChart } from "@/components/WalletBalanceChart";
import { WalletModal } from "@/components/WalletModal";
import { getCurrencyInfo, type Wallet, type Transaction, type Category } from "@shared/schema";
import {
  ArrowLeft,
  Pencil,
  TrendingUp,
  ChevronRight,
  Plus,
  Settings,
} from "lucide-react";
import { format, subDays, endOfMonth } from "date-fns";

export default function WalletDetail() {
  const { user } = useAuth();
  const [, params] = useRoute("/wallets/:id");
  const walletId = params?.id ? parseInt(params.id) : null;
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [chartMode, setChartMode] = useState<"daily" | "monthly">("daily");

  const { data: wallet, isLoading: walletLoading } = useQuery<Wallet>({
    queryKey: ["/api/wallets", walletId],
    enabled: !!walletId,
  });

  const { data: allTransactions = [], isLoading: transactionsLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const walletTransactions = useMemo(() => {
    if (!walletId) return [];
    return allTransactions
      .filter(t => t.walletId === walletId || t.toWalletId === walletId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allTransactions, walletId]);

  const recentTransactions = walletTransactions.slice(0, 10);

  const balanceChartData = useMemo(() => {
    if (!wallet || walletTransactions.length === 0) return [];

    const currentBalance = parseFloat(wallet.balance || "0");
    const today = new Date();

    if (chartMode === "daily") {
      const days = 30;
      const data: { date: string; balance: number }[] = [];
      
      let runningBalance = currentBalance;
      const balanceByDate: Record<string, number> = {};
      
      for (let i = 0; i < days; i++) {
        const date = subDays(today, i);
        const dateStr = format(date, "yyyy-MM-dd");
        balanceByDate[dateStr] = runningBalance;
        
        const dayTransactions = walletTransactions.filter(t => {
          const tDate = format(new Date(t.date), "yyyy-MM-dd");
          return tDate === dateStr;
        });
        
        for (const t of dayTransactions) {
          if (t.type === "income" && t.walletId === walletId) {
            runningBalance -= parseFloat(t.amount || "0");
          } else if (t.type === "expense" && t.walletId === walletId) {
            runningBalance += parseFloat(t.amount || "0");
          } else if (t.type === "transfer") {
            if (t.walletId === walletId) {
              runningBalance += parseFloat(t.amount || "0");
            }
            if (t.toWalletId === walletId) {
              runningBalance -= parseFloat(t.toWalletAmount || t.amount || "0");
            }
          }
        }
      }
      
      for (let i = days - 1; i >= 0; i--) {
        const date = subDays(today, i);
        const dateStr = format(date, "yyyy-MM-dd");
        const displayDate = format(date, "M.d");
        
        let dayBalance = currentBalance;
        for (let j = 0; j < i; j++) {
          const checkDate = subDays(today, j);
          const checkDateStr = format(checkDate, "yyyy-MM-dd");
          const dayTxns = walletTransactions.filter(t => {
            const tDate = format(new Date(t.date), "yyyy-MM-dd");
            return tDate === checkDateStr;
          });
          
          for (const t of dayTxns) {
            if (t.type === "income" && t.walletId === walletId) {
              dayBalance -= parseFloat(t.amount || "0");
            } else if (t.type === "expense" && t.walletId === walletId) {
              dayBalance += parseFloat(t.amount || "0");
            } else if (t.type === "transfer") {
              if (t.walletId === walletId) {
                dayBalance += parseFloat(t.amount || "0");
              }
              if (t.toWalletId === walletId) {
                dayBalance -= parseFloat(t.toWalletAmount || t.amount || "0");
              }
            }
          }
        }
        
        data.push({ date: displayDate, balance: dayBalance });
      }
      
      return data;
    } else {
      const months = 6;
      const data: { date: string; balance: number }[] = [];
      
      for (let i = months - 1; i >= 0; i--) {
        const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const monthEnd = endOfMonth(monthDate);
        const displayDate = format(monthDate, "M月");
        
        let monthBalance = currentBalance;
        
        const futureTxns = walletTransactions.filter(t => {
          const tDate = new Date(t.date);
          return tDate > monthEnd;
        });
        
        for (const t of futureTxns) {
          if (t.type === "income" && t.walletId === walletId) {
            monthBalance -= parseFloat(t.amount || "0");
          } else if (t.type === "expense" && t.walletId === walletId) {
            monthBalance += parseFloat(t.amount || "0");
          } else if (t.type === "transfer") {
            if (t.walletId === walletId) {
              monthBalance += parseFloat(t.amount || "0");
            }
            if (t.toWalletId === walletId) {
              monthBalance -= parseFloat(t.toWalletAmount || t.amount || "0");
            }
          }
        }
        
        data.push({ date: displayDate, balance: monthBalance });
      }
      
      return data;
    }
  }, [wallet, walletTransactions, walletId, chartMode]);

  if (!walletId) {
    return (
      <div className="p-4 md:p-6">
        <p className="text-muted-foreground">钱包不存在</p>
      </div>
    );
  }

  const currencyInfo = getCurrencyInfo(wallet?.currency || user?.defaultCurrency || "MYR");
  const balance = parseFloat(wallet?.balance || "0");

  return (
    <div className="min-h-screen overflow-y-auto custom-scroll p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/wallets">
            <Button variant="ghost" size="sm" data-testid="button-back" className="text-gray-400 hover:text-white">
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
          </Link>
          <h1 className="text-2xl font-semibold flex items-center gap-2 text-white">
            {wallet?.name || "钱包详情"}
          </h1>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowEditModal(true)}
          data-testid="button-edit-wallet"
        >
          <Settings className="w-5 h-5" />
        </Button>
      </div>

      <Card className="glass-card">
        <CardContent className="p-4 md:p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">当前余额</p>
              {walletLoading ? (
                <Skeleton className="h-10 w-40" />
              ) : (
                <p
                  className={`text-3xl md:text-4xl font-bold font-mono ${
                    balance < 0 ? "text-expense" : ""
                  }`}
                  data-testid="text-current-balance"
                >
                  {currencyInfo.symbol}
                  {balance.toLocaleString("zh-CN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                当前余额 = 初始余额 + 余额起始时间后的交易金额之和
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowCorrectionModal(true)}
              data-testid="button-correct-balance"
            >
              <Pencil className="w-5 h-5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              余额趋势
            </CardTitle>
            <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
              <Button
                variant={chartMode === "daily" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => setChartMode("daily")}
                data-testid="button-chart-daily"
              >
                日
              </Button>
              <Button
                variant={chartMode === "monthly" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => setChartMode("monthly")}
                data-testid="button-chart-monthly"
              >
                月
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {walletLoading || transactionsLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <WalletBalanceChart
              data={balanceChartData}
              currency={wallet?.currency || "MYR"}
            />
          )}
          <Link href={`/analytics?walletId=${walletId}`}>
            <span
              className="text-primary text-sm hover:underline cursor-pointer mt-2 inline-block"
              data-testid="link-view-report"
            >
              查看报告
            </span>
          </Link>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium">最近交易</CardTitle>
            <Link href={`/transactions?walletId=${walletId}`}>
              <Button variant="ghost" size="icon" data-testid="button-add-transaction">
                <Plus className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {transactionsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : recentTransactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              暂无交易记录
            </p>
          ) : (
            <div className="space-y-1">
              {recentTransactions.map((transaction) => {
                const category = categories.find(c => c.id === transaction.categoryId);
                const isTransferOut = transaction.type === "transfer" && transaction.walletId === walletId;
                const isTransferIn = transaction.type === "transfer" && transaction.toWalletId === walletId;
                
                return (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between py-3 border-b border-border/50 last:border-0"
                    data-testid={`transaction-item-${transaction.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor:
                            transaction.type === "expense" || isTransferOut
                              ? "hsl(var(--expense))"
                              : transaction.type === "income" || isTransferIn
                              ? "hsl(var(--income))"
                              : "hsl(var(--primary))",
                        }}
                      />
                      <div>
                        <p className="text-sm font-medium">
                          {transaction.description || category?.name || "未分类"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(transaction.date), "M/d")}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-sm font-mono ${
                          transaction.type === "expense" || isTransferOut
                            ? "text-expense"
                            : transaction.type === "income" || isTransferIn
                            ? "text-income"
                            : ""
                        }`}
                      >
                        {transaction.type === "expense" || isTransferOut ? "-" : "+"}
                        {parseFloat(
                          isTransferIn
                            ? transaction.toWalletAmount || transaction.amount || "0"
                            : transaction.amount || "0"
                        ).toLocaleString("zh-CN", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {recentTransactions.length > 0 && (
            <Link href={`/transactions?walletId=${walletId}`}>
              <span
                className="text-primary text-sm hover:underline cursor-pointer mt-4 w-full flex items-center justify-center"
                data-testid="link-all-transactions"
              >
                所有交易
                <ChevronRight className="w-4 h-4 ml-1" />
              </span>
            </Link>
          )}
        </CardContent>
      </Card>

      {wallet && (
        <BalanceCorrectionModal
          open={showCorrectionModal}
          onOpenChange={setShowCorrectionModal}
          wallet={wallet}
          defaultCurrency={user?.defaultCurrency || "MYR"}
        />
      )}

      {wallet && (
        <WalletModal
          open={showEditModal}
          onOpenChange={setShowEditModal}
          wallet={wallet}
          defaultCurrency={user?.defaultCurrency || "MYR"}
        />
      )}
    </div>
  );
}
