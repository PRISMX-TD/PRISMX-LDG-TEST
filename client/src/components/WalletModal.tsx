import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getSessionToken } from "@/lib/neonAuth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { supportedCurrencies, type Wallet } from "@shared/schema";
import {
  Loader2, Trash2, ArrowRightLeft, Wallet as WalletIcon,
  Banknote, CreditCard, Smartphone, TrendingUp, Coins, Check, Archive,
} from "lucide-react";

/* r7 — WalletModal rewritten from scratch.
   - Hero live preview card with color gradient
   - Visual wallet type picker (gradient tiles with icons)
   - Color swatches with check + glow
   - Switch row styled as warm web3 row card
   - Delete + Archive dialogs use custom radio cards */

const WALLET_TYPES = [
  { value: "cash", label: "现金", icon: Banknote },
  { value: "bank_card", label: "银行卡", icon: CreditCard },
  { value: "digital_wallet", label: "数字钱包", icon: Smartphone },
  { value: "credit_card", label: "信用卡", icon: CreditCard },
  { value: "investment", label: "投资", icon: TrendingUp },
];

const WALLET_COLORS = [
  "#a78bfa", "#f0abfc", "#fbbf24", "#34d399",
  "#60a5fa", "#f87171", "#fb923c", "#22d3ee",
  "#c084fc", "#10b981",
];

interface WalletFormData {
  name: string; type: string; currency: string; color: string;
  exchangeRateToDefault: string; isFlexible: boolean;
}

interface WalletModalProps {
  open: boolean; onOpenChange: (open: boolean) => void;
  wallet?: Wallet | null; defaultCurrency?: string;
}

export function WalletModal({ open, onOpenChange, wallet, defaultCurrency = "MYR" }: WalletModalProps) {
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteWithTransactions, setDeleteWithTransactions] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [archiveAction, setArchiveAction] = useState<"transfer" | "destroy">("transfer");
  const [archiveTargetId, setArchiveTargetId] = useState<string>("");
  const [archiveRate, setArchiveRate] = useState<string>("");
  const isEditing = !!wallet;
  const { data: allWallets = [] } = useQuery<Wallet[]>({ queryKey: ["/api/wallets"] });

  const form = useForm<WalletFormData>({
    defaultValues: {
      name: "", type: "cash", currency: defaultCurrency, color: WALLET_COLORS[0],
      exchangeRateToDefault: "1", isFlexible: true,
    },
  });

  const watchedCurrency = form.watch("currency");
  const watchedColor = form.watch("color");
  const watchedType = form.watch("type");
  const watchedName = form.watch("name");
  const showExchangeRate = watchedCurrency !== defaultCurrency;
  const [isLoadingRate, setIsLoadingRate] = useState(false);

  useEffect(() => {
    if (wallet) {
      form.reset({
        name: wallet.name,
        type: wallet.type || "cash",
        currency: wallet.currency || defaultCurrency,
        color: wallet.color || WALLET_COLORS[0],
        exchangeRateToDefault: wallet.exchangeRateToDefault || "1",
        isFlexible: wallet.isFlexible !== false,
      });
    } else {
      form.reset({
        name: "", type: "cash", currency: defaultCurrency,
        color: WALLET_COLORS[0], exchangeRateToDefault: "1", isFlexible: true,
      });
    }
  }, [wallet, defaultCurrency, form]);

  useEffect(() => {
    let cancelled = false; let retryTimeout: any;
    const fetchRate = async (retry = 0) => {
      if (!showExchangeRate || !watchedCurrency) {
        if (!isEditing) form.setValue("exchangeRateToDefault", "1");
        return;
      }
      if (isEditing && wallet?.currency === watchedCurrency) return;
      setIsLoadingRate(true);
      try {
        const headers: Record<string, string> = {};
        const token = getSessionToken();
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const r = await fetch(`/api/exchange-rate?from=${watchedCurrency}&to=${defaultCurrency}`, { headers, credentials: "include" });
        if (cancelled) return;
        if (r.ok) {
          const data = await r.json();
          if (data.rate) { form.setValue("exchangeRateToDefault", data.rate.toString()); setIsLoadingRate(false); return; }
        }
        throw new Error("Failed");
      } catch {
        if (cancelled) return;
        retryTimeout = setTimeout(() => { if (!cancelled) fetchRate(retry + 1); }, 2000);
      }
    };
    const timer = setTimeout(() => fetchRate(), 500);
    return () => { cancelled = true; clearTimeout(timer); clearTimeout(retryTimeout); setIsLoadingRate(false); };
  }, [watchedCurrency, defaultCurrency, showExchangeRate, isEditing, wallet, form]);

  const createMutation = useMutation({
    mutationFn: async (data: WalletFormData) => apiRequest("POST", "/api/wallets", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/wallets"] }); toast({ title: "钱包已创建" }); onOpenChange(false); form.reset(); },
    onError: (error: any) => toast({ title: "创建失败", description: error.message || "请稍后重试", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async (data: WalletFormData) => apiRequest("PATCH", `/api/wallets/${wallet!.id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/wallets"] }); toast({ title: "钱包已更新" }); onOpenChange(false); },
    onError: (error: any) => toast({ title: "更新失败", description: error.message || "请稍后重试", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (withTx: boolean) => {
      const url = withTx ? `/api/wallets/${wallet!.id}?deleteTransactions=true` : `/api/wallets/${wallet!.id}`;
      return apiRequest("DELETE", url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      toast({ title: "钱包已删除" });
      setShowDeleteDialog(false); setDeleteWithTransactions(false); onOpenChange(false);
    },
    onError: (error: any) => { toast({ title: "删除失败", description: error.message || "无法删除最后一个钱包", variant: "destructive" }); setShowDeleteDialog(false); },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async () => apiRequest("PATCH", `/api/wallets/${wallet!.id}`, { isDefault: true }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/wallets"] }); toast({ title: "已设为默认钱包" }); },
    onError: (error: any) => toast({ title: "设置失败", description: error.message || "请稍后重试", variant: "destructive" }),
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      if (!wallet) return Promise.resolve();
      const body: any = { action: archiveAction };
      if (archiveAction === "transfer") {
        body.targetWalletId = parseInt(archiveTargetId);
        const target = allWallets.find(w => String(w.id) === archiveTargetId);
        if (target && (wallet.currency || defaultCurrency) !== (target.currency || defaultCurrency)) body.rate = parseFloat(archiveRate);
      }
      return apiRequest("POST", `/api/wallets/${wallet!.id}/archive`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      setShowArchiveDialog(false); onOpenChange(false);
      setArchiveAction("transfer"); setArchiveTargetId(""); setArchiveRate("");
      toast({ title: "钱包已归档" });
    },
    onError: (error: any) => toast({ title: "归档失败", description: error.message || "请检查目标钱包与汇率", variant: "destructive" }),
  });

  const onSubmit = (data: WalletFormData) => {
    if (isEditing) updateMutation.mutate(data);
    else createMutation.mutate(data);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[88vh] overflow-y-auto custom-scroll" data-testid="modal-wallet">
          <DialogHeader>
            <DialogTitle>{isEditing ? "编辑钱包" : "新建钱包"}</DialogTitle>
          </DialogHeader>

          {/* Live preview hero */}
          <div className="rounded-2xl p-4 relative overflow-hidden"
               style={{
                 background: `linear-gradient(135deg, ${watchedColor}33 0%, ${watchedColor}11 100%), rgba(20,12,32,0.7)`,
                 border: `1px solid ${watchedColor}33`,
               }}>
            <div aria-hidden className="absolute -top-12 -right-10 w-32 h-32 rounded-full opacity-50 blur-3xl"
                 style={{ background: `radial-gradient(circle, ${watchedColor}66 0%, transparent 70%)` }} />
            <div className="relative flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-[11px] font-bold tracking-wide"
                   style={{ background: `linear-gradient(135deg, ${watchedColor}, ${watchedColor}cc)`, boxShadow: `0 8px 20px -6px ${watchedColor}` }}>
                {(watchedCurrency || "RM").slice(0, 3)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold m-0 truncate">{watchedName || "新钱包"}</p>
                <p className="text-[10.5px] tracking-[0.18em] uppercase text-foreground/55 m-0 mt-0.5">
                  {WALLET_TYPES.find(t => t.value === watchedType)?.label} · {watchedCurrency}
                </p>
              </div>
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                rules={{ required: "请输入钱包名称" }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>名称</FormLabel>
                    <FormControl><Input placeholder="输入钱包名称" {...field} data-testid="input-wallet-name" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>类型</FormLabel>
                    <div className="grid grid-cols-5 gap-1.5">
                      {WALLET_TYPES.map(({ value, label, icon: Icon }) => {
                        const active = field.value === value;
                        return (
                          <button key={value} type="button" onClick={() => field.onChange(value)}
                                  data-testid={`type-${value}`} aria-label={label}
                                  className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all ${
                                    active ? "border" : "bg-white/[0.04] border border-white/[0.06] text-foreground/55 hover:bg-white/[0.08]"
                                  }`}
                                  style={active ? { background: `${watchedColor}22`, borderColor: `${watchedColor}55`, color: watchedColor } : {}}>
                            <Icon className="w-4 h-4" />
                            <span className="text-[9.5px] font-medium">{label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>货币</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger data-testid="select-wallet-currency"><SelectValue placeholder="选择货币" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {supportedCurrencies.map(c => (
                          <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code} — {c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {showExchangeRate && (
                <FormField
                  control={form.control}
                  name="exchangeRateToDefault"
                  rules={{
                    required: "请输入汇率",
                    validate: (v) => { const r = parseFloat(v); if (isNaN(r) || r <= 0) return "汇率必须为正数"; return true; },
                  }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        汇率 (1 {watchedCurrency} = ? {defaultCurrency})
                        {isLoadingRate && <Loader2 className="h-3 w-3 animate-spin text-[#a78bfa]" />}
                      </FormLabel>
                      <FormControl>
                        <Input type="number" step="0.0000001" min="0.0000001" placeholder="输入汇率" {...field} data-testid="input-exchange-rate" />
                      </FormControl>
                      <p className="text-[10.5px] text-foreground/45 m-0">用于计算总资产时转换为默认货币</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>颜色</FormLabel>
                    <div className="grid grid-cols-5 gap-2">
                      {WALLET_COLORS.map(c => {
                        const active = field.value === c;
                        return (
                          <button key={c} type="button" onClick={() => field.onChange(c)}
                                  aria-label={`颜色 ${c}`} data-testid={`button-color-${c.replace("#", "")}`}
                                  className="aspect-square rounded-xl relative transition-all hover:scale-105"
                                  style={{
                                    background: c,
                                    boxShadow: active ? `0 8px 20px -6px ${c}, 0 0 0 2px rgba(0,0,0,0.5), 0 0 0 4px ${c}88` : `0 4px 12px -4px ${c}66`,
                                  }}>
                            {active && <Check className="absolute inset-0 m-auto w-4 h-4 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" strokeWidth={3} />}
                          </button>
                        );
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isFlexible"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-2xl p-3 bg-white/[0.03] border border-white/[0.06]">
                    <div className="min-w-0 flex-1">
                      <FormLabel className="text-[12.5px] font-semibold">可灵活调用资金</FormLabel>
                      <p className="text-[10.5px] text-foreground/50 m-0 mt-0.5">打开：日常可花的活钱。关闭：长期/应急储蓄，会计入应急金、不作日常花销</p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-flexible" />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter className="!justify-start flex-wrap gap-2 pt-1">
                {isEditing && (
                  <>
                    <Button type="button" variant="outline" size="icon"
                            className="text-rose-300 hover:bg-rose-500/10 border-rose-500/20"
                            onClick={() => setShowDeleteDialog(true)}
                            disabled={wallet?.isDefault === true} data-testid="button-delete-wallet">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setShowArchiveDialog(true)} disabled={wallet?.isDefault === true}>
                      <Archive className="w-4 h-4" />归档
                    </Button>
                    {!wallet?.isDefault && (
                      <Button type="button" variant="outline" onClick={() => setDefaultMutation.mutate()} disabled={setDefaultMutation.isPending} data-testid="button-set-default">
                        设为默认
                      </Button>
                    )}
                  </>
                )}
                <div className="flex-1" />
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
                <Button type="submit" disabled={isPending} data-testid="button-submit-wallet">
                  {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isEditing ? "保存" : "创建"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* DELETE confirm */}
      <AlertDialog open={showDeleteDialog} onOpenChange={(o) => { setShowDeleteDialog(o); if (!o) setDeleteWithTransactions(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除钱包</AlertDialogTitle>
            <AlertDialogDescription>请选择删除方式</AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 py-1">
            <RadioCard
              active={!deleteWithTransactions}
              onClick={() => setDeleteWithTransactions(false)}
              title="仅删除钱包"
              desc="保留该钱包的所有交易记录, 交易将不再关联任何钱包"
              accent="#a78bfa"
              testid="option-delete-wallet-only"
            />
            <RadioCard
              active={deleteWithTransactions}
              onClick={() => setDeleteWithTransactions(true)}
              title="删除钱包及所有交易"
              desc="同时删除该钱包的所有交易记录, 此操作无法撤销"
              accent="#f87171"
              danger
              testid="option-delete-with-transactions"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(deleteWithTransactions)}
              className="bg-gradient-to-br from-rose-400 to-rose-600 text-white border-0"
              data-testid="button-confirm-delete">
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ARCHIVE */}
      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>归档钱包</AlertDialogTitle>
            <AlertDialogDescription>
              归档后该钱包将从列表隐藏。当前余额 {wallet ? parseFloat(wallet.balance || "0").toFixed(2) : "0.00"} {wallet?.currency}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <RadioCard
              active={archiveAction === "transfer"}
              onClick={() => setArchiveAction("transfer")}
              title="转入其他钱包"
              desc="余额转移到指定钱包, 生成转账记录"
              accent="#a78bfa"
              titleIcon={<ArrowRightLeft className="w-3.5 h-3.5" />}
              extra={
                archiveAction === "transfer" && (
                  <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
                    <Select value={archiveTargetId} onValueChange={setArchiveTargetId}>
                      <SelectTrigger><SelectValue placeholder="选择目标钱包" /></SelectTrigger>
                      <SelectContent>
                        {allWallets.filter(w => !wallet || w.id !== wallet.id).map(w => (
                          <SelectItem key={w.id} value={String(w.id)}>{w.name} ({w.currency})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(() => {
                      const target = allWallets.find(w => String(w.id) === archiveTargetId);
                      return wallet && target && wallet.currency !== target.currency;
                    })() && (
                      <Input placeholder="跨币种汇率 (源 → 目标)" value={archiveRate} onChange={(e) => setArchiveRate(e.target.value)} />
                    )}
                  </div>
                )
              }
            />
            <RadioCard
              active={archiveAction === "destroy"}
              onClick={() => setArchiveAction("destroy")}
              title="销毁余额"
              desc="将余额清零, 不生成交易记录"
              accent="#f87171"
              danger
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => archiveMutation.mutate()}>
              {archiveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "确认归档"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function RadioCard({ active, onClick, title, desc, accent, danger, extra, testid, titleIcon }: {
  active: boolean; onClick: () => void; title: string; desc: string;
  accent: string; danger?: boolean; extra?: React.ReactNode; testid?: string;
  titleIcon?: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} data-testid={testid}
            aria-pressed={active}
            className={`group w-full text-left rounded-2xl p-3 transition-all border ${
              active ? "shadow-[0_6px_16px_-6px_var(--g)]" : "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.14]"
            }`}
            style={active ? { background: `linear-gradient(135deg, ${accent}22 0%, ${accent}11 100%)`, borderColor: `${accent}44`, ["--g" as any]: `${accent}55` } : {}}>
      <div className="flex items-start gap-3">
        <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5"
             style={{
               borderColor: active ? accent : "rgba(255,255,255,0.20)",
               background: active ? `${accent}33` : "transparent",
             }}>
          {active && <div className="w-2 h-2 rounded-full" style={{ background: accent }} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {titleIcon}
            <p className={`text-[13px] font-bold m-0 ${danger ? "text-rose-300" : ""}`}>{title}</p>
          </div>
          <p className="text-[11px] text-foreground/55 m-0 mt-0.5">{desc}</p>
          {extra}
        </div>
      </div>
    </button>
  );
}
