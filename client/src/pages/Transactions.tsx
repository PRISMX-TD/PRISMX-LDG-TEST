import { TransactionFilters, TransactionFilterValues } from "@/components/TransactionFilters";
import { lazy, Suspense } from "react";
const TransactionModal = lazy(() => import("@/components/TransactionModal").then(m => ({ default: m.TransactionModal })));
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, ArrowLeft, TrendingUp, TrendingDown, ArrowUpRight, Search, Filter, Download, Loader2 } from "lucide-react";
import { Link } from "wouter";
import type { Wallet, Category, Transaction, SubLedger } from "@shared/schema";
import { getCurrencyInfo } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getSessionToken } from "@/lib/neonAuth";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUndoableDelete } from "@/hooks/useUndoableDelete";
import { BrandCircle, pickBrand } from "@/components/ds/BrandCircle";
import { PillButton } from "@/components/ds/PillButton";
import { RoundIconButton } from "@/components/ds/RoundIconButton";
import { PillTabs } from "@/components/ds/PillTabs";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

interface TxRel extends Transaction { category?: Category | null; wallet?: Wallet | null; toWallet?: Wallet | null; }
interface TxStats { totalIncome: number; totalExpense: number; categoryBreakdown: { categoryId: number; categoryName: string; total: number; color: string }[]; }
type RangeKey = "today" | "week" | "month" | "year";

export default function Transactions() {
  const { user, isLoading: isAuthLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [filters, setFilters] = useState<TransactionFilterValues>({});
  const [range, setRange] = useState<RangeKey>("month");
  const [showFilters, setShowFilters] = useState(false);

  const { data: wallets = [] } = useQuery<Wallet[]>({ queryKey: ["/api/wallets"], enabled: isAuthenticated });
  const { data: categories = [] } = useQuery<Category[]>({ queryKey: ["/api/categories"], enabled: isAuthenticated });
  const { data: subLedgers = [] } = useQuery<SubLedger[]>({ queryKey: ["/api/sub-ledgers"], enabled: isAuthenticated });

  // Date range comes from the range pill unless the user has set startDate/endDate via filters.
  const statsRange = useMemo(() => {
    if (filters.startDate && filters.endDate) return { start: filters.startDate, end: filters.endDate, label: "自定义" };
    const d = new Date();
    if (range === "today") return { start: new Date(d.getFullYear(), d.getMonth(), d.getDate()), end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999), label: "今天" };
    if (range === "week") { const day = (d.getDay() + 6) % 7; const s = new Date(d); s.setDate(d.getDate() - day); s.setHours(0,0,0,0); const e = new Date(s); e.setDate(s.getDate() + 6); e.setHours(23,59,59,999); return { start: s, end: e, label: "本周" }; }
    if (range === "year") return { start: new Date(d.getFullYear(), 0, 1), end: new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999), label: "今年" };
    return { start: new Date(d.getFullYear(), d.getMonth(), 1), end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999), label: "本月" };
  }, [range, filters.startDate, filters.endDate]);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    p.append("startDate", statsRange.start.toISOString());
    p.append("endDate",   statsRange.end.toISOString());
    if (filters.categoryId) p.append("categoryId", filters.categoryId.toString());
    if (filters.walletId)   p.append("walletId",   filters.walletId.toString());
    if (filters.type)       p.append("type",       filters.type);
    if (filters.search)     p.append("search",     filters.search);
    return p.toString();
  }, [statsRange, filters]);

  const PAGE_SIZE = 50;
  const {
    data: allTx = [], isLoading: isTxLoading, isError: isTxError, error: txError,
  } = useQuery<TxRel[]>({
    queryKey: ["/api/transactions", queryParams],
    queryFn: async () => {
      const url = `/api/transactions${queryParams ? `?${queryParams}&` : "?"}limit=${PAGE_SIZE}&offset=0`;
      const headers: Record<string, string> = {};
      const token = getSessionToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(url, { headers, credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error("Failed to fetch " + res.status);
      return json;
    },
    enabled: isAuthenticated,
  });

  const { data: stats } = useQuery<TxStats>({
    queryKey: ["/api/transactions/stats", { startDate: statsRange.start.toISOString(), endDate: statsRange.end.toISOString() }],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      const token = getSessionToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`/api/transactions/stats?startDate=${statsRange.start.toISOString()}&endDate=${statsRange.end.toISOString()}`, { headers, credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    enabled: isAuthenticated,
  });

  // ---- Selection / bulk ops (kept from r4) -----------------
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState<string>("");
  const isSelectionActive = selectedIds.size > 0;
  const toggleSelect = (id: number) => setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clearSelection = () => setSelectedIds(new Set());

  const bulkDeleteMut = useMutation({
    mutationFn: async () => { const r = await apiRequest("POST", "/api/transactions/batch-delete", { ids: Array.from(selectedIds) }); return r.json(); },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      toast({ title: `已删除 ${data.deleted || 0} 笔` });
      clearSelection();
    },
    onError: (e: any) => toast({ title: "批量删除失败", description: e.message, variant: "destructive" }),
  });
  const bulkCatMut = useMutation({
    mutationFn: async () => { const r = await apiRequest("POST", "/api/transactions/batch-categorize", { ids: Array.from(selectedIds), categoryId: bulkCategoryId === "_none_" ? null : parseInt(bulkCategoryId) }); return r.json(); },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      toast({ title: `已更新 ${data.updated || 0} 笔分类` });
      clearSelection();
      setBulkCategoryId("");
    },
    onError: (e: any) => toast({ title: "批量分类失败", description: e.message, variant: "destructive" }),
  });

  const undoableDelete = useUndoableDelete();
  const handleDelete = (t: Transaction) => {
    void undoableDelete({
      deleteUrl: `/api/transactions/${t.id}`,
      restoreUrl: "/api/transactions",
      restorePayload: {
        type: t.type, amount: parseFloat(t.amount), currency: t.currency,
        walletId: t.walletId, toWalletId: t.toWalletId || undefined,
        categoryId: t.categoryId || undefined, subLedgerId: t.subLedgerId || undefined,
        loanId: t.loanId || undefined, description: t.description || undefined,
        date: new Date(t.date).toISOString(),
      },
      invalidateKeys: [["/api/transactions"], ["/api/wallets"]],
      label: "已删除交易",
    });
  };

  const handleExport = () => {
    const url = `/api/transactions/export${queryParams ? `?${queryParams}` : ""}`;
    window.open(url, "_blank");
  };

  const cur = getCurrencyInfo(user?.defaultCurrency || "MYR");

  // Group transactions by day for the activity feed
  const byDay = useMemo(() => {
    const groups = new Map<string, TxRel[]>();
    for (const t of allTx) {
      const k = new Date(t.date).toDateString();
      const arr = groups.get(k) || [];
      arr.push(t);
      groups.set(k, arr);
    }
    return Array.from(groups.entries());
  }, [allTx]);

  const dayLabel = (key: string) => {
    const d = new Date(key); const today = new Date(); today.setHours(0,0,0,0);
    if (d.toDateString() === today.toDateString()) return "今天";
    const y = new Date(today); y.setDate(today.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return "昨天";
    return format(d, "M 月 d 日 · EEEE", { locale: zhCN });
  };

  if (isAuthLoading || !user) return null;

  return (
    <div className="text-foreground">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-5 md:py-7 pb-20 md:pb-10 space-y-5">

        {/* ============ HEADER ============ */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <RoundIconButton size="sm" aria-label="返回">
                <ArrowLeft className="w-4 h-4" />
              </RoundIconButton>
            </Link>
            <h1 className="text-[22px] md:text-[28px] font-semibold tracking-tight m-0 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-primary" /> 活动
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <RoundIconButton size="sm" onClick={() => setShowFilters(s => !s)} aria-label="筛选">
              <Filter className="w-4 h-4" />
            </RoundIconButton>
            <RoundIconButton size="sm" onClick={handleExport} aria-label="导出">
              <Download className="w-4 h-4" />
            </RoundIconButton>
          </div>
        </header>

        {/* ============ HERO STATS ============ */}
        <section className="hero-card">
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] text-foreground/70 m-0 tracking-wider uppercase">{statsRange.label}净流入</p>
              <span className="text-[10px] text-foreground/60">{format(statsRange.start, "MM/dd")} – {format(statsRange.end, "MM/dd")}</span>
            </div>
            <p className="text-[36px] md:text-[44px] font-semibold tracking-tight leading-none m-0">
              <span className={`num-gradient`}>
                {((stats?.totalIncome || 0) - (stats?.totalExpense || 0)) >= 0 ? "+" : "−"}
                {cur.symbol} {Math.abs((stats?.totalIncome || 0) - (stats?.totalExpense || 0)).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </p>
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <span className="text-[12px] text-income inline-flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> +{cur.symbol} {(stats?.totalIncome || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[12px] text-expense inline-flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5" /> −{cur.symbol} {(stats?.totalExpense || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[12px] text-foreground/60 inline-flex items-center gap-1">
                共 {allTx.length} 笔
              </span>
            </div>
          </div>
        </section>

        {/* ============ RANGE PILLS ============ */}
        <PillTabs<RangeKey>
          value={range}
          onChange={setRange}
          options={[
            { id: "today", label: "今天" },
            { id: "week", label: "本周" },
            { id: "month", label: "本月" },
            { id: "year", label: "今年" },
          ]}
        />

        {/* ============ FILTERS (collapsible) ============ */}
        {showFilters && (
          <div className="asset-card p-4">
            <TransactionFilters
              categories={categories}
              wallets={wallets}
              filters={filters}
              onFiltersChange={setFilters}
              onExport={handleExport}
            />
          </div>
        )}

        {/* ============ BULK BAR ============ */}
        {isSelectionActive && (
          <div className="asset-card p-3 flex items-center gap-3 flex-wrap sticky top-2 z-10">
            <span className="text-sm font-medium">已选 {selectedIds.size} 笔</span>
            <select
              value={bulkCategoryId}
              onChange={(e) => setBulkCategoryId(e.target.value)}
              className="bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 text-xs"
            >
              <option value="">批量改分类…</option>
              <option value="_none_">设为未分类</option>
              {categories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </select>
            <Button size="sm" variant="outline" disabled={!bulkCategoryId || bulkCatMut.isPending} onClick={() => bulkCatMut.mutate()}>应用</Button>
            <Button size="sm" variant="outline" className="text-expense border-expense/40 hover:bg-expense/10"
              disabled={bulkDeleteMut.isPending}
              onClick={() => { if (confirm(`确认删除已选 ${selectedIds.size} 笔？`)) bulkDeleteMut.mutate(); }}>
              删除
            </Button>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={clearSelection}>清除</Button>
          </div>
        )}

        {/* ============ ACTIVITY FEED ============ */}
        {isTxError ? (
          <div className="asset-card text-center py-10">
            <p className="text-sm text-expense m-0 font-medium">加载失败</p>
            <p className="text-xs text-foreground-muted m-0 mt-1">{(txError as Error)?.message || "未知错误"}</p>
            <PillButton className="mt-4" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/transactions"] })}>重试</PillButton>
          </div>
        ) : isTxLoading ? (
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
        ) : allTx.length === 0 ? (
          <div className="asset-card text-center py-16">
            <Receipt className="w-10 h-10 mx-auto text-foreground-muted mb-3" />
            <p className="text-sm text-foreground m-0 font-medium">没有找到交易</p>
            <p className="text-xs text-foreground-muted m-0 mt-1">调整筛选或记一笔新的</p>
            <PillButton className="mt-5" onClick={() => { setEditingTx(null); setIsModalOpen(true); }}>记一笔</PillButton>
          </div>
        ) : (
          <div className="space-y-5">
            {byDay.map(([dayKey, txs], dayIdx) => {
              const dayInc = txs.filter(t => t.type === "income" && !t.loanId).reduce((s, t) => s + parseFloat(t.amount), 0);
              const dayExp = txs.filter(t => t.type === "expense" && !t.loanId).reduce((s, t) => s + parseFloat(t.amount), 0);
              return (
                <section key={dayKey}>
                  <div className="flex items-baseline justify-between mb-2 px-1">
                    <p className="text-[12px] text-foreground/70 m-0 font-medium">{dayLabel(dayKey)}</p>
                    <p className="text-[11px] font-mono text-foreground-muted m-0">
                      {dayInc > 0 && <span className="text-income mr-2">+{cur.symbol}{dayInc.toFixed(2)}</span>}
                      {dayExp > 0 && <span className="text-expense">−{cur.symbol}{dayExp.toFixed(2)}</span>}
                    </p>
                  </div>
                  <div className="activity-card">
                    {txs.map((t, i) => {
                      const [from, to] = pickBrand(t.wallet?.currency, t.wallet?.type);
                      const sign = t.type === "expense" ? "−" : t.type === "income" ? "+" : "";
                      const toneClass = t.type === "expense" ? "text-expense" : t.type === "income" ? "text-income" : "text-foreground";
                      const newest = dayIdx === 0 && i === 0;
                      const checked = selectedIds.has(t.id);
                      return (
                        <div
                          key={t.id}
                          className={`activity-row ${newest ? "is-newest" : ""} cursor-pointer group`}
                          onClick={() => {
                            if (isSelectionActive) { toggleSelect(t.id); return; }
                            setEditingTx(t); setIsModalOpen(true);
                          }}
                          onContextMenu={(e) => { e.preventDefault(); toggleSelect(t.id); }}
                        >
                          {isSelectionActive ? (
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleSelect(t.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-4 h-4 accent-primary"
                              aria-label="选择"
                            />
                          ) : (
                            <BrandCircle label={(t.wallet?.currency || "RM").slice(0, 3)} from={from} to={to} size="sm" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium m-0 truncate">
                              {t.description || t.category?.name || (t.type === "expense" ? "支出" : t.type === "income" ? "收入" : "转账")}
                            </p>
                            <p className="text-[10.5px] text-foreground-muted m-0 mt-0.5 truncate">
                              {t.wallet?.name || "未知"} · {format(new Date(t.date), "HH:mm")}
                              {t.category && t.type !== "transfer" && <> · {t.category.name}</>}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-[13.5px] font-mono font-medium m-0 ${toneClass}`}>
                              {sign}{getCurrencyInfo(t.wallet?.currency || "MYR").symbol} {parseFloat(t.amount).toFixed(2)}
                            </p>
                            {t.currency && t.wallet?.currency && t.currency !== t.wallet.currency && t.originalAmount && (
                              <p className="text-[9.5px] text-foreground-muted m-0 mt-0.5">
                                原 {getCurrencyInfo(t.currency).symbol}{parseFloat(t.originalAmount).toFixed(2)}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}

          </div>
        )}
      </div>

      <FloatingActionButton onClick={() => { setEditingTx(null); setIsModalOpen(true); }} />

      <Suspense fallback={null}>
        <TransactionModal
          open={isModalOpen}
          onOpenChange={(open) => { setIsModalOpen(open); if (!open) setEditingTx(null); }}
          wallets={wallets}
          categories={categories}
          subLedgers={subLedgers}
          defaultCurrency={user?.defaultCurrency || "MYR"}
          transaction={editingTx}
          onDelete={handleDelete}
        />
      </Suspense>
    </div>
  );
}
