import { WalletModal } from "@/components/WalletModal";
import { TransactionModal } from "@/components/TransactionModal";
import { EmptyState } from "@/components/EmptyState";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import {
  Wallet, Plus, Eye, EyeOff, ArrowLeft, Loader2,
  Banknote, CreditCard, Smartphone, TrendingUp,
  MoreVertical, Pencil, Trash2, Star,
ArrowDownLeft, ArrowUpRight,
} from "lucide-react";
import { walletTypeLabels, getCurrencyInfo } from "@shared/schema";
import type { Wallet as WalletType, UserWalletPreferences, Category, SubLedger } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { usePrivacyMode } from "@/hooks/usePrivacyMode";
import { BrandCircle, pickBrand } from "@/components/ds/BrandCircle";
import { Sparkline } from "@/components/ds/Sparkline";
import { PillButton } from "@/components/ds/PillButton";
import { RoundIconButton } from "@/components/ds/RoundIconButton";
import { PillTabs } from "@/components/ds/PillTabs";
import { ToastAction } from "@/components/ui/toast";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const walletTypeIcons: Record<string, typeof Wallet> = {
  cash: Banknote, bank_card: CreditCard, digital_wallet: Smartphone, credit_card: CreditCard, investment: TrendingUp,
};

type TypeFilter = "all" | "cash" | "bank_card" | "digital_wallet" | "credit_card" | "investment";

export default function Wallets() {
  const { user } = useAuth();
  const defaultCurrency = user?.defaultCurrency || "MYR";
  const cur = getCurrencyInfo(defaultCurrency);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { isPrivacyMode, togglePrivacyMode } = usePrivacyMode();
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [isTxOpen, setIsTxOpen] = useState(false);
  const [selected, setSelected] = useState<WalletType | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const { data: wallets = [], isLoading } = useQuery<WalletType[]>({ queryKey: ["/api/wallets"] });
  const { data: categories = [] } = useQuery<Category[]>({ queryKey: ["/api/categories"] });
  const { data: subLedgers = [] } = useQuery<SubLedger[]>({ queryKey: ["/api/sub-ledgers"] });
  const { data: transactions = [] } = useQuery<any[]>({ queryKey: ["/api/transactions", { limit: 200 }] });

  const setDefaultMut = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/wallets/${id}`, { isDefault: true }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/wallets"] }); toast({ title: "已设为默认" }); },
    onError: () => toast({ title: "设置失败", variant: "destructive" }),
  });
  // "Delete" a wallet = archive it (soft delete). Transactions are preserved and stay
  // viewable in history; undo simply un-archives the wallet (no duplicate is created).
  async function deleteWithUndo(w: WalletType) {
    try {
      await apiRequest("DELETE", `/api/wallets/${w.id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
    } catch (err: any) {
      toast({ title: "删除失败", description: err?.message || "请稍后重试", variant: "destructive" });
      return;
    }
    toast({
      title: `已删除 "${w.name}"`,
      description: "关联交易已保留 · 30 秒内可撤销",
      duration: 30_000,
      action: (
        <ToastAction altText="撤销" onClick={() => {
          void (async () => {
            try {
              await apiRequest("PATCH", `/api/wallets/${w.id}`, { isArchived: false });
              queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
              toast({ title: "已撤销" });
            } catch (e: any) {
              toast({ title: "撤销失败", description: e?.message, variant: "destructive" });
            }
          })();
        }}>撤销</ToastAction>
      ),
    });
  }

  const visible = wallets.filter(w => !(w as any).isArchived);
  const filtered = useMemo(() => typeFilter === "all" ? visible : visible.filter(w => w.type === typeFilter), [visible, typeFilter]);

  const totalInDefault = useMemo(() => visible.reduce((s, w) => {
    const b = parseFloat(w.balance || "0");
    const r = parseFloat(w.exchangeRateToDefault || "1");
    return s + b * (isNaN(r) || r <= 0 ? 1 : r);
  }, 0), [visible]);

  // r7 wallet card stats — actual money flow + activity instead of noisy spark/%.
  const monthStart = useMemo(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime();
  }, []);
  const walletStats = (walletId: number) => {
    let monthIn = 0, monthOut = 0, monthCount = 0;
    let lastActivityMs = 0;
    for (const t of transactions || []) {
      const involved = t.walletId === walletId || t.toWalletId === walletId;
      if (!involved) continue;
      const tm = new Date(t.date).getTime();
      if (tm > lastActivityMs) lastActivityMs = tm;
      if (tm < monthStart) continue;
      const amt = parseFloat(t.amount);
      monthCount += 1;
      if (t.type === "income" && t.walletId === walletId) monthIn += amt;
      else if (t.type === "expense" && t.walletId === walletId) monthOut += amt;
      else if (t.type === "transfer") {
        if (t.walletId === walletId) monthOut += amt;
        if (t.toWalletId === walletId) monthIn += parseFloat(t.toWalletAmount || t.amount);
      }
    }
    return { monthIn, monthOut, monthCount, lastActivityMs };
  };
  const relTime = (ms: number) => {
    if (!ms) return "暂无活动";
    const diff = Date.now() - ms;
    const m = Math.floor(diff / 60000);
    if (m < 60) return m <= 1 ? "刚刚" : `${m} 分钟前`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} 小时前`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d} 天前`;
    const mo = Math.floor(d / 30);
    if (mo < 12) return `${mo} 月前`;
    return `${Math.floor(mo / 12)} 年前`;
  };

  const typeCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const w of visible) map[w.type || "other"] = (map[w.type || "other"] || 0) + 1;
    return map;
  }, [visible]);

  const fmt = (n: number) => isPrivacyMode ? "***" : n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtBig = (n: number) => isPrivacyMode ? "***" : n.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtSmall = (n: number) => isPrivacyMode ? "00" : (n % 1).toFixed(2).slice(2);

  if (!user) return null;

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
              <Wallet className="w-5 h-5 text-primary" /> 钱包
            </h1>
          </div>
          <RoundIconButton size="sm" onClick={togglePrivacyMode} aria-label="隐私">
            {isPrivacyMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </RoundIconButton>
        </header>

        {/* ============ HERO TOTAL ============ */}
        <section className="hero-card">
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] text-foreground/70 m-0 tracking-wider uppercase">总资产</p>
              <span className="text-[11px] text-foreground/65">{visible.length} 个钱包</span>
            </div>
            <p className="leading-[1.05] tracking-tight m-0 flex items-baseline">
              <span className="text-[36px] sm:text-[44px] md:text-[52px] font-semibold num-gradient">
                {cur.symbol} {fmtBig(totalInDefault)}
              </span>
              {!isPrivacyMode && <span className="text-[22px] md:text-[26px] text-foreground/55 ml-0.5">.{fmtSmall(totalInDefault)}</span>}
            </p>
            <div className="flex items-center gap-2.5 mt-5">
              <PillButton
                className="flex-1 h-12"
                leftIcon={<Plus className="w-5 h-5" />}
                onClick={() => { setSelected(null); setIsWalletOpen(true); }}
              >
                添加钱包
              </PillButton>
            </div>
          </div>
        </section>

        {/* ============ TYPE FILTER PILLS ============ */}
        <PillTabs<TypeFilter>
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { id: "all",            label: `全部 ${visible.length}` },
            { id: "cash",           label: `现金 ${typeCounts.cash || 0}` },
            { id: "bank_card",      label: `银行 ${typeCounts.bank_card || 0}` },
            { id: "digital_wallet", label: `数字 ${typeCounts.digital_wallet || 0}` },
            { id: "credit_card",    label: `信用 ${typeCounts.credit_card || 0}` },
            { id: "investment",     label: `投资 ${typeCounts.investment || 0}` },
          ]}
        />

        {/* ============ WALLETS GRID ============ */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[1,2,3,4,5,6].map(i => <div key={i} className="asset-card h-40 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="asset-card text-center py-16">
            <Wallet className="w-10 h-10 mx-auto text-foreground-muted mb-3" />
            <p className="text-sm font-medium">{visible.length === 0 ? "还没有钱包" : "该类型下没有钱包"}</p>
            <p className="text-xs text-foreground-muted mt-1">点上面 + 添加</p>
          </div>
        ) : (
          <div className="space-y-7">
            {(() => {
              // r7 — Group filtered wallets by type, render each group as a labelled bento row
              const typeOrder = ["cash", "bank_card", "digital_wallet", "credit_card", "investment"];
              const groups = typeOrder
                .map(t => ({ type: t, items: filtered.filter(w => w.type === t) }))
                .filter(g => g.items.length > 0);
              // Add an "other" bucket for any unexpected type
              const knownTypes = new Set(typeOrder);
              const otherItems = filtered.filter(w => !knownTypes.has(w.type));
              if (otherItems.length > 0) groups.push({ type: "other", items: otherItems });

              return groups.map(({ type, items }) => {
                const groupLabel = walletTypeLabels[type] || "其他";
                const groupSubtotal = items.reduce((sum, w) => {
                  const rate = parseFloat(w.exchangeRateToDefault || "1") || 1;
                  return sum + parseFloat(w.balance || "0") * rate;
                }, 0);
                return (
                  <section key={type}>
                    <div className="flex items-baseline justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[14.5px] font-bold tracking-tight m-0">{groupLabel}</h3>
                        <span className="text-[11px] text-foreground-muted">{items.length} 个</span>
                      </div>
                      <p className="text-[12.5px] font-mono text-foreground-muted">
                        {cur.symbol} {groupSubtotal.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {items.map(w => {
                        const [from, to] = pickBrand(w.currency, w.type);
                        const bal = parseFloat(w.balance || "0");
                        const rate = parseFloat(w.exchangeRateToDefault || "1") || 1;
                        const balInDefault = bal * rate;
                        const sharePct = totalInDefault > 0 ? (balInDefault / totalInDefault) * 100 : 0;
                        const stats = walletStats(w.id);
                        const isDiffCur = (w.currency || "MYR") !== defaultCurrency;
                        const fmtMoney = (n: number) => n.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                        return (
                          <div
                            key={w.id}
                            onClick={() => navigate(`/wallets/${w.id}`)}
                            className="group relative overflow-hidden rounded-2xl cursor-pointer transition-all hover:-translate-y-0.5"
                            style={{
                              background: "rgba(255,255,255,0.025)",
                              border: "1px solid rgba(255,255,255,0.06)",
                            }}
                          >
                            {/* tiny brand-colored corner orb — visible at ~12% opacity, never loud */}
                            <div aria-hidden className="absolute -top-10 -right-10 w-28 h-28 rounded-full opacity-[0.08] group-hover:opacity-[0.18] blur-3xl transition-opacity pointer-events-none"
                                 style={{ background: `radial-gradient(circle, ${from}, transparent 70%)` }} />
                            {/* slim brand accent stripe on the left edge */}
                            <div aria-hidden className="absolute top-3 bottom-3 left-0 w-[3px] rounded-r-full opacity-80"
                                 style={{ background: `linear-gradient(180deg, ${from}, ${to})` }} />

                            {/* menu (top-right) */}
                            <div className="absolute top-2.5 right-2.5 z-10" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="w-7 h-7 rounded-full bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.10] flex items-center justify-center text-foreground/55 hover:text-foreground transition-all" aria-label="菜单">
                                    <MoreVertical className="w-3.5 h-3.5" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                  <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setSelected(w); setIsWalletOpen(true); }}>
                                    <Pencil className="w-4 h-4 mr-2" /> 编辑
                                  </DropdownMenuItem>
                                  {!w.isDefault && (
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setDefaultMut.mutate(w.id); }}>
                                      <Star className="w-4 h-4 mr-2" /> 设为默认
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onSelect={(e) => { e.preventDefault(); if (confirm(`删除 "${w.name}"？钱包将被归档，关联交易会完整保留（30 秒可撤销）`)) deleteWithUndo(w); }}
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" /> 删除
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>

                            {/* card body — 3 zones: identity / balance+share / monthly activity */}
                            <div className="relative">

                              {/* ZONE 1 — Identity strip */}
                              <div className="flex items-center gap-3 px-4 pt-4 pb-3 pr-12">
                                <div
                                  className="w-11 h-11 rounded-2xl flex items-center justify-center text-white text-[10.5px] font-bold tracking-wider shrink-0"
                                  style={{
                                    background: `linear-gradient(135deg, ${from}, ${to})`,
                                    boxShadow: `0 8px 20px -10px ${from}`,
                                  }}
                                >
                                  {(w.currency || "MYR").slice(0, 3)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[14.5px] font-semibold leading-tight m-0 truncate">{w.name}</p>
                                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                    <span className="text-[10.5px] text-foreground/55">{walletTypeLabels[w.type] || w.type}</span>
                                    {w.isDefault && (
                                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md">
                                        <Star className="w-2.5 h-2.5 fill-current" />默认
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* ZONE 2 — Balance + share + cross-currency */}
                              <div className="px-4 pb-3">
                                <p className="text-[28px] font-bold tracking-tight tabular-nums leading-none m-0">
                                  {fmt(bal)}
                                  <span className="text-[12px] font-semibold text-foreground/45 ml-1.5 align-middle">{w.currency || "MYR"}</span>
                                </p>
                                <div className="flex items-center gap-2 mt-2 text-[11px] text-foreground/55 flex-wrap">
                                  <span className="inline-flex items-center gap-1">
                                    <span className="w-1 h-1 rounded-full bg-[#a78bfa]" />
                                    {sharePct.toFixed(1)}% 总资产
                                  </span>
                                  {isDiffCur && (
                                    <>
                                      <span className="text-foreground/30">·</span>
                                      <span>≈ {cur.symbol}{balInDefault.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* ZONE 3 — Monthly activity */}
                              <div className="border-t border-white/[0.04] px-4 py-2.5">
                                {stats.monthCount > 0 ? (
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 text-[11px] tabular-nums">
                                      <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                                        <ArrowDownLeft className="w-3 h-3" />{fmtMoney(stats.monthIn)}
                                      </span>
                                      <span className="text-foreground/25">·</span>
                                      <span className="inline-flex items-center gap-1 text-rose-400 font-semibold">
                                        <ArrowUpRight className="w-3 h-3" />{fmtMoney(stats.monthOut)}
                                      </span>
                                    </div>
                                    <span className="text-[10.5px] text-foreground/50">
                                      {stats.monthCount} 笔 · {relTime(stats.lastActivityMs)}
                                    </span>
                                  </div>
                                ) : (
                                  <p className="text-[10.5px] text-foreground/45 m-0 text-center">本月暂无活动</p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              });
            })()}

            {/* ADD WALLET — full-width dashed plate */}
            <button
              type="button"
              onClick={() => { setSelected(null); setIsWalletOpen(true); }}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border border-dashed border-white/[0.18] bg-white/[0.025] hover:bg-white/[0.05] hover:border-white/[0.30] transition-all text-foreground/65 hover:text-foreground"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#a78bfa] to-[#7c3aed] flex items-center justify-center shadow-[0_4px_12px_-2px_rgba(124,58,237,0.5)]">
                <Plus className="w-4 h-4 text-white" />
              </div>
              <span className="text-[13px] font-semibold">添加新钱包</span>
            </button>
          </div>
        )}
      </div>

      <FloatingActionButton onClick={() => setIsTxOpen(true)} />

      <WalletModal
        open={isWalletOpen}
        onOpenChange={setIsWalletOpen}
        wallet={selected}
        defaultCurrency={defaultCurrency}
      />
      <TransactionModal
        open={isTxOpen}
        onOpenChange={setIsTxOpen}
        wallets={wallets}
        categories={categories}
        subLedgers={subLedgers}
        defaultCurrency={defaultCurrency}
      />
    </div>
  );
}
