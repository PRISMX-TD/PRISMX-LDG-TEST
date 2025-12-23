import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/Header";
import { TransactionFilters, TransactionFilterValues } from "@/components/TransactionFilters";
import { TransactionItem, TransactionItemSkeleton } from "@/components/TransactionItem";
import { lazy, Suspense } from "react";
const TransactionModal = lazy(() => import("@/components/TransactionModal").then(m => ({ default: m.TransactionModal })));
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, ArrowLeft, TrendingUp, TrendingDown } from "lucide-react";
import { Link } from "wouter";
import type { Wallet, Category, Transaction, SubLedger } from "@shared/schema";
import { getCurrencyInfo } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";

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
    refetch: refetchTransactions,
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
  const [visibleCount, setVisibleCount] = useState(30);
  useEffect(() => {
    setVisibleCount(30);
    const total = flatTransactions.length;
    let cancelled = false;
    const step = () => {
      if (cancelled) return;
      setVisibleCount((c) => (c < total ? Math.min(c + 30, total) : c));
      if (typeof (window as any).requestIdleCallback === "function") {
        (window as any).requestIdleCallback(step);
      } else {
        setTimeout(step, 100);
      }
    };
    if (total > 30) step();
    return () => { cancelled = true; };
  }, [flatTransactions.length]);

  const sentinelRef = useState<HTMLDivElement | null>(null)[0] as HTMLDivElement | null;
  const [sentinelEl, setSentinelEl] = useState<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sentinelEl) return;
    const io = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    }, { rootMargin: "200px", root: listRef.current || undefined });
    io.observe(sentinelEl);
    return () => io.disconnect();
  }, [sentinelEl, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const ITEM_HEIGHT = 72;
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerHeight(el.clientHeight));
    setContainerHeight(el.clientHeight);
    ro.observe(el);
    return () => ro.disconnect();
  }, [listRef.current]);
  const overscan = 10;
  const totalHeight = flatTransactions.length * ITEM_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - overscan);
  const visibleItems = Math.ceil((containerHeight || 0) / ITEM_HEIGHT) + overscan * 2;
  const endIndex = Math.min(flatTransactions.length, startIndex + visibleItems);

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
    <div className="min-h-screen aurora-bg">
      <div className="hidden md:block">
        <Header user={user} />
      </div>

      <main className="mx-auto max-w-[1600px] px-4 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
        <div className="hidden md:flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-back-home">
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
          </Link>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Receipt className="w-6 h-6" />
            交易记录
          </h1>
        </div>

        {/* 统计卡片 - 使用透明玻璃效果 */}
        <div className="grid gap-3 md:gap-4 grid-cols-3">
          <div className="p-3 md:p-4 rounded-xl bg-income/5 border border-income/20">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-income" />
              <span className="text-xs md:text-sm text-muted-foreground">收入</span>
            </div>
            {isStatsLoading ? (
              <Skeleton className="h-6 w-16" />
            ) : (
              <p className="text-base md:text-xl font-bold font-mono text-income">
                +{currencyInfo.symbol}{(stats?.totalIncome || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
              </p>
            )}
          </div>

          <div className="p-3 md:p-4 rounded-xl bg-expense/5 border border-expense/20">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-expense" />
              <span className="text-xs md:text-sm text-muted-foreground">支出</span>
            </div>
            {isStatsLoading ? (
              <Skeleton className="h-6 w-16" />
            ) : (
              <p className="text-base md:text-xl font-bold font-mono text-expense">
                -{currencyInfo.symbol}{(stats?.totalExpense || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
              </p>
            )}
          </div>

          <div className="p-3 md:p-4 rounded-xl bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs md:text-sm text-muted-foreground">净收入</span>
            </div>
            {isStatsLoading ? (
              <Skeleton className="h-6 w-16" />
            ) : (
              <p
                className={`text-base md:text-xl font-bold font-mono ${
                  (stats?.totalIncome || 0) - (stats?.totalExpense || 0) >= 0 ? "text-income" : "text-expense"
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

        <div className="grid gap-4 md:gap-6 grid-cols-1">
          <div className="space-y-4">
            <TransactionFilters
              categories={categories}
              wallets={wallets}
              filters={filters}
              onFiltersChange={setFilters}
              onExport={handleExport}
            />

            {/* 交易列表 - 无卡片包装，直接展示 */}
            <div>
              {isTransactionsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <TransactionItemSkeleton key={i} />
                  ))}
                </div>
              ) : (transactionsPages?.pages?.flat().length || 0) === 0 ? (
                <div className="py-12">
                  <EmptyState
                    icon={Receipt}
                    title="没有找到交易记录"
                    description="调整筛选条件或添加新交易"
                    actionLabel="记一笔"
                    onAction={handleAddNew}
                  />
                </div>
              ) : (
                <div className="space-y-2 themed-scrollbar" ref={listRef} onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)} style={{ maxHeight: "calc(100vh - 260px)", overflowY: "auto" }}>
                  <div style={{ height: totalHeight, position: "relative" }}>
                    <div style={{ transform: `translateY(${startIndex * ITEM_HEIGHT}px)` }}>
                      {flatTransactions.slice(startIndex, endIndex).map((transaction) => (
                        <TransactionItem
                          key={transaction.id}
                          transaction={transaction}
                          category={transaction.category}
                          wallet={transaction.wallet}
                          toWallet={transaction.toWallet}
                          onClick={(tx) => {
                            setEditingTransaction(tx);
                            setIsModalOpen(true);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  {hasNextPage && (
                    <div ref={setSentinelEl} className="flex justify-center pt-2">
                      <Button variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                        {isFetchingNextPage ? "加载中..." : "加载更多"}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

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
    </div>
  );
}
