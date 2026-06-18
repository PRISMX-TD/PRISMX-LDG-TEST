import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getCurrencyInfo, type Wallet, type Category } from "@shared/schema";
import { Loader2, Receipt, EyeOff, Check, ArrowDown, ArrowUp } from "lucide-react";

/* r7 — BalanceCorrectionModal rewritten from scratch.
   - Big hero number for difference with directional chip
   - Custom radio cards instead of shadcn radio group, with gradient active state
   - Inherits new ui/dialog chrome */

type UiCorrectionChoice = "with_transaction" | "silent";
type ServerCorrectionMethod = "adjust_income_expense" | "adjust_transfer" | "change_current_balance" | "set_initial_balance";

interface BalanceCorrectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallet: Wallet;
  defaultCurrency: string;
}

const CHOICES = [
  {
    value: "with_transaction" as const,
    title: "差额补记收支",
    desc: "自动生成『其他』分类的收入/支出交易, 计入收支统计与预算",
    icon: Receipt,
    accent: "#a78bfa",
    note: "影响统计",
  },
  {
    value: "silent" as const,
    title: "直接调整余额",
    desc: "只修改钱包数字, 不产生交易记录, 不影响统计与预算",
    icon: EyeOff,
    accent: "#fbbf24",
    note: "不计入统计",
  },
];

export function BalanceCorrectionModal({ open, onOpenChange, wallet, defaultCurrency }: BalanceCorrectionModalProps) {
  const { toast } = useToast();
  const currentBalance = parseFloat(wallet.balance || "0");
  const [targetBalance, setTargetBalance] = useState(currentBalance.toString());
  const [selectedChoice, setSelectedChoice] = useState<UiCorrectionChoice>("with_transaction");
  const currencyInfo = getCurrencyInfo(wallet.currency || defaultCurrency);

  const { data: categories = [] } = useQuery<Category[]>({ queryKey: ["/api/categories"] });

  useEffect(() => {
    if (open) {
      setTargetBalance(currentBalance.toString());
      setSelectedChoice("with_transaction");
    }
  }, [open, currentBalance]);

  const correctionMutation = useMutation({
    mutationFn: async (data: { method: ServerCorrectionMethod; targetBalance: string; walletId: number }) =>
      apiRequest("POST", "/api/wallets/balance-correction", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      toast({ title: "余额已校正" });
      onOpenChange(false);
    },
    onError: (error: any) => toast({ title: "校正失败", description: error.message || "请稍后重试", variant: "destructive" }),
  });

  const handleSubmit = () => {
    const target = parseFloat(targetBalance);
    if (isNaN(target)) { toast({ title: "请输入有效金额", variant: "destructive" }); return; }
    const serverMethod: ServerCorrectionMethod = selectedChoice === "with_transaction" ? "adjust_income_expense" : "adjust_transfer";
    correctionMutation.mutate({ method: serverMethod, targetBalance: target.toString(), walletId: wallet.id });
  };

  const difference = parseFloat(targetBalance || "0") - currentBalance;
  const isIncrease = difference > 0;
  const isDecrease = difference < 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="modal-balance-correction">
        <DialogHeader>
          <DialogTitle>余额校正 · {wallet.name}</DialogTitle>
        </DialogHeader>

        {/* current state hero */}
        <div className="rounded-2xl p-4 bg-white/[0.03] border border-white/[0.06]">
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-[10.5px] tracking-[0.18em] uppercase text-foreground/55">当前余额</span>
            <span className="text-[10.5px] tracking-[0.18em] uppercase text-foreground/55">{wallet.currency || defaultCurrency}</span>
          </div>
          <p className="text-[26px] font-bold font-mono m-0">{currencyInfo.symbol}{currentBalance.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="target-balance">目标余额</Label>
            <Input id="target-balance" type="number" step="0.01" value={targetBalance}
                   onChange={(e) => setTargetBalance(e.target.value)}
                   className="text-[18px] font-mono h-12" data-testid="input-target-balance" />
            {difference !== 0 && !isNaN(difference) && (
              <div className="flex items-center gap-2 pt-1">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${
                  isIncrease ? "bg-emerald-400/15 text-emerald-300 border border-emerald-400/20" : "bg-rose-400/15 text-rose-300 border border-rose-400/20"
                }`}>
                  {isIncrease ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                  差额
                </span>
                <span className={`text-[12.5px] font-mono font-bold ${isIncrease ? "text-emerald-300" : "text-rose-300"}`}>
                  {isIncrease ? "+" : ""}{currencyInfo.symbol}{difference.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>校正方式</Label>
            <div className="space-y-2">
              {CHOICES.map((c) => {
                const active = selectedChoice === c.value;
                const Icon = c.icon;
                return (
                  <button key={c.value} type="button" onClick={() => setSelectedChoice(c.value)}
                          aria-pressed={active} data-testid={`option-${c.value}`}
                          className={`w-full text-left rounded-2xl p-3 transition-all border flex items-start gap-3 ${
                            active
                              ? "shadow-[0_6px_16px_-6px_var(--g)]"
                              : "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.14]"
                          }`}
                          style={active ? { background: `linear-gradient(135deg, ${c.accent}22 0%, ${c.accent}11 100%)`, borderColor: `${c.accent}44`, ["--g" as any]: `${c.accent}55` } : {}}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                         style={{ background: active ? `${c.accent}33` : "rgba(255,255,255,0.05)", color: active ? c.accent : "rgba(255,255,255,0.6)", border: `1px solid ${active ? `${c.accent}55` : "rgba(255,255,255,0.08)"}` }}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13.5px] font-bold m-0">{c.title}</p>
                        <span className="text-[9.5px] px-1.5 py-0.5 rounded-md font-semibold uppercase tracking-wider"
                              style={{ background: active ? `${c.accent}22` : "rgba(255,255,255,0.05)", color: active ? c.accent : "rgba(255,255,255,0.5)" }}>
                          {c.note}
                        </span>
                      </div>
                      <p className="text-[11.5px] text-foreground/55 m-0 mt-1">{c.desc}</p>
                    </div>
                    {active && (
                      <Check className="w-5 h-5 shrink-0" style={{ color: c.accent }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} data-testid="button-cancel-correction">取消</Button>
          <Button className="flex-1" onClick={handleSubmit} disabled={correctionMutation.isPending} data-testid="button-confirm-correction">
            {correctionMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            完成校正
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
