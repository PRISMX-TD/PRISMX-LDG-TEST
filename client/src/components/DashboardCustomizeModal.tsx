import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Loader2, Sparkles, ArrowDownLeft, ArrowUpRight, Coins, Flame, Activity, BarChart3, Receipt } from "lucide-react";

/* r7 — DashboardCustomizeModal completely rewritten.
   Every toggle now matches an actual section the user sees on the r7 Dashboard.
   Server-side schema is unchanged; we reuse existing field names. */

interface Preferences {
  showTotalAssets?: boolean;
  showMonthlyIncome?: boolean;
  showMonthlyExpense?: boolean;
  showFlexibleFunds?: boolean;
  showWallets?: boolean;
  showBudgets?: boolean;
  showSavingsGoals?: boolean;
  showRecentTransactions?: boolean;
  cardOrder?: string[] | null;
}

interface DashboardCustomizeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SectionDef = {
  key: keyof Preferences;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
};

const SECTIONS: SectionDef[] = [
  { key: "showTotalAssets",        label: "总资产卡片",   desc: "顶部紫色 Hero — 总余额、趋势、12 月资产曲线、4 个快捷动作", icon: Sparkles,       accent: "#a78bfa" },
  { key: "showMonthlyIncome",      label: "今日收入",     desc: "右侧 4 格里的「今日收入」绿色小卡",                          icon: ArrowDownLeft,  accent: "#34d399" },
  { key: "showMonthlyExpense",     label: "今日支出",     desc: "右侧 4 格里的「今日支出」红色小卡",                          icon: ArrowUpRight,   accent: "#f87171" },
  { key: "showFlexibleFunds",      label: "可灵活调用",   desc: "右侧 4 格里的「可灵活调用」紫色小卡",                        icon: Coins,          accent: "#c084fc" },
  { key: "showSavingsGoals",       label: "记账连续",     desc: "右侧 4 格里的「记账连续 N 天」琥珀色小卡",                   icon: Flame,          accent: "#fbbf24" },
  { key: "showBudgets",            label: "本月现金流",   desc: "30 天每日收支双曲线图",                                      icon: Activity,       accent: "#a78bfa" },
  { key: "showWallets",            label: "年度脉搏",     desc: "12 个月每月收支柱状图",                                      icon: BarChart3,      accent: "#fbbf24" },
  { key: "showRecentTransactions", label: "最近活动",     desc: "页面底部的交易明细 feed",                                    icon: Receipt,        accent: "#f0abfc" },
];

export function DashboardCustomizeModal({ open, onOpenChange }: DashboardCustomizeModalProps) {
  const { toast } = useToast();
  const { data: prefs } = useQuery<Preferences>({ queryKey: ["/api/dashboard-preferences"] });

  const [values, setValues] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!prefs) return;
    setValues({
      showTotalAssets:        prefs.showTotalAssets        !== false,
      showMonthlyIncome:      prefs.showMonthlyIncome      !== false,
      showMonthlyExpense:     prefs.showMonthlyExpense     !== false,
      showFlexibleFunds:      prefs.showFlexibleFunds      !== false,
      showSavingsGoals:       prefs.showSavingsGoals       !== false,
      showBudgets:            prefs.showBudgets            !== false,
      showWallets:            prefs.showWallets            !== false,
      showRecentTransactions: prefs.showRecentTransactions !== false,
    });
  }, [prefs, open]);

  const toggle = (k: string) => setValues(v => ({ ...v, [k]: !v[k] }));
  const setAll = (on: boolean) => {
    const next: Record<string, boolean> = {};
    SECTIONS.forEach(s => { next[s.key as string] = on; });
    setValues(next);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: Preferences = {
        showTotalAssets:        values.showTotalAssets,
        showMonthlyIncome:      values.showMonthlyIncome,
        showMonthlyExpense:     values.showMonthlyExpense,
        showFlexibleFunds:      values.showFlexibleFunds,
        showSavingsGoals:       values.showSavingsGoals,
        showBudgets:            values.showBudgets,
        showWallets:            values.showWallets,
        showRecentTransactions: values.showRecentTransactions,
      };
      await apiRequest("PATCH", "/api/dashboard-preferences", payload);
      return payload;
    },
    onSuccess: (newPrefs) => {
      queryClient.setQueryData(["/api/dashboard-preferences"], (old: Preferences | undefined) => ({
        ...(old ?? {}),
        ...newPrefs,
      }));
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard-preferences"] });
      queryClient.refetchQueries({ queryKey: ["/api/dashboard-preferences"] });
      toast({ title: "已保存", description: "仪表盘布局已更新" });
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast({ title: "保存失败", description: e?.message || "请重试", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[88vh] overflow-y-auto custom-scroll">
        <DialogHeader>
          <DialogTitle>仪表盘布局</DialogTitle>
          <p className="text-[12px] text-foreground/55 m-0 mt-1">选择要在仪表盘上显示的卡片。每一项对应你在主页看到的一块内容。</p>
        </DialogHeader>

        <div className="flex items-center gap-2 -mt-1 mb-2">
          <Button size="sm" variant="outline" onClick={() => setAll(true)}>全部显示</Button>
          <Button size="sm" variant="outline" onClick={() => setAll(false)}>全部隐藏</Button>
        </div>

        <div className="space-y-2">
          {SECTIONS.map((s) => {
            const active = !!values[s.key as string];
            const Icon = s.icon;
            return (
              <label
                key={s.key as string}
                htmlFor={`toggle-${s.key as string}`}
                className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${
                  active
                    ? "bg-white/[0.04] border-white/[0.14]"
                    : "bg-white/[0.015] border-white/[0.06] opacity-70 hover:opacity-100"
                }`}
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                     style={{ background: `${s.accent}22`, border: `1px solid ${s.accent}33`, color: s.accent }}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold m-0">{s.label}</p>
                  <p className="text-[11px] text-foreground/55 m-0 mt-0.5">{s.desc}</p>
                </div>
                <Switch
                  id={`toggle-${s.key as string}`}
                  checked={active}
                  onCheckedChange={() => toggle(s.key as string)}
                  className="mt-1 shrink-0"
                />
              </label>
            );
          })}
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
