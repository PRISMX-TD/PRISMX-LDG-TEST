import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText, Download, ChevronLeft, ChevronRight, Loader2,
  TrendingUp, TrendingDown, Wallet, ArrowLeft, BarChart3,
} from "lucide-react";
import { getCurrencyInfo } from "@shared/schema";
import type { Transaction, Wallet as WalletType, Category } from "@shared/schema";
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";

/* r7 — Reports rewritten from scratch.
   - Glass hero with period switcher inside
   - 4 stat tiles with gradient and matching tone
   - Side-by-side breakdown cards with rank ribbons
   - All page chrome matches Dashboard r7 */

export default function Reports() {
  const { user } = useAuth();
  const currencyInfo = getCurrencyInfo(user?.defaultCurrency || "MYR");

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [reportType, setReportType] = useState<"monthly" | "yearly">("monthly");

  const { data: transactions = [], isLoading } = useQuery<Transaction[]>({ queryKey: ["/api/transactions"] });
  const { data: wallets = [] } = useQuery<WalletType[]>({ queryKey: ["/api/wallets"] });
  const { data: categories = [] } = useQuery<Category[]>({ queryKey: ["/api/categories"] });

  const reportData = useMemo(() => {
    let startDate: Date, endDate: Date;
    if (reportType === "monthly") {
      startDate = startOfMonth(new Date(selectedYear, selectedMonth - 1));
      endDate = endOfMonth(new Date(selectedYear, selectedMonth - 1));
    } else {
      startDate = startOfYear(new Date(selectedYear, 0));
      endDate = endOfYear(new Date(selectedYear, 0));
    }

    const filtered = transactions.filter(t => {
      const d = new Date(t.date);
      return d >= startDate && d <= endDate;
    });

    let totalIncome = 0, totalExpense = 0;
    const catMap: Record<number, { name: string; color: string; income: number; expense: number }> = {};
    const walMap: Record<number, { name: string; income: number; expense: number }> = {};
    const defaultCur = user?.defaultCurrency || "MYR";

    filtered.forEach(t => {
      const raw = parseFloat(t.amount);
      const wallet = wallets.find(w => w.id === t.walletId);
      let amount = raw;
      if (wallet && wallet.currency !== defaultCur) amount = raw * (parseFloat(wallet.exchangeRateToDefault || "1"));

      if (t.type === "income") totalIncome += amount;
      else if (t.type === "expense") totalExpense += amount;

      if (t.categoryId && t.type !== "transfer") {
        if (!catMap[t.categoryId]) {
          const c = categories.find(x => x.id === t.categoryId);
          catMap[t.categoryId] = { name: c?.name || "其他", color: c?.color || "#a78bfa", income: 0, expense: 0 };
        }
        if (t.type === "income") catMap[t.categoryId].income += amount;
        else catMap[t.categoryId].expense += amount;
      }
      if (t.walletId && t.type !== "transfer") {
        if (!walMap[t.walletId]) walMap[t.walletId] = { name: wallet?.name || "未知钱包", income: 0, expense: 0 };
        if (t.type === "income") walMap[t.walletId].income += amount;
        else walMap[t.walletId].expense += amount;
      }
    });

    return {
      startDate, endDate, totalIncome, totalExpense,
      netIncome: totalIncome - totalExpense,
      transactionCount: filtered.length,
      categoryBreakdown: Object.values(catMap).sort((a, b) => (b.income + b.expense) - (a.income + a.expense)),
      walletBreakdown:   Object.values(walMap).sort((a, b) => (b.income + b.expense) - (a.income + a.expense)),
    };
  }, [transactions, categories, wallets, selectedMonth, selectedYear, reportType, user]);

  const navigatePeriod = (dir: number) => {
    if (reportType === "monthly") {
      let m = selectedMonth + dir, y = selectedYear;
      if (m > 12) { m = 1; y++; } else if (m < 1) { m = 12; y--; }
      setSelectedMonth(m); setSelectedYear(y);
    } else {
      setSelectedYear(selectedYear + dir);
    }
  };

  const handleExport = () => {
    const s = format(reportData.startDate, "yyyy-MM-dd");
    const e = format(reportData.endDate, "yyyy-MM-dd");
    window.open(`/api/transactions/export?startDate=${s}&endDate=${e}`, "_blank");
  };

  const maxCatTotal = Math.max(...reportData.categoryBreakdown.map(c => c.income + c.expense), 1);
  const maxWalTotal = Math.max(...reportData.walletBreakdown.map(w => w.income + w.expense), 1);

  return (
    <div className="min-h-screen text-foreground relative">
      <div aria-hidden className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute -top-40 left-1/3 w-[520px] h-[520px] rounded-full opacity-40 blur-3xl"
             style={{ background: "radial-gradient(circle, rgba(167,139,250,0.35) 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 right-1/4 w-[420px] h-[420px] rounded-full opacity-25 blur-3xl"
             style={{ background: "radial-gradient(circle, rgba(34,211,238,0.25) 0%, transparent 70%)" }} />
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-5 md:py-8 pb-28 md:pb-12 relative">

        {/* HEADER */}
        <header className="flex items-center justify-between mb-6 md:mb-8">
          <div className="flex items-center gap-3">
            <Link href="/insights">
              <button className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.10] hover:bg-white/[0.10] flex items-center justify-center text-foreground/70 hover:text-foreground transition-all">
                <ArrowLeft className="w-[18px] h-[18px]" />
              </button>
            </Link>
            <div>
              <p className="text-[11px] tracking-[0.2em] uppercase text-foreground/45 m-0">Reports</p>
              <h1 className="text-[22px] md:text-[28px] font-bold tracking-tight m-0 flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#a78bfa]" />财务报表
              </h1>
            </div>
          </div>
          <Button onClick={handleExport} variant="outline" data-testid="button-export-csv">
            <Download className="w-4 h-4" />导出 CSV
          </Button>
        </header>

        {isLoading ? (
          <div className="rounded-3xl p-12 text-center bg-white/[0.025] border border-white/[0.06]">
            <Loader2 className="w-6 h-6 animate-spin text-[#a78bfa] mx-auto" />
          </div>
        ) : (
          <>
            {/* PERIOD CHIP */}
            <section className="rounded-3xl p-5 md:p-6 mb-6 lg:mb-8"
                     style={{
                       background: "linear-gradient(135deg, rgba(167,139,250,0.12) 0%, rgba(99,102,241,0.08) 100%), rgba(20,12,32,0.7)",
                       border: "1px solid rgba(255,255,255,0.06)",
                       backdropFilter: "blur(16px)",
                     }}>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <Tabs value={reportType} onValueChange={(v) => setReportType(v as "monthly" | "yearly")}>
                  <TabsList>
                    <TabsTrigger value="monthly">月度</TabsTrigger>
                    <TabsTrigger value="yearly">年度</TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="flex items-center gap-2">
                  <button onClick={() => navigatePeriod(-1)} aria-label="上一期"
                          className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.10] hover:bg-white/[0.10] flex items-center justify-center text-foreground/70 hover:text-foreground transition-all">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="px-4 py-2 rounded-full bg-white/[0.06] border border-white/[0.10] min-w-[130px] text-center">
                    <span className="text-[14px] font-semibold tabular-nums">
                      {reportType === "monthly" ? `${selectedYear} 年 ${selectedMonth} 月` : `${selectedYear} 年`}
                    </span>
                  </div>
                  <button onClick={() => navigatePeriod(1)} aria-label="下一期"
                          className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.10] hover:bg-white/[0.10] flex items-center justify-center text-foreground/70 hover:text-foreground transition-all">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </section>

            {/* 4 STAT TILES */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 lg:mb-8">
              <StatTile tone="emerald" label="总收入" valueText={`+${currencyInfo.symbol}${reportData.totalIncome.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`} icon={<TrendingUp className="w-4 h-4" />} />
              <StatTile tone="rose" label="总支出" valueText={`−${currencyInfo.symbol}${reportData.totalExpense.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`} icon={<TrendingDown className="w-4 h-4" />} />
              <StatTile tone={reportData.netIncome >= 0 ? "violet" : "rose"} label="净收入" valueText={`${reportData.netIncome >= 0 ? "+" : ""}${currencyInfo.symbol}${reportData.netIncome.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`} icon={<BarChart3 className="w-4 h-4" />} />
              <StatTile tone="amber" label="交易笔数" valueText={`${reportData.transactionCount}`} icon={<FileText className="w-4 h-4" />} />
            </section>

            {/* BREAKDOWNS */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5 mb-6">
              {/* Category */}
              <div className="rounded-3xl p-5 bg-white/[0.025] border border-white/[0.06]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[15px] font-bold tracking-tight m-0">分类明细</h3>
                  <span className="text-[10px] tracking-[0.18em] uppercase text-foreground/45">Top {reportData.categoryBreakdown.length}</span>
                </div>
                {reportData.categoryBreakdown.length === 0 ? (
                  <p className="text-center text-[13px] text-foreground/50 py-8 m-0">暂无数据</p>
                ) : (
                  <div className="space-y-3">
                    {reportData.categoryBreakdown.map((c, i) => {
                      const total = c.income + c.expense;
                      const widthPct = (total / maxCatTotal) * 100;
                      return (
                        <div key={i}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
                              <span className="text-[13px] font-medium">{c.name}</span>
                            </div>
                            <div className="flex items-center gap-3 text-[11.5px] tabular-nums">
                              {c.income > 0 && <span className="text-emerald-300">+{currencyInfo.symbol}{c.income.toFixed(2)}</span>}
                              {c.expense > 0 && <span className="text-rose-300">−{currencyInfo.symbol}{c.expense.toFixed(2)}</span>}
                            </div>
                          </div>
                          <div className="h-1.5 w-full bg-white/[0.04] rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${widthPct}%`, background: `linear-gradient(90deg, ${c.color}cc, ${c.color})`, boxShadow: `0 0 8px ${c.color}66` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Wallet */}
              <div className="rounded-3xl p-5 bg-white/[0.025] border border-white/[0.06]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[15px] font-bold tracking-tight m-0 flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-[#a78bfa]" />钱包明细
                  </h3>
                  <span className="text-[10px] tracking-[0.18em] uppercase text-foreground/45">Top {reportData.walletBreakdown.length}</span>
                </div>
                {reportData.walletBreakdown.length === 0 ? (
                  <p className="text-center text-[13px] text-foreground/50 py-8 m-0">暂无数据</p>
                ) : (
                  <div className="space-y-3">
                    {reportData.walletBreakdown.map((w, i) => {
                      const total = w.income + w.expense;
                      const widthPct = (total / maxWalTotal) * 100;
                      return (
                        <div key={i}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[13px] font-medium">{w.name}</span>
                            <div className="flex items-center gap-3 text-[11.5px] tabular-nums">
                              {w.income > 0 && <span className="text-emerald-300">+{currencyInfo.symbol}{w.income.toFixed(2)}</span>}
                              {w.expense > 0 && <span className="text-rose-300">−{currencyInfo.symbol}{w.expense.toFixed(2)}</span>}
                            </div>
                          </div>
                          <div className="h-1.5 w-full bg-white/[0.04] rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${widthPct}%`, background: "linear-gradient(90deg, #a78bfa, #7c3aed)", boxShadow: "0 0 8px rgba(167,139,250,0.4)" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            {/* Footnotes */}
            <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.04] text-[11.5px] text-foreground/55 space-y-1">
              <p className="m-0">· 报表期间 {format(reportData.startDate, "yyyy-MM-dd")} 至 {format(reportData.endDate, "yyyy-MM-dd")}</p>
              <p className="m-0">· 所有金额均以 {currencyInfo.name} ({currencyInfo.code}) 为单位显示</p>
              <p className="m-0">· 转账交易不计入收入或支出统计</p>
              <p className="m-0">· 点击「导出 CSV」可下载详细交易记录</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatTile({ tone, label, valueText, icon }: {
  tone: "emerald" | "rose" | "violet" | "amber";
  label: string; valueText: string; icon: React.ReactNode;
}) {
  const t = {
    emerald: { grad: "from-emerald-400/20 to-emerald-600/10", border: "border-emerald-400/20", clr: "text-emerald-300" },
    rose:    { grad: "from-rose-400/20 to-rose-600/10",       border: "border-rose-400/20",    clr: "text-rose-300" },
    violet:  { grad: "from-violet-400/20 to-violet-600/10",   border: "border-violet-400/20",  clr: "text-violet-300" },
    amber:   { grad: "from-amber-400/20 to-amber-600/10",     border: "border-amber-400/20",   clr: "text-amber-300" },
  }[tone];
  return (
    <div className={`relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br ${t.grad} border ${t.border}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10.5px] tracking-[0.18em] uppercase text-foreground/55 m-0">{label}</p>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${t.clr} bg-white/[0.04] border ${t.border}`}>{icon}</div>
      </div>
      <p className={`text-[19px] md:text-[22px] font-bold m-0 tabular-nums truncate ${t.clr}`}>{valueText}</p>
    </div>
  );
}
