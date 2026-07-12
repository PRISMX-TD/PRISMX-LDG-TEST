import { Filter, Download, Coffee, Smartphone, Briefcase, ShoppingBag, Home, Zap, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Link } from "wouter";

/* r7 — Recent transactions list rewritten as a Web3-style activity feed.
   Each row is a flush card with a gradient brand badge, no table chrome,
   no neon-glow color tokens — full warm web3 palette. */

interface RecentTransactionsProps {
  transactions: any[];
  onTransactionClick?: (transaction: any) => void;
}

const getCategoryIcon = (iconName: string) => {
  switch (iconName) {
    case "food":      return Coffee;
    case "shopping":  return ShoppingBag;
    case "housing":   return Home;
    case "transport": return Zap;
    case "salary":
    case "work":      return Briefcase;
    default:          return Smartphone;
  }
};

const VISIBLE_COUNT = 50;

export function RecentTransactions({ transactions, onTransactionClick }: RecentTransactionsProps) {
  const visible = transactions.slice(0, VISIBLE_COUNT);

  return (
    <section className="rounded-3xl overflow-hidden mb-6"
             style={{
               background: "rgba(255,255,255,0.025)",
               border: "1px solid rgba(255,255,255,0.06)",
             }}>
      <div className="px-5 py-4 flex items-center justify-between border-b border-white/[0.05]">
        <h3 className="text-[15px] font-bold tracking-tight m-0">最近交易</h3>
        <div className="flex gap-1.5">
          <button aria-label="筛选" className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] flex items-center justify-center text-foreground/55 hover:text-foreground transition-all">
            <Filter className="w-3.5 h-3.5" />
          </button>
          <button aria-label="导出" className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] flex items-center justify-center text-foreground/55 hover:text-foreground transition-all">
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {transactions.length === 0 ? (
        <div className="py-12 text-center text-[13px] text-foreground/45">暂无交易记录</div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {visible.map((t) => {
            const Icon = getCategoryIcon(t.category?.icon || "other");
            const isExpense = t.type === "expense";
            const isIncome = t.type === "income";
            const amtClr = isExpense ? "text-rose-400" : isIncome ? "text-emerald-400" : "text-foreground";
            const sign = isExpense ? "−" : isIncome ? "+" : "";
            const catColor = t.category?.color || "#a78bfa";

            return (
              <button
                key={t.id}
                onClick={() => onTransactionClick?.(t)}
                className="w-full flex items-center gap-3 md:gap-4 px-4 md:px-5 py-3.5 text-left hover:bg-white/[0.03] active:bg-white/[0.05] transition-colors"
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `${catColor}22`, border: `1px solid ${catColor}33` }}
                >
                  <Icon className="w-[18px] h-[18px]" style={{ color: catColor }} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-semibold m-0 truncate">
                    {t.description || t.category?.name || "未命名交易"}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {t.category && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium"
                            style={{ background: `${catColor}1f`, color: catColor }}>
                        {t.category.name}
                      </span>
                    )}
                    <span className="text-[10.5px] text-foreground/50 truncate">
                      {t.wallet?.name} · {format(new Date(t.date), "MM月dd日 HH:mm", { locale: zhCN })}
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p className={`text-[15px] font-bold m-0 tabular-nums ${amtClr}`}>
                    {sign}{parseFloat(t.amount).toFixed(2)}
                  </p>
                  <p className="text-[10px] text-foreground/45 m-0">{t.wallet?.currency || "MYR"}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {transactions.length > VISIBLE_COUNT && (
        <div className="px-5 py-3.5 border-t border-white/[0.05] flex justify-end">
          <Link href="/transactions" className="inline-flex items-center gap-1 text-[12.5px] text-[#a78bfa] hover:text-[#c4b5fd] transition-colors">
            查看全部 <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}
    </section>
  );
}
