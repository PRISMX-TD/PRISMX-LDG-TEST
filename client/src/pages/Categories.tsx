import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { getSessionToken } from "@/lib/neonAuth";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from "wouter";
import {
  ArrowLeft, Plus, Pencil, Trash2, Loader2, Tag,
  Utensils, ShoppingBag, Car, Home, Gamepad2, Pill, GraduationCap, Gift,
  CreditCard, Smartphone, Plane, Shirt, Music, Coffee, Wallet, Briefcase,
  TrendingUp, DollarSign, Heart, Zap,
} from "lucide-react";
import type { Category } from "@shared/schema";
import { RoundIconButton } from "@/components/ds/RoundIconButton";
import { PillButton } from "@/components/ds/PillButton";
import { PillTabs } from "@/components/ds/PillTabs";
import { useUndoableDelete } from "@/hooks/useUndoableDelete";

const COLORS = [
  "#EF4444", "#F97316", "#F59E0B", "#84CC16", "#22C55E", "#10B981", "#14B8A6", "#06B6D4", "#0EA5E9",
  "#3B82F6", "#6366F1", "#8B5CF6", "#A855F7", "#D946EF", "#EC4899", "#F43F5E", "#78716C", "#64748B",
];

const ICON_OPTIONS = [
  { value: "utensils", label: "餐饮", Icon: Utensils },
  { value: "shopping-bag", label: "购物", Icon: ShoppingBag },
  { value: "car", label: "交通", Icon: Car },
  { value: "home", label: "住房", Icon: Home },
  { value: "gamepad", label: "娱乐", Icon: Gamepad2 },
  { value: "pill", label: "医疗", Icon: Pill },
  { value: "graduation-cap", label: "教育", Icon: GraduationCap },
  { value: "gift", label: "礼物", Icon: Gift },
  { value: "credit-card", label: "支付", Icon: CreditCard },
  { value: "smartphone", label: "通讯", Icon: Smartphone },
  { value: "plane", label: "旅行", Icon: Plane },
  { value: "shirt", label: "服饰", Icon: Shirt },
  { value: "music", label: "音乐", Icon: Music },
  { value: "coffee", label: "饮品", Icon: Coffee },
  { value: "wallet", label: "钱包", Icon: Wallet },
  { value: "briefcase", label: "工作", Icon: Briefcase },
  { value: "trending-up", label: "投资", Icon: TrendingUp },
  { value: "dollar-sign", label: "收入", Icon: DollarSign },
  { value: "heart", label: "健康", Icon: Heart },
  { value: "zap", label: "其他", Icon: Zap },
];

const getIcon = (name?: string | null) => ICON_OPTIONS.find(i => i.value === name)?.Icon || Tag;

type TabKind = "expense" | "income";

export default function Categories() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKind>("expense");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [pendingDelete, setPendingDelete] = useState<{ cat: Category; tx: number; bg: number } | null>(null);

  const { data: categories = [], isLoading } = useQuery<Category[]>({ queryKey: ["/api/categories"] });

  const createMut = useMutation({
    mutationFn: async (data: any) => apiRequest("POST", "/api/categories", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/categories"] }); toast({ title: "已创建" }); close(); },
    onError: (e: any) => toast({ title: "创建失败", description: e.message, variant: "destructive" }),
  });
  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/categories/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/categories"] }); toast({ title: "已更新" }); close(); },
    onError: (e: any) => toast({ title: "更新失败", description: e.message, variant: "destructive" }),
  });

  const undoableDelete = useUndoableDelete();
  function confirmDelete(cat: Category) {
    void undoableDelete({
      deleteUrl: `/api/categories/${cat.id}`,
      restoreUrl: "/api/categories",
      restorePayload: { name: cat.name, type: cat.type, icon: cat.icon, color: cat.color },
      invalidateKeys: [["/api/categories"]],
      label: `已删除分类 "${cat.name}"`,
      onSuccess: () => setPendingDelete(null),
    });
  }

  async function requestDelete(cat: Category) {
    try {
      const headers: Record<string, string> = {};
      const token = getSessionToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const [txR, bgR] = await Promise.all([
        fetch(`/api/transactions?categoryId=${cat.id}&limit=1000`, { headers, credentials: "include" }),
        fetch(`/api/budgets`, { headers, credentials: "include" }),
      ]);
      const txs = txR.ok ? await txR.json() : [];
      const bgs = bgR.ok ? await bgR.json() : [];
      const bg = (bgs as Array<{ categoryId: number }>).filter(b => b.categoryId === cat.id).length;
      setPendingDelete({ cat, tx: txs.length, bg });
    } catch { setPendingDelete({ cat, tx: 0, bg: 0 }); }
  }

  function close() {
    setModalOpen(false); setEditing(null); setName(""); setIcon(""); setColor(COLORS[0]);
  }
  function openEdit(cat: Category) {
    setEditing(cat); setName(cat.name); setIcon(cat.icon || ""); setColor(cat.color || COLORS[0]); setModalOpen(true);
  }
  function openCreate() { close(); setModalOpen(true); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast({ title: "请输入名称", variant: "destructive" }); return; }
    if (editing) updateMut.mutate({ id: editing.id, data: { name: name.trim(), icon, color } });
    else createMut.mutate({ name: name.trim(), type: tab, icon, color });
  }

  const list = categories.filter(c => c.type === tab);
  const expCount = categories.filter(c => c.type === "expense").length;
  const incCount = categories.filter(c => c.type === "income").length;

  if (isAuthLoading || !user) return null;

  return (
    <div className="text-foreground">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-5 md:py-7 pb-20 md:pb-10 space-y-5">

        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <RoundIconButton size="sm" aria-label="返回"><ArrowLeft className="w-4 h-4" /></RoundIconButton>
            </Link>
            <h1 className="text-[22px] md:text-[28px] font-semibold tracking-tight m-0 flex items-center gap-2">
              <Tag className="w-5 h-5 text-primary" /> 分类
            </h1>
          </div>
          <PillButton onClick={openCreate} leftIcon={<Plus className="w-4 h-4" />} className="h-10 px-5 text-[13px]">
            新建
          </PillButton>
        </header>

        <PillTabs<TabKind>
          value={tab}
          onChange={setTab}
          options={[
            { id: "expense", label: `支出 ${expCount}` },
            { id: "income", label: `收入 ${incCount}` },
          ]}
        />

        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1,2,3,4,5,6].map(i => <div key={i} className="asset-card h-16 animate-pulse" />)}
          </div>
        ) : list.length === 0 ? (
          <div className="asset-card text-center py-16">
            <Tag className="w-10 h-10 mx-auto text-foreground-muted mb-3" />
            <p className="text-sm font-medium">暂无 {tab === "expense" ? "支出" : "收入"} 分类</p>
            <PillButton className="mt-5" onClick={openCreate} leftIcon={<Plus className="w-4 h-4" />}>新建分类</PillButton>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {list.map(cat => {
              const Icon = getIcon(cat.icon);
              return (
                <div key={cat.id} className="asset-card flex items-center gap-3 !p-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.4)]" style={{ background: `linear-gradient(135deg, ${cat.color || COLORS[0]} 0%, ${cat.color || COLORS[0]}cc 100%)` }}>
                    <Icon className="w-[18px] h-[18px]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-medium m-0 truncate">{cat.name}</p>
                    {cat.isDefault && <p className="text-[10px] text-foreground-muted m-0">默认</p>}
                  </div>
                  {!cat.isDefault && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button onClick={() => openEdit(cat)} className="w-7 h-7 rounded-md hover:bg-surface-3 flex items-center justify-center text-foreground-muted hover:text-foreground" aria-label="编辑">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => requestDelete(cat)} className="w-7 h-7 rounded-md hover:bg-expense/15 flex items-center justify-center text-foreground-muted hover:text-expense" aria-label="删除">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* DELETE CONFIRM */}
        <Dialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>删除分类 "{pendingDelete?.cat.name}"?</DialogTitle></DialogHeader>
            <div className="space-y-2 text-sm">
              <p>此操作不可撤销。</p>
              {pendingDelete && pendingDelete.tx > 0 && <p className="text-warm">· {pendingDelete.tx} 笔历史交易将变为"未分类"</p>}
              {pendingDelete && pendingDelete.bg > 0 && <p className="text-expense">· {pendingDelete.bg} 条预算将被同步删除</p>}
              {pendingDelete && pendingDelete.tx === 0 && pendingDelete.bg === 0 && <p className="text-foreground-muted">无关联数据，可安全删除。</p>}
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="ghost" className="flex-1" onClick={() => setPendingDelete(null)}>取消</Button>
              <Button className="flex-1 bg-expense" onClick={() => pendingDelete && confirmDelete(pendingDelete.cat)}>确认删除</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* EDIT / CREATE */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{editing ? "编辑分类" : `新建${tab === "expense" ? "支出" : "收入"}分类`}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>名称</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="例如 餐饮" />
              </div>
              <div className="space-y-2">
                <Label>图标</Label>
                <div className="grid grid-cols-5 gap-2">
                  {ICON_OPTIONS.map(({ value, label, Icon }) => (
                    <button key={value} type="button"
                      onClick={() => setIcon(value)}
                      className={`flex items-center justify-center w-10 h-10 rounded-xl border transition-all ${icon === value ? "border-primary bg-primary/15" : "border-border hover:bg-surface-3"}`}
                      title={label}>
                      <Icon className="w-[18px] h-[18px]" />
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>颜色</Label>
                <div className="grid grid-cols-9 gap-2">
                  {COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setColor(c)}
                      className={`w-7 h-7 rounded-full transition-transform ${color === c ? "ring-2 ring-offset-2 ring-primary ring-offset-surface-1 scale-110" : ""}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={close} className="flex-1">取消</Button>
                <Button type="submit" disabled={createMut.isPending || updateMut.isPending} className="flex-1 bg-primary">
                  {(createMut.isPending || updateMut.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}保存
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
