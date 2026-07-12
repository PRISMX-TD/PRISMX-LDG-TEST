import { useState, useMemo, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PillTabs } from "@/components/ds/PillTabs";
import {
  BarChart3, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Loader2,
  Wallet, PieChart as PieChartIcon, Calendar, Settings2, Target, Percent,
  Activity, GripVertical, ChevronUp, ChevronDown, Coins, ArrowUp, ArrowDown,
  CreditCard, BookOpen, ArrowLeft, Sparkles, Brain,
} from "lucide-react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor,
  useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getCurrencyInfo } from "@shared/schema";
import { LazyRecharts } from "@/components/LazyRecharts";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Transaction, Category, Wallet as WalletType, Budget, SavingsGoal, SubLedger } from "@shared/schema";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

/* r7 — Analytics rewritten from scratch.
   - Full warm web3 shell, no PageContainer, no glass-card token
   - Hero KPI quartet with gradient tone tiles + animated count
   - Period selector as glass capsule with chevron prev/next
   - Data view tabs as inherit-from-r7 PillTabs
   - Each chart card wrapped in new SectionCard (no glass-card)
   - AI insights uses new card chrome
   All data hooks and calculations preserved verbatim. */

const CHART_COLORS = [
  "#a78bfa", "#c084fc", "#e879f9", "#f0abfc",
  "#34d399", "#6ee7b7", "#a7f3d0", "#fbbf24",
];

interface AnalyticsPreferences {
  showYearlyStats: boolean;
  showMonthlyTrend: boolean;
  showExpenseDistribution: boolean;
  showIncomeDistribution: boolean;
  showBudgetProgress: boolean;
  showSavingsProgress: boolean;
  showWalletDistribution: boolean;
  showCashflowTrend: boolean;
  showTopCategories: boolean;
  showMonthlyComparison: boolean;
  showFullAmount: boolean;
  cardOrder: string[] | null;
}

const defaultPreferences: AnalyticsPreferences = {
  showYearlyStats: true, showMonthlyTrend: true, showExpenseDistribution: true,
  showIncomeDistribution: true, showBudgetProgress: true, showSavingsProgress: true,
  showWalletDistribution: true, showCashflowTrend: true, showTopCategories: true,
  showMonthlyComparison: true, showFullAmount: false, cardOrder: null,
};

interface SettingsItem {
  key: keyof AnalyticsPreferences;
  label: string;
  description: string;
}

const defaultSettingsItems: SettingsItem[] = [
  { key: "showYearlyStats", label: "年度统计", description: "显示年度收入、支出和结余统计" },
  { key: "showMonthlyTrend", label: "月度收支趋势", description: "显示每月收支趋势图表" },
  { key: "showExpenseDistribution", label: "支出分布", description: "显示支出分类饼图" },
  { key: "showIncomeDistribution", label: "收入分布", description: "显示收入分类饼图" },
  { key: "showBudgetProgress", label: "预算执行情况", description: "显示预算使用进度" },
  { key: "showSavingsProgress", label: "储蓄目标进度", description: "显示储蓄目标完成情况" },
  { key: "showWalletDistribution", label: "账户分布", description: "显示各钱包余额分布" },
  { key: "showCashflowTrend", label: "累计现金流", description: "显示累计储蓄趋势" },
];

/* ---------- shared visual building blocks ---------- */
function SectionCard({ title, icon, accent = "violet", children, action }: {
  title: string;
  icon: React.ReactNode;
  accent?: "violet" | "rose" | "emerald" | "amber" | "blue";
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const accentColor = {
    violet: "text-[#a78bfa]",
    rose: "text-rose-400",
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    blue: "text-blue-400",
  }[accent];
  return (
    <div className="rounded-3xl p-5 bg-white/[0.025] border border-white/[0.06] hover:border-white/[0.10] transition-colors">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-[13.5px] font-bold tracking-tight m-0 flex items-center gap-2">
          <span className={accentColor}>{icon}</span>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function KpiTile({ tone, label, icon, valueText, badge }: {
  tone: "emerald" | "rose" | "violet" | "blue";
  label: string; icon: React.ReactNode; valueText: string; badge?: React.ReactNode;
}) {
  const t = {
    emerald: { grad: "from-emerald-400/18 to-emerald-600/8", border: "border-emerald-400/20", clr: "text-emerald-300", glow: "rgba(52,211,153,0.4)" },
    rose:    { grad: "from-rose-400/18 to-rose-600/8",       border: "border-rose-400/20",    clr: "text-rose-300",    glow: "rgba(244,114,128,0.4)" },
    violet:  { grad: "from-violet-400/18 to-violet-600/8",   border: "border-violet-400/20",  clr: "text-violet-300",  glow: "rgba(167,139,250,0.4)" },
    blue:    { grad: "from-blue-400/18 to-blue-600/8",       border: "border-blue-400/20",    clr: "text-blue-300",    glow: "rgba(96,165,250,0.4)" },
  }[tone];
  return (
    <div className={`relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br ${t.grad} border ${t.border}`}>
      <div aria-hidden className="absolute -top-10 -right-10 w-28 h-28 rounded-full blur-3xl opacity-50"
           style={{ background: `radial-gradient(circle, ${t.glow} 0%, transparent 70%)` }} />
      <div className="relative">
        <div className="flex items-center justify-between mb-2.5">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${t.clr} bg-white/[0.04] border ${t.border}`}>
            {icon}
          </div>
          {badge}
        </div>
        <p className="text-[10px] tracking-[0.18em] uppercase text-foreground/55 m-0 mb-1">{label}</p>
        <p className={`text-[16px] md:text-[19px] font-bold m-0 tabular-nums truncate ${t.clr}`}>{valueText}</p>
      </div>
    </div>
  );
}

/* ---------- sortable settings row (rewritten for r7 chrome) ---------- */
function SortableSettingsItem({ item, isChecked, onToggle, onMove, index, total, isPending }: {
  item: SettingsItem;
  isChecked: boolean;
  onToggle: (key: keyof AnalyticsPreferences) => void;
  onMove: (key: string, direction: "up" | "down") => void;
  index: number;
  total: number;
  isPending: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.key });
  const style = {
    transform: CSS.Transform.toString(transform), transition,
    opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 1000 : undefined,
    touchAction: "none" as const,
  };
  return (
    <div ref={setNodeRef} style={style}
         className={`flex items-center gap-2 p-3 rounded-xl bg-white/[0.03] border transition-all ${
           isDragging ? "border-[#a78bfa] shadow-[0_8px_20px_-6px_rgba(124,58,237,0.4)]" : "border-white/[0.06] hover:border-white/[0.14]"
         }`} data-testid={`card-item-${item.key}`}>
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none p-1 -m-1">
        <GripVertical className="w-3.5 h-3.5 text-foreground/40 shrink-0" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-semibold m-0 truncate">{item.label}</p>
        <p className="text-[10.5px] text-foreground/50 truncate m-0 mt-0.5">{item.description}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <div className="flex flex-col gap-0.5">
          <button onClick={() => onMove(item.key, "up")} disabled={index === 0 || isPending}
                  aria-label="上移" data-testid={`button-move-up-${item.key}`}
                  className="w-5 h-5 rounded-md hover:bg-white/[0.08] flex items-center justify-center text-foreground/55 disabled:opacity-30 transition-colors">
            <ChevronUp className="w-3 h-3" />
          </button>
          <button onClick={() => onMove(item.key, "down")} disabled={index === total - 1 || isPending}
                  aria-label="下移" data-testid={`button-move-down-${item.key}`}
                  className="w-5 h-5 rounded-md hover:bg-white/[0.08] flex items-center justify-center text-foreground/55 disabled:opacity-30 transition-colors">
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>
        <Switch checked={isChecked} onCheckedChange={() => onToggle(item.key)}
                disabled={isPending} data-testid={`switch-${item.key}`} />
      </div>
    </div>
  );
}

export default function Analytics() {
  const { user } = useAuth();
  const currencyInfo = getCurrencyInfo(user?.defaultCurrency || "MYR");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [timePeriod, setTimePeriod] = useState<"year" | "month">("year");
  const [dataView, setDataView] = useState<"overview" | "income" | "expense" | "savings" | "ai">("overview");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedSubLedgerId, setSelectedSubLedgerId] = useState<string>("all");

  useEffect(() => {
    if (isDragging) { document.body.style.overflow = "hidden"; document.body.style.touchAction = "none"; }
    else { document.body.style.overflow = ""; document.body.style.touchAction = ""; }
    return () => { document.body.style.overflow = ""; document.body.style.touchAction = ""; };
  }, [isDragging]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { data: preferences = defaultPreferences } = useQuery<AnalyticsPreferences>({ queryKey: ["/api/analytics-preferences"] });

  const updatePreferencesMutation = useMutation({
    mutationFn: (data: Partial<AnalyticsPreferences>) => apiRequest("PATCH", "/api/analytics-preferences", data),
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ["/api/analytics-preferences"] });
      const previousPrefs = queryClient.getQueryData<AnalyticsPreferences>(["/api/analytics-preferences"]);
      queryClient.setQueryData<AnalyticsPreferences>(["/api/analytics-preferences"], (old) => ({ ...(old ?? defaultPreferences), ...updates }));
      return { previousPrefs };
    },
    onError: (_e, _u, context) => { if (context?.previousPrefs) queryClient.setQueryData(["/api/analytics-preferences"], context.previousPrefs); },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/analytics-preferences"] }),
  });

  const orderedItems = useMemo(() => {
    const order = preferences.cardOrder;
    if (!order || order.length === 0) return defaultSettingsItems;
    const out: SettingsItem[] = [];
    const map = new Map(defaultSettingsItems.map(it => [it.key, it]));
    order.forEach(k => { const it = map.get(k as keyof AnalyticsPreferences); if (it) { out.push(it); map.delete(k as keyof AnalyticsPreferences); } });
    map.forEach(it => out.push(it));
    return out;
  }, [preferences.cardOrder]);

  const handleDragStart = () => setIsDragging(true);
  const handleDragEnd = (event: DragEndEvent) => {
    setIsDragging(false);
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const order = orderedItems.map(it => it.key as string);
      const oldIdx = order.indexOf(String(active.id));
      const newIdx = order.indexOf(String(over.id));
      if (oldIdx !== -1 && newIdx !== -1) updatePreferencesMutation.mutate({ cardOrder: arrayMove(order, oldIdx, newIdx) });
    }
  };
  const moveItem = (key: string, direction: "up" | "down") => {
    const order = orderedItems.map(it => it.key as string);
    const i = order.indexOf(key);
    if (i === -1) return;
    if (direction === "up" && i === 0) return;
    if (direction === "down" && i === order.length - 1) return;
    updatePreferencesMutation.mutate({ cardOrder: arrayMove(order, i, direction === "up" ? i - 1 : i + 1) });
  };

  const { data: transactions = [], isLoading: isTransactionsLoading } = useQuery<Transaction[]>({ queryKey: ["/api/transactions"] });
  const { data: categories = [] } = useQuery<Category[]>({ queryKey: ["/api/categories"] });
  const { data: wallets = [] } = useQuery<WalletType[]>({ queryKey: ["/api/wallets"] });
  const { data: budgets = [] } = useQuery<Budget[]>({ queryKey: ["/api/budgets"] });
  const { data: savingsGoals = [] } = useQuery<SavingsGoal[]>({ queryKey: ["/api/savings-goals"] });
  const { data: subLedgers = [] } = useQuery<SubLedger[]>({ queryKey: ["/api/sub-ledgers"] });
  const { data: budgetSpending = [] } = useQuery<any[]>({ queryKey: ["/api/budgets/spending", { month: new Date().getMonth() + 1, year: selectedYear }] });

  const getConverted = (t: Transaction): number => {
    const raw = parseFloat(t.amount);
    const defaultCur = user?.defaultCurrency || "MYR";
    // Prefer the wallet joined onto the transaction so conversion still works for
    // transactions on ARCHIVED wallets (which are excluded from the /api/wallets list,
    // so wallets.find would miss them and silently skip conversion).
    const w = (t as any).wallet || wallets.find(x => x.id === t.walletId);
    if (w && w.currency !== defaultCur) {
      const r = parseFloat(w.exchangeRateToDefault || "1");
      return raw * (isNaN(r) || r <= 0 ? 1 : r);
    }
    return raw;
  };

  // Convert a wallet's own balance to the user's default currency for cross-wallet totals
  // and distribution charts (otherwise a USD balance is summed as if it were MYR).
  const walletRate = (w: WalletType): number => {
    const defaultCur = user?.defaultCurrency || "MYR";
    if (w.currency === defaultCur) return 1;
    const r = parseFloat(w.exchangeRateToDefault || "1");
    return isNaN(r) || r <= 0 ? 1 : r;
  };

  const filteredTransactions = useMemo(() => {
    if (selectedSubLedgerId === "all") return transactions;
    if (selectedSubLedgerId === "main") {
      return transactions.filter(t => {
        if (!t.subLedgerId) return true;
        const sl = subLedgers.find(s => s.id === t.subLedgerId);
        return !(sl && sl.includeInMainAnalytics === false);
      });
    }
    return transactions.filter(t => String(t.subLedgerId) === selectedSubLedgerId);
  }, [transactions, selectedSubLedgerId, subLedgers]);

  const monthlyData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: format(new Date(selectedYear, i, 1), "M月"),
      shortMonth: format(new Date(selectedYear, i, 1), "M"),
      income: 0, expense: 0, savings: 0,
    }));
    filteredTransactions.forEach(t => {
      const d = new Date(t.date);
      if (d.getFullYear() !== selectedYear) return;
      const amount = getConverted(t);
      if (t.type === "income") months[d.getMonth()].income += amount;
      else if (t.type === "expense") months[d.getMonth()].expense += amount;
    });
    months.forEach(m => { m.savings = m.income - m.expense; });
    return months;
  }, [filteredTransactions, selectedYear, wallets, user]);

  const expenseCategoryData = useMemo(() => {
    const totals: Record<number, { name: string; color: string; total: number }> = {};
    const targetMonth = selectedMonth !== null ? selectedMonth : new Date().getMonth();
    filteredTransactions.forEach(t => {
      if (t.type !== "expense") return;
      const d = new Date(t.date);
      if (d.getFullYear() !== selectedYear) return;
      if (timePeriod === "month" && d.getMonth() !== targetMonth) return;
      const cid = t.categoryId || 0;
      if (!totals[cid]) {
        const c = categories.find(x => x.id === cid);
        totals[cid] = { name: c?.name || "其他", color: c?.color || CHART_COLORS[Object.keys(totals).length % CHART_COLORS.length], total: 0 };
      }
      totals[cid].total += getConverted(t);
    });
    return Object.values(totals).sort((a, b) => b.total - a.total).slice(0, 6);
  }, [filteredTransactions, categories, selectedYear, timePeriod, selectedMonth, wallets, user]);

  const incomeCategoryData = useMemo(() => {
    const totals: Record<number, { name: string; color: string; total: number }> = {};
    const targetMonth = selectedMonth !== null ? selectedMonth : new Date().getMonth();
    filteredTransactions.forEach(t => {
      if (t.type !== "income") return;
      const d = new Date(t.date);
      if (d.getFullYear() !== selectedYear) return;
      if (timePeriod === "month" && d.getMonth() !== targetMonth) return;
      const cid = t.categoryId || 0;
      if (!totals[cid]) {
        const c = categories.find(x => x.id === cid);
        totals[cid] = { name: c?.name || "其他", color: c?.color || CHART_COLORS[Object.keys(totals).length % CHART_COLORS.length], total: 0 };
      }
      totals[cid].total += getConverted(t);
    });
    return Object.values(totals).sort((a, b) => b.total - a.total).slice(0, 6);
  }, [filteredTransactions, categories, selectedYear, timePeriod, selectedMonth, wallets, user]);

  const walletData = useMemo(() => wallets.map((w, i) => ({
    name: w.name, balance: parseFloat(w.balance || "0") * walletRate(w),
    color: w.color || CHART_COLORS[i % CHART_COLORS.length],
  })).filter(w => w.balance > 0), [wallets, user]);

  const yearlyTotals = useMemo(() => {
    let income = 0, expense = 0;
    filteredTransactions.forEach(t => {
      const d = new Date(t.date);
      if (d.getFullYear() !== selectedYear) return;
      const a = getConverted(t);
      if (t.type === "income") income += a;
      else if (t.type === "expense") expense += a;
    });
    return { income, expense, savings: income - expense };
  }, [filteredTransactions, selectedYear, wallets, user]);

  const currentMonthTotals = useMemo(() => {
    const target = selectedMonth !== null ? selectedMonth : new Date().getMonth();
    let income = 0, expense = 0;
    filteredTransactions.forEach(t => {
      const d = new Date(t.date);
      if (d.getFullYear() !== selectedYear || d.getMonth() !== target) return;
      const a = getConverted(t);
      if (t.type === "income") income += a;
      else if (t.type === "expense") expense += a;
    });
    return { income, expense, savings: income - expense };
  }, [filteredTransactions, selectedYear, selectedMonth, wallets, user]);

  const displayTotals = timePeriod === "month" ? currentMonthTotals : yearlyTotals;
  const periodLabel = timePeriod === "month" ? "月度" : "年度";

  const compareData = useMemo(() => {
    const target = selectedMonth !== null ? selectedMonth : new Date().getMonth();
    const cur = monthlyData[target];
    const prev = target > 0 ? monthlyData[target - 1] : null;
    const expenseChange = prev && prev.expense > 0 ? ((cur.expense - prev.expense) / prev.expense) * 100 : 0;
    const incomeChange = prev && prev.income > 0 ? ((cur.income - prev.income) / prev.income) * 100 : 0;
    return { expenseChange, incomeChange };
  }, [monthlyData, selectedMonth]);

  const totalBalance = useMemo(() => wallets.reduce((s, w) => s + parseFloat(w.balance || "0") * walletRate(w), 0), [wallets, user]);

  const cumulativeSavingsData = useMemo(() => {
    const target = selectedMonth !== null ? selectedMonth : new Date().getMonth();
    let cum = 0;
    if (timePeriod === "month") return monthlyData.slice(0, target + 1).map(m => { cum += m.savings; return { ...m, cumulative: cum }; });
    return monthlyData.map(m => { cum += m.savings; return { ...m, cumulative: cum }; });
  }, [monthlyData, timePeriod, selectedMonth]);

  const budgetProgressData = useMemo(() => budgetSpending.map((b: any) => ({
    name: b.categoryName, budget: parseFloat(b.amount), spent: b.spent,
    remaining: Math.max(0, parseFloat(b.amount) - b.spent),
    percentage: (b.spent / parseFloat(b.amount)) * 100,
    color: b.categoryColor,
  })).slice(0, 5), [budgetSpending]);

  const savingsGoalsProgress = useMemo(() => savingsGoals.map((g: SavingsGoal) => {
    const current = parseFloat(g.currentAmount);
    const target = parseFloat(g.targetAmount);
    return { name: g.name, current, target, percentage: target > 0 ? (current / target) * 100 : 0, isCompleted: g.isCompleted };
  }), [savingsGoals]);

  const formatCompact = (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0);
  const formatFull = (v: number) => v.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt = (v: number) => preferences.showFullAmount ? formatFull(v) : formatCompact(v);
  const togglePreference = (key: keyof AnalyticsPreferences) => updatePreferencesMutation.mutate({ [key]: !preferences[key] });

  const months = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
  const currentMonth = new Date().getMonth();

  const handlePrevPeriod = () => {
    if (timePeriod === "year") setSelectedYear(selectedYear - 1);
    else {
      if (selectedMonth === null) setSelectedMonth(currentMonth);
      else if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(selectedYear - 1); }
      else setSelectedMonth(selectedMonth - 1);
    }
  };
  const handleNextPeriod = () => {
    if (timePeriod === "year") setSelectedYear(selectedYear + 1);
    else {
      if (selectedMonth === null) setSelectedMonth(currentMonth);
      else if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(selectedYear + 1); }
      else setSelectedMonth(selectedMonth + 1);
    }
  };
  const getPeriodLabel = () => timePeriod === "year" ? `${selectedYear} 年` : `${selectedYear} 年 ${months[selectedMonth ?? currentMonth]}`;
  const savingsRate = yearlyTotals.income > 0 ? (yearlyTotals.savings / yearlyTotals.income) * 100 : 0;

  return (
    <div className="min-h-screen text-foreground relative">
      <div aria-hidden className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute -top-40 left-1/4 w-[520px] h-[520px] rounded-full opacity-40 blur-3xl"
             style={{ background: "radial-gradient(circle, rgba(167,139,250,0.35) 0%, transparent 70%)" }} />
        <div className="absolute top-1/3 right-0 w-[420px] h-[420px] rounded-full opacity-30 blur-3xl"
             style={{ background: "radial-gradient(circle, rgba(96,165,250,0.25) 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 left-1/3 w-[380px] h-[380px] rounded-full opacity-25 blur-3xl"
             style={{ background: "radial-gradient(circle, rgba(245,158,11,0.25) 0%, transparent 70%)" }} />
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-5 md:py-8 pb-20 md:pb-12 relative space-y-5 md:space-y-6">

        {/* HEADER */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/insights">
              <button className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.10] hover:bg-white/[0.10] flex items-center justify-center text-foreground/70 hover:text-foreground transition-all">
                <ArrowLeft className="w-[18px] h-[18px]" />
              </button>
            </Link>
            <div>
              <p className="text-[11px] tracking-[0.2em] uppercase text-foreground/45 m-0">Analytics</p>
              <h1 className="text-[22px] md:text-[28px] font-bold tracking-tight m-0 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[#a78bfa]" />数据分析
              </h1>
            </div>
          </div>
          <button onClick={() => setSettingsOpen(true)} aria-label="设置" data-testid="button-analytics-settings"
                  className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.10] hover:bg-white/[0.10] flex items-center justify-center text-foreground/70 hover:text-foreground transition-all">
            <Settings2 className="w-[18px] h-[18px]" />
          </button>
        </header>

        {isTransactionsLoading ? (
          <div className="rounded-3xl p-12 text-center bg-white/[0.025] border border-white/[0.06]">
            <Loader2 className="w-6 h-6 animate-spin text-[#a78bfa] mx-auto" />
          </div>
        ) : (
          <>
            {/* PERIOD + FILTER */}
            <section className="rounded-3xl p-4 md:p-5"
                     style={{
                       background: "linear-gradient(135deg, rgba(167,139,250,0.10) 0%, rgba(99,102,241,0.06) 100%), rgba(20,12,32,0.55)",
                       border: "1px solid rgba(255,255,255,0.06)",
                     }}>
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button onClick={handlePrevPeriod} aria-label="上一期" data-testid="button-prev-period"
                          className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.10] hover:bg-white/[0.10] flex items-center justify-center text-foreground/70 hover:text-foreground transition-all">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="px-4 py-2.5 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-[#a78bfa]" />
                    <span className="text-[13px] font-semibold tabular-nums" data-testid="text-selected-period">{getPeriodLabel()}</span>
                  </div>
                  <button onClick={handleNextPeriod} aria-label="下一期" data-testid="button-next-period"
                          className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.10] hover:bg-white/[0.10] flex items-center justify-center text-foreground/70 hover:text-foreground transition-all">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Tabs value={timePeriod} onValueChange={(v) => {
                    setTimePeriod(v as "year" | "month");
                    if (v === "month" && selectedMonth === null) setSelectedMonth(currentMonth);
                  }}>
                    <TabsList>
                      <TabsTrigger value="month" data-testid="button-period-month">按月</TabsTrigger>
                      <TabsTrigger value="year" data-testid="button-period-year">按年</TabsTrigger>
                    </TabsList>
                  </Tabs>

                  {subLedgers.length > 0 && (
                    <Select value={selectedSubLedgerId} onValueChange={setSelectedSubLedgerId}>
                      <SelectTrigger className="w-[140px] h-9" data-testid="select-subledger-filter">
                        <BookOpen className="w-3.5 h-3.5 text-[#a78bfa]" />
                        <SelectValue placeholder="账本" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" data-testid="option-subledger-all">全部账本</SelectItem>
                        <SelectItem value="main" data-testid="option-subledger-main">仅主账本</SelectItem>
                        {subLedgers.filter(s => !s.isArchived).map(sl => (
                          <SelectItem key={sl.id} value={String(sl.id)} data-testid={`option-subledger-${sl.id}`}>
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full" style={{ background: sl.color || "#a78bfa" }} />
                              {sl.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </section>

            {/* DATA VIEW TABS — wallets-style scrollable pills so the row stays
                inside its container instead of widening the whole page. */}
            <PillTabs<"overview" | "income" | "expense" | "savings" | "ai">
              value={dataView}
              onChange={(v) => setDataView(v)}
              options={[
                { id: "overview", label: "总览" },
                { id: "income", label: "收入" },
                { id: "expense", label: "支出" },
                { id: "savings", label: "储蓄" },
                { id: "ai", label: "AI 建议" },
              ]}
            />

            {/* KPI QUARTET */}
            {preferences.showYearlyStats && (
              <section className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="card-yearly-income">
                <KpiTile tone="emerald" label={`${periodLabel}收入`} icon={<ArrowUp className="w-4 h-4" />}
                  valueText={`${currencyInfo.symbol}${fmt(displayTotals.income)}`}
                  badge={timePeriod === "month" && compareData.incomeChange !== 0 && (
                    <span className={`px-1.5 py-0.5 rounded-md text-[9.5px] font-bold ${compareData.incomeChange > 0 ? "bg-emerald-400/15 text-emerald-300 border border-emerald-400/20" : "bg-rose-400/15 text-rose-300 border border-rose-400/20"}`}>
                      {compareData.incomeChange > 0 ? "+" : ""}{compareData.incomeChange.toFixed(1)}%
                    </span>
                  )} />
                <KpiTile tone="rose" label={`${periodLabel}支出`} icon={<ArrowDown className="w-4 h-4" />}
                  valueText={`${currencyInfo.symbol}${fmt(displayTotals.expense)}`}
                  badge={timePeriod === "month" && compareData.expenseChange !== 0 && (
                    <span className={`px-1.5 py-0.5 rounded-md text-[9.5px] font-bold ${compareData.expenseChange > 0 ? "bg-rose-400/15 text-rose-300 border border-rose-400/20" : "bg-emerald-400/15 text-emerald-300 border border-emerald-400/20"}`}>
                      {compareData.expenseChange > 0 ? "+" : ""}{compareData.expenseChange.toFixed(1)}%
                    </span>
                  )} />
                <KpiTile tone="violet" label={`${periodLabel}结余`} icon={<Coins className="w-4 h-4" />}
                  valueText={`${displayTotals.savings >= 0 ? "+" : "−"}${currencyInfo.symbol}${fmt(Math.abs(displayTotals.savings))}`}
                  badge={<span className="px-1.5 py-0.5 rounded-md text-[9.5px] font-bold bg-violet-400/15 text-violet-300 border border-violet-400/20">
                    {(displayTotals.income > 0 ? (displayTotals.savings / displayTotals.income * 100) : 0).toFixed(0)}%
                  </span>} />
                <KpiTile tone="blue" label="总资产" icon={<CreditCard className="w-4 h-4" />}
                  valueText={`${currencyInfo.symbol}${fmt(totalBalance)}`}
                  badge={<span className="px-1.5 py-0.5 rounded-md text-[9.5px] font-bold bg-blue-400/15 text-blue-300 border border-blue-400/20">
                    {wallets.length} 账户
                  </span>} />
              </section>
            )}

            {/* OVERVIEW VIEW */}
            {dataView === "overview" && (
              <div className="space-y-4">
                <AiInsightsSection compact />

                {preferences.showMonthlyTrend && (
                  <SectionCard title="收支趋势" icon={<Activity className="w-4 h-4" />} accent="violet">
                    <div className="h-[220px] md:h-[280px]">
                      <LazyRecharts>
                        {(R) => (
                          <R.ResponsiveContainer width="100%" height="100%">
                            <R.AreaChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                              <defs>
                                <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#34d399" stopOpacity={0.4} />
                                  <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#f87171" stopOpacity={0.4} />
                                  <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
                                </linearGradient>
                              </defs>
                              <R.CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                              <R.XAxis dataKey="shortMonth" tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} />
                              <R.YAxis tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmt(v)} />
                              <R.Tooltip labelStyle={{ color: "rgba(255,255,255,0.55)", fontSize: "11px", marginBottom: "4px" }} itemStyle={{ color: "rgba(255,255,255,0.92)" }} contentStyle={{ backgroundColor: "rgba(26,20,36,0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", backdropFilter: "blur(12px)" }}
                                formatter={(v: number, name: string) => [`${currencyInfo.symbol}${formatFull(v)}`, name === "income" ? "收入" : "支出"]}
                                labelFormatter={(label: string | number) => `${label}月`} />
                              <R.Area type="monotone" dataKey="income" stroke="#34d399" strokeWidth={2.5} fill="url(#colorIncome)" />
                              <R.Area type="monotone" dataKey="expense" stroke="#f87171" strokeWidth={2.5} fill="url(#colorExpense)" />
                            </R.AreaChart>
                          </R.ResponsiveContainer>
                        )}
                      </LazyRecharts>
                    </div>
                  </SectionCard>
                )}

                <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                  {preferences.showExpenseDistribution && expenseCategoryData.length > 0 && (
                    <SectionCard title="支出构成" icon={<PieChartIcon className="w-4 h-4" />} accent="rose">
                      <div className="flex items-center gap-4">
                        <div className="w-[120px] h-[120px] md:w-[140px] md:h-[140px] shrink-0">
                          <LazyRecharts className="w-full h-full">
                            {(R) => (
                              <R.ResponsiveContainer width="100%" height="100%">
                                <R.PieChart>
                                  <R.Pie data={expenseCategoryData} cx="50%" cy="50%" innerRadius="55%" outerRadius="85%" dataKey="total" paddingAngle={3} strokeWidth={0}>
                                    {expenseCategoryData.map((entry, i) => <R.Cell key={i} fill={entry.color} />)}
                                  </R.Pie>
                                </R.PieChart>
                              </R.ResponsiveContainer>
                            )}
                          </LazyRecharts>
                        </div>
                        <div className="flex-1 space-y-2">
                          {expenseCategoryData.slice(0, 4).map((c, i) => {
                            const percentage = (c.total / Math.max(yearlyTotals.expense, 1)) * 100;
                            return (
                              <div key={i} className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
                                <span className="text-[11.5px] text-foreground/70 flex-1 truncate">{c.name}</span>
                                <span className="text-[11.5px] font-mono">{percentage.toFixed(0)}%</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </SectionCard>
                  )}

                  {preferences.showIncomeDistribution && incomeCategoryData.length > 0 && (
                    <SectionCard title="收入构成" icon={<PieChartIcon className="w-4 h-4" />} accent="emerald">
                      <div className="flex items-center gap-4">
                        <div className="w-[120px] h-[120px] md:w-[140px] md:h-[140px] shrink-0">
                          <LazyRecharts className="w-full h-full">
                            {(R) => (
                              <R.ResponsiveContainer width="100%" height="100%">
                                <R.PieChart>
                                  <R.Pie data={incomeCategoryData} cx="50%" cy="50%" innerRadius="55%" outerRadius="85%" dataKey="total" paddingAngle={3} strokeWidth={0}>
                                    {incomeCategoryData.map((entry, i) => <R.Cell key={i} fill={entry.color} />)}
                                  </R.Pie>
                                </R.PieChart>
                              </R.ResponsiveContainer>
                            )}
                          </LazyRecharts>
                        </div>
                        <div className="flex-1 space-y-2">
                          {incomeCategoryData.slice(0, 4).map((c, i) => {
                            const percentage = (c.total / Math.max(yearlyTotals.income, 1)) * 100;
                            return (
                              <div key={i} className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
                                <span className="text-[11.5px] text-foreground/70 flex-1 truncate">{c.name}</span>
                                <span className="text-[11.5px] font-mono">{percentage.toFixed(0)}%</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </SectionCard>
                  )}
                </div>

                <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                  {preferences.showBudgetProgress && budgetProgressData.length > 0 && (
                    <SectionCard title="预算执行" icon={<Target className="w-4 h-4" />} accent="violet">
                      <div className="space-y-3">
                        {budgetProgressData.map((b, i) => (
                          <div key={i} className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full" style={{ background: b.color }} />
                                <span className="text-[12px] font-medium">{b.name}</span>
                              </div>
                              <span className={`text-[11.5px] font-mono font-semibold ${b.percentage > 100 ? "text-rose-300" : b.percentage > 80 ? "text-amber-300" : "text-foreground/60"}`}>
                                {b.percentage.toFixed(0)}%
                              </span>
                            </div>
                            <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-500"
                                   style={{ width: `${Math.min(b.percentage, 100)}%`, background: b.percentage > 100 ? "linear-gradient(90deg, #f87171, #dc2626)" : `linear-gradient(90deg, ${b.color}cc, ${b.color})`, boxShadow: `0 0 8px ${b.color}55` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  )}

                  {preferences.showSavingsProgress && savingsGoalsProgress.length > 0 && (
                    <SectionCard title="储蓄目标" icon={<Percent className="w-4 h-4" />} accent="emerald">
                      <div className="space-y-3">
                        {savingsGoalsProgress.slice(0, 4).map((g, i) => (
                          <div key={i} className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className={`text-[12px] font-medium ${g.isCompleted ? "line-through text-foreground/45" : ""}`}>{g.name}</span>
                              <span className={`text-[11.5px] font-mono font-semibold ${g.isCompleted ? "text-emerald-300" : "text-foreground/60"}`}>
                                {g.percentage.toFixed(0)}%
                              </span>
                            </div>
                            <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-500"
                                   style={{ width: `${Math.min(g.percentage, 100)}%`, background: "linear-gradient(90deg, #34d399, #10b981)", boxShadow: "0 0 8px rgba(52,211,153,0.4)" }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  )}
                </div>

                {preferences.showCashflowTrend && (
                  <SectionCard title="累计现金流" icon={<TrendingUp className="w-4 h-4" />} accent="violet">
                    <div className="h-[200px]">
                      <LazyRecharts>
                        {(R) => (
                          <R.ResponsiveContainer width="100%" height="100%">
                            <R.ComposedChart data={cumulativeSavingsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                              <defs>
                                <linearGradient id="colorCum" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.4} />
                                  <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                                </linearGradient>
                              </defs>
                              <R.CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                              <R.XAxis dataKey="shortMonth" tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} />
                              <R.YAxis tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmt(v)} />
                              <R.Tooltip labelStyle={{ color: "rgba(255,255,255,0.55)", fontSize: "11px", marginBottom: "4px" }} itemStyle={{ color: "rgba(255,255,255,0.92)" }} contentStyle={{ backgroundColor: "rgba(26,20,36,0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px" }}
                                formatter={(v: number, name: string) => [`${currencyInfo.symbol}${formatFull(v)}`, name === "savings" ? "月结余" : "累计"]}
                                labelFormatter={(l: string | number) => `${l}月`} />
                              <R.Bar dataKey="savings" fill="#a78bfa" opacity={0.5} radius={[6, 6, 0, 0]} />
                              <R.Line type="monotone" dataKey="cumulative" stroke="#34d399" strokeWidth={2.5} dot={{ fill: "#34d399", strokeWidth: 0, r: 3 }} />
                            </R.ComposedChart>
                          </R.ResponsiveContainer>
                        )}
                      </LazyRecharts>
                    </div>
                  </SectionCard>
                )}
              </div>
            )}

            {/* AI VIEW */}
            {dataView === "ai" && (
              <div className="space-y-4">
                <AiInsightsSection />
              </div>
            )}

            {/* INCOME VIEW */}
            {dataView === "income" && (
              <div className="space-y-4">
                <SectionCard title="月度收入" icon={<BarChart3 className="w-4 h-4" />} accent="emerald">
                  <div className="h-[240px]">
                    <LazyRecharts>
                      {(R) => (
                        <R.ResponsiveContainer width="100%" height="100%">
                          <R.BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <R.CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <R.XAxis dataKey="shortMonth" tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} />
                            <R.YAxis tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmt(v)} />
                            <R.Tooltip labelStyle={{ color: "rgba(255,255,255,0.55)", fontSize: "11px", marginBottom: "4px" }} itemStyle={{ color: "rgba(255,255,255,0.92)" }} contentStyle={{ backgroundColor: "rgba(26,20,36,0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px" }}
                              formatter={(v: number) => [`${currencyInfo.symbol}${formatFull(v)}`, "收入"]} />
                            <R.Bar dataKey="income" fill="#34d399" radius={[6, 6, 0, 0]} />
                          </R.BarChart>
                        </R.ResponsiveContainer>
                      )}
                    </LazyRecharts>
                  </div>
                </SectionCard>

                <SectionCard title="收入来源排行" icon={<TrendingUp className="w-4 h-4" />} accent="emerald">
                  <div className="space-y-3">
                    {incomeCategoryData.map((c, i) => {
                      const max = incomeCategoryData[0]?.total || 1;
                      const pct = (c.total / max) * 100;
                      return (
                        <div key={i} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 rounded-md text-[9.5px] font-mono font-bold bg-white/[0.06] border border-white/[0.10]">{i + 1}</span>
                              <span className="text-[13px] font-medium">{c.name}</span>
                            </div>
                            <span className="text-[12.5px] font-mono text-emerald-300">{currencyInfo.symbol}{fmt(c.total)}</span>
                          </div>
                          <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${c.color}cc, ${c.color})`, boxShadow: `0 0 8px ${c.color}55` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>
              </div>
            )}

            {/* EXPENSE VIEW */}
            {dataView === "expense" && (
              <div className="space-y-4">
                <SectionCard title="月度支出" icon={<BarChart3 className="w-4 h-4" />} accent="rose">
                  <div className="h-[240px]">
                    <LazyRecharts>
                      {(R) => (
                        <R.ResponsiveContainer width="100%" height="100%">
                          <R.BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <R.CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <R.XAxis dataKey="shortMonth" tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} />
                            <R.YAxis tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmt(v)} />
                            <R.Tooltip labelStyle={{ color: "rgba(255,255,255,0.55)", fontSize: "11px", marginBottom: "4px" }} itemStyle={{ color: "rgba(255,255,255,0.92)" }} contentStyle={{ backgroundColor: "rgba(26,20,36,0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px" }}
                              formatter={(v: number) => [`${currencyInfo.symbol}${formatFull(v)}`, "支出"]} />
                            <R.Bar dataKey="expense" fill="#f87171" radius={[6, 6, 0, 0]} />
                          </R.BarChart>
                        </R.ResponsiveContainer>
                      )}
                    </LazyRecharts>
                  </div>
                </SectionCard>

                <SectionCard title="支出分类排行" icon={<TrendingDown className="w-4 h-4" />} accent="rose">
                  <div className="space-y-3">
                    {expenseCategoryData.map((c, i) => {
                      const max = expenseCategoryData[0]?.total || 1;
                      const pct = (c.total / max) * 100;
                      return (
                        <div key={i} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 rounded-md text-[9.5px] font-mono font-bold bg-white/[0.06] border border-white/[0.10]">{i + 1}</span>
                              <span className="text-[13px] font-medium">{c.name}</span>
                            </div>
                            <span className="text-[12.5px] font-mono text-rose-300">{currencyInfo.symbol}{fmt(c.total)}</span>
                          </div>
                          <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${c.color}cc, ${c.color})`, boxShadow: `0 0 8px ${c.color}55` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>
              </div>
            )}

            {/* SAVINGS VIEW */}
            {dataView === "savings" && (
              <div className="space-y-4">
                <SectionCard title="月度储蓄趋势" icon={<Activity className="w-4 h-4" />} accent="violet">
                  <div className="h-[240px]">
                    <LazyRecharts>
                      {(R) => (
                        <R.ResponsiveContainer width="100%" height="100%">
                          <R.AreaChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                              <linearGradient id="colorSavings" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.5} />
                                <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <R.CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <R.XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} />
                            <R.YAxis tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmt(v)} />
                            <R.Tooltip labelStyle={{ color: "rgba(255,255,255,0.55)", fontSize: "11px", marginBottom: "4px" }} itemStyle={{ color: "rgba(255,255,255,0.92)" }} contentStyle={{ backgroundColor: "rgba(26,20,36,0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px" }}
                              formatter={(v: number) => [`${currencyInfo.symbol}${formatFull(v)}`, "结余"]} />
                            <R.Area type="monotone" dataKey="savings" stroke="#a78bfa" strokeWidth={2.5} fill="url(#colorSavings)" />
                          </R.AreaChart>
                        </R.ResponsiveContainer>
                      )}
                    </LazyRecharts>
                  </div>
                </SectionCard>

                <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                  {preferences.showWalletDistribution && walletData.length > 0 && (
                    <SectionCard title="账户分布" icon={<CreditCard className="w-4 h-4" />} accent="blue">
                      <div className="flex items-center gap-4">
                        <div className="w-[100px] h-[100px] shrink-0">
                          <LazyRecharts className="w-full h-full">
                            {(R) => (
                              <R.ResponsiveContainer width="100%" height="100%">
                                <R.PieChart>
                                  <R.Pie data={walletData} cx="50%" cy="50%" innerRadius="50%" outerRadius="80%" dataKey="balance" paddingAngle={3} strokeWidth={0}>
                                    {walletData.map((entry, i) => <R.Cell key={i} fill={entry.color} />)}
                                  </R.Pie>
                                </R.PieChart>
                              </R.ResponsiveContainer>
                            )}
                          </LazyRecharts>
                        </div>
                        <div className="flex-1 space-y-2">
                          {walletData.slice(0, 4).map((w, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: w.color }} />
                              <span className="text-[11.5px] text-foreground/70 flex-1 truncate">{w.name}</span>
                              <span className="text-[11.5px] font-mono">{currencyInfo.symbol}{fmt(w.balance)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </SectionCard>
                  )}

                  <SectionCard title="储蓄概览" icon={<Sparkles className="w-4 h-4" />} accent="amber">
                    <div className="space-y-3">
                      {[
                        { l: "平均月储蓄", v: yearlyTotals.savings / 12, c: "text-foreground" },
                        { l: "最高月储蓄", v: Math.max(...monthlyData.map(m => m.savings)), c: "text-emerald-300" },
                        { l: "最低月储蓄", v: Math.min(...monthlyData.map(m => m.savings)), c: "text-rose-300" },
                      ].map((row, i) => (
                        <div key={i} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                          <span className="text-[11.5px] text-foreground/55">{row.l}</span>
                          <span className={`text-[13px] font-mono ${row.c}`}>{currencyInfo.symbol}{fmt(row.v)}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between py-2">
                        <span className="text-[11.5px] text-foreground/55">储蓄率</span>
                        <span className="text-[13px] font-mono">{savingsRate.toFixed(1)}%</span>
                      </div>
                    </div>
                  </SectionCard>
                </div>
              </div>
            )}

            {/* SETTINGS DIALOG */}
            <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
              <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col" data-testid="modal-analytics-settings">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-base">
                    <Settings2 className="w-4 h-4 text-[#a78bfa]" />分析页设置
                  </DialogTitle>
                  <p className="text-[11px] text-foreground/55 m-0 mt-0.5">选择要显示的卡片, 拖拽或使用箭头调整顺序</p>
                </DialogHeader>

                <div className="flex items-center justify-between p-3 rounded-xl border border-white/[0.06] bg-white/[0.03] mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold m-0">显示完整金额</p>
                    <p className="text-[10.5px] text-foreground/50 m-0 mt-0.5">关闭时显示缩写 (如 8.4k), 开启后显示完整数字</p>
                  </div>
                  <Switch checked={preferences.showFullAmount} onCheckedChange={() => togglePreference("showFullAmount")}
                          disabled={updatePreferencesMutation.isPending} data-testid="switch-showFullAmount" />
                </div>

                {orderedItems.length > 0 ? (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                    <SortableContext items={orderedItems.map(it => it.key)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2 overflow-y-auto flex-1 pr-1 custom-scroll">
                        {orderedItems.map((item, index) => (
                          <SortableSettingsItem key={item.key} item={item}
                            isChecked={preferences[item.key] as boolean}
                            onToggle={togglePreference} onMove={moveItem}
                            index={index} total={orderedItems.length}
                            isPending={updatePreferencesMutation.isPending} />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <p className="text-[12.5px] text-foreground/55 py-4 text-center m-0">没有可显示的卡片</p>
                )}
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- AI insights (chrome rewritten, body preserved) ---------- */

interface AiResponse {
  metrics: {
    rangeMonths: number; totalIncome: number; totalExpense: number;
    avgMonthlyExpense: number; savingsRate: number; emergencyFundMonths: number | null;
    monthly: Record<string, { income: number; expense: number }>;
    topExpenseCategories: { categoryId: number; categoryName: string; total: number; color: string }[];
    budgetDeviations: { categoryId: number; categoryName: string; budget: number; spent: number; deviation: number; color: string }[];
    topRecurringPayments: { amount: number; months: number; categoryName: string; walletName: string; sampleDate: string | null }[];
  };
  ai: {
    summary?: string;
    insights?: { title: string; explanation: string; relatedMetrics?: string[] }[];
    actions?: { title: string; impact?: string; effort?: string; steps?: string[] }[];
    disclaimer?: string;
  } | null;
  aiEnabled: boolean; message?: string; fromCache?: boolean;
  cooldownRemainingMs?: number; cachedAt?: string; nextAllowedAt?: string;
}

function AiInsightsSection({ compact = false }: { compact?: boolean }) {
  const { user, isAuthenticated } = useAuth();
  const [rangeMonths, setRangeMonths] = useState<string>("6");
  const queryKey = useMemo(() => ["/api", "ai", `insights?rangeMonths=${rangeMonths}`], [rangeMonths]);
  const { data, isLoading, refetch } = useQuery<AiResponse>({ queryKey, enabled: isAuthenticated });
  // Use the user's actual default currency — the server already returns every metric
  // converted to it. (Previously this was hard-coded to RM regardless of the user.)
  const currency = getCurrencyInfo(user?.defaultCurrency || "MYR").symbol;

  return (
    <SectionCard title="AI 建议" icon={<Brain className="w-4 h-4" />} accent="violet"
      action={
        <div className="flex items-center gap-2">
          <Select value={rangeMonths} onValueChange={(v) => setRangeMonths(v)}>
            <SelectTrigger className="w-[100px] h-9" data-testid="select-ai-range-analytics"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="3">近 3 月</SelectItem>
              <SelectItem value="6">近 6 月</SelectItem>
              <SelectItem value="12">近 12 月</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-ai-analytics"
                  disabled={!!data && !!data.fromCache && (data.cooldownRemainingMs ?? 0) > 0}>
            刷新
          </Button>
        </div>
      }>
      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-2/3 bg-white/[0.05]" />
            <Skeleton className="h-5 w-1/2 bg-white/[0.05]" />
            <Skeleton className="h-24 w-full bg-white/[0.05]" />
          </div>
        ) : !data || !data.metrics ? (
          // Guard against data.metrics being null — the server returns { metrics: null }
          // when the computation fails early, and reading data.metrics.* would crash the page.
          <p className="text-[12.5px] text-foreground/55 m-0">{data?.message || "暂无数据"}</p>
        ) : (
          <div className="space-y-4">
            {data.ai?.summary && (
              <div className="p-3 rounded-xl bg-gradient-to-br from-[#a78bfa]/15 to-[#7c3aed]/8 border border-[#a78bfa]/20 text-[12.5px] leading-relaxed">
                {data.ai.summary}
              </div>
            )}
            <div className={`grid gap-3 ${compact ? "grid-cols-3" : "grid-cols-1 sm:grid-cols-3"}`}>
              <div className="rounded-xl p-3 bg-white/[0.03] border border-white/[0.06]">
                <p className="text-[10px] tracking-[0.18em] uppercase text-foreground/55 m-0">储蓄率</p>
                <p className="text-[18px] font-bold font-mono m-0 mt-0.5 text-emerald-300">{(data.metrics.savingsRate * 100).toFixed(1)}%</p>
              </div>
              <div className="rounded-xl p-3 bg-white/[0.03] border border-white/[0.06]">
                <p className="text-[10px] tracking-[0.18em] uppercase text-foreground/55 m-0">应急金月数</p>
                <p className="text-[18px] font-bold font-mono m-0 mt-0.5 text-amber-300">{data.metrics.emergencyFundMonths == null ? "—" : data.metrics.emergencyFundMonths.toFixed(2)}</p>
              </div>
              <div className="rounded-xl p-3 bg-white/[0.03] border border-white/[0.06]">
                <p className="text-[10px] tracking-[0.18em] uppercase text-foreground/55 m-0">月均支出</p>
                <p className="text-[18px] font-bold font-mono m-0 mt-0.5 text-rose-300">{currency}{data.metrics.avgMonthlyExpense.toFixed(2)}</p>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="text-[12px] font-bold m-0">当月预算偏差 Top</h4>
              {data.metrics.budgetDeviations.length === 0 ? (
                <p className="text-[11.5px] text-foreground/45 m-0">暂无偏差</p>
              ) : (
                <div className="space-y-2">
                  {data.metrics.budgetDeviations.map((b) => {
                    const pct = b.budget > 0 ? Math.min(100, (b.spent / b.budget) * 100) : 0;
                    return (
                      <div key={b.categoryId} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11.5px] text-foreground/70 truncate">{b.categoryName}</span>
                          <span className="text-[11.5px] font-mono">{currency}{b.deviation.toFixed(2)}</span>
                        </div>
                        <Progress value={pct} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {data.ai?.actions && data.ai.actions.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-[12px] font-bold m-0">可执行建议</h4>
                <Accordion type="single" collapsible className="w-full">
                  {(compact ? (data.ai.actions || []).slice(0, 2) : (data.ai.actions || [])).map((a, idx) => (
                    <AccordionItem key={idx} value={`item-${idx}`}>
                      <AccordionTrigger className="text-[12.5px]">{a.title}</AccordionTrigger>
                      <AccordionContent>
                        {a.steps && a.steps.length > 0 ? (
                          <ol className="list-decimal ml-5 text-[11.5px] text-foreground/65 space-y-1">
                            {a.steps.map((s, i) => <li key={i}>{s}</li>)}
                          </ol>
                        ) : <p className="text-[11.5px] text-foreground/55 m-0">无具体步骤</p>}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            )}
            {data.aiEnabled === false && (
              <p className="text-[11px] text-foreground/55 m-0">AI 未启用: {data.message || "未配置密钥"}</p>
            )}
            {data.fromCache && (data.cooldownRemainingMs ?? 0) > 0 && (
              <p className="text-[11px] text-foreground/55 m-0">冷却中: 约 {Math.ceil((data.cooldownRemainingMs || 0) / 60000)} 分钟后可重新分析</p>
            )}
            {!compact && data.ai?.disclaimer && (
              <p className="text-[11px] text-foreground/55 m-0">{data.ai.disclaimer}</p>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
