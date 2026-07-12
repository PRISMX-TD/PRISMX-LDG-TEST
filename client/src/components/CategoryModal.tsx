import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Coffee, ShoppingBag, Bus, Home, Music, HeartPulse, GraduationCap, Gift,
  Briefcase, TrendingUp, Sparkles, Loader2, Trash2, Check,
} from "lucide-react";
import type { Category } from "@shared/schema";

/* r7 — CategoryModal rewritten from scratch.
   Visual icon picker grid (no more select dropdown), bigger color swatch ring,
   live preview row at top. Inherits new ui/dialog chrome. */

const COLORS = [
  "#a78bfa", "#f0abfc", "#fbbf24", "#34d399",
  "#60a5fa", "#f87171", "#fb923c", "#22d3ee",
  "#c084fc", "#10b981", "#ef4444", "#6b7280",
];

const ICONS = [
  { value: "food", label: "餐饮", icon: Coffee },
  { value: "shopping", label: "购物", icon: ShoppingBag },
  { value: "transport", label: "交通", icon: Bus },
  { value: "housing", label: "住房", icon: Home },
  { value: "entertainment", label: "娱乐", icon: Music },
  { value: "health", label: "医疗", icon: HeartPulse },
  { value: "education", label: "教育", icon: GraduationCap },
  { value: "gift", label: "礼物", icon: Gift },
  { value: "salary", label: "工资", icon: Briefcase },
  { value: "work", label: "投资", icon: TrendingUp },
  { value: "other", label: "其他", icon: Sparkles },
];

interface CategoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: Category | null;
  type?: "expense" | "income";
}

export function CategoryModal({ open, onOpenChange, category, type = "expense" }: CategoryModalProps) {
  const { toast } = useToast();
  const isEdit = !!category;
  const locked = isEdit && !!category?.isDefault;

  const [name, setName] = useState(category?.name || "");
  const [iconKey, setIconKey] = useState(category?.icon || "other");
  const [color, setColor] = useState(category?.color || COLORS[0]);
  const [categoryType, setCategoryType] = useState<"expense" | "income">((category?.type as "expense" | "income") || type);

  useEffect(() => {
    if (open) {
      setName(category?.name || "");
      setIconKey(category?.icon || "other");
      setColor(category?.color || COLORS[0]);
      setCategoryType((category?.type as "expense" | "income") || type);
    }
  }, [open, category, type]);

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; type: string; icon: string; color: string }) =>
      apiRequest("POST", "/api/categories", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "分类已创建" });
      onOpenChange(false);
    },
    onError: (error: any) => toast({ title: "创建失败", description: error.message || "请重试", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { name: string; icon: string; color: string }) =>
      apiRequest("PATCH", `/api/categories/${category?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "分类已更新" });
      onOpenChange(false);
    },
    onError: (error: any) => toast({ title: "更新失败", description: error.message || "请重试", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/categories/${category?.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "分类已删除" });
      onOpenChange(false);
    },
    onError: (error: any) => toast({ title: "删除失败", description: error.message || "无法删除默认分类", variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast({ title: "请输入分类名称", variant: "destructive" }); return; }
    if (locked) { toast({ title: "默认分类不能编辑", variant: "destructive" }); return; }
    if (isEdit) updateMutation.mutate({ name: name.trim(), icon: iconKey, color });
    else createMutation.mutate({ name: name.trim(), type: categoryType, icon: iconKey, color });
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const PreviewIcon = ICONS.find(i => i.value === iconKey)?.icon || Sparkles;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑分类" : "新建分类"}</DialogTitle>
        </DialogHeader>

        {/* Live preview chip */}
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
               style={{ background: `${color}22`, border: `1px solid ${color}44` }}>
            <PreviewIcon className="w-6 h-6" style={{ color }} />
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-bold m-0 truncate">{name || "新分类"}</p>
            <p className="text-[10.5px] tracking-[0.18em] uppercase text-foreground/55 m-0 mt-0.5">
              {categoryType === "expense" ? "支出" : "收入"} · {ICONS.find(i => i.value === iconKey)?.label}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">分类名称</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)}
                   placeholder="输入分类名称" data-testid="input-category-name" disabled={locked} />
          </div>

          {!isEdit && (
            <div className="space-y-1.5">
              <Label>类型</Label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setCategoryType("expense")}
                        className={`px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${
                          categoryType === "expense"
                            ? "bg-gradient-to-br from-rose-400/30 to-rose-600/20 border border-rose-400/30 text-rose-300 shadow-[0_4px_12px_-4px_rgba(244,114,128,0.4)]"
                            : "bg-white/[0.04] border border-white/[0.08] text-foreground/65 hover:bg-white/[0.08]"
                        }`}>
                  支出
                </button>
                <button type="button" onClick={() => setCategoryType("income")}
                        className={`px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${
                          categoryType === "income"
                            ? "bg-gradient-to-br from-emerald-400/30 to-emerald-600/20 border border-emerald-400/30 text-emerald-300 shadow-[0_4px_12px_-4px_rgba(52,211,153,0.4)]"
                            : "bg-white/[0.04] border border-white/[0.08] text-foreground/65 hover:bg-white/[0.08]"
                        }`}>
                  收入
                </button>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>图标</Label>
            <div className="grid grid-cols-6 gap-1.5">
              {ICONS.map(({ value, label, icon: Icon }) => {
                const active = iconKey === value;
                return (
                  <button key={value} type="button" disabled={locked} aria-label={label}
                          onClick={() => setIconKey(value)}
                          className={`group aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all ${
                            active
                              ? "border text-foreground"
                              : "bg-white/[0.04] border border-white/[0.06] text-foreground/55 hover:bg-white/[0.08]"
                          }`}
                          style={active ? { background: `${color}22`, borderColor: `${color}55`, color } : {}}
                          data-testid={`icon-${value}`}>
                    <Icon className="w-4 h-4" />
                    <span className="text-[9px] font-medium">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>颜色</Label>
            <div className="grid grid-cols-6 gap-2">
              {COLORS.map((c) => {
                const active = color === c;
                return (
                  <button key={c} type="button" disabled={locked}
                          onClick={() => setColor(c)}
                          aria-label={`选择颜色 ${c}`}
                          className="aspect-square rounded-xl relative transition-all hover:scale-105"
                          style={{
                            background: c,
                            boxShadow: active ? `0 8px 20px -6px ${c}, 0 0 0 2px rgba(0,0,0,0.5), 0 0 0 4px ${c}88` : `0 4px 12px -4px ${c}66`,
                          }}
                          data-testid={`button-color-${c.replace("#", "")}`}>
                    {active && (
                      <Check className="absolute inset-0 m-auto w-4 h-4 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" strokeWidth={3} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <DialogFooter className="flex !justify-between gap-2 pt-2">
            {isEdit && !locked && (
              <Button type="button" variant="outline" size="icon"
                      onClick={() => { if (confirm(`确定删除分类 "${name}"?`)) deleteMutation.mutate(); }}
                      disabled={deleteMutation.isPending}
                      className="text-rose-300 hover:bg-rose-500/10 border-rose-500/20"
                      data-testid="button-delete-category">
                {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
              <Button type="submit" disabled={isPending || locked} data-testid="button-save-category">
                {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {isEdit ? "保存" : "创建"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
