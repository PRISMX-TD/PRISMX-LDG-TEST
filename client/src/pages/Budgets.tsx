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
import { TrendingUp, Plus, Loader2, Trash2, ChevronLeft, ChevronRight, ArrowLeft, Pencil, AlertTriangle, Copy } from "lucide-react";
import { getCurrencyInfo } from "@shared/schema";
import { getSessionToken } from "@/lib/neonAuth";
import type { Category } from "@shared/schema";
import { Link } from "wouter";
import { ProgressGradient } from "@/components/ds/ProgressGradient";
import { RoundIconButton } from "@/components/ds/RoundIconButton";
import { PillButton } from "@/components/ds/PillButton";
import { useUndoableDelete } from "@/hooks/useUndoableDelete";

interface BudgetWithSpending {
  id: number; categoryId: number; amount: string; month: number; year: number;
  spent: number; categoryName: string; categoryColor: string;
}

export default function Budgets() {
  const { user } = useAuth();
  const { toast } = useToast();
  const cur = getCurrencyInfo(user?.defaultCurrency || "MYR");
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [modalOpen, setModalOpen] = useState(false);
  const [selCat, setSelCat] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [editing, setEditing] = useState<BudgetWithSpending | null>(null);
  const [editAmount, setEditAmount] = useState("");

  const { data: budgets = [], isLoading } = useQuery<BudgetWithSpending[]>({
    queryKey: ["/api/budgets/spending", { month, year }],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      const token = getSessionToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const r = await fetch(`/api/budgets/spending?month=${month}&year=${year}`, { headers, credentials: "include" });
      if (!r.ok) throw new Error();
      return r.json();
    },
  });
  const { data: categories = [] } = useQuery<Category[]>({ queryKey: ["/api/categories"] });

  const createMut = useMutation({
    mutationFn: async (data: any) => apiRequest("POST", "/api/budgets", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/budgets/spending"] });
      toast({ title: "预算已创建" });
      setModalOpen(false); setSelCat(""); setAmount("");
    },
    onError: (e: any) => toast({ title: "创建失败", description: e.message, variant: "destructive" }),
  });
  const updateMut = useMutation({
    mutationFn: async ({ id, amount }: { id: number; amount: number }) => apiRequest("PATCH", `/api/budgets/${id}`, { amount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budgets/spending"] });
      toast({ title: "预算已更新" });
      setEditing(null); setEditAmount("");
    },
    onError: (e: any) => toast({ title: "更新失败", description: e.message, variant: "destructive" }),
  });
  const copyMut = useMutation({
    mutationFn: async () => { const r = await apiRequest("POST", "/api/budgets/copy-from-previous", { year, month }); return r.json(); },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/budgets/spending"] });
      toast({ title: `已复制 ${data.created || 0} 条预算` });
    },
    onError: (e: any) => toast({ title: "复制失败", description: e.message, variant: "destructive" }),
  });

  const undoableDelete = useUndoableDelete();
  function deleteWithUndo(b: BudgetWithSpending) {
    void undoableDelete({
      deleteUrl: `/api/budgets/${b.id}`,
      restoreUrl: "/api/budgets",
      restorePayload: { categoryId: b.categoryId, amount: parseFloat(b.amount), month: b.month, year: b.year },
      invalidateKeys: [["/api/budgets/spending"]],
      label: "已删除预算",
    });
  }

  const expCats = categories.filter(c => c.type === "expense");
  const usedCatIds = budgets.map(b => b.categoryId);
  const availCats = expCats.filter(c => !usedCatIds.includes(c.id));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selCat || !amount) { toast({ title: "请填写完整", variant: "destructive" }); return; }
    createMut.mutate({ categoryId: parseInt(selCat), amount: parseFloat(amount), month, year });
  }

  function navMonth(d: number) {
    let m = month + d, y = year;
    if (m > 12) { m = 1; y++; } else if (m < 1) { m = 12; y--; }
    setMonth(m); setYear(y);
  }

  const totalBudget = budgets.reduce((s, b) => s + parseFloat(b.amount), 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const overallPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  return (
    <div className="text-foreground">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-5 md:py-7 pb-20 md:pb-10 space-y-5">

        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/planning">
              <RoundIconButton size="sm" aria-label="返回"><ArrowLeft className="w-4 h-4" /></RoundIconButton>
            </Link>
            <h1 className="text-[22px] md:text-[28px] font-semibold tracking-tight m-0 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" /> 预算
            </h1>
          </div>
          <PillButton onClick={() => setModalOpen(true)} disabled={availCats.length === 0} leftIcon={<Plus className="w-4 h-4" />} className="h-10 px-5 text-[13px]">
            添加
          </PillButton>
        </header>

        {/* HERO: Overall progress */}
        <section className="hero-card">
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] text-foreground/70 m-0 tracking-wider uppercase">{year} 年 {month} 月预算</p>
              <div className="flex items-center gap-1">
                <button onClick={() => navMonth(-1)} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/15 flex items-center justify-center" aria-label="上月">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => navMonth(1)} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/15 flex items-center justify-center" aria-label="下月">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
            <p className="leading-[1.05] tracking-tight m-0 flex items-baseline">
              <span className="text-[40px] md:text-[48px] font-semibold num-gradient">{cur.symbol} {totalSpent.toFixed(0)}</span>
              <span className="text-[18px] text-foreground/55 ml-2">/ {cur.symbol}{totalBudget.toFixed(0)}</span>
            </p>
            <div className="mt-4">
              <ProgressGradient value={totalSpent} max={totalBudget} className="h-2" />
            </div>
            <p className={`text-[12px] mt-3 m-0 ${overallPct > 100 ? "text-expense" : "text-foreground/70"}`}>
              {overallPct > 100
                ? `超支 ${cur.symbol}${(totalSpent - totalBudget).toFixed(2)}`
                : `已用 ${overallPct.toFixed(1)}% · 剩 ${cur.symbol}${(totalBudget - totalSpent).toFixed(2)}`}
            </p>
            {budgets.length === 0 && (
              <PillButton variant="ghost" onClick={() => copyMut.mutate()} disabled={copyMut.isPending} leftIcon={<Copy className="w-4 h-4" />} className="mt-4 h-10 px-5 text-[12px]">
                {copyMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                复制上月预算
              </PillButton>
            )}
          </div>
        </section>

        {budgets.length > 0 && (
          <div className="flex justify-end">
            <PillButton variant="ghost" onClick={() => copyMut.mutate()} disabled={copyMut.isPending} leftIcon={<Copy className="w-4 h-4" />} className="h-9 px-4 text-[12px]">
              复制上月
            </PillButton>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="asset-card h-24 animate-pulse" />)}</div>
        ) : budgets.length === 0 ? (
          <div className="asset-card text-center py-16">
            <TrendingUp className="w-10 h-10 mx-auto text-foreground-muted mb-3" />
            <p className="text-sm font-medium">本月还没有预算</p>
            <p className="text-xs text-foreground-muted mt-1">为常用分类设置预算，跟踪开支</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {budgets.map(b => {
              const a = parseFloat(b.amount);
              const pct = a > 0 ? (b.spent / a) * 100 : 0;
              const over = b.spent > a;
              return (
                <div key={b.id} className="asset-card">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-lg shrink-0" style={{ background: `linear-gradient(135deg, ${b.categoryColor}, ${b.categoryColor}88)` }} />
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold m-0 truncate">{b.categoryName}</p>
                        <p className="text-[10px] text-foreground-muted m-0">{pct.toFixed(0)}% 已用</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => { setEditing(b); setEditAmount(b.amount); }} className="w-7 h-7 rounded-md hover:bg-surface-3 flex items-center justify-center text-foreground-muted" aria-label="编辑">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteWithUndo(b)} className="w-7 h-7 rounded-md hover:bg-expense/15 flex items-center justify-center text-foreground-muted hover:text-expense" aria-label="删除">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-[18px] font-semibold m-0 leading-none mb-2 font-mono">
                    {cur.symbol}{b.spent.toFixed(2)}
                    <span className="text-[12px] text-foreground-muted ml-1.5">/ {cur.symbol}{a.toFixed(0)}</span>
                  </p>
                  <ProgressGradient value={b.spent} max={a} className="h-2" />
                  <p className={`text-[10px] mt-2 m-0 flex items-center gap-1 ${over ? "text-expense" : "text-foreground-muted"}`}>
                    {over && <AlertTriangle className="w-3 h-3" />}
                    {over ? `超支 ${cur.symbol}${(b.spent - a).toFixed(2)}` : `剩 ${cur.symbol}${(a - b.spent).toFixed(2)}`}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* ADD */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>添加预算</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>分类</Label>
                <Select value={selCat} onValueChange={setSelCat}>
                  <SelectTrigger><SelectValue placeholder="选择分类" /></SelectTrigger>
                  <SelectContent>
                    {availCats.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>金额 ({cur.symbol})</Label>
                <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="例如 1000" />
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} className="flex-1">取消</Button>
                <Button type="submit" disabled={createMut.isPending} className="flex-1 bg-primary">
                  {createMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}创建
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* EDIT */}
        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>修改预算 "{editing?.categoryName}"</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Label>新的预算金额 ({cur.symbol})</Label>
              <Input type="number" step="0.01" value={editAmount} onChange={e => setEditAmount(e.target.value)} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditing(null)} className="flex-1">取消</Button>
              <Button disabled={updateMut.isPending || !editAmount} className="flex-1 bg-primary"
                onClick={() => editing && updateMut.mutate({ id: editing.id, amount: parseFloat(editAmount) })}>
                {updateMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}保存
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
