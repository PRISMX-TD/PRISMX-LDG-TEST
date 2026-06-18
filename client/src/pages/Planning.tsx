import { useState, lazy, Suspense } from "react";
import { useLocation, useSearch, Link } from "wouter";
import { TrendingUp, PiggyBank, CalendarClock, Bell, Loader2, ArrowLeft, Calendar } from "lucide-react";

/* r7 — Planning hub rewritten from scratch. Matches Insights/People shell. */

const Budgets   = lazy(() => import("./Budgets"));
const Savings   = lazy(() => import("./Savings"));
const Recurring = lazy(() => import("./Recurring"));
const Reminders = lazy(() => import("./Reminders"));

type Tab = "budgets" | "savings" | "recurring" | "reminders";
const TABS: { id: Tab; label: string; icon: any; accent: string }[] = [
  { id: "budgets",   label: "预算",     icon: TrendingUp,    accent: "#a78bfa" },
  { id: "savings",   label: "储蓄目标", icon: PiggyBank,     accent: "#34d399" },
  { id: "recurring", label: "定期交易", icon: CalendarClock, accent: "#60a5fa" },
  { id: "reminders", label: "账单提醒", icon: Bell,          accent: "#fbbf24" },
];

export default function Planning() {
  const [, setLocation] = useLocation();
  const sp = new URLSearchParams(useSearch());
  const initial = (sp.get("tab") as Tab) || "budgets";
  const [tab, setTab] = useState<Tab>(initial);

  const setActive = (t: Tab) => {
    setTab(t);
    const next = new URLSearchParams(sp.toString());
    next.set("tab", t);
    setLocation(`/planning?${next.toString()}`, { replace: true });
  };

  return (
    <div className="min-h-screen text-foreground relative">
      <div aria-hidden className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute -top-40 right-1/3 w-[520px] h-[520px] rounded-full opacity-40 blur-3xl"
             style={{ background: "radial-gradient(circle, rgba(52,211,153,0.25) 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 left-0 w-[460px] h-[460px] rounded-full opacity-30 blur-3xl"
             style={{ background: "radial-gradient(circle, rgba(167,139,250,0.30) 0%, transparent 70%)" }} />
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-5 md:py-8 pb-28 md:pb-12 relative">
        <header className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <Link href="/">
              <button className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.10] hover:bg-white/[0.10] flex items-center justify-center text-foreground/70 hover:text-foreground transition-all">
                <ArrowLeft className="w-[18px] h-[18px]" />
              </button>
            </Link>
            <div>
              <p className="text-[11px] tracking-[0.2em] uppercase text-foreground/45 m-0">Planning</p>
              <h1 className="text-[24px] md:text-[32px] font-bold tracking-tight m-0 flex items-center gap-2">
                <Calendar className="w-6 h-6 text-[#34d399]" />计划
              </h1>
              <p className="text-[12.5px] text-foreground/55 m-0 mt-0.5">设个预算 · 攒个目标 · 让未来的钱有去处</p>
            </div>
          </div>

          <nav className="flex gap-2 overflow-x-auto custom-scroll -mx-1 px-1 pb-1">
            {TABS.map(({ id, label, icon: Icon, accent }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  onClick={() => setActive(id)}
                  className={`shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] font-medium transition-all border ${
                    active
                      ? "text-white shadow-[0_4px_12px_-4px_var(--g)]"
                      : "bg-white/[0.04] border-white/[0.08] text-foreground/65 hover:text-foreground hover:bg-white/[0.08]"
                  }`}
                  style={active ? { background: `linear-gradient(135deg, ${accent}, ${accent}dd)`, borderColor: "transparent", ["--g" as any]: `${accent}80` } : {}}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              );
            })}
          </nav>
        </header>

        <Suspense fallback={<div className="py-20 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#34d399]" /></div>}>
          {tab === "budgets"   && <Budgets />}
          {tab === "savings"   && <Savings />}
          {tab === "recurring" && <Recurring />}
          {tab === "reminders" && <Reminders />}
        </Suspense>
      </div>
    </div>
  );
}
