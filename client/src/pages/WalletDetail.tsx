import { useState, useMemo } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { BalanceCorrectionModal } from "@/components/BalanceCorrectionModal";
import { WalletModal } from "@/components/WalletModal";
import { getCurrencyInfo, type Wallet, type Transaction, type Category, type SubLedger } from "@shared/schema";
import { getSessionToken } from "@/lib/neonAuth";
import {
  ArrowLeft, Pencil, ChevronRight, Settings,
  ArrowUpRight, ArrowDownLeft, MoreVertical, Eye, EyeOff,
} from "lucide-react";
import { format } from "date-fns";
import { BrandCircle, pickBrand } from "@/components/ds/BrandCircle";
import { Sparkline } from "@/components/ds/Sparkline";
import { PillButton } from "@/components/ds/PillButton";
import { RoundIconButton } from "@/components/ds/RoundIconButton";
import { PillTabs } from "@/components/ds/PillTabs";
import { usePrivacyMode } from "@/hooks/usePrivacyMode";

type ChartMode = "30d" | "6m" | "1y";

export default function WalletDetail() {
  const { user } = useAuth();
  const [, params] = useRoute("/wallets/:id");
  const [, navigate] = useLocation();
  const walletId = params?.id ? parseInt(params.id) : null;
  const [showCorrection, setShowCorrection] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [chartMode, setChartMode] = useState<ChartMode>("30d");
  const { isPrivacyMode, togglePrivacyMode } = usePrivacyMode();

  const { data: wallet, isLoading: walletLoading } = useQuery<Wallet>({
    queryKey: ["/api/wallets", walletId],
    enabled: !!walletId,
  });

  const { data: allTransactions = [], isLoading: txLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions", { walletId }],
    queryFn: async () => {
      if (!walletId) return [];
      const headers: Record<string, string> = {};
      const token = getSessionToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const r = await fetch(`/api/transactions?walletId=${walletId}&limit=500`, { headers, credentials: "include" });
      if (!r.ok) throw new Error();
      return r.json();
    },
    enabled: !!walletId,
  });

  const { data: categories = [] } = useQuery<Category[]>({ queryKey: ["/api/categories"] });
  const { data: walletsList = [] } = useQuery<Wallet[]>({ queryKey: ["/api/wallets"] });
  const { data: subLedgers = [] } = useQuery<SubLedger[]>({ queryKey: ["/api/sub-ledgers"] });

  const walletTx = useMemo(() => {
    if (!walletId) return [];
    return allTransactions
      .filter(t => t.walletId === walletId || t.toWalletId === walletId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allTransactions, walletId]);

  const recent = walletTx.slice(0, 10);

  // Balance history (sparkline)
  const sparkData = useMemo(() => {
    if (!wallet) return [];
    const points = chartMode === "30d" ? 30 : chartMode === "6m" ? 26 : 52;
    const stride = chartMode === "30d" ? 1 : chartMode === "6m" ? 7 : 7;
    let running = parseFloat(wallet.balance || "0");
    const series: number[] = [running];
    const now = new Date();
    for (let i = 1; i < points; i++) {
      const back = new Date(now); back.setDate(back.getDate() - i * stride);
      const back2 = new Date(now); back2.setDate(back2.getDate() - (i - 1) * stride);
      const within = walletTx.filter(t => {
        const td = new Date(t.date);
        return td > back && td <= back2;
      });
      for (const t of within) {
        const amt = parseFloat(t.amount);
        if (t.type === "income" && t.walletId === walletId) running -= amt;
        else if (t.type === "expense" && t.walletId === walletId) running += amt;
        else if (t.type === "transfer") {
          if (t.walletId === walletId) running += amt;
          if (t.toWalletId === walletId) running -= parseFloat(t.toWalletAmount || t.amount);
        }
      }
      series.unshift(running);
    }
    return series;
  }, [wallet, walletTx, chartMode, walletId]);

  if (!walletId) return <div className="p-4 text-foreground-muted">钱包不存在</div>;

  const cur = getCurrencyInfo(wallet?.currency || user?.defaultCurrency || "MYR");
  const balance = parseFloat(wallet?.balance || "0");
  const [from, to] = pickBrand(wallet?.currency, wallet?.type);

  // Income/expense for this wallet, last 30 days
  const last30 = useMemo(() => {
    const cut = new Date(); cut.setDate(cut.getDate() - 30);
    const txs = walletTx.filter(t => new Date(t.date) >= cut);
    const inc = txs.filter(t => t.type === "income" && t.walletId === walletId).reduce((s, t) => s + parseFloat(t.amount), 0);
    const exp = txs.filter(t => t.type === "expense" && t.walletId === walletId).reduce((s, t) => s + parseFloat(t.amount), 0);
    return { inc, exp };
  }, [walletTx, walletId]);

  const delta = sparkData.length >= 2 ? sparkData[sparkData.length - 1] - sparkData[0] : 0;
  const deltaPct = sparkData[0] !== 0 ? (delta / Math.abs(sparkData[0])) * 100 : 0;

  const fmtBig = (n: number) => isPrivacyMode ? "***" : Math.abs(n).toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtSmall = (n: number) => isPrivacyMode ? "00" : (Math.abs(n) % 1).toFixed(2).slice(2);
  const fmt2 = (n: number) => isPrivacyMode ? "***" : n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="text-foreground">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-5 md:py-7 pb-20 md:pb-10 space-y-5">

        {/* HEADER */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/wallets">
              <RoundIconButton size="sm" aria-label="返回">
                <ArrowLeft className="w-4 h-4" />
              </RoundIconButton>
            </Link>
            <h1 className="text-[18px] md:text-[22px] font-semibold m-0 truncate">
              {wallet?.name || "钱包"}
            </h1>
            {wallet?.isDefault && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/15 text-primary border border-primary/25">默认</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <RoundIconButton size="sm" onClick={togglePrivacyMode} aria-label="隐私">
              {isPrivacyMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </RoundIconButton>
            <RoundIconButton size="sm" onClick={() => setShowEdit(true)} aria-label="设置">
              <Settings className="w-4 h-4" />
            </RoundIconButton>
          </div>
        </header>

        {/* HERO */}
        <section className="hero-card">
          <div className="relative">
            <div className="flex items-center gap-3 mb-3">
              <BrandCircle label={(wallet?.currency || "RM").slice(0, 3)} from={from} to={to} size="lg" />
              <div>
                <p className="text-[11px] text-foreground/65 m-0 tracking-wider uppercase">当前余额</p>
                <p className="text-[10px] text-foreground/65 m-0">{wallet?.currency || "MYR"}</p>
              </div>
            </div>

            {walletLoading ? (
              <Skeleton className="h-12 w-56" />
            ) : (
              <p className="leading-[1.05] tracking-tight m-0 flex items-baseline">
                <span className={`text-[36px] sm:text-[44px] md:text-[52px] font-semibold ${balance < 0 ? "text-expense" : "num-gradient"}`}>
                  {balance < 0 ? "−" : ""}{cur.symbol} {fmtBig(balance)}
                </span>
                {!isPrivacyMode && <span className="text-[22px] md:text-[26px] text-foreground/55 ml-0.5">.{fmtSmall(balance)}</span>}
              </p>
            )}

            <p className={`text-[12px] mt-1.5 mb-4 flex items-center gap-1 ${deltaPct >= 0 ? "text-income" : "text-expense"}`}>
              {deltaPct >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownLeft className="w-3.5 h-3.5" />}
              <span className="font-semibold">{deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(2)}%</span>
              <span className="text-foreground/65">({chartMode === "30d" ? "30 天" : chartMode === "6m" ? "6 月" : "1 年"})</span>
              <button onClick={() => setShowCorrection(true)} className="ml-auto inline-flex items-center gap-1 text-foreground/70 hover:text-foreground transition-colors text-[11px]">
                <Pencil className="w-3 h-3" /> 校正
              </button>
            </p>
          </div>
        </section>

        {/* MINI INC/EXP */}
        <section className="grid grid-cols-2 gap-3">
          <div className="asset-card">
            <p className="text-[10px] text-foreground-muted m-0 uppercase tracking-wider">30 天收入</p>
            <p className="text-[20px] font-semibold m-0 text-income leading-tight mt-1.5">+{fmt2(last30.inc)}</p>
          </div>
          <div className="asset-card">
            <p className="text-[10px] text-foreground-muted m-0 uppercase tracking-wider">30 天支出</p>
            <p className="text-[20px] font-semibold m-0 text-expense leading-tight mt-1.5">−{fmt2(last30.exp)}</p>
          </div>
        </section>

        {/* CHART */}
        <section className="asset-card !p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[14px] font-semibold m-0">余额趋势</h3>
            <PillTabs<ChartMode>
              value={chartMode}
              onChange={setChartMode}
              options={[
                { id: "30d", label: "30 天" },
                { id: "6m",  label: "6 月" },
                { id: "1y",  label: "1 年" },
              ]}
            />
          </div>
          {txLoading ? <Skeleton className="h-32 w-full" /> : <Sparkline data={sparkData} height={120} />}
        </section>

        {/* RECENT TRANSACTIONS */}
        <section>
          <div className="section-head">
            <h3>最近交易</h3>
            <Link href={`/transactions?walletId=${walletId}`}>查看全部 →</Link>
          </div>
          {txLoading ? (
            <div className="space-y-2">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
            </div>
          ) : recent.length === 0 ? (
            <div className="asset-card text-center py-10 text-[12px] text-foreground-muted">暂无交易记录</div>
          ) : (
            <div className="activity-card">
              {recent.map((t, i) => {
                const cat = categories.find(c => c.id === t.categoryId);
                const isTransferOut = t.type === "transfer" && t.walletId === walletId;
                const isTransferIn = t.type === "transfer" && t.toWalletId === walletId;
                const tone = (t.type === "expense" || isTransferOut) ? "text-expense" : (t.type === "income" || isTransferIn) ? "text-income" : "text-foreground";
                const sign = (t.type === "expense" || isTransferOut) ? "−" : "+";
                return (
                  <div key={t.id} className={`activity-row ${i === 0 ? "is-newest" : ""}`}>
                    <BrandCircle label={(t.wallet?.currency || wallet?.currency || "RM").slice(0,3)} from={from} to={to} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium m-0 truncate">
                        {t.description || cat?.name || "未分类"}
                      </p>
                      <p className="text-[10.5px] text-foreground-muted m-0 mt-0.5">
                        {format(new Date(t.date), "M/d HH:mm")}
                      </p>
                    </div>
                    <p className={`text-[13.5px] font-mono font-medium m-0 ${tone}`}>
                      {sign}{cur.symbol} {parseFloat(isTransferIn ? (t.toWalletAmount || t.amount) : t.amount).toFixed(2)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {wallet && (
        <>
          <BalanceCorrectionModal
            open={showCorrection}
            onOpenChange={setShowCorrection}
            wallet={wallet}
            defaultCurrency={user?.defaultCurrency || "MYR"}
          />
          <WalletModal
            open={showEdit}
            onOpenChange={setShowEdit}
            wallet={wallet}
            defaultCurrency={user?.defaultCurrency || "MYR"}
          />
        </>
      )}
    </div>
  );
}
