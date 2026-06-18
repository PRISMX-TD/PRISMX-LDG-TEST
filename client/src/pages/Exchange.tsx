import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowUpDown, ArrowLeft, Key, Plus, RefreshCw, Trash2, Shield, TrendingUp,
  Coins, AlertCircle, CheckCircle2, Eye, EyeOff, Edit, Loader2,
} from "lucide-react";

/* r7 — Exchange rewritten from scratch.
   - Hero "grand total" tile with gradient orb
   - Per-credential cards as full-bleed bento with own gradient ring
   - Inline manual balance editor instead of dialog
   - Asset list with real visual hierarchy */

interface ExchangeCredential {
  id: number; exchange: string; label: string; manualBalance?: string;
  isActive: boolean; lastSyncAt: string | null; createdAt: string; apiKeyPreview: string;
}
interface BalanceItem {
  asset: string; free: string; locked: string; frozen?: string; total?: string;
  usdtValue?: string; price?: string; accountType?: string;
}
interface BalancesResponse {
  balances: BalanceItem[]; apiTotalValue: string; manualBalance: string;
  totalUsdtValue: string; lastSyncAt: string;
}
type ExchangeType = "mexc" | "pionex";

const exchangeInfo: Record<ExchangeType, { name: string; description: string; placeholder: string; manualNote: string; brand: [string, string] }> = {
  mexc: {
    name: "MEXC",
    description: "请输入您的 MEXC API Key 和 Secret 以查看账户余额。建议 API 权限仅含『读取』。",
    placeholder: "mx0v...",
    manualNote: "API 无法获取的账户余额（理财、DEX+、跟单、机器人、Alpha、法币等）",
    brand: ["#3b82f6", "#1e3a8a"],
  },
  pionex: {
    name: "派网 (Pionex)",
    description: "请输入您的派网 API Key 和 Secret 以查看账户余额。建议 API 权限仅含『读取』。",
    placeholder: "api...",
    manualNote: "API 仅能获取交易账户余额，机器人和理财账户需手动录入",
    brand: ["#fbbf24", "#d97706"],
  },
};

export default function Exchange() {
  const { toast } = useToast();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedExchange, setSelectedExchange] = useState<ExchangeType>("mexc");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [label, setLabel] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [manualBalanceInput, setManualBalanceInput] = useState("");
  const [editingManualBalanceId, setEditingManualBalanceId] = useState<number | null>(null);

  const { data: credentials = [], isLoading: isLoadingCredentials } = useQuery<ExchangeCredential[]>({
    queryKey: ["/api/exchange-credentials"],
  });

  const hasMexc = credentials.some(c => c.exchange === "mexc");
  const hasPionex = credentials.some(c => c.exchange === "pionex");

  const { data: mexcBalances, isLoading: isLoadingMexc, refetch: refetchMexc, error: mexcErr } = useQuery<BalancesResponse>({
    queryKey: ["/api/mexc/balances"], enabled: hasMexc,
    refetchInterval: 5 * 60 * 1000, refetchIntervalInBackground: false, refetchOnWindowFocus: false,
  });
  const { data: pionexBalances, isLoading: isLoadingPionex, refetch: refetchPionex, error: pionexErr } = useQuery<BalancesResponse>({
    queryKey: ["/api/pionex/balances"], enabled: hasPionex,
    refetchInterval: 5 * 60 * 1000, refetchIntervalInBackground: false, refetchOnWindowFocus: false,
  });

  const addCredentialMut = useMutation({
    mutationFn: async (data: { exchange: string; apiKey: string; apiSecret: string; label: string }) => {
      const res = await apiRequest("POST", "/api/exchange-credentials", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "API 凭证已保存", description: "正在获取账户信息..." });
      setIsAddModalOpen(false);
      setApiKey(""); setApiSecret(""); setLabel(""); setSelectedExchange("mexc");
      queryClient.invalidateQueries({ queryKey: ["/api/exchange-credentials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mexc/balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pionex/balances"] });
    },
    onError: (error: any) => {
      toast({ title: "保存失败", description: error.message || "请检查 API 凭证是否正确", variant: "destructive" });
    },
  });

  const deleteCredentialMut = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/exchange-credentials/${id}`),
    onSuccess: () => {
      toast({ title: "已删除 API 凭证" });
      queryClient.invalidateQueries({ queryKey: ["/api/exchange-credentials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mexc/balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pionex/balances"] });
    },
    onError: () => toast({ title: "删除失败", variant: "destructive" }),
  });

  const updateManualBalMut = useMutation({
    mutationFn: async ({ id, manualBalance }: { id: number; manualBalance: string }) => {
      const res = await apiRequest("PATCH", `/api/exchange-credentials/${id}/manual-balance`, { manualBalance });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "其他账户余额已更新" });
      setEditingManualBalanceId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/exchange-credentials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mexc/balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pionex/balances"] });
    },
    onError: () => toast({ title: "更新失败", variant: "destructive" }),
  });

  const handleAddCredential = () => {
    if (!apiKey.trim() || !apiSecret.trim()) {
      toast({ title: "请填写 API Key 和 Secret", variant: "destructive" });
      return;
    }
    const defaultLabel = selectedExchange === "pionex" ? "派网账户" : "MEXC 账户";
    addCredentialMut.mutate({
      exchange: selectedExchange, apiKey: apiKey.trim(), apiSecret: apiSecret.trim(),
      label: label.trim() || defaultLabel,
    });
  };

  const exName = (e: string) => e === "pionex" ? "派网" : e === "mexc" ? "MEXC" : e.toUpperCase();
  const getBal = (e: string) => e === "pionex" ? pionexBalances : e === "mexc" ? mexcBalances : null;
  const getLoad = (e: string) => e === "pionex" ? isLoadingPionex : e === "mexc" ? isLoadingMexc : false;
  const getErr = (e: string) => e === "pionex" ? pionexErr : e === "mexc" ? mexcErr : null;
  const getRefetch = (e: string) => e === "pionex" ? refetchPionex : e === "mexc" ? refetchMexc : () => {};

  const grandTotal = () => {
    let t = 0;
    if (mexcBalances) t += parseFloat(mexcBalances.totalUsdtValue || "0");
    if (pionexBalances) t += parseFloat(pionexBalances.totalUsdtValue || "0");
    return t;
  };
  const fmt = (v: string | number, d = 2) => {
    const n = typeof v === "string" ? parseFloat(v) : v;
    if (isNaN(n)) return "0.00";
    return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  const fmtCrypto = (v: string | number) => {
    const n = typeof v === "string" ? parseFloat(v) : v;
    if (isNaN(n) || n === 0) return "0";
    if (n < 0.00001) return n.toExponential(4);
    if (n < 1) return n.toFixed(8);
    if (n < 1000) return n.toFixed(4);
    return fmt(n, 2);
  };

  return (
    <div className="min-h-screen text-foreground relative">
      <div aria-hidden className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute -top-40 left-1/3 w-[520px] h-[520px] rounded-full opacity-40 blur-3xl"
             style={{ background: "radial-gradient(circle, rgba(245,158,11,0.3) 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 right-1/4 w-[420px] h-[420px] rounded-full opacity-25 blur-3xl"
             style={{ background: "radial-gradient(circle, rgba(59,130,246,0.3) 0%, transparent 70%)" }} />
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-5 md:py-8 pb-28 md:pb-12 relative space-y-5 md:space-y-6">

        {/* HEADER */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <button className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.10] hover:bg-white/[0.10] flex items-center justify-center text-foreground/70 hover:text-foreground transition-all">
                <ArrowLeft className="w-[18px] h-[18px]" />
              </button>
            </Link>
            <div>
              <p className="text-[11px] tracking-[0.2em] uppercase text-foreground/45 m-0">Exchange</p>
              <h1 className="text-[22px] md:text-[28px] font-bold tracking-tight m-0 flex items-center gap-2">
                <ArrowUpDown className="w-5 h-5 text-[#fbbf24]" />交易所账户
              </h1>
            </div>
          </div>
          <Button onClick={() => setIsAddModalOpen(true)} data-testid="button-add-exchange">
            <Plus className="w-4 h-4" />连接交易所
          </Button>
        </header>

        {/* CONTENT */}
        {isLoadingCredentials ? (
          <div className="rounded-3xl p-12 text-center bg-white/[0.025] border border-white/[0.06]">
            <Loader2 className="w-6 h-6 animate-spin text-[#fbbf24] mx-auto" />
          </div>
        ) : credentials.length === 0 ? (
          <div className="relative overflow-hidden rounded-3xl p-10 md:p-14 text-center"
               style={{
                 background: "linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(59,130,246,0.10) 100%), rgba(20,12,32,0.7)",
                 border: "1px solid rgba(255,255,255,0.08)",
                 backdropFilter: "blur(16px)",
               }}>
            <div aria-hidden className="absolute -top-20 -left-20 w-72 h-72 rounded-full opacity-40 blur-3xl"
                 style={{ background: "radial-gradient(circle, rgba(245,158,11,0.5) 0%, transparent 70%)" }} />
            <div className="relative">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[#fbbf24] via-[#f59e0b] to-[#d97706] flex items-center justify-center shadow-[0_8px_24px_-8px_rgba(245,158,11,0.6)] mb-4">
                <ArrowUpDown className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-[18px] font-bold m-0 mb-2">连接您的交易所账户</h3>
              <p className="text-[13.5px] text-foreground/65 max-w-md mx-auto mb-6 m-0">
                连接 MEXC 或派网交易所 API 以查看您的加密货币资产余额和实时估值
              </p>
              <Button onClick={() => setIsAddModalOpen(true)} data-testid="button-connect-exchange">
                <Plus className="w-4 h-4" />连接交易所
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* GRAND TOTAL HERO */}
            <section className="relative overflow-hidden rounded-3xl p-6 md:p-8"
                     style={{
                       background: "linear-gradient(135deg, rgba(245,158,11,0.18) 0%, rgba(217,119,6,0.10) 50%, rgba(20,12,32,0.7) 100%)",
                       border: "1px solid rgba(255,255,255,0.08)",
                       backdropFilter: "blur(16px)",
                     }}>
              <div aria-hidden className="absolute -top-24 -right-16 w-80 h-80 rounded-full opacity-40 blur-3xl"
                   style={{ background: "radial-gradient(circle, rgba(245,158,11,0.5) 0%, transparent 70%)" }} />
              <div className="relative flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#fbbf24] via-[#f59e0b] to-[#d97706] flex items-center justify-center shadow-[0_8px_20px_-6px_rgba(245,158,11,0.6)]">
                    <Coins className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-[10.5px] tracking-[0.2em] uppercase text-foreground/55 m-0">All exchanges</p>
                    <p className="text-[15px] font-bold m-0">交易所总资产</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10.5px] tracking-[0.2em] uppercase text-foreground/55 m-0">Total · USDT</p>
                  <p className="text-[34px] md:text-[42px] font-bold tabular-nums m-0"
                     style={{
                       background: "linear-gradient(135deg, #fbbf24 0%, #f0abfc 100%)",
                       WebkitBackgroundClip: "text",
                       WebkitTextFillColor: "transparent",
                     }}
                     data-testid="text-grand-total">
                    ${fmt(grandTotal())}
                  </p>
                </div>
              </div>
            </section>

            {/* PER-CREDENTIAL CARDS */}
            <div className="space-y-5">
              {credentials.map((credential) => {
                const balances = getBal(credential.exchange);
                const loading = getLoad(credential.exchange);
                const error = getErr(credential.exchange);
                const refetch = getRefetch(credential.exchange);
                const exchangeType = credential.exchange as ExchangeType;
                const info = exchangeInfo[exchangeType] || { brand: ["#a78bfa", "#7c3aed"], manualNote: "" };
                const [bFrom, bTo] = info.brand;

                return (
                  <div key={credential.id} className="rounded-3xl overflow-hidden relative"
                       style={{
                         background: "linear-gradient(135deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.015) 100%)",
                         border: "1px solid rgba(255,255,255,0.06)",
                       }}>
                    <div aria-hidden className="absolute top-0 left-0 right-0 h-0.5"
                         style={{ background: `linear-gradient(90deg, ${bFrom}, ${bTo})` }} />

                    {/* Card header */}
                    <div className="px-5 md:px-6 py-4 border-b border-white/[0.04]">
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-[0_6px_16px_-6px_var(--brand-glow)]"
                               style={{ background: `linear-gradient(135deg, ${bFrom}, ${bTo})`, ['--brand-glow' as any]: bFrom }}>
                            <TrendingUp className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-[15px] font-bold m-0">{credential.label}</h3>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/[0.06] border border-white/[0.10]">
                                {exName(credential.exchange)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="font-mono text-[10.5px] text-foreground/45">{credential.apiKeyPreview}</span>
                              {credential.isActive ? (
                                <span className="px-1.5 py-0.5 rounded-md text-[9.5px] font-bold bg-emerald-400/15 text-emerald-300 border border-emerald-400/20 inline-flex items-center gap-1">
                                  <CheckCircle2 className="w-2.5 h-2.5" />已连接
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded-md text-[9.5px] font-bold bg-amber-400/15 text-amber-300 border border-amber-400/20 inline-flex items-center gap-1">
                                  <AlertCircle className="w-2.5 h-2.5" />已禁用
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {balances?.totalUsdtValue && (
                            <div className="text-right mr-1">
                              <p className="text-[10px] tracking-[0.18em] uppercase text-foreground/45 m-0">资产折合</p>
                              <p className="text-[20px] font-bold m-0 tabular-nums text-amber-300">
                                ${fmt(balances.totalUsdtValue)}
                              </p>
                              <p className="text-[10px] text-foreground/45 m-0">
                                API ${fmt(balances.apiTotalValue)}
                                {parseFloat(balances.manualBalance) > 0 && <> · 其他 ${fmt(balances.manualBalance)}</>}
                              </p>
                            </div>
                          )}
                          <button onClick={() => refetch()} disabled={loading} aria-label="刷新"
                                  className="w-9 h-9 rounded-full bg-white/[0.04] border border-white/[0.10] hover:bg-white/[0.10] flex items-center justify-center text-foreground/70 hover:text-foreground transition-all disabled:opacity-50">
                            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                          </button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button aria-label="删除"
                                      className="w-9 h-9 rounded-full bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/15 flex items-center justify-center text-rose-300 transition-all">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>确定要删除此 API 连接吗?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  删除后将无法查看{exName(credential.exchange)}的资产信息, 您可以随时重新添加。
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteCredentialMut.mutate(credential.id)}>删除</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </div>

                    {/* Card body */}
                    <div className="px-5 md:px-6 py-5 space-y-3">
                      {loading ? (
                        <div className="space-y-2">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-white/[0.04] animate-pulse" />
                                <div className="w-16 h-4 rounded bg-white/[0.04] animate-pulse" />
                              </div>
                              <div className="w-24 h-4 rounded bg-white/[0.04] animate-pulse" />
                            </div>
                          ))}
                        </div>
                      ) : error ? (
                        <div className="text-center py-6">
                          <AlertCircle className="w-7 h-7 mx-auto text-rose-300 mb-2" />
                          <p className="text-[13px] m-0">获取余额失败</p>
                          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>重试</Button>
                        </div>
                      ) : balances?.balances && balances.balances.length > 0 ? (
                        <div className="space-y-1.5">
                          {balances.balances.map((balance, index) => (
                            <div key={`${balance.accountType || "spot"}-${balance.asset}-${index}`}
                                 className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-colors">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#a78bfa]/30 to-[#7c3aed]/30 border border-white/[0.08] flex items-center justify-center">
                                  <span className="text-[10.5px] font-bold">{balance.asset.substring(0, 3)}</span>
                                </div>
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-[13px] font-semibold m-0">{balance.asset}</p>
                                    {balance.accountType && (
                                      <span className="px-1.5 py-0.5 rounded-md text-[9px] font-medium bg-white/[0.05] border border-white/[0.08] text-foreground/55">
                                        {balance.accountType}
                                      </span>
                                    )}
                                  </div>
                                  {balance.price && balance.asset !== "USDT" && (
                                    <p className="text-[10.5px] text-foreground/45 m-0 mt-0.5">${fmt(balance.price, 4)}</p>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-[13px] font-mono m-0">
                                  {fmtCrypto(parseFloat(balance.free) + parseFloat(balance.locked || balance.frozen || "0"))}
                                </p>
                                {balance.usdtValue && (
                                  <p className="text-[10.5px] text-foreground/55 m-0">≈ ${fmt(balance.usdtValue)}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-6">
                          <Coins className="w-7 h-7 mx-auto text-foreground/40 mb-2" />
                          <p className="text-[13px] text-foreground/55 m-0">暂无资产</p>
                        </div>
                      )}

                      {/* Manual balance row */}
                      <div className="pt-3 mt-3 border-t border-white/[0.04]">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div>
                            <p className="text-[12.5px] font-semibold m-0 flex items-center gap-1.5">
                              <Plus className="w-3 h-3 text-[#fbbf24]" />其他账户余额
                            </p>
                            <p className="text-[10.5px] text-foreground/55 m-0 mt-0.5">{info.manualNote}</p>
                          </div>
                          {editingManualBalanceId === credential.id ? (
                            <div className="flex items-center gap-2">
                              <Input type="number" placeholder="0.00"
                                     value={manualBalanceInput}
                                     onChange={(e) => setManualBalanceInput(e.target.value)}
                                     className="w-32 h-9" data-testid="input-manual-balance" />
                              <Button size="sm" onClick={() => updateManualBalMut.mutate({ id: credential.id, manualBalance: manualBalanceInput || "0" })}
                                      disabled={updateManualBalMut.isPending} data-testid="button-save-manual-balance">保存</Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingManualBalanceId(null)}>取消</Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold tabular-nums">${fmt(credential.manualBalance || "0")}</span>
                              <button onClick={() => { setManualBalanceInput(credential.manualBalance || "0"); setEditingManualBalanceId(credential.id); }}
                                      aria-label="编辑"
                                      className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.10] flex items-center justify-center text-foreground/65 hover:text-foreground transition-all"
                                      data-testid="button-edit-manual-balance">
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* SECURITY NOTE */}
        <div className="rounded-2xl p-5 bg-white/[0.025] border border-white/[0.06]">
          <h4 className="text-[13.5px] font-bold m-0 mb-2 flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#a78bfa]" />安全提示
          </h4>
          <ul className="space-y-1 text-[11.5px] text-foreground/55 m-0 pl-1">
            <li>· 请仅创建具有「读取」权限的 API Key, 不要开启交易权限</li>
            <li>· 您的 API 凭证使用 AES-256 加密存储, 只有您可以访问</li>
            <li>· 本应用仅用于查看余额, 不会执行任何交易操作</li>
            <li>· 建议定期更换 API Key 以确保账户安全</li>
          </ul>
        </div>

        {/* ADD CRED DIALOG */}
        <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Key className="w-4 h-4 text-[#a78bfa]" />连接 {exchangeInfo[selectedExchange].name}
              </DialogTitle>
              <DialogDescription>{exchangeInfo[selectedExchange].description}</DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label>选择交易所</Label>
                <div className="flex gap-2">
                  <Button variant={selectedExchange === "mexc" ? "default" : "outline"} size="sm"
                          onClick={() => setSelectedExchange("mexc")} disabled={hasMexc} data-testid="button-select-mexc">
                    MEXC{hasMexc && " (已连接)"}
                  </Button>
                  <Button variant={selectedExchange === "pionex" ? "default" : "outline"} size="sm"
                          onClick={() => setSelectedExchange("pionex")} disabled={hasPionex} data-testid="button-select-pionex">
                    派网{hasPionex && " (已连接)"}
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="label">账户标签 (可选)</Label>
                <Input id="label" placeholder={`我的${exchangeInfo[selectedExchange].name}账户`}
                       value={label} onChange={(e) => setLabel(e.target.value)} data-testid="input-exchange-label" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="apiKey">API Key</Label>
                <Input id="apiKey" placeholder={exchangeInfo[selectedExchange].placeholder}
                       value={apiKey} onChange={(e) => setApiKey(e.target.value)} data-testid="input-api-key" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="apiSecret">API Secret</Label>
                <div className="relative">
                  <Input id="apiSecret" type={showSecret ? "text" : "password"}
                         placeholder="输入 API Secret" value={apiSecret}
                         onChange={(e) => setApiSecret(e.target.value)}
                         className="pr-10" data-testid="input-api-secret" />
                  <button type="button" onClick={() => setShowSecret(!showSecret)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-foreground/55 hover:text-foreground"
                          data-testid="button-toggle-secret">
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="rounded-xl p-3 bg-amber-400/8 border border-amber-400/20 flex items-start gap-2">
                <Shield className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                <p className="text-[11px] text-foreground/65 m-0">您的 API 凭证将被加密存储, 仅用于读取账户余额。建议创建仅含「读取」权限的 API Key。</p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddModalOpen(false)} data-testid="button-cancel-add">取消</Button>
              <Button onClick={handleAddCredential}
                      disabled={addCredentialMut.isPending || (selectedExchange === "mexc" && hasMexc) || (selectedExchange === "pionex" && hasPionex)}
                      data-testid="button-save-exchange">
                {addCredentialMut.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />验证中</> : "保存并验证"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
