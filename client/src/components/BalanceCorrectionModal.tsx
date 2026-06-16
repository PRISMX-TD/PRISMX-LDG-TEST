import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getCurrencyInfo, type Wallet, type Category } from "@shared/schema";
import { Loader2 } from "lucide-react";

// Server accepts: adjust_income_expense | adjust_transfer | change_current_balance | set_initial_balance.
// The last three all produced the exact same behavior (silent balance overwrite, no transaction),
// so the UI surfaces just two distinct, meaningful choices and maps to the server names internally.
type UiCorrectionChoice = "with_transaction" | "silent";
type ServerCorrectionMethod =
  | "adjust_income_expense"
  | "adjust_transfer"
  | "change_current_balance"
  | "set_initial_balance";

interface BalanceCorrectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallet: Wallet;
  defaultCurrency: string;
}

const choices: { value: UiCorrectionChoice; title: string; description: string }[] = [
  {
    value: "with_transaction",
    title: "差额补记收支（影响统计）",
    description: "会自动生成一笔'其他'分类的收入/支出交易，计入收支统计与预算。",
  },
  {
    value: "silent",
    title: "直接调整余额（不计入统计）",
    description: "只修改钱包余额数字，不产生交易记录，不影响收支统计与预算。",
  },
];

export function BalanceCorrectionModal({
  open,
  onOpenChange,
  wallet,
  defaultCurrency,
}: BalanceCorrectionModalProps) {
  const { toast } = useToast();
  const currentBalance = parseFloat(wallet.balance || "0");
  const [targetBalance, setTargetBalance] = useState(currentBalance.toString());
  const [selectedChoice, setSelectedChoice] = useState<UiCorrectionChoice>("with_transaction");
  const currencyInfo = getCurrencyInfo(wallet.currency || defaultCurrency);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  useEffect(() => {
    if (open) {
      setTargetBalance(currentBalance.toString());
      setSelectedChoice("with_transaction");
    }
  }, [open, currentBalance]);

  const correctionMutation = useMutation({
    mutationFn: async (data: {
      method: ServerCorrectionMethod;
      targetBalance: string;
      walletId: number;
    }) => {
      return apiRequest("POST", "/api/wallets/balance-correction", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      toast({ title: "余额已校正" });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "校正失败",
        description: error.message || "请稍后重试",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    const target = parseFloat(targetBalance);
    if (isNaN(target)) {
      toast({
        title: "请输入有效金额",
        variant: "destructive",
      });
      return;
    }

    // Map the two-choice UI back onto the server's enum. Both silent variants resolve to
    // adjust_transfer, which is the canonical silent path on the server.
    const serverMethod: ServerCorrectionMethod =
      selectedChoice === "with_transaction" ? "adjust_income_expense" : "adjust_transfer";

    correctionMutation.mutate({
      method: serverMethod,
      targetBalance: target.toString(),
      walletId: wallet.id,
    });
  };

  const difference = parseFloat(targetBalance || "0") - currentBalance;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="modal-balance-correction">
        <DialogHeader className="pb-2">
          <DialogTitle>余额校正</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>目标余额</Label>
            <Input
              type="number"
              step="0.01"
              value={targetBalance}
              onChange={(e) => setTargetBalance(e.target.value)}
              className="text-lg font-mono"
              data-testid="input-target-balance"
            />
            {difference !== 0 && !isNaN(difference) && (
              <p className="text-xs text-muted-foreground">
                差额: {difference > 0 ? "+" : ""}
                {currencyInfo.symbol}
                {difference.toLocaleString("zh-CN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            )}
          </div>

          <RadioGroup
            value={selectedChoice}
            onValueChange={(v) => setSelectedChoice(v as UiCorrectionChoice)}
            className="space-y-3"
          >
            {choices.map((choice) => (
              <label
                key={choice.value}
                htmlFor={`correction-${choice.value}`}
                className="flex items-start gap-3 p-3 rounded-lg hover-elevate cursor-pointer border border-border/40"
                data-testid={`option-${choice.value}`}
              >
                <RadioGroupItem
                  id={`correction-${choice.value}`}
                  value={choice.value}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{choice.title}</p>
                  <p className="text-xs text-muted-foreground">{choice.description}</p>
                </div>
              </label>
            ))}
          </RadioGroup>
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            className="flex-1 h-11"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-correction"
          >
            取消
          </Button>
          <Button
            className="flex-1 h-11"
            onClick={handleSubmit}
            disabled={correctionMutation.isPending}
            data-testid="button-confirm-correction"
          >
            {correctionMutation.isPending && (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            )}
            完成
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
