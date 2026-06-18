import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Plus, Loader2, Trash2, Calendar, CheckCircle2, AlertTriangle, ArrowLeft, Pencil } from "lucide-react";
import { getCurrencyInfo } from "@shared/schema";
import { format, differenceInDays } from "date-fns";
import type { BillReminder, Wallet, Category } from "@shared/schema";
import { Link } from "wouter";
import { useUndoableDelete } from "@/hooks/useUndoableDelete";
import { RoundIconButton } from "@/components/ds/RoundIconButton";
import { PillButton } from "@/components/ds/PillButton";
export default function Reminders() {
  const { user } = useAuth();
  const { toast } = useToast();
  const cur = getCurrencyInfo(user?.defaultCurrency || "MYR");

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<BillReminder | null>(null);
  const [form, setForm] = useState({ name: "", amount: "", dueDate: format(new Date(), "yyyy-MM-dd"), walletId: "", categoryId: "", isRecurring: false, frequency: "monthly", notes: "" });
  const [eForm, setEForm] = useState({ name: "", amount: "", dueDate: "", walletId: "", categoryId: "", frequency: "once", notes: "" });

  const { data: reminders = [], isLoading } = useQuery<BillReminder[]>({ queryKey: ["/api/bill-reminders"] });
  const { data: wallets = [] } = useQuery<Wallet[]>({ queryKey: ["/api/wallets"] });
  const { data: categories = [] } = useQuery<Category[]>({ queryKey: ["/api/categories"] });
  const expCats = categories.filter(c => c.type === "expense");

  const createMut = useMutation({
    mutationFn: async (data: any) => apiRequest("POST", "/api/bill-reminders", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bill-reminders"] });
      toast({ title: "已创建" });
      setCreateOpen(false);
      setForm({ name: "", amount: "", dueDate: format(new Date(), "yyyy-MM-dd"), walletId: "", categoryId: "", isRecurring: false, frequency: "monthly", notes: "" });
    },
    onError: (e: any) => toast({ title: "创建失败", description: e.message, variant: "destructive" }),
  });

  const editMut = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      return apiRequest("PATCH", `/api/bill-reminders/${editing.id}`, {
        name: eForm.name.trim(),
        amount: eForm.amount ? parseFloat(eForm.amount) : null,
        dueDate: eForm.dueDate ? new Date(eForm.dueDate).toISOString() : null,
        walletId: eForm.walletId ? parseInt(eForm.walletId) : null,
        categoryId: eForm.categoryId ? parseInt(eForm.categoryId) : null,
        frequency: eForm.frequency,
        notes: eForm.notes || null,
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/bill-reminders"] }); toast({ title: "已更新" }); setEditOpen(false); },
    onError: (e: any) => toast({ title: "更新失败", description: e.message, variant: "destructive" }),
  });

  const markPaidMut = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `/api/bill-reminders/${id}/pay`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bill-reminders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      toast({ title: "已记账并标记为已付" });
    },
    onError: (e: any) => toast({ title: "操作失败", description: e.message, variant: "destructive" }),
  });

  const undoableDelete = useUndoableDelete();
  function deleteWithUndo(r: BillReminder) {
    void undoableDelete({
      deleteUrl: `/api/bill-reminders/${r.id}`,
      restoreUrl: "/api/bill-reminders",
      restorePayload: { name: r.name, amount: r.amount ? parseFloat(r.amount) : null, dueDate: r.dueDate, frequency: r.frequency, categoryId: r.categoryId, walletId: r.walletId, notes: r.notes },
      invalidateKeys: [["/api/bill-reminders"]],
      label: `已删除账单 "${r.name}"`,
    });
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.amount || !form.dueDate) { toast({ title: "请填写完整", variant: "destructive" }); return; }
    createMut.mutate({
      name: form.name.trim(),
      amount: parseFloat(form.amount),
      currency: user?.defaultCurrency || "MYR",
      dueDate: form.dueDate,
      walletId: form.walletId ? parseInt(form.walletId) : null,
      categoryId: form.categoryId ? parseInt(form.categoryId) : null,
      isRecurring: form.isRecurring,
      frequency: form.isRecurring ? form.frequency : "once",
      notes: form.notes || null,
    });
  }

  function openEdit(r: BillReminder) {
    setEditing(r);
    setEForm({
      name: r.name, amount: r.amount || "",
      dueDate: r.dueDate ? format(new Date(r.dueDate), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
      walletId: r.walletId ? String(r.walletId) : "",
      categoryId: r.categoryId ? String(r.categoryId) : "",
      frequency: r.frequency || "once",
      notes: r.notes || "",
    });
    setEditOpen(true);
  }

  function daysUntil(due: any) {
    const d = new Date(due); d.setHours(0,0,0,0);
    const t = new Date(); t.setHours(0,0,0,0);
    return differenceInDays(d, t);
  }

  const unpaid = reminders.filter(r => !r.isPaid).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const paid = reminders.filter(r => r.isPaid).slice(0, 5);
  const totalDue = unpaid.reduce((s, r) => s + parseFloat(r.amount || "0"), 0);

  return (
    <div className="text-foreground">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-5 md:py-7 pb-28 md:pb-10 space-y-5">

        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/planning">
              <RoundIconButton size="sm" aria-label="返回"><ArrowLeft className="w-4 h-4" /></RoundIconButton>
            </Link>
            <h1 className="text-[22px] md:text-[28px] font-semibold tracking-tight m-0 flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" /> 账单提醒
            </h1>
          </div>
          <PillButton onClick={() => setCreateOpen(true)} leftIcon={<Plus className="w-4 h-4" />} className="h-10 px-5 text-[13px]">添加</PillButton>
        </header>

        <section className="hero-card">
          <div className="relative">
            <p className="text-[11px] text-foreground/70 tracking-wider uppercase m-0">未付账单合计</p>
            <p className="leading-[1.05] tracking-tight m-0 mt-1">
              <span className="text-[40px] md:text-[48px] font-semibold num-gradient">{cur.symbol} {totalDue.toFixed(2)}</span>
            </p>
            <p className="text-[12px] text-foreground/70 mt-3 m-0">{unpaid.length} 笔待付 · {paid.length} 笔已付</p>
          </div>
        </section>

        {isLoading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="asset-card h-20 animate-pulse" />)}</div>
        ) : reminders.length === 0 ? (
          <div className="asset-card text-center py-16">
            <Bell className="w-10 h-10 mx-auto text-foreground-muted mb-3" />
            <p className="text-sm font-medium">暂无账单提醒</p>
          </div>
        ) : (
          <>
            {unpaid.length > 0 && (
              <section>
                <div className="section-head"><h3 className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-warm" /> 待付</h3></div>
                <div className="space-y-2">
                  {unpaid.map((r, i) => {
                    const days = daysUntil(r.dueDate);
                    const tone = days < 0 ? "text-expense" : days === 0 ? "text-expense" : days <= 3 ? "text-warm" : "text-foreground-muted";
                    const label = days < 0 ? `已逾期 ${Math.abs(days)} 天` : days === 0 ? "今天到期" : `${days} 天后`;
                    return (
                      <div key={r.id} className={`asset-card ${i === 0 ? "border-warm/30" : ""}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-9 h-9 rounded-xl bg-expense/15 flex items-center justify-center shrink-0">
                              <Calendar className="w-[18px] h-[18px] text-expense" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-[13.5px] font-medium m-0 truncate">{r.name}</p>
                                {r.frequency !== "once" && <span className="text-[10px] text-foreground-muted">循环</span>}
                              </div>
                              <p className={`text-[10.5px] m-0 ${tone}`}>{label} · {format(new Date(r.dueDate), "M/d")}</p>
                            </div>
                          </div>
                          <p className="text-[14px] font-mono font-semibold text-expense shrink-0">
                            {cur.symbol}{parseFloat(r.amount || "0").toFixed(2)}
                          </p>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => markPaidMut.mutate(r.id)} disabled={markPaidMut.isPending}
                              className="px-3 py-1.5 rounded-full bg-income/15 text-income border border-income/25 hover:bg-income/25 text-[11px] font-medium inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> 已付
                            </button>
                            <button onClick={() => openEdit(r)} className="w-7 h-7 rounded-md hover:bg-surface-3 flex items-center justify-center text-foreground-muted" aria-label="编辑"><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => deleteWithUndo(r)} className="w-7 h-7 rounded-md hover:bg-expense/15 flex items-center justify-center text-foreground-muted hover:text-expense" aria-label="删除"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
            {paid.length > 0 && (
              <section>
                <div className="section-head"><h3 className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-income" /> 已付（近 5 笔）</h3></div>
                <div className="space-y-2">
                  {paid.map(r => (
                    <div key={r.id} className="asset-card opacity-60 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-income/15 flex items-center justify-center shrink-0"><CheckCircle2 className="w-[18px] h-[18px] text-income" /></div>
                        <div className="min-w-0">
                          <p className="text-[13.5px] font-medium m-0 truncate">{r.name}</p>
                          <p className="text-[10.5px] text-foreground-muted m-0">{format(new Date(r.dueDate), "M/d")}</p>
                        </div>
                      </div>
                      <p className="text-[13px] font-mono text-foreground-muted">{cur.symbol}{parseFloat(r.amount || "0").toFixed(2)}</p>
                      <button onClick={() => deleteWithUndo(r)} className="w-7 h-7 rounded-md hover:bg-expense/15 flex items-center justify-center text-foreground-muted hover:text-expense" aria-label="删除"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>添加账单提醒</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="space-y-2"><Label>名称</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例如 房租 / 电话费" /></div>
              <div className="space-y-2"><Label>金额 ({cur.symbol})</Label><Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
              <div className="space-y-2"><Label>到期日</Label><Input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>支付钱包（可选）</Label>
                <Select value={form.walletId} onValueChange={v => setForm({ ...form, walletId: v })}>
                  <SelectTrigger><SelectValue placeholder="选择" /></SelectTrigger>
                  <SelectContent>{wallets.map(w => <SelectItem key={w.id} value={w.id.toString()}>{w.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>分类（可选）</Label>
                <Select value={form.categoryId} onValueChange={v => setForm({ ...form, categoryId: v })}>
                  <SelectTrigger><SelectValue placeholder="选择" /></SelectTrigger>
                  <SelectContent>{expCats.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="rec" checked={form.isRecurring} onCheckedChange={c => setForm({ ...form, isRecurring: !!c })} />
                <Label htmlFor="rec">循环账单</Label>
              </div>
              {form.isRecurring && (
                <div className="space-y-2">
                  <Label>频率</Label>
                  <Select value={form.frequency} onValueChange={v => setForm({ ...form, frequency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">每周</SelectItem>
                      <SelectItem value="monthly">每月</SelectItem>
                      <SelectItem value="yearly">每年</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2"><Label>备注（可选）</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)} className="flex-1">取消</Button>
                <Button type="submit" className="flex-1 bg-primary" disabled={createMut.isPending}>{createMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}添加</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>编辑提醒</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2"><Label>名称</Label><Input value={eForm.name} onChange={e => setEForm({ ...eForm, name: e.target.value })} /></div>
              <div className="space-y-2"><Label>金额 ({cur.symbol})</Label><Input type="number" step="0.01" value={eForm.amount} onChange={e => setEForm({ ...eForm, amount: e.target.value })} /></div>
              <div className="space-y-2"><Label>到期日</Label><Input type="date" value={eForm.dueDate} onChange={e => setEForm({ ...eForm, dueDate: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>频率</Label>
                <Select value={eForm.frequency} onValueChange={v => setEForm({ ...eForm, frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">仅一次</SelectItem>
                    <SelectItem value="weekly">每周</SelectItem>
                    <SelectItem value="monthly">每月</SelectItem>
                    <SelectItem value="yearly">每年</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 pt-3">
              <Button variant="ghost" onClick={() => setEditOpen(false)} className="flex-1">取消</Button>
              <Button className="flex-1 bg-primary" disabled={editMut.isPending} onClick={() => editMut.mutate()}>
                {editMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}保存
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
