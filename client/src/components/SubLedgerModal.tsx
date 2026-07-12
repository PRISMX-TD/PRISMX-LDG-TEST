import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, BookOpen, CalendarIcon, X, Target, Palette,
  Plane, Briefcase, PartyPopper, Heart, Wrench, GraduationCap,
  Sparkles, Check,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { SubLedger } from "@shared/schema";
import { supportedCurrencies } from "@shared/schema";

/* r7 — SubLedgerModal rewritten from scratch.
   - Live preview chip at top
   - Icon picker as gradient tile grid (real icons, not just labels)
   - Color swatches with check mark + glow on active
   - Calendar popovers cleaned up
   - Switch row styled as warm web3 row card */

const COLORS = [
  "#a78bfa", "#c084fc", "#f0abfc", "#fbbf24",
  "#34d399", "#10b981", "#60a5fa", "#3b82f6",
  "#f87171", "#fb923c", "#22d3ee", "#ec4899",
];

const ICONS = [
  { value: "trip", label: "旅行", icon: Plane },
  { value: "project", label: "项目", icon: Briefcase },
  { value: "event", label: "活动", icon: PartyPopper },
  { value: "wedding", label: "婚礼", icon: Heart },
  { value: "renovation", label: "装修", icon: Wrench },
  { value: "education", label: "教育", icon: GraduationCap },
  { value: "business", label: "业务", icon: Briefcase },
  { value: "other", label: "其他", icon: Sparkles },
];

interface SubLedgerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subLedger?: SubLedger | null;
}

export function SubLedgerModal({ open, onOpenChange, subLedger }: SubLedgerModalProps) {
  const { toast } = useToast();
  const isEditing = !!subLedger;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [iconKey, setIconKey] = useState("trip");
  const [color, setColor] = useState(COLORS[0]);
  const [budgetAmount, setBudgetAmount] = useState("");
  const [currency, setCurrency] = useState("MYR");
  const [includeInMainAnalytics, setIncludeInMainAnalytics] = useState(true);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);

  useEffect(() => {
    if (subLedger) {
      setName(subLedger.name);
      setDescription(subLedger.description || "");
      setIconKey(subLedger.icon || "trip");
      setColor(subLedger.color || COLORS[0]);
      setBudgetAmount(subLedger.budgetAmount || "");
      setCurrency(subLedger.currency || "MYR");
      setIncludeInMainAnalytics(subLedger.includeInMainAnalytics ?? true);
      setStartDate(subLedger.startDate ? new Date(subLedger.startDate) : undefined);
      setEndDate(subLedger.endDate ? new Date(subLedger.endDate) : undefined);
    } else {
      setName(""); setDescription(""); setIconKey("trip"); setColor(COLORS[0]);
      setBudgetAmount(""); setCurrency("MYR"); setIncludeInMainAnalytics(true);
      setStartDate(undefined); setEndDate(undefined);
    }
  }, [subLedger, open]);

  const invalidate = () => queryClient.invalidateQueries({
    predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/sub-ledgers"),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/sub-ledgers", data),
    onSuccess: () => { invalidate(); toast({ title: "子账本创建成功" }); onOpenChange(false); },
    onError: () => toast({ title: "创建失败", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", `/api/sub-ledgers/${subLedger?.id}`, data),
    onSuccess: () => { invalidate(); toast({ title: "子账本更新成功" }); onOpenChange(false); },
    onError: () => toast({ title: "更新失败", variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast({ title: "请输入名称", variant: "destructive" }); return; }
    const data = {
      name: name.trim(),
      description: description.trim() || null,
      icon: iconKey, color,
      budgetAmount: budgetAmount ? budgetAmount : null,
      currency, includeInMainAnalytics,
      startDate: startDate ? startDate.toISOString() : null,
      endDate: endDate ? endDate.toISOString() : null,
    };
    if (isEditing) updateMutation.mutate(data);
    else createMutation.mutate(data);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const PreviewIcon = ICONS.find(i => i.value === iconKey)?.icon || BookOpen;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[88vh] overflow-y-auto custom-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#a78bfa]" />
            {isEditing ? "编辑子账本" : "创建子账本"}
          </DialogTitle>
        </DialogHeader>

        {/* Live preview */}
        <div className="rounded-2xl p-3.5 bg-white/[0.03] border border-white/[0.06] flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
               style={{ background: `${color}22`, border: `1px solid ${color}44` }}>
            <PreviewIcon className="w-6 h-6" style={{ color }} />
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-bold m-0 truncate">{name || "新子账本"}</p>
            <p className="text-[10.5px] tracking-[0.18em] uppercase text-foreground/55 m-0 mt-0.5">
              {ICONS.find(i => i.value === iconKey)?.label} · {currency}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">名称 *</Label>
            <Input id="name" placeholder="例如: 日本旅行 2026" value={name}
                   onChange={(e) => setName(e.target.value)} data-testid="input-subledger-name" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">描述</Label>
            <Textarea id="description" placeholder="添加一些描述（可选）"
                      value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                      data-testid="input-subledger-description" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="budgetAmount" className="flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" />预算金额
            </Label>
            <div className="flex gap-2">
              <Input id="budgetAmount" type="number" step="0.01" min="0" placeholder="设置预算上限（可选）"
                     value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)}
                     className="flex-1" data-testid="input-subledger-budget" />
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-[100px]"><SelectValue placeholder="币种" /></SelectTrigger>
                <SelectContent>
                  {supportedCurrencies.map(c => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-[10.5px] text-foreground/45 m-0">设置后可在子账本页面查看预算使用进度</p>
          </div>

          <div className="space-y-1.5">
            <Label>类型</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {ICONS.map(({ value, label, icon: Icon }) => {
                const active = iconKey === value;
                return (
                  <button key={value} type="button" onClick={() => setIconKey(value)}
                          data-testid={`button-icon-${value}`} aria-label={label}
                          className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all ${
                            active ? "border" : "bg-white/[0.04] border border-white/[0.06] text-foreground/55 hover:bg-white/[0.08]"
                          }`}
                          style={active ? { background: `${color}22`, borderColor: `${color}55`, color } : {}}>
                    <Icon className="w-4 h-4" />
                    <span className="text-[9.5px] font-medium">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5" />颜色
            </Label>
            <div className="grid grid-cols-6 gap-2">
              {COLORS.map(c => {
                const active = color === c;
                return (
                  <button key={c} type="button" onClick={() => setColor(c)}
                          data-testid={`button-color-${c.replace("#", "")}`} aria-label={`颜色 ${c}`}
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
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1 text-[12px]"><CalendarIcon className="w-3 h-3" />开始日期</Label>
              <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" data-testid="input-subledger-start-date"
                          className={cn("w-full justify-start text-left font-normal h-10 text-[12px] rounded-xl", !startDate && "text-foreground/50")}>
                    <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                    {startDate ? format(startDate, "yyyy/MM/dd") : "选择日期"}
                    {startDate && (
                      <X className="ml-auto h-3.5 w-3.5 hover:text-rose-300"
                         onClick={(e) => { e.stopPropagation(); setStartDate(undefined); }} />
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-2xl border-white/[0.08]" style={{ background: "rgba(26,20,36,0.98)", backdropFilter: "blur(20px)" }} align="start">
                  <Calendar mode="single" selected={startDate}
                            onSelect={(d) => { setStartDate(d); setStartDateOpen(false); }}
                            locale={zhCN} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1 text-[12px]"><CalendarIcon className="w-3 h-3" />结束日期</Label>
              <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" data-testid="input-subledger-end-date"
                          className={cn("w-full justify-start text-left font-normal h-10 text-[12px] rounded-xl", !endDate && "text-foreground/50")}>
                    <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                    {endDate ? format(endDate, "yyyy/MM/dd") : "选择日期"}
                    {endDate && (
                      <X className="ml-auto h-3.5 w-3.5 hover:text-rose-300"
                         onClick={(e) => { e.stopPropagation(); setEndDate(undefined); }} />
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-2xl border-white/[0.08]" style={{ background: "rgba(26,20,36,0.98)", backdropFilter: "blur(20px)" }} align="start">
                  <Calendar mode="single" selected={endDate}
                            onSelect={(d) => { setEndDate(d); setEndDateOpen(false); }}
                            locale={zhCN} initialFocus
                            disabled={(d) => startDate ? d < startDate : false} />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <div className="min-w-0 flex-1">
              <Label htmlFor="includeInMain" className="cursor-pointer text-[12.5px] font-semibold">计入总账分析</Label>
              <p className="text-[10.5px] text-foreground/50 m-0 mt-0.5">关闭后此子账本的交易不会出现在主分析中</p>
            </div>
            <Switch id="includeInMain" checked={includeInMainAnalytics}
                    onCheckedChange={setIncludeInMainAnalytics} data-testid="switch-include-in-main" />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-subledger">取消</Button>
            <Button type="submit" disabled={isPending} data-testid="button-save-subledger">
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEditing ? "保存" : "创建"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
