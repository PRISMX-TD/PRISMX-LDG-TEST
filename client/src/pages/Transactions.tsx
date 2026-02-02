import { PageContainer } from "@/components/PageContainer";
import { TransactionFilters, TransactionFilterValues } from "@/components/TransactionFilters";
import { TransactionItem, TransactionItemSkeleton } from "@/components/TransactionItem";
import { lazy, Suspense } from "react";
const TransactionModal = lazy(() => import("@/components/TransactionModal").then(m => ({ default: m.TransactionModal })));
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, ArrowLeft, TrendingUp, TrendingDown, ArrowUpRight } from "lucide-react";
import { Link } from "wouter";
import type { Wallet, Category, Transaction, SubLedger } from "@shared/schema";
import { getCurrencyInfo } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useInfiniteQuery } from "@tanstack/react-query";

interface TransactionWithRelations extends Transaction {
  category?: Category | null;
  wallet?: Wallet | null;
  toWallet?: Wallet | null;
}

interface TransactionStats {
  totalIncome: number;
  totalExpense: number;
  categoryBreakdown: { categoryId: number; categoryName: string; total: number; color: string }[];
}

export default function Transactions() {
  const { user, isLoading: isAuthLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [filters, setFilters] = useState<TransactionFilterValues>({});

  const { data: wallets = [] } = useQuery<Wallet[]>({
    queryKey: ["/api/wallets"],
    enabled: isAuthenticated,
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    enabled: isAuthenticated,
  });

  const { data: subLedgers = [] } = useQuery<SubLedger[]>({
    queryKey: ["/api/sub-ledgers"],
    enabled: isAuthenticated,
  });

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.startDate) params.append("startDate", filters.startDate.toISOString());
    if (filters.endDate) params.append("endDate", filters.endDate.toISOString());
    if (filters.categoryId) params.append("categoryId", filters.categoryId.toString());
    if (filters.walletId) params.append("walletId", filters.walletId.toString());
    if (filters.type) params.append("type", filters.type);
    if (filters.search) params.append("search", filters.search);
    return params.toString();
  }, [filters]);

  const PAGE_SIZE = 50;
  const {
    data: transactionsPages,
    isLoading: isTransactionsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<TransactionWithRelations[]>({
    queryKey: ["/api/transactions", queryParams],
    queryFn: async ({ pageParam = 0 }) => {
      const url = `/api/transactions${queryParams ? `?${queryParams}&` : "?"}limit=${PAGE_SIZE}&offset=${pageParam}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    getNextPageParam: (lastPage, allPages) => {
      const nextOffset = (allPages.reduce((sum, p) => sum + p.length, 0));
      return lastPage.length === PAGE_SIZE ? nextOffset : undefined;
    },
    enabled: isAuthenticated,
    initialPageParam: 0,
  });

  const flatTransactions = transactionsPages?.pages?.flat() || [];

  const { data: stats, isLoading: isStatsLoading } = useQuery<TransactionStats>({
    queryKey: ["/api/transactions/stats", { startDate: filters.startDate, endDate: filters.endDate }],
    queryFn: async () => {
      if (!filters.startDate || !filters.endDate) return { totalIncome: 0, totalExpense: 0, categoryBreakdown: [] };
      const res = await fetch(
        `/api/transactions/stats?startDate=${filters.startDate.toISOString()}&endDate=${filters.endDate.toISOString()}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    enabled: isAuthenticated && !!filters.startDate && !!filters.endDate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/transactions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      toast({
        title: "删除成功",
        description: "交易记录已删除",
      });
    },
    onError: () => {
      toast({
        title: "删除失败",
        description: "请稍后重试",
        variant: "destructive",
      });
    },
  });

  const handleExport = () => {
    const exportUrl = `/api/transactions/export${queryParams ? `?${queryParams}` : ""}`;
    window.open(exportUrl, "_blank");
  };

  const handleDeleteTransaction = (transaction: Transaction) => {
    deleteMutation.mutate(transaction.id);
  };

  const handleCloseModal = (open: boolean) => {
    setIsModalOpen(open);
    if (!open) {
      setEditingTransaction(null);
    }
  };

  const handleAddNew = () => {
    setEditingTransaction(null);
    setIsModalOpen(true);
  };

  const currencyInfo = getCurrencyInfo(user?.defaultCurrency || "MYR");

  if (isAuthLoading || !user) {
    return null;
  }

  return (
    <PageContainer scrollable={false}>
      <div className="flex-1 flex flex-col min-h-0 space-y-4 md:space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-back-home" className="text-gray-400 hover:text-white">
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
          </Link>
          <h1 className="text-2xl font-semibold flex items-center gap-2 text-white">
            <Receipt className="w-6 h-6 text-neon-purple" />
            交易记录
          </h1>
        </div>

        {/* 统计卡片 - 使用透明玻璃效果 */}
        <div className="grid gap-3 md:gap-4 grid-cols-3">
          <div className="glass-card p-3 md:p-4 group">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-yellow-400" />
              <span className="text-xs md:text-sm text-gray-400">收入</span>
            </div>
            {isStatsLoading ? (
              <Skeleton className="h-6 w-16 bg-white/10" />
            ) : (
              <p className="text-base md:text-xl font-bold font-mono text-white group-hover:text-yellow-200 transition-colors">
                +{currencyInfo.symbol}{(stats?.totalIncome || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
              </p>
            )}
          </div>

          <div className="glass-card p-3 md:p-4 group">
            <div className="flex items-center gap-2 mb-1">
              <ArrowUpRight className="w-4 h-4 text-red-400" />
              <span className="text-xs md:text-sm text-gray-400">支出</span>
            </div>
            {isStatsLoading ? (
              <Skeleton className="h-6 w-16 bg-white/10" />
            ) : (
              <p className="text-base md:text-xl font-bold font-mono text-white group-hover:text-red-200 transition-colors">
                -{currencyInfo.symbol}{(stats?.totalExpense || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
              </p>
            )}
          </div>

          <div className="glass-card p-3 md:p-4 group">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs md:text-sm text-gray-400">净收入</span>
            </div>
            {isStatsLoading ? (
              <Skeleton className="h-6 w-16 bg-white/10" />
            ) : (
              <p
                className={`text-base md:text-xl font-bold font-mono transition-colors ${
                  (stats?.totalIncome || 0) - (stats?.totalExpense || 0) >= 0 ? "text-white group-hover:text-green-200" : "text-red-400 group-hover:text-red-200"
                }`}
              >
                {(stats?.totalIncome || 0) - (stats?.totalExpense || 0) >= 0 ? "+" : ""}
                {currencyInfo.symbol}
                {((stats?.totalIncome || 0) - (stats?.totalExpense || 0)).toLocaleString("zh-CN", {
                  minimumFractionDigits: 2,
                })}
              </p>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0 gap-4">
          <div className="glass-card p-4">
            <TransactionFilters
              categories={categories}
              wallets={wallets}
              filters={filters}
              onFiltersChange={setFilters}
              onExport={handleExport}
            />
          </div>

          {/* 交易列表 - 直接展示，移除手动虚拟滚动 */}
          <div className="flex-1 min-h-0 overflow-y-auto custom-scroll pr-2">
            {isTransactionsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <TransactionItemSkeleton key={i} />
                ))}
              </div>
            ) : flatTransactions.length === 0 ? (
              <div className="py-12 glass-card rounded-xl">
                <EmptyState
                  icon={Receipt}
                  title="没有找到交易记录"
                  description="调整筛选条件或添加新交易"
                  actionLabel="记一笔"
                  onAction={handleAddNew}
                />
              </div>
            ) : (
              <div className="space-y-2 pb-20 md:pb-0">
                {flatTransactions.map((transaction) => (
                  <TransactionItem
                    key={transaction.id}
                    transaction={transaction}
                    category={categories.find(c => c.id === transaction.categoryId)}
                    wallet={wallets.find(w => w.id === transaction.walletId)}
                    toWallet={transaction.toWalletId ? wallets.find(w => w.id === transaction.toWalletId) : undefined}
                    onClick={(tx) => {
                      setEditingTransaction(tx);
                      setIsModalOpen(true);
                    }}
                  />
                ))}
                
                {hasNextPage && (
                  <div className="flex justify-center py-4">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => fetchNextPage()} 
                      disabled={isFetchingNextPage}
                      className="bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10"
                    >
                      {isFetchingNextPage ? "加载中..." : "加载更多"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <FloatingActionButton onClick={handleAddNew} />

      <Suspense fallback={null}>
        <TransactionModal
          open={isModalOpen}
          onOpenChange={handleCloseModal}
          wallets={wallets}
          categories={categories}
          subLedgers={subLedgers}
          defaultCurrency={user?.defaultCurrency || "MYR"}
          transaction={editingTransaction}
          onDelete={handleDeleteTransaction}
        />
      </Suspense>
    </PageContainer>
  );
}
