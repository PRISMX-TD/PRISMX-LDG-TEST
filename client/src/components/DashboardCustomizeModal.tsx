import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface Preferences {
  showTotalAssets?: boolean;
  showMonthlyIncome?: boolean;
  showMonthlyExpense?: boolean;
  showFlexibleFunds?: boolean;
  showWallets?: boolean;
  showRecentTransactions?: boolean;
  cardOrder?: string[] | null;
}

interface DashboardCustomizeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULT_ORDER = ["metrics", "cashflow", "wallet", "recent"];

export function DashboardCustomizeModal({ open, onOpenChange }: DashboardCustomizeModalProps) {
  const { data: prefs } = useQuery<Preferences>({
    queryKey: ["/api/dashboard-preferences"],
  });
  const [order, setOrder] = useState<string[]>(DEFAULT_ORDER);
  const [showTotalAssets, setShowTotalAssets] = useState(true);
  const [showMonthlyIncome, setShowMonthlyIncome] = useState(true);
  const [showMonthlyExpense, setShowMonthlyExpense] = useState(true);
  const [showFlexibleFunds, setShowFlexibleFunds] = useState(true);
  const [showWallets, setShowWallets] = useState(true);
  const [showRecent, setShowRecent] = useState(true);

  useEffect(() => {
    if (prefs) {
      setOrder(prefs.cardOrder && prefs.cardOrder.length ? prefs.cardOrder as string[] : DEFAULT_ORDER);
      setShowTotalAssets(prefs.showTotalAssets !== false);
      setShowMonthlyIncome(prefs.showMonthlyIncome !== false);
      setShowMonthlyExpense(prefs.showMonthlyExpense !== false);
      setShowFlexibleFunds(prefs.showFlexibleFunds === true);
      setShowWallets(prefs.showWallets !== false);
      setShowRecent(prefs.showRecentTransactions !== false);
    }
  }, [prefs]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/dashboard-preferences", {
        showTotalAssets,
        showMonthlyIncome,
        showMonthlyExpense,
        showFlexibleFunds,
        showWallets,
        showRecentTransactions: showRecent,
        cardOrder: order,
      });
    },
    onSuccess: () => {
      onOpenChange(false);
    },
  });

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...order];
    const nidx = idx + dir;
    if (nidx < 0 || nidx >= next.length) return;
    const [item] = next.splice(idx, 1);
    next.splice(nidx, 0, item);
    setOrder(next);
  };

  const nameOf = (key: string) => {
    switch (key) {
      case "metrics": return "关键指标";
      case "cashflow": return "资金流向分析";
      case "wallet": return "钱包卡片";
      case "recent": return "最近交易";
      default: return key;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>仪表盘布局</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">显示内容</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <Switch checked={showTotalAssets} onCheckedChange={setShowTotalAssets} id="showTotalAssets" />
                <Label htmlFor="showTotalAssets">总资产</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={showFlexibleFunds} onCheckedChange={setShowFlexibleFunds} id="showFlexibleFunds" />
                <Label htmlFor="showFlexibleFunds">灵活资金</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={showMonthlyIncome} onCheckedChange={setShowMonthlyIncome} id="showMonthlyIncome" />
                <Label htmlFor="showMonthlyIncome">本月收入</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={showMonthlyExpense} onCheckedChange={setShowMonthlyExpense} id="showMonthlyExpense" />
                <Label htmlFor="showMonthlyExpense">本月支出</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={showWallets} onCheckedChange={setShowWallets} id="showWallets" />
                <Label htmlFor="showWallets">钱包卡片</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={showRecent} onCheckedChange={setShowRecent} id="showRecent" />
                <Label htmlFor="showRecent">最近交易</Label>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">排列顺序</p>
            <div className="space-y-2">
              {order.map((key, idx) => (
                <div key={key} className="flex items-center justify-between p-2 rounded-md bg-muted">
                  <span className="text-sm">{nameOf(key)}</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => move(idx, -1)}>上移</Button>
                    <Button variant="outline" size="sm" onClick={() => move(idx, 1)}>下移</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              保存
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
