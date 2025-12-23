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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getCurrencyInfo, type Wallet, type Category } from "@shared/schema";
import { Loader2 } from "lucide-react";

type CorrectionMethod = 
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

const correctionMethods: { value: CorrectionMethod; title: string; description: string }[] = [
  {
    value: "adjust_income_expense",
    title: "差额补记收支",
    description: "添加收入或支出交易记录，会计入收支统计。",
  },
  {
    value: "adjust_transfer",
    title: "直接调整余额",
    description: "直接调整余额，不创建交易记录，不影响收支统计。",
  },
  {
    value: "change_current_balance",
    title: "更改当前余额",
    description: "直接设置当前余额，不创建交易记录。",
  },
  {
    value: "set_initial_balance",
    title: "设置初始余额",
    description: "", // Will be dynamically set
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
  const [selectedMethod, setSelectedMethod] = useState<CorrectionMethod>("adjust_income_expense");
  const currencyInfo = getCurrencyInfo(wallet.currency || defaultCurrency);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  useEffect(() => {
    if (open) {
      setTargetBalance(currentBalance.toString());
      setSelectedMethod("adjust_income_expense");
    }
  }, [open, currentBalance]);

  const correctionMutation = useMutation({
    mutationFn: async (data: {
      method: CorrectionMethod;
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

    correctionMutation.mutate({
      method: selectedMethod,
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

          <div className="space-y-3">
            {correctionMethods.map((method) => {
              const description =
                method.value === "set_initial_balance"
                  ? `设置初始余额为指定金额，当前初始余额为${currencyInfo.symbol}${currentBalance.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}。`
                  : method.description;

              return (
                <div
                  key={method.value}
                  className="flex items-start gap-3 p-3 rounded-lg hover-elevate cursor-pointer"
                  onClick={() => setSelectedMethod(method.value)}
                  data-testid={`option-${method.value}`}
                >
                  <Checkbox
                    checked={selectedMethod === method.value}
                    onCheckedChange={() => setSelectedMethod(method.value)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{method.title}</p>
                    <p className="text-xs text-muted-foreground">{description}</p>
                  </div>
                </div>
              );
            })}
          </div>
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
