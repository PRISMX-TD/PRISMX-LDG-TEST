import { useState, useMemo } from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { TransactionModal } from "@/components/TransactionModal";
import { Button } from "@/components/ui/button";
import {
  Loader2, ArrowLeft, BookOpen, Receipt, TrendingDown, TrendingUp,
  Target, Globe, Plus, AlertTriangle, Calendar,
} from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { Transaction, SubLedger, Category, Wallet } from "@shared/schema";

/* r7 — SubLedgerDetail rewritten from scratch.
   - Hero card with sub-ledger color stripe, balance + period
   - Stat trio: expense / income / budget (or net)
   - Budget progress as gradient pill with over-budget badge
   - Multi-currency breakdown as flush rows
   - Transaction list as flush activity feed (not glass-card per-item) */

export default function SubLedgerDetail() {
  const [, params] = useRoute("/sub-ledgers/:id");
  const subLedgerId = params?.id ? parseInt(params.id) : null;
  const { user } = useAuth();
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: subLedgers = [], isLoading: isLoadingSubLedgers } = useQuery<SubLedger[]>({
    queryKey: ["/api/sub-ledgers?includeArchived=true"],
  });
  const { data: transactions = [], isLoading: isLoadingTransactions } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
  });
  const { data: categories = [] } = useQuery<Category[]>({ queryKey: ["/api/categories"] });
  const { data: wallets = [] } = useQuery<Wallet[]>({ queryKey: ["/api/wallets"] });

  const subLedger = subLedgers.find(s => s.id === subLedgerId);

  const subLedgerTransactions = useMemo(() =>
    transactions.filter(t => t.subLedgerId === subLedgerId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
  [transactions, subLedgerId]);

  const stats = useMemo(() => {
    let totalExpense = 0, totalIncome = 0;
    const cur: Record<string, { expense: number; income: number; convertedExpense: number; convertedIncome: number }> = {};
    const defaultCurrency = user?.defaultCurrency || "MYR";
    subLedgerTransactions.forEach(t => {
      // Prefer the joined wallet so archived wallets (absent from /api/wallets) still convert.
      const w = (t as any).wallet || wallets.find(x => x.id === t.walletId);
      const c = w?.currency || defaultCurrency;
      const rawRate = parseFloat(w?.exchangeRateToDefault || "1");
      const rate = isNaN(rawRate) || rawRate <= 0 ? 1 : rawRate;
      const amount = parseFloat(t.amount);
      const converted = amount * rate;
      if (!cur[c]) cur[c] = { expense: 0, income: 0, convertedExpense: 0, convertedIncome: 0 };
      if (t.type === "expense") { totalExpense += converted; cur[c].expense += amount; cur[c].convertedExpense += converted; }
      else if (t.type === "income") { totalIncome += converted; cur[c].income += amount; cur[c].convertedIncome += converted; }
    });
    return { totalExpense, totalIncome, net: totalIncome - totalExpense, cur, defaultCurrency };
  }, [subLedgerTransactions, wallets, user]);

  if (isLoadingSubLedgers || isLoadingTransactions) {
    return (
      <div className="min-h-screen bg-[#0a0612] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#a78bfa]" />
      </div>
    );
  }

  if (!subLedger) {
    return (
      <div className="min-h-screen bg-[#0a0612] flex flex-col items-center justify-center gap-4">
        <p className="text-foreground/55">未找到该子账本</p>
        <Link href="/insights?tab=subledgers"><Button variant="outline">返回子账本列表</Button></Link>
      </div>
    );
  }

  const color = subLedger.color || "#a78bfa";
  const hasBudget = subLedger.budgetAmount && parseFloat(subLedger.budgetAmount) > 0;
  const budget = hasBudget ? parseFloat(subLedger.budgetAmount!) : 0;
  const pct = hasBudget ? Math.min((stats.totalExpense / budget) * 100, 100) : 0;
  const over = hasBudget && stats.totalExpense > budget;
  const remaining = hasBudget ? budget - stats.totalExpense : 0;

  return (
    <div className="min-h-screen text-foreground relative">
      <div aria-hidden className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute -top-40 left-1/3 w-[520px] h-[520px] rounded-full opacity-50 blur-3xl"
             style={{ background: `radial-gradient(circle, ${color}33 0%, transparent 70%)` }} />
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-5 md:py-8 pb-20 md:pb-12 relative space-y-5 md:space-y-6">

        {/* HEADER */}
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/insights?tab=subledgers">
              <button className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.10] hover:bg-white/[0.10] flex items-center justify-center text-foreground/70 hover:text-foreground transition-all">
                <ArrowLeft className="w-[18px] h-[18px]" />
              </button>
            </Link>
            <div>
              <p className="text-[11px] tracking-[0.2em] uppercase text-foreground/45 m-0">Sub-ledger</p>
              <h1 className="text-[22px] md:text-[28px] font-bold tracking-tight m-0 flex items-center gap-2">
                <BookOpen className="w-5 h-5" style={{ color }} />
                {subLedger.name}
              </h1>
            </div>
          </div>
          <Button onClick={() => setIsModalOpen(true)} className="hidden md:inline-flex">
            <Plus className="w-4 h-4" />记一笔
          </Button>
        </header>

        {/* HERO CARD */}
        <section className="relative overflow-hidden rounded-3xl p-5 md:p-7"
                 style={{
                   background: `linear-gradient(135deg, ${color}22 0%, rgba(20,12,32,0.7) 80%)`,
                   border: "1px solid rgba(255,255,255,0.08)",
                   backdropFilter: "blur(16px)",
                 }}>
          <div aria-hidden className="absolute top-0 left-0 right-0 h-1"
               style={{ background: `linear-gradient(90deg, ${color}, ${color}66)` }} />
          <div aria-hidden className="absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-40 blur-3xl"
               style={{ background: `radial-gradient(circle, ${color}66 0%, transparent 70%)` }} />

          <div className="relative">
            {subLedger.description && (
              <p className="text-[13px] text-foreground/65 m-0 mb-4">{subLedger.description}</p>
            )}
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-[12px] text-foreground/55">净 {stats.defaultCurrency}</span>
            </div>
            <p className="text-[36px] md:text-[44px] font-bold tabular-nums m-0 leading-none"
               style={{
                 background: stats.net >= 0
                   ? `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`
                   : "linear-gradient(135deg, #f87171 0%, #dc2626 100%)",
                 WebkitBackgroundClip: "text",
                 WebkitTextFillColor: "transparent",
               }}>
              {stats.net >= 0 ? "+" : "−"}{Math.abs(stats.net).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>

            {/* meta pills */}
            <div className="flex items-center flex-wrap gap-2 mt-4">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/[0.10] text-[11px] font-medium">
                <Receipt className="w-3 h-3" />{subLedgerTransactions.length} 笔
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/[0.10] text-[11px] font-medium">
                {subLedger.currency || "MYR"}
              </span>
              {(subLedger.startDate || subLedger.endDate) && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/[0.10] text-[11px] font-medium">
                  <Calendar className="w-3 h-3" />
                  {subLedger.startDate ? format(new Date(subLedger.startDate), "MM/dd") : "?"}–{subLedger.endDate ? format(new Date(subLedger.endDate), "MM/dd") : "?"}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* STAT TRIO */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          <div className="rounded-2xl p-4 bg-emerald-400/8 border border-emerald-400/15">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10.5px] tracking-[0.18em] uppercase text-foreground/55 m-0">收入</p>
              <div className="w-7 h-7 rounded-lg bg-emerald-400/15 border border-emerald-400/20 flex items-center justify-center text-emerald-300">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-[20px] font-bold m-0 tabular-nums text-emerald-300">+{stats.totalIncome.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl p-4 bg-rose-400/8 border border-rose-400/15">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10.5px] tracking-[0.18em] uppercase text-foreground/55 m-0">支出</p>
              <div className="w-7 h-7 rounded-lg bg-rose-400/15 border border-rose-400/20 flex items-center justify-center text-rose-300">
                <TrendingDown className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-[20px] font-bold m-0 tabular-nums text-rose-300">−{stats.totalExpense.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl p-4 bg-white/[0.025] border border-white/[0.06]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10.5px] tracking-[0.18em] uppercase text-foreground/55 m-0">{hasBudget ? "剩余预算" : "预算"}</p>
              <div className="w-7 h-7 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center"
                   style={{ color }}>
                <Target className="w-3.5 h-3.5" />
              </div>
            </div>
            {hasBudget ? (
              <p className={`text-[20px] font-bold m-0 tabular-nums ${remaining >= 0 ? "text-foreground" : "text-rose-300"}`}>
                {remaining.toFixed(2)}
              </p>
            ) : (
              <p className="text-[14px] text-foreground/45 m-0 mt-1">未设置</p>
            )}
          </div>
        </section>

        {/* BUDGET BAR + CURRENCY BREAKDOWN */}
        <section className={`grid gap-3 md:gap-4 ${hasBudget ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
          {hasBudget && (
            <div className="rounded-3xl p-5 bg-white/[0.025] border border-white/[0.06]">
              <h3 className="text-[13px] font-bold m-0 mb-3 flex items-center gap-2">
                <Target className="w-3.5 h-3.5" style={{ color }} />
                预算执行 ({subLedger.currency || stats.defaultCurrency})
              </h3>
              <div className="flex items-end justify-between mb-3">
                <div>
                  <p className="text-[28px] font-bold font-mono m-0 leading-none">{stats.totalExpense.toFixed(0)}</p>
                  <p className="text-[11px] text-foreground/55 m-0 mt-1">已用 / 总预算 {budget.toFixed(0)}</p>
                </div>
                <div className={`text-right ${over ? "text-rose-300" : ""}`} style={!over ? { color } : {}}>
                  <p className="text-[22px] font-bold m-0 leading-none">{((stats.totalExpense / budget) * 100).toFixed(0)}%</p>
                  <p className="text-[11px] m-0 mt-1 inline-flex items-center gap-1">
                    {over && <AlertTriangle className="w-3 h-3" />}
                    {over ? "已超支" : "剩余"} {Math.abs(budget - stats.totalExpense).toFixed(0)}
                  </p>
                </div>
              </div>
              <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500"
                     style={{
                       width: `${pct}%`,
                       background: over ? "linear-gradient(90deg, #f87171, #dc2626)" : `linear-gradient(90deg, ${color}cc, ${color})`,
                       boxShadow: over ? "0 0 8px rgba(248,113,113,0.5)" : `0 0 8px ${color}55`,
                     }} />
              </div>
            </div>
          )}

          <div className="rounded-3xl p-5 bg-white/[0.025] border border-white/[0.06]">
            <h3 className="text-[13px] font-bold m-0 mb-3 flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-foreground/60" />多币种支出明细
            </h3>
            {Object.keys(stats.cur).length === 0 ? (
              <p className="text-[12px] text-foreground/50 text-center py-4 m-0">暂无支出</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(stats.cur).map(([currency, c]) => {
                  if (c.expense === 0 && c.income === 0) return null;
                  return (
                    <div key={currency} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[10.5px] font-bold tracking-wide"
                             style={{ background: `${color}22`, color, border: `1px solid ${color}33` }}>
                          {currency}
                        </div>
                        <div>
                          <p className="text-[12.5px] font-semibold m-0">{currency}</p>
                          {currency !== stats.defaultCurrency && (
                            <p className="text-[10.5px] text-foreground/55 m-0">折合 {stats.defaultCurrency} {c.convertedExpense.toFixed(2)}</p>
                          )}
                        </div>
                      </div>
                      <p className="text-[13px] font-bold font-mono text-rose-300 m-0">{c.expense.toFixed(2)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* TRANSACTIONS */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[16px] font-bold tracking-tight m-0">交易列表</h2>
            <Button onClick={() => setIsModalOpen(true)} size="sm" className="md:hidden">
              <Plus className="w-3.5 h-3.5" />记一笔
            </Button>
          </div>

          {subLedgerTransactions.length === 0 ? (
            <div className="rounded-3xl p-10 text-center bg-white/[0.025] border border-dashed border-white/[0.10]">
              <Receipt className="w-7 h-7 mx-auto text-foreground/35 mb-2" />
              <p className="text-[13px] font-medium m-0">该子账本下暂无交易</p>
              <p className="text-[12px] text-foreground/50 m-0 mt-1 mb-4">点击下方添加</p>
              <Button onClick={() => setIsModalOpen(true)}><Plus className="w-4 h-4" />记一笔</Button>
            </div>
          ) : (
            <div className="rounded-3xl bg-white/[0.025] border border-white/[0.06] overflow-hidden">
              {subLedgerTransactions.map((t, i) => {
                const cat = categories.find(c => c.id === t.categoryId);
                const w = wallets.find(x => x.id === t.walletId);
                const catColor = cat?.color || color;
                const isExpense = t.type === "expense";
                const isIncome = t.type === "income";
                return (
                  <button
                    key={t.id}
                    onClick={() => { setSelectedTransaction(t); setIsModalOpen(true); }}
                    className={`w-full flex items-center gap-3 md:gap-4 px-4 md:px-5 py-3.5 text-left transition-all hover:bg-white/[0.04] ${
                      i < subLedgerTransactions.length - 1 ? "border-b border-white/[0.04]" : ""
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[11px] font-bold shrink-0"
                         style={{ background: `${catColor}22`, color: catColor, border: `1px solid ${catColor}33` }}>
                      {(w?.currency || "RM").slice(0, 3)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-semibold m-0 truncate">
                        {t.description || cat?.name || (isExpense ? "支出" : isIncome ? "收入" : "转账")}
                      </p>
                      <p className="text-[11px] text-foreground/50 m-0 mt-0.5 truncate">
                        {w?.name || "未知"} · {format(new Date(t.date), "MM月dd日 HH:mm", { locale: zhCN })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-[15px] font-bold m-0 tabular-nums ${isExpense ? "text-rose-300" : isIncome ? "text-emerald-300" : "text-foreground"}`}>
                        {isExpense ? "−" : isIncome ? "+" : ""}{parseFloat(t.amount).toFixed(2)}
                      </p>
                      <p className="text-[10px] text-foreground/45 m-0">{w?.currency || "MYR"}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* mobile FAB */}
        <button
          onClick={() => setIsModalOpen(true)}
          aria-label="记一笔"
          className="fixed bottom-24 right-5 z-[9999] w-14 h-14 rounded-full md:hidden flex items-center justify-center text-white transition-all hover:scale-105 active:scale-95"
          style={{
            background: `linear-gradient(135deg, ${color}, ${color}cc)`,
            boxShadow: `0 14px 38px -10px ${color}b3, inset 0 1px 0 rgba(255,255,255,0.18)`,
          }}
        >
          <Plus className="w-6 h-6" strokeWidth={2.4} />
        </button>

        <TransactionModal
          open={isModalOpen}
          onOpenChange={(o) => { setIsModalOpen(o); if (!o) setSelectedTransaction(null); }}
          transaction={selectedTransaction || undefined}
          categories={categories}
          wallets={wallets}
          subLedgers={subLedgers}
          defaultSubLedgerId={subLedger.id}
        />
      </div>
    </div>
  );
}
