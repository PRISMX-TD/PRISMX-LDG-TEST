import { useState, lazy, Suspense } from "react";
import { useLocation, useSearch, Link } from "wouter";
import { HandCoins, Users, Loader2, ArrowLeft } from "lucide-react";

/* r7 — People hub rewritten from scratch. */

const Loans = lazy(() => import("./Loans"));
const Split = lazy(() => import("./Split"));

type Tab = "loans" | "split";
const TABS: { id: Tab; label: string; icon: any; accent: string }[] = [
  { id: "loans", label: "借贷",     icon: HandCoins, accent: "#a78bfa" },
  { id: "split", label: "费用分摊", icon: Users,     accent: "#f0abfc" },
];

export default function People() {
  const [, setLocation] = useLocation();
  const sp = new URLSearchParams(useSearch());
  const initial = (sp.get("tab") as Tab) || "loans";
  const [tab, setTab] = useState<Tab>(initial);

  const setActive = (t: Tab) => {
    setTab(t);
    const next = new URLSearchParams(sp.toString());
    next.set("tab", t);
    setLocation(`/people?${next.toString()}`, { replace: true });
  };

  return (
    <div className="min-h-screen text-foreground relative">
      <div aria-hidden className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute -top-40 left-1/4 w-[520px] h-[520px] rounded-full opacity-40 blur-3xl"
             style={{ background: "radial-gradient(circle, rgba(240,171,252,0.30) 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 right-1/4 w-[420px] h-[420px] rounded-full opacity-25 blur-3xl"
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
              <p className="text-[11px] tracking-[0.2em] uppercase text-foreground/45 m-0">People</p>
              <h1 className="text-[24px] md:text-[32px] font-bold tracking-tight m-0 flex items-center gap-2">
                <Users className="w-6 h-6 text-[#f0abfc]" />人情账
              </h1>
              <p className="text-[12.5px] text-foreground/55 m-0 mt-0.5">谁欠你 · 你欠谁 · 一起吃饭的钱怎么分</p>
            </div>
          </div>

          <nav className="flex gap-2 -mx-1 px-1 pb-1">
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

        <Suspense fallback={<div className="py-20 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#f0abfc]" /></div>}>
          {tab === "loans" && <Loans />}
          {tab === "split" && <Split />}
        </Suspense>
      </div>
    </div>
  );
}
