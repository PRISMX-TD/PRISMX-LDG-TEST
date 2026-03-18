import { useState, useMemo } from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { PageContainer } from "@/components/PageContainer";
import { TransactionItem } from "@/components/TransactionItem";
import { TransactionModal } from "@/components/TransactionModal";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { 
  Loader2, 
  ArrowLeft, 
  BookOpen, 
  Receipt,
  TrendingDown,
  Target,
  Globe,
  Plus
} from "lucide-react";
import type { Transaction, SubLedger, Category, Wallet } from "@shared/schema";

export default function SubLedgerDetail() {
  const [, params] = useRoute("/sub-ledgers/:id");
  const subLedgerId = params?.id ? parseInt(params.id) : null;
  const { user } = useAuth();

  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: subLedgers = [], isLoading: isLoadingSubLedgers } = useQuery<SubLedger[]>({
    queryKey: ["/api/sub-ledgers?includeArchived=true"], // 包含已归档的，以防用户直接通过 URL 访问
  });

  const { data: transactions = [], isLoading: isLoadingTransactions } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: wallets = [] } = useQuery<Wallet[]>({
    queryKey: ["/api/wallets"],
  });

  const subLedger = subLedgers.find((s) => s.id === subLedgerId);
  
  const subLedgerTransactions = useMemo(() => {
    return transactions
      .filter((t) => t.subLedgerId === subLedgerId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, subLedgerId]);

  const stats = useMemo(() => {
    let totalExpenseDefault = 0;
    let totalIncomeDefault = 0;
    const currencyStats: Record<string, { expense: number; income: number; convertedExpense: number; convertedIncome: number }> = {};
    const defaultCurrency = user?.defaultCurrency || "MYR";

    subLedgerTransactions.forEach(t => {
      const wallet = wallets.find(w => w.id === t.walletId);
      const currency = wallet?.currency || defaultCurrency;
      const rate = parseFloat(wallet?.exchangeRateToDefault || "1");
      const amount = parseFloat(t.amount);
      const converted = amount * rate;

      if (!currencyStats[currency]) {
        currencyStats[currency] = { expense: 0, income: 0, convertedExpense: 0, convertedIncome: 0 };
      }

      if (t.type === "expense") {
        totalExpenseDefault += converted;
        currencyStats[currency].expense += amount;
        currencyStats[currency].convertedExpense += converted;
      } else if (t.type === "income") {
        totalIncomeDefault += converted;
        currencyStats[currency].income += amount;
        currencyStats[currency].convertedIncome += converted;
      }
    });

    return {
      totalExpenseDefault,
      totalIncomeDefault,
      netBalanceDefault: totalIncomeDefault - totalExpenseDefault,
      currencyStats,
      defaultCurrency
    };
  }, [subLedgerTransactions, wallets, user?.defaultCurrency]);

  if (isLoadingSubLedgers || isLoadingTransactions) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </PageContainer>
    );
  }

  if (!subLedger) {
    return (
      <PageContainer>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <p className="text-muted-foreground">未找到该子账本</p>
          <Link href="/sub-ledgers">
            <Button variant="outline">返回子账本列表</Button>
          </Link>
        </div>
      </PageContainer>
    );
  }

  const handleTransactionClick = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedTransaction(null);
  };

  return (
    <PageContainer>
      <div className="space-y-6 max-w-4xl mx-auto pb-20">
        <div className="flex items-center gap-4">
          <Link href="/sub-ledgers">
            <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
          </Link>
          <h1 className="text-2xl font-semibold flex items-center gap-2 text-white">
            <BookOpen className="w-6 h-6" style={{ color: subLedger.color || "#8B5CF6" }} />
            {subLedger.name}
          </h1>
        </div>

        {/* 顶部统计卡片 - 仅显示支出和预算相关 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="glass-card p-4 flex items-center gap-4 min-h-[104px] group">
            <div className="w-12 h-12 rounded-full bg-expense/20 flex items-center justify-center shrink-0">
              <TrendingDown className="w-6 h-6 text-expense group-hover:scale-110 transition-transform" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground mb-1">总支出 ({stats.defaultCurrency})</p>
              <p className="text-2xl font-bold font-mono text-white group-hover:text-expense transition-colors truncate">
                {stats.totalExpenseDefault.toFixed(2)}
              </p>
            </div>
          </div>
          
          <div className="glass-card p-4 flex items-center gap-4 min-h-[104px] group">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <Target className="w-6 h-6 text-primary group-hover:scale-110 transition-transform" />
            </div>
            <div className="min-w-0 w-full">
              {subLedger.budgetAmount && parseFloat(subLedger.budgetAmount) > 0 ? (
                <>
                  <p className="text-sm text-muted-foreground mb-1">剩余预算 ({stats.defaultCurrency})</p>
                  <p className={`text-2xl font-bold font-mono truncate transition-colors ${
                    parseFloat(subLedger.budgetAmount) - stats.totalExpenseDefault >= 0 ? 'text-white group-hover:text-primary' : 'text-destructive'
                  }`}>
                    {(parseFloat(subLedger.budgetAmount) - stats.totalExpenseDefault).toFixed(2)}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-1">预算</p>
                  <p className="text-lg text-muted-foreground">未设置</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 预算进度与多币种明细 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 预算卡片 */}
          {subLedger.budgetAmount && parseFloat(subLedger.budgetAmount) > 0 && (
            <Card className="glass-card border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                  <Target className="w-4 h-4" />
                  预算执行情况 ({subLedger.currency || stats.defaultCurrency})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const budget = parseFloat(subLedger.budgetAmount!);
                  const used = stats.totalExpenseDefault; // 简化处理：假设预算是以默认货币计算的
                  const percentage = Math.min((used / budget) * 100, 100);
                  const isOverBudget = used > budget;
                  
                  return (
                    <div className="space-y-3">
                      <div className="flex items-end justify-between">
                        <div className="space-y-1">
                          <p className="text-2xl font-bold font-mono text-white">
                            {used.toFixed(0)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            已用 / 总预算 {budget.toFixed(0)}
                          </p>
                        </div>
                        <div className={`text-right ${isOverBudget ? 'text-destructive' : 'text-primary'}`}>
                          <p className="text-xl font-bold">{((used / budget) * 100).toFixed(0)}%</p>
                          <p className="text-xs">
                            {isOverBudget ? '已超支' : '剩余'} {Math.abs(budget - used).toFixed(0)}
                          </p>
                        </div>
                      </div>
                      <Progress 
                        value={percentage} 
                        className={`h-2 ${isOverBudget ? "[&>div]:bg-destructive" : "[&>div]:bg-primary"}`}
                      />
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {/* 多币种明细卡片 */}
          <Card className={`glass-card border-primary/20 ${!subLedger.budgetAmount || parseFloat(subLedger.budgetAmount) <= 0 ? 'md:col-span-2' : ''}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                <Globe className="w-4 h-4" />
                多币种支出明细
              </CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(stats.currencyStats).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(stats.currencyStats).map(([currency, cStats]) => {
                    if (cStats.expense === 0 && cStats.income === 0) return null;
                    return (
                      <div key={currency} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                            {currency}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">{currency} 消费</p>
                            {currency !== stats.defaultCurrency && (
                              <p className="text-xs text-muted-foreground">
                                折合 {stats.defaultCurrency} {cStats.convertedExpense.toFixed(2)}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold font-mono text-expense">
                            {cStats.expense.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">暂无支出记录</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center justify-between mt-8 mb-4">
          <h2 className="text-lg font-semibold text-white">交易列表</h2>
          <Button onClick={() => setIsModalOpen(true)} size="sm" className="hidden md:flex">
            <Plus className="w-4 h-4 mr-1" />
            记一笔
          </Button>
        </div>
        
        <div className="flex-1 flex flex-col min-h-0">
          {subLedgerTransactions.length > 0 ? (
            <div className="space-y-2">
              {subLedgerTransactions.map((transaction) => (
                <TransactionItem
                  key={transaction.id}
                  transaction={transaction}
                  category={categories.find((c) => c.id === transaction.categoryId)}
                  wallet={wallets.find((w) => w.id === transaction.walletId)}
                  toWallet={
                    transaction.toWalletId
                      ? wallets.find((w) => w.id === transaction.toWalletId)
                      : undefined
                  }
                  onClick={(tx) => {
                    setSelectedTransaction(tx);
                    setIsModalOpen(true);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="py-12 glass-card rounded-xl">
              <EmptyState
                icon={Receipt}
                title="暂无交易"
                description="该子账本下暂无交易记录"
                actionLabel="记一笔"
                onAction={() => setIsModalOpen(true)}
              />
            </div>
          )}
        </div>

        {/* 悬浮添加按钮 (移动端) */}
        <Button
          size="icon"
          className="fixed bottom-24 right-6 w-14 h-14 rounded-full shadow-lg shadow-primary/25 md:hidden z-50"
          onClick={() => setIsModalOpen(true)}
        >
          <Plus className="w-6 h-6" />
        </Button>

        {/* 使用已有的 TransactionModal 来支持添加、编辑和删除 */}
        <TransactionModal
          open={isModalOpen}
          onOpenChange={handleCloseModal}
          transaction={selectedTransaction || undefined}
          categories={categories}
          wallets={wallets}
          subLedgers={subLedgers}
          defaultSubLedgerId={subLedger.id}
        />
      </div>
    </PageContainer>
  );
}
