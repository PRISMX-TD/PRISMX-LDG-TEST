import { useState, useEffect, useMemo, startTransition } from "react";
import { useLocation, useSearch, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { TransactionModal } from "@/components/TransactionModal";
import { DashboardCustomizeModal } from "@/components/DashboardCustomizeModal";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { usePrivacyMode } from "@/hooks/usePrivacyMode";
import {
  Plus, ArrowUp, ArrowDown, ArrowUpRight, ArrowDownLeft, Bell,
  Loader2, ChevronDown, Eye, EyeOff, SlidersHorizontal, Search,
  Coins, ChevronRight, Send, Download, ArrowLeftRight, PiggyBank,
  Sparkles, Wallet as WalletIcon, Activity, TrendingUp, TrendingDown,
  Flame, Star,
} from "lucide-react";
import type { Wallet as WalletType, Category, Transaction, SubLedger, BillReminder } from "@shared/schema";
import { getCurrencyInfo } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BrandCircle, pickBrand } from "@/components/ds/BrandCircle";
import { Sparkline } from "@/components/ds/Sparkline";
import { LazyRecharts } from "@/components/LazyRecharts";

interface TxRel extends Transaction { category?: Category | null; wallet?: WalletType | null; toWallet?: WalletType | null; }
interface DashboardPrefs {
  showTotalAssets?: boolean;
  showMonthlyIncome?: boolean;
  showMonthlyExpense?: boolean;
  showFlexibleFunds?: boolean;
  showSavingsGoals?: boolean;
  showBudgets?: boolean;
  showWallets?: boolean;
  showRecentTransactions?: boolean;
  cardOrder?: string[] | null;
}
type Range = "today" | "week" | "month" | "year";

/* ============================================================
   Local helpers — count-up animation, formatters.
   This dashboard is ground-up rewritten in r7. NO carry-over
   from the previous layout — every section has a new shape.
   ============================================================ */

function useCountUp(target: number, durationMs = 900) {
  const [val, setVal] = useState(target);
  useEffect(() => {
    const start = val;
    const delta = target - start;
    if (Math.abs(delta) < 0.01) { setVal(target); return; }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / durationMs);
      const eased = 1 - Math.pow(1 - k, 3);
      setVal(start + delta * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return val;
}

export default function Dashboard() {
  const { user, isLoading: isAuthLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const { isPrivacyMode, togglePrivacyMode } = usePrivacyMode();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const range: Range = "month"; // r7: pills removed; snap tiles always 本月
  const [, setLocation] = useLocation();
  const searchString = useSearch();

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) window.location.href = "/api/login";
  }, [isAuthenticated, isAuthLoading]);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (params.get("action") === "add-transaction" && isAuthenticated && !isAuthLoading) {
      setIsModalOpen(true);
      startTransition(() => setLocation("/", { replace: true }));
    }
  }, [searchString, isAuthenticated, isAuthLoading, setLocation]);

  const { data: wallets = [] } = useQuery<WalletType[]>({ queryKey: ["/api/wallets"], enabled: isAuthenticated });
  const { data: categories = [] } = useQuery<Category[]>({ queryKey: ["/api/categories"], enabled: isAuthenticated });
  const { data: subLedgers = [] } = useQuery<SubLedger[]>({ queryKey: ["/api/sub-ledgers"], enabled: isAuthenticated });
  const { data: transactions = [] } = useQuery<TxRel[]>({ queryKey: ["/api/transactions", { limit: 100 }], enabled: isAuthenticated });
  const { data: reminders = [] } = useQuery<BillReminder[]>({ queryKey: ["/api/bill-reminders"], enabled: isAuthenticated });
  const { data: dashboardPrefs = {} } = useQuery<DashboardPrefs>({ queryKey: ["/api/dashboard-preferences"], enabled: isAuthenticated });
  const showTotalAssets        = dashboardPrefs.showTotalAssets        !== false;
  const showMonthlyIncome      = dashboardPrefs.showMonthlyIncome      !== false;
  const showMonthlyExpense     = dashboardPrefs.showMonthlyExpense     !== false;
  const showFlexibleFunds      = dashboardPrefs.showFlexibleFunds      !== false;
  const showSavingsGoals       = dashboardPrefs.showSavingsGoals       !== false; // r7: maps to 记账连续 SnapTile
  const showCashFlow           = dashboardPrefs.showBudgets            !== false; // r7: showBudgets repurposed for 本月现金流 chart
  const showWallets            = dashboardPrefs.showWallets            !== false; // r7: legacy 'wallet' id → 年度脉搏
  const showRecentTransactions = dashboardPrefs.showRecentTransactions !== false;

  const now = new Date();
  const { start: rangeStart, end: rangeEnd, label: rangeLabel } = useMemo(() => {
    const d = new Date();
    if (range === "today")  return { start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0), end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999), label: "今天" };
    if (range === "week")   { const day = (d.getDay() + 6) % 7; const s = new Date(d); s.setDate(d.getDate() - day); s.setHours(0,0,0,0); const e = new Date(s); e.setDate(s.getDate() + 6); e.setHours(23,59,59,999); return { start: s, end: e, label: "本周" }; }
    if (range === "year")   return { start: new Date(d.getFullYear(), 0, 1), end: new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999), label: "全年" };
    return { start: new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0), end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999), label: "本月" };
  }, [range]);

  const { data: rangeStats } = useQuery<{ totalIncome: number; totalExpense: number }>({
    queryKey: ["/api/transactions/stats", { startDate: rangeStart.toISOString(), endDate: rangeEnd.toISOString() }],
    enabled: isAuthenticated,
  });

  const fxRate = (t: TxRel): number => {
    const w = wallets.find(x => x.id === t.walletId);
    if (!w) return 1;
    const defaultCur = user?.defaultCurrency || "MYR";
    if (w.currency === defaultCur) return 1;
    const r = parseFloat(w.exchangeRateToDefault || "1");
    return isNaN(r) || r <= 0 ? 1 : r;
  };

  const totalAssets = useMemo(() =>
    wallets.reduce((s, w) => s + parseFloat(w.balance || "0") * (parseFloat(w.exchangeRateToDefault || "1") || 1), 0),
  [wallets]);

  const flexibleFunds = useMemo(() =>
    wallets.filter(w => w.isFlexible !== false)
      .reduce((s, w) => s + parseFloat(w.balance || "0") * (parseFloat(w.exchangeRateToDefault || "1") || 1), 0),
  [wallets]);
  const flexibleCount = useMemo(() => wallets.filter(w => w.isFlexible !== false).length, [wallets]);

  const totalSparkline = useMemo(() => {
    if (transactions.length === 0) return [totalAssets, totalAssets];
    const points: number[] = [];
    let running = totalAssets;
    points.unshift(running);
    const sorted = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    for (let i = 0; i < Math.min(29, sorted.length); i++) {
      const t = sorted[i];
      const amt = parseFloat(t.amount) * fxRate(t);
      if (t.type === "income") running -= amt;
      else if (t.type === "expense") running += amt;
      points.unshift(running);
    }
    return points;
  }, [transactions, totalAssets, wallets]);

  const incomeSum  = rangeStats?.totalIncome  ?? 0;
  const expenseSum = rangeStats?.totalExpense ?? 0;

  const todayStr = now.toDateString();
  const todayExpense = useMemo(() =>
    transactions
      .filter(t => t.type === "expense" && !t.loanId && new Date(t.date).toDateString() === todayStr)
      .reduce((s, t) => s + parseFloat(t.amount) * fxRate(t), 0),
  [transactions, wallets]);

  const todayIncome = useMemo(() =>
    transactions
      .filter(t => t.type === "income" && new Date(t.date).toDateString() === todayStr)
      .reduce((s, t) => s + parseFloat(t.amount) * fxRate(t), 0),
  [transactions, wallets]);

  // 30-day daily flow — income + expense per day for the trailing 30 days.
  const dailyFlow = useMemo(() => {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const buckets: { label: string; date: Date; income: number; expense: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      buckets.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, date: d, income: 0, expense: 0 });
    }
    const startMs = buckets[0].date.getTime();
    const endMs = today.getTime() + 24 * 60 * 60 * 1000 - 1;
    for (const t of transactions) {
      const tm = new Date(t.date).getTime();
      if (tm < startMs || tm > endMs) continue;
      const idx = Math.floor((tm - startMs) / (24 * 60 * 60 * 1000));
      if (idx < 0 || idx >= 30) continue;
      const amt = parseFloat(t.amount) * fxRate(t);
      if (t.type === "income") buckets[idx].income += amt;
      else if (t.type === "expense") buckets[idx].expense += amt;
    }
    return buckets;
  }, [transactions, wallets, now]);
  const dailyFlowTotals = useMemo(() => {
    let inc = 0, exp = 0;
    for (const b of dailyFlow) { inc += b.income; exp += b.expense; }
    return { income: inc, expense: exp, net: inc - exp };
  }, [dailyFlow]);

  // 12-month income + expense bars for the current calendar year.
  const yearlyFlow = useMemo(() => {
    const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
    const buckets = monthNames.map((m, i) => ({ label: m, monthIdx: i, income: 0, expense: 0 }));
    const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
    const yearEnd = new Date(now.getFullYear() + 1, 0, 1).getTime();
    for (const t of transactions) {
      const d = new Date(t.date);
      const tm = d.getTime();
      if (tm < yearStart || tm >= yearEnd) continue;
      const amt = parseFloat(t.amount) * fxRate(t);
      if (t.type === "income") buckets[d.getMonth()].income += amt;
      else if (t.type === "expense") buckets[d.getMonth()].expense += amt;
    }
    return buckets;
  }, [transactions, wallets, now]);
  const yearlyTotals = useMemo(() => {
    let inc = 0, exp = 0;
    for (const b of yearlyFlow) { inc += b.income; exp += b.expense; }
    return { income: inc, expense: exp };
  }, [yearlyFlow]);
  const currentMonthIdx = now.getMonth();

  // 12-month total assets back-walked from current via monthly net flow
  const yearlyAssets = useMemo(() => {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthNames = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
    const points: { label: string; key: string; value: number }[] = [];
    let running = totalAssets;
    for (let back = 0; back < 12; back++) {
      const m = new Date(today.getFullYear(), today.getMonth() - back, 1);
      points.unshift({
        label: `${m.getFullYear()} ${monthNames[m.getMonth()]}`,
        key: `${m.getFullYear()}-${m.getMonth()}`,
        value: running,
      });
      // subtract net flow that occurred during month `back` (the one we just recorded)
      const monthStart = new Date(today.getFullYear(), today.getMonth() - back, 1).getTime();
      const monthEnd = new Date(today.getFullYear(), today.getMonth() - back + 1, 1).getTime();
      let net = 0;
      for (const t of transactions) {
        const tm = new Date(t.date).getTime();
        if (tm < monthStart || tm >= monthEnd) continue;
        const amt = parseFloat(t.amount) * fxRate(t);
        if (t.type === "income") net += amt;
        else if (t.type === "expense") net -= amt;
      }
      running -= net;
    }
    return points;
  }, [transactions, wallets, totalAssets, now]);


  const streak = useMemo(() => {
    const days = new Set(transactions.map(t => new Date(t.date).toDateString()));
    let n = 0;
    const d = new Date();
    while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); if (n > 365) break; }
    return n;
  }, [transactions]);

  const trendPct = useMemo(() => {
    if (totalSparkline.length < 2) return 0;
    const first = totalSparkline[0];
    if (first === 0) return 0;
    return ((totalAssets - first) / first) * 100;
  }, [totalSparkline, totalAssets]);

  const cur = getCurrencyInfo(user?.defaultCurrency || "MYR");

  const upcomingBills = useMemo(() => reminders
    .filter(r => !r.isPaid)
    .map(r => ({ ...r, days: Math.ceil((new Date(r.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) }))
    .filter(r => r.days <= 7 && r.days >= 0)
    .sort((a, b) => a.days - b.days)
    .slice(0, 3),
  [reminders]);

  const walletSparkline = (walletId: number): number[] => {
    const txs = transactions
      .filter(t => t.walletId === walletId || t.toWalletId === walletId)
      .slice(0, 14)
      .reverse();
    if (txs.length < 2) return [1, 1, 1];
    let running = parseFloat(wallets.find(w => w.id === walletId)?.balance || "0");
    const pts: number[] = [running];
    for (const t of txs) {
      const amt = parseFloat(t.amount);
      if (t.type === "income" && t.walletId === walletId) running -= amt;
      else if (t.type === "expense" && t.walletId === walletId) running += amt;
      else if (t.type === "transfer") {
        if (t.walletId === walletId) running += amt;
        if (t.toWalletId === walletId) running -= parseFloat(t.toWalletAmount || t.amount);
      }
      pts.push(running);
    }
    return pts.reverse();
  };

  const deleteMut = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/transactions/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      toast({ title: "已删除" });
    },
    onError: () => toast({ title: "删除失败", variant: "destructive" }),
  });

  const fmt2 = (n: number) => isPrivacyMode ? "***" : n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtInt = (n: number) => isPrivacyMode ? "***" : Math.floor(n).toLocaleString("zh-CN");
  const fmtDec = (n: number) => isPrivacyMode ? "00" : (n % 1).toFixed(2).slice(2);

  const greeting = (() => {
    const h = now.getHours();
    if (h < 5) return "深夜了";
    if (h < 11) return "Morning";
    if (h < 14) return "Noon";
    if (h < 18) return "Afternoon";
    if (h < 22) return "Evening";
    return "Late night";
  })();

  const greetingEmoji = (() => {
    const h = now.getHours();
    if (h < 5) return "🌙";
    if (h < 11) return "☀️";
    if (h < 14) return "🍱";
    if (h < 18) return "☕";
    if (h < 22) return "🌆";
    return "✨";
  })();

  const displayName =
    user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}`
    : user?.firstName || user?.email?.split("@")[0] || "Rex";
  const initials = displayName.slice(0, 2).toUpperCase();

  const topWallets = useMemo(() =>
    [...wallets]
      .sort((a, b) => Math.abs(parseFloat(b.balance || "0")) - Math.abs(parseFloat(a.balance || "0")))
      .slice(0, 4),
  [wallets]);

  const animTotal = useCountUp(totalAssets);
  const animFlexible = useCountUp(flexibleFunds);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0612]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="r7-dash min-h-screen text-foreground relative">
      {/* DEEP BACKGROUND — radial gradients + grain (real depth, not flat) */}
      <div aria-hidden className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute -top-40 -left-32 w-[520px] h-[520px] rounded-full opacity-50 blur-3xl"
             style={{ background: "radial-gradient(circle, rgba(167,139,250,0.35) 0%, transparent 70%)" }} />
        <div className="absolute top-1/3 -right-32 w-[420px] h-[420px] rounded-full opacity-40 blur-3xl"
             style={{ background: "radial-gradient(circle, rgba(245,158,11,0.25) 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 left-1/3 w-[380px] h-[380px] rounded-full opacity-30 blur-3xl"
             style={{ background: "radial-gradient(circle, rgba(236,72,153,0.25) 0%, transparent 70%)" }} />
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-5 md:py-8 pb-28 md:pb-12 relative">

        {/* ========== HEADER ROW ========== */}
        <header className="flex items-center justify-between mb-6 md:mb-8">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-11 h-11 md:w-12 md:h-12 rounded-2xl bg-gradient-to-br from-[#a78bfa] via-[#8b5cf6] to-[#7c3aed] flex items-center justify-center text-white font-bold text-[15px] shadow-[0_8px_24px_-8px_rgba(124,58,237,0.6)]">
                {user.profileImageUrl ? (
                  <img src={user.profileImageUrl} alt={displayName} className="w-full h-full object-cover rounded-2xl" />
                ) : initials}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0a0612]" />
            </div>
            <div>
              <p className="text-[11px] tracking-[0.2em] uppercase text-foreground/45 m-0 leading-tight">
                {greeting} {greetingEmoji}
              </p>
              <p className="text-[15px] md:text-[16px] font-semibold m-0 mt-0.5 leading-tight">{displayName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setLocation("/transactions")}
              className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.10] hover:bg-white/[0.10] flex items-center justify-center text-foreground/70 hover:text-foreground transition-all"
              aria-label="搜索"
            >
              <Search className="w-[18px] h-[18px]" />
            </button>
            <button
              onClick={() => setIsCustomizeOpen(true)}
              className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.10] hover:bg-white/[0.10] flex items-center justify-center text-foreground/70 hover:text-foreground transition-all"
              aria-label="自定义"
            >
              <SlidersHorizontal className="w-[18px] h-[18px]" />
            </button>
            <button
              onClick={() => setLocation("/planning?tab=reminders")}
              className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.10] hover:bg-white/[0.10] flex items-center justify-center text-foreground/70 hover:text-foreground transition-all relative"
              aria-label="提醒"
            >
              <Bell className="w-[18px] h-[18px]" />
              {upcomingBills.length > 0 && (
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#fbbf24] shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
              )}
            </button>
          </div>
        </header>

        {/* ========== HERO: 5/7 SPLIT — left big balance, right snapshot stack ========== */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 mb-5 lg:mb-6">

          {/* HERO BALANCE — left 7 cols (preference: 总资产 toggle) */}
          {showTotalAssets && (
          <div className="lg:col-span-8 relative overflow-hidden rounded-[28px] p-6 md:p-7"
               style={{
                 background: "linear-gradient(135deg, rgba(124,58,237,0.25) 0%, rgba(99,102,241,0.18) 35%, rgba(217,70,239,0.18) 100%), rgba(20,12,32,0.85)",
                 border: "1px solid rgba(255,255,255,0.08)",
                 boxShadow: "0 30px 80px -30px rgba(124,58,237,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
                 backdropFilter: "blur(20px)",
               }}>
            {/* decorative orbs */}
            <div aria-hidden className="absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-40 blur-3xl"
                 style={{ background: "radial-gradient(circle, rgba(245,158,11,0.4) 0%, transparent 70%)" }} />
            <div aria-hidden className="absolute -bottom-20 -left-10 w-64 h-64 rounded-full opacity-30 blur-3xl"
                 style={{ background: "radial-gradient(circle, rgba(167,139,250,0.5) 0%, transparent 70%)" }} />

            <div className="relative grid grid-cols-1 md:grid-cols-12 gap-5 md:gap-6 min-h-[230px]">
              {/* LEFT — balance text, fills full height */}
              <div className="md:col-span-7 min-w-0 flex flex-col justify-between gap-4">
                <div className="flex items-center justify-between md:justify-start gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/[0.10] text-[11px] tracking-wider uppercase text-foreground/60">
                    <Sparkles className="w-3 h-3 text-[#fbbf24]" />
                    Total balance
                  </span>
                  <button
                    onClick={togglePrivacyMode}
                    className="md:hidden text-foreground/45 hover:text-foreground/80 transition-colors p-1.5 rounded-full hover:bg-white/[0.06]"
                    aria-label="隐私"
                  >
                    {isPrivacyMode ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                  </button>
                </div>

                <div className="flex items-baseline gap-1 leading-none">
                  <span className="text-[18px] md:text-[22px] font-semibold text-foreground/70 mr-1">{cur.symbol}</span>
                  <span className="text-[44px] md:text-[54px] lg:text-[64px] font-bold tracking-tight break-all"
                        style={{
                          background: "linear-gradient(135deg, #ffffff 0%, #e0e7ff 40%, #c7d2fe 100%)",
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                          letterSpacing: "-0.04em",
                        }}>
                    {fmtInt(animTotal)}
                  </span>
                  {!isPrivacyMode && (
                    <span className="text-[20px] md:text-[24px] lg:text-[28px] font-semibold text-foreground/40">.{fmtDec(animTotal)}</span>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    trendPct >= 0
                      ? "bg-emerald-400/15 text-emerald-300 border border-emerald-400/20"
                      : "bg-rose-400/15 text-rose-300 border border-rose-400/20"
                  }`}>
                    {trendPct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {trendPct >= 0 ? "+" : ""}{trendPct.toFixed(2)}%
                  </span>
                  <span className="text-[12px] text-foreground/45">last 30 days</span>
                  <span className="text-[12px] text-foreground/45 ml-auto hidden md:inline">{wallets.length} 个账户</span>
                  <button
                    onClick={togglePrivacyMode}
                    className="hidden md:inline-flex text-foreground/45 hover:text-foreground/80 transition-colors p-1.5 rounded-full hover:bg-white/[0.06]"
                    aria-label="隐私"
                  >
                    {isPrivacyMode ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                  </button>
                </div>
              </div>

              {/* RIGHT — top: 12-month total assets sparkline (axis-less) ; bottom: 4 horizontal action buttons */}
              <div className="md:col-span-5 flex flex-col gap-3 min-h-0">
                <div className="flex-1 min-h-[100px] -mx-1">
                  <LazyRecharts>
                    {(R) => (
                      <R.ResponsiveContainer width="100%" height="100%">
                        <R.AreaChart data={yearlyAssets} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
                          <defs>
                            <linearGradient id="heroAssetsGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.55} />
                              <stop offset="60%" stopColor="#fbbf24" stopOpacity={0.16} />
                              <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
                            </linearGradient>
                            <filter id="heroAssetsGlow" x="-10%" y="-30%" width="120%" height="160%">
                              <feGaussianBlur stdDeviation="2.5" result="blur" />
                              <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                              </feMerge>
                            </filter>
                          </defs>
                          <R.XAxis dataKey="label" hide />
                          <R.YAxis hide domain={["dataMin - 100", "dataMax + 100"]} />
                          <R.Tooltip
                            cursor={{ stroke: "rgba(251,191,36,0.4)", strokeDasharray: "3 4" }}
                            itemStyle={{ color: "rgba(255,255,255,0.92)" }}
                            labelStyle={{ color: "rgba(255,255,255,0.55)", fontSize: "10.5px", marginBottom: "4px", letterSpacing: "0.08em", textTransform: "uppercase" }}
                            contentStyle={{ backgroundColor: "rgba(26,20,36,0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", backdropFilter: "blur(12px)", padding: "8px 10px" }}
                            formatter={(v: number) => [`${cur.symbol}${fmt2(v)}`, "总资产"]}
                          />
                          <R.Area type="monotone" dataKey="value" stroke="#fbbf24" strokeWidth={2.5}
                                  fill="url(#heroAssetsGrad)"
                                  dot={false}
                                  activeDot={{ r: 5, fill: "#fbbf24", stroke: "#0a0612", strokeWidth: 2 }}
                                  style={{ filter: "url(#heroAssetsGlow)" }} />
                        </R.AreaChart>
                      </R.ResponsiveContainer>
                    )}
                  </LazyRecharts>
                </div>

                <div className="grid grid-cols-4 gap-2 md:gap-2.5">
                  <ActionButton
                    icon={<Plus className="w-5 h-5" />}
                    label="记一笔"
                    primary
                    onClick={() => { setEditingTx(null); setIsModalOpen(true); }}
                  />
                  <ActionButton
                    icon={<ArrowLeftRight className="w-5 h-5" />}
                    label="转账"
                    onClick={() => setLocation("/exchange")}
                  />
                  <ActionButton
                    icon={<PiggyBank className="w-5 h-5" />}
                    label="储蓄"
                    onClick={() => setLocation("/planning?tab=savings")}
                  />
                  <ActionButton
                    icon={<Activity className="w-5 h-5" />}
                    label="分析"
                    onClick={() => setLocation("/insights?tab=analytics")}
                  />
                </div>
              </div>
            </div>
          </div>
          )}

          {/* RIGHT 5 COLS — stacked snapshot tiles (preference-driven) */}
          <div className="lg:col-span-4 grid grid-cols-2 gap-3">
            {showMonthlyIncome && (
              <SnapTile
                tone="income"
                label="今日收入"
                valueText={`+${fmt2(todayIncome)}`}
                sub={`${rangeLabel} ${cur.symbol}${fmt2(incomeSum)}`}
                icon={<ArrowDownLeft className="w-4 h-4" />}
              />
            )}
            {showMonthlyExpense && (
              <SnapTile
                tone="expense"
                label="今日支出"
                valueText={`−${fmt2(todayExpense)}`}
                sub={`${rangeLabel} ${cur.symbol}${fmt2(expenseSum)}`}
                icon={<ArrowUpRight className="w-4 h-4" />}
              />
            )}
            {showFlexibleFunds && (
              <SnapTile
                tone="flex"
                label="可灵活调用"
                valueText={fmt2(animFlexible)}
                sub={`${flexibleCount} 个钱包`}
                icon={<Coins className="w-4 h-4" />}
              />
            )}
            {showSavingsGoals && (
              <SnapTile
                tone="streak"
                label="记账连续"
                valueText={`${streak} 天`}
                sub={streak >= 7 ? "保持住 🔥" : streak >= 3 ? "继续加油" : "今天记一笔"}
                icon={<Flame className="w-4 h-4" />}
              />
            )}
          </div>
        </section>

        {/* ========== CASH FLOW + YEARLY PULSE ========== */}
        {(showCashFlow || showWallets) && (
        <>
        <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
          <div>
            <p className="text-[10.5px] tracking-[0.2em] uppercase text-foreground/45 m-0">Cash flow · 30 days</p>
            <h2 className="text-[18px] md:text-[20px] font-bold tracking-tight m-0 mt-0.5 flex items-center gap-2">
              <span>本月现金流</span>
              <span className={`text-[14px] font-semibold ${dailyFlowTotals.net >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                {dailyFlowTotals.net >= 0 ? "+" : "−"}{cur.symbol}{fmt2(Math.abs(dailyFlowTotals.net))}
              </span>
            </h2>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /><span className="text-foreground/65">收入 {cur.symbol}{fmt2(dailyFlowTotals.income)}</span></span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-400" /><span className="text-foreground/65">支出 {cur.symbol}{fmt2(dailyFlowTotals.expense)}</span></span>
            <Link href="/insights?tab=analytics" className="text-foreground/55 hover:text-foreground transition-colors">深入分析 →</Link>
          </div>
        </div>

        <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 mb-5 lg:mb-6 items-stretch">

          {/* CASH FLOW — left 8 cols, no card chrome, smooth dual area */}
          {showCashFlow && (
          <div className="lg:col-span-8 flex flex-col">
            <div className="flex-1 min-h-[260px] -mx-2">
              <LazyRecharts>
                {(R) => (
                  <R.ResponsiveContainer width="100%" height="100%">
                    <R.AreaChart data={dailyFlow} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="dashIncomeGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#34d399" stopOpacity={0.55} />
                          <stop offset="50%" stopColor="#34d399" stopOpacity={0.18} />
                          <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="dashExpenseGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f87171" stopOpacity={0.55} />
                          <stop offset="50%" stopColor="#f87171" stopOpacity={0.18} />
                          <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
                        </linearGradient>
                        <filter id="dashIncomeGlow" x="-20%" y="-20%" width="140%" height="140%">
                          <feGaussianBlur stdDeviation="2.5" result="blur" />
                          <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                        <filter id="dashExpenseGlow" x="-20%" y="-20%" width="140%" height="140%">
                          <feGaussianBlur stdDeviation="2.5" result="blur" />
                          <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                      </defs>
                      <R.CartesianGrid strokeDasharray="2 6" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <R.XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10.5 }} axisLine={false} tickLine={false}
                               interval={4} />
                      <R.YAxis tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10.5 }} axisLine={false} tickLine={false}
                               tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)} width={50} />
                      <R.Tooltip itemStyle={{ color: "rgba(255,255,255,0.92)" }} contentStyle={{ backgroundColor: "rgba(26,20,36,0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px", backdropFilter: "blur(12px)", padding: "10px 12px" }}
                                 labelStyle={{ color: "rgba(255,255,255,0.7)", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}
                                 formatter={(v: number, name: string) => {
                                   const label = name === "income" ? "收入" : "支出";
                                   return [`${cur.symbol}${fmt2(v)}`, label];
                                 }} />
                      <R.Area type="monotone" dataKey="income" stroke="#34d399" strokeWidth={2.5} fill="url(#dashIncomeGrad)"
                              dot={false} activeDot={{ r: 5, fill: "#34d399", stroke: "#0a0612", strokeWidth: 2 }}
                              style={{ filter: "url(#dashIncomeGlow)" }} />
                      <R.Area type="monotone" dataKey="expense" stroke="#f87171" strokeWidth={2.5} fill="url(#dashExpenseGrad)"
                              dot={false} activeDot={{ r: 5, fill: "#f87171", stroke: "#0a0612", strokeWidth: 2 }}
                              style={{ filter: "url(#dashExpenseGlow)" }} />
                    </R.AreaChart>
                  </R.ResponsiveContainer>
                )}
              </LazyRecharts>
            </div>
          </div>
          )}

          {/* YEARLY PULSE — controlled by 年度脉搏 toggle */}
          {showWallets && (
          <div className="lg:col-span-4 rounded-3xl p-5 bg-white/[0.025] border border-white/[0.06] flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[12px] tracking-[0.18em] uppercase text-foreground/45 m-0">Yearly pulse</p>
              <Activity className="w-3.5 h-3.5 text-foreground/40" />
            </div>
            <p className="text-[22px] font-bold m-0 tabular-nums">{now.getFullYear()} 年</p>
            <div className="flex items-center gap-3 text-[10.5px] mb-3 mt-0.5">
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-foreground/65">{cur.symbol}{fmt2(yearlyTotals.income)}</span></span>
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400" /><span className="text-foreground/65">{cur.symbol}{fmt2(yearlyTotals.expense)}</span></span>
            </div>
            <div className="flex-1 min-h-[180px] -mx-1.5">
              <LazyRecharts>
                {(R) => (
                  <R.ResponsiveContainer width="100%" height="100%">
                    <R.BarChart data={yearlyFlow} margin={{ top: 4, right: 4, left: -28, bottom: 0 }} barCategoryGap="22%">
                      <R.CartesianGrid strokeDasharray="2 6" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <R.XAxis dataKey="monthIdx" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9.5 }}
                               axisLine={false} tickLine={false}
                               tickFormatter={(v: number) => `${v + 1}`} />
                      <R.YAxis tick={false} axisLine={false} tickLine={false} width={0} />
                      <R.Tooltip labelStyle={{ color: "rgba(255,255,255,0.55)", fontSize: "11px", marginBottom: "4px" }} itemStyle={{ color: "rgba(255,255,255,0.92)" }} contentStyle={{ backgroundColor: "rgba(26,20,36,0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", backdropFilter: "blur(12px)", padding: "8px 10px" }}
                                 labelFormatter={(idx: number) => `${idx + 1} 月`}
                                 formatter={(v: number, name: string) => [`${cur.symbol}${fmt2(v)}`, name === "income" ? "收入" : "支出"]} />
                      <R.Bar dataKey="income" radius={[4, 4, 0, 0]} maxBarSize={14}>
                        {yearlyFlow.map((_, i) => (
                          <R.Cell key={`inc-${i}`} fill={i === currentMonthIdx ? "#a7f3d0" : "#34d399"} />
                        ))}
                      </R.Bar>
                      <R.Bar dataKey="expense" radius={[4, 4, 0, 0]} maxBarSize={14}>
                        {yearlyFlow.map((_, i) => (
                          <R.Cell key={`exp-${i}`} fill={i === currentMonthIdx ? "#fecaca" : "#f87171"} />
                        ))}
                      </R.Bar>
                    </R.BarChart>
                  </R.ResponsiveContainer>
                )}
              </LazyRecharts>
            </div>
          </div>
          )}
        </section>
        </>
        )}

        {/* ========== UPCOMING BILLS (only if any) ========== */}
        {upcomingBills.length > 0 && (
          <section className="mb-5 lg:mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[18px] md:text-[20px] font-bold tracking-tight flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#fbbf24]" />即将到期
              </h2>
              <Link href="/planning?tab=reminders" className="text-[12px] text-foreground/55 hover:text-foreground transition-colors">全部 →</Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {upcomingBills.map(b => {
                const urgent = b.days <= 1;
                return (
                  <div key={b.id} className="rounded-2xl p-4 bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.18] transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        urgent
                          ? "bg-rose-400/15 text-rose-300 border border-rose-400/25"
                          : "bg-amber-400/15 text-amber-300 border border-amber-400/25"
                      }`}>
                        {b.days === 0 ? "今天到期" : `${b.days} 天后`}
                      </span>
                      <p className="font-bold text-[15px] tabular-nums m-0">{cur.symbol}{parseFloat(b.amount || "0").toFixed(2)}</p>
                    </div>
                    <p className="text-[13.5px] font-medium m-0 truncate">{b.name}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ========== ACTIVITY — controlled by 最近交易 toggle ========== */}
        {showRecentTransactions && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[18px] md:text-[20px] font-bold tracking-tight">最近活动</h2>
            <Link href="/transactions" className="text-[12px] text-foreground/55 hover:text-foreground transition-colors">全部交易 →</Link>
          </div>

          {transactions.length === 0 ? (
            <div className="rounded-3xl p-10 text-center bg-white/[0.025] border border-dashed border-white/[0.10]">
              <Sparkles className="w-7 h-7 mx-auto text-foreground/35 mb-2" />
              <p className="text-[13px] font-medium m-0">还没有交易记录</p>
              <p className="text-[12px] text-foreground/50 m-0 mt-1">点上面的「记一笔」开始</p>
            </div>
          ) : (
            <div className="rounded-3xl bg-white/[0.025] border border-white/[0.06] overflow-hidden">
              {transactions.slice(0, 10).map((t, i) => {
                const [from, to] = pickBrand(t.wallet?.currency, t.wallet?.type);
                const isExpense = t.type === "expense";
                const isIncome = t.type === "income";
                const isFirst = i === 0;
                return (
                  <button
                    key={t.id}
                    onClick={() => { setEditingTx(t); setIsModalOpen(true); }}
                    className={`w-full flex items-center gap-3 md:gap-4 px-4 md:px-5 py-3.5 text-left transition-all hover:bg-white/[0.04] ${
                      i < 9 ? "border-b border-white/[0.04]" : ""
                    } ${isFirst ? "bg-gradient-to-r from-primary/[0.05] to-transparent" : ""}`}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-[10.5px] font-bold shrink-0"
                         style={{ background: `linear-gradient(135deg, ${from}, ${to})`, boxShadow: `0 6px 16px -8px ${from}` }}>
                      {(t.wallet?.currency || "RM").slice(0, 3)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-semibold m-0 truncate">
                        {t.description || t.category?.name || (isExpense ? "支出" : isIncome ? "收入" : "转账")}
                        {isFirst && (
                          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-400/15 border border-emerald-400/25 text-emerald-300 text-[9px] font-bold uppercase">
                            <Star className="w-2.5 h-2.5 mr-0.5" />NEW
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-foreground/50 m-0 mt-0.5 truncate">
                        {t.wallet?.name || "未知"} · {new Date(t.date).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-[15px] font-bold m-0 tabular-nums ${
                        isExpense ? "text-rose-400" : isIncome ? "text-emerald-400" : "text-foreground"
                      }`}>
                        {isExpense ? "−" : isIncome ? "+" : ""}{parseFloat(t.amount).toFixed(2)}
                      </p>
                      <p className="text-[10px] text-foreground/45 m-0">{t.wallet?.currency || "MYR"}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
        )}
      </div>

      <FloatingActionButton onClick={() => { setEditingTx(null); setIsModalOpen(true); }} />

      <TransactionModal
        open={isModalOpen}
        onOpenChange={(open) => { setIsModalOpen(open); if (!open) setEditingTx(null); }}
        wallets={wallets}
        categories={categories}
        subLedgers={subLedgers}
        defaultCurrency={user?.defaultCurrency || "MYR"}
        transaction={editingTx}
        onDelete={(t) => deleteMut.mutate(t.id)}
      />
      <DashboardCustomizeModal open={isCustomizeOpen} onOpenChange={setIsCustomizeOpen} />
    </div>
  );
}

/* ---------- local sub-components ---------- */

function ActionButton({ icon, label, onClick, primary = false }: {
  icon: React.ReactNode; label: string; onClick: () => void; primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex flex-col items-center justify-center gap-1.5 py-2 transition-colors ${
        primary ? "text-[#c4b5fd] hover:text-white" : "text-foreground/65 hover:text-foreground"
      }`}
    >
      {icon}
      <span className="text-[11px] font-semibold tracking-wide">{label}</span>
    </button>
  );
}

function SnapTile({ tone, label, valueText, sub, icon }: {
  tone: "income" | "expense" | "flex" | "streak";
  label: string; valueText: string; sub: string; icon: React.ReactNode;
}) {
  const toneStyles = {
    income:  { iconBg: "bg-emerald-400/15 text-emerald-300 border-emerald-400/20", valueClr: "text-emerald-400" },
    expense: { iconBg: "bg-rose-400/15 text-rose-300 border-rose-400/20", valueClr: "text-rose-400" },
    flex:    { iconBg: "bg-violet-400/15 text-violet-300 border-violet-400/20", valueClr: "text-foreground" },
    streak:  { iconBg: "bg-amber-400/15 text-amber-300 border-amber-400/20", valueClr: "text-amber-300" },
  }[tone];
  return (
    <div className="h-full min-h-[110px] rounded-2xl p-4 bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.14] transition-all flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10.5px] tracking-[0.18em] uppercase text-foreground/50 m-0">{label}</p>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center border ${toneStyles.iconBg}`}>
          {icon}
        </div>
      </div>
      <p className={`text-[20px] md:text-[22px] font-bold m-0 leading-none tabular-nums ${toneStyles.valueClr} mt-auto`}>{valueText}</p>
      <p className="text-[10.5px] text-foreground/50 m-0 mt-1.5 truncate">{sub}</p>
    </div>
  );
}
