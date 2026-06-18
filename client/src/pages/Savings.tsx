import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PiggyBank, Plus, Loader2, Target, Trash2, ArrowLeft, Pencil } from "lucide-react";
import { getCurrencyInfo } from "@shared/schema";
import type { SavingsGoal } from "@shared/schema";
import { Link } from "wouter";
import { ProgressGradient } from "@/components/ds/ProgressGradient";
import { RoundIconButton } from "@/components/ds/RoundIconButton";
import { PillButton } from "@/components/ds/PillButton";
import { useUndoableDelete } from "@/hooks/useUndoableDelete";

export default function Savings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const cur = getCurrencyInfo(user?.defaultCurrency || "MYR");

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<SavingsGoal | null>(null);

  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [linked, setLinked] = useState<string>("");
  const [targetDate, setTargetDate] = useState("");

  const [eName, setEName] = useState("");
  const [eTarget, setETarget] = useState("");
  const [eLinked, setELinked] = useState("");
  const [eDate, setEDate] = useState("");

  const [addAmount, setAddAmount] = useState("");

  const { data: goals = [], isLoading } = useQuery<SavingsGoal[]>({ queryKey: ["/api/savings-goals"] });
  const { data: wallets = [] } = useQuery<any[]>({ queryKey: ["/api/wallets"] });

  const createMut = useMutation({
    mutationFn: async (d: any) => apiRequest("POST", "/api/savings-goals", d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/savings-goals"] });
      toast({ title: "已创建" });
      setCreateOpen(false); setName(""); setTarget(""); setLinked(""); setTargetDate("");
    },
    onError: (e: any) => toast({ title: "创建失败", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, currentAmount }: { id: number; currentAmount: number }) => apiRequest("PATCH", `/api/savings-goals/${id}`, { currentAmount }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/savings-goals"] }); toast({ title: "已更新存款" }); setAddOpen(false); setAddAmount(""); },
    onError: (e: any) => toast({ title: "更新失败", description: e.message, variant: "destructive" }),
  });

  const editMut = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      return apiRequest("PATCH", `/api/savings-goals/${selected.id}`, {
        name: eName.trim(),
        targetAmount: parseFloat(eTarget),
        targetDate: eDate ? new Date(eDate).toISOString() : null,
        linkedWalletId: eLinked ? parseInt(eLinked) : null,
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/savings-goals"] }); toast({ title: "已更新" }); setEditOpen(false); },
    onError: (e: any) => toast({ title: "更新失败", description: e.message, variant: "destructive" }),
  });

  const undoableDelete = useUndoableDelete();
  function deleteGoal(g: SavingsGoal) {
    void undoableDelete({
      deleteUrl: `/api/savings-goals/${g.id}`,
      restoreUrl: "/api/savings-goals",
      restorePayload: {
        name: g.name, targetAmount: parseFloat(g.targetAmount), currentAmount: parseFloat(g.currentAmount || "0"),
        currency: g.currency, targetDate: g.targetDate, icon: g.icon, color: g.color,
        linkedWalletId: (g as any).linkedWalletId ?? null,
      },
      invalidateKeys: [["/api/savings-goals"]],
      label: `已删除 "${g.name}"`,
    });
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !target) { toast({ title: "请填写完整", variant: "destructive" }); return; }
    createMut.mutate({
      name: name.trim(),
      targetAmount: parseFloat(target),
      currency: user?.defaultCurrency || "MYR",
      linkedWalletId: linked ? parseInt(linked) : null,
      targetDate: targetDate || null,
    });
  }

  function openEdit(g: SavingsGoal) {
    setSelected(g);
    setEName(g.name);
    setETarget(g.targetAmount);
    setEDate(g.targetDate ? new Date(g.targetDate).toISOString().split("T")[0] : "");
    setELinked((g as any).linkedWalletId ? String((g as any).linkedWalletId) : "");
    setEditOpen(true);
  }

  function openAdd(g: SavingsGoal) {
    setSelected(g); setAddAmount(""); setAddOpen(true);
  }

  function computeEta(g: SavingsGoal): string | null {
    const t = parseFloat(g.targetAmount); const c = parseFloat(g.currentAmount || "0");
    if (c >= t) return "已达成";
    if (!g.createdAt) return null;
    const created = new Date(g.createdAt as any);
    const months = Math.max(1, (Date.now() - created.getTime()) / (30 * 24 * 60 * 60 * 1000));
    const rate = c / months;
    if (rate <= 0) return null;
    const left = Math.ceil((t - c) / rate);
    if (left > 240) return null;
    return left === 1 ? "约 1 个月可达成" : `约 ${left} 个月可达成`;
  }

  const active = goals.filter(g => !g.isCompleted);
  const completed = goals.filter(g => g.isCompleted);
  const totalSaved = goals.reduce((s, g) => s + parseFloat(g.currentAmount || "0"), 0);
  const totalTarget = goals.reduce((s, g) => s + parseFloat(g.targetAmount), 0);

  return (
    <div className="text-foreground">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-5 md:py-7 pb-28 md:pb-10 space-y-5">

        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/planning">
              <RoundIconButton size="sm" aria-label="返回"><ArrowLeft className="w-4 h-4" /></RoundIconButton>
            </Link>
            <h1 className="text-[22px] md:text-[28px] font-semibold tracking-tight m-0 flex items-center gap-2">
              <PiggyBank className="w-5 h-5 text-primary" /> 储蓄目标
            </h1>
          </div>
          <PillButton onClick={() => setCreateOpen(true)} leftIcon={<Plus className="w-4 h-4" />} className="h-10 px-5 text-[13px]">
            新建
          </PillButton>
        </header>

        {/* HERO */}
        <section className="hero-card">
          <div className="relative">
            <p className="text-[11px] text-foreground/70 tracking-wider uppercase m-0">总储蓄</p>
            <p className="leading-[1.05] tracking-tight m-0 mt-1 flex items-baseline">
              <span className="text-[40px] md:text-[48px] font-semibold num-gradient">{cur.symbol} {totalSaved.toFixed(0)}</span>
              <span className="text-[18px] text-foreground/55 ml-2">/ {cur.symbol}{totalTarget.toFixed(0)}</span>
            </p>
            <div className="mt-4">
              <ProgressGradient value={totalSaved} max={totalTarget || 1} className="h-2" />
            </div>
            <p className="text-[12px] text-foreground/70 mt-3 m-0">{active.length} 个进行中 · {completed.length} 个已完成</p>
          </div>
        </section>

        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{[1,2,3].map(i => <div key={i} className="asset-card h-32 animate-pulse" />)}</div>
        ) : goals.length === 0 ? (
          <div className="asset-card text-center py-16">
            <PiggyBank className="w-10 h-10 mx-auto text-foreground-muted mb-3" />
            <p className="text-sm font-medium">还没有储蓄目标</p>
            <p className="text-xs text-foreground-muted mt-1">设定目标，开始积累</p>
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <section>
                <div className="section-head"><h3>进行中</h3></div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {active.map(g => {
                    const t = parseFloat(g.targetAmount), c = parseFloat(g.currentAmount || "0");
                    const pct = Math.min((c / t) * 100, 100);
                    const eta = computeEta(g);
                    return (
                      <div key={g.id} className="asset-card cursor-pointer" onClick={() => openAdd(g)}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
                              <Target className="w-[18px] h-[18px] text-primary" />
                            </div>
                            <div>
                              <p className="text-[14px] font-semibold m-0 truncate">{g.name}</p>
                              {eta && <p className="text-[10px] text-warm m-0">{eta}</p>}
                            </div>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); openEdit(g); }}
                            className="w-7 h-7 rounded-md hover:bg-surface-3 flex items-center justify-center text-foreground-muted" aria-label="编辑">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-[18px] font-semibold m-0 font-mono leading-tight">
                          {cur.symbol}{c.toFixed(2)}
                          <span className="text-[12px] text-foreground-muted ml-1.5">/ {cur.symbol}{t.toFixed(0)}</span>
                        </p>
                        <ProgressGradient value={c} max={t} className="h-2 mt-2.5" />
                        <p className="text-[10px] text-foreground-muted mt-1.5 m-0">{pct.toFixed(0)}%</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
            {completed.length > 0 && (
              <section>
                <div className="section-head"><h3>已完成</h3></div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {completed.map(g => (
                    <div key={g.id} className="asset-card opacity-70">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-9 h-9 rounded-xl bg-income/15 flex items-center justify-center"><Target className="w-[18px] h-[18px] text-income" /></div>
                        <p className="text-[14px] font-semibold m-0 truncate">{g.name}</p>
                      </div>
                      <p className="text-[14px] font-mono text-income m-0">已达成 · {cur.symbol}{parseFloat(g.targetAmount).toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* CREATE */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>新建储蓄目标</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2"><Label>名称</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="例如 日本旅行" /></div>
              <div className="space-y-2"><Label>目标金额 ({cur.symbol})</Label><Input type="number" step="0.01" value={target} onChange={e => setTarget(e.target.value)} /></div>
              <div className="space-y-2">
                <Label>关联钱包（可选，进度按该钱包余额）</Label>
                <Select value={linked || "none"} onValueChange={v => setLinked(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="无" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">无</SelectItem>
                    {wallets.map((w: any) => <SelectItem key={w.id} value={String(w.id)}>{w.name} ({w.currency})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>目标日期（可选）</Label><Input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} /></div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)} className="flex-1">取消</Button>
                <Button type="submit" className="flex-1 bg-primary" disabled={createMut.isPending}>
                  {createMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}创建
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* EDIT */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>编辑目标</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2"><Label>名称</Label><Input value={eName} onChange={e => setEName(e.target.value)} /></div>
              <div className="space-y-2"><Label>目标金额 ({cur.symbol})</Label><Input type="number" step="0.01" value={eTarget} onChange={e => setETarget(e.target.value)} /></div>
              <div className="space-y-2"><Label>目标日期</Label><Input type="date" value={eDate} onChange={e => setEDate(e.target.value)} /></div>
              <div className="space-y-2">
                <Label>关联钱包</Label>
                <Select value={eLinked || "none"} onValueChange={v => setELinked(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="无" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">无</SelectItem>
                    {wallets.map((w: any) => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 pt-3">
              <Button variant="ghost" onClick={() => selected && deleteGoal(selected)} className="text-expense">删除目标</Button>
              <Button variant="ghost" className="ml-auto" onClick={() => setEditOpen(false)}>取消</Button>
              <Button className="bg-primary" disabled={editMut.isPending || !eName || !eTarget} onClick={() => editMut.mutate()}>
                {editMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}保存
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ADD AMOUNT */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{selected?.name} · 加钱</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Label>本次存入 ({cur.symbol})</Label>
              <Input type="number" step="0.01" value={addAmount} onChange={e => setAddAmount(e.target.value)} />
            </div>
            <div className="flex gap-2 pt-3">
              <Button variant="ghost" onClick={() => setAddOpen(false)} className="flex-1">取消</Button>
              <Button className="flex-1 bg-primary" disabled={!addAmount || updateMut.isPending}
                onClick={() => selected && updateMut.mutate({ id: selected.id, currentAmount: parseFloat(selected.currentAmount || "0") + parseFloat(addAmount) })}>
                {updateMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}存入
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
