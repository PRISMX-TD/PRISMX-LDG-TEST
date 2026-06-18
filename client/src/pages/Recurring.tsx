import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarClock, Plus, Loader2, Trash2, TrendingDown, TrendingUp, ArrowLeft, Pencil } from "lucide-react";
import { getCurrencyInfo } from "@shared/schema";
import { format } from "date-fns";
import type { RecurringTransaction, Wallet, Category } from "@shared/schema";
import { Link } from "wouter";
import { useUndoableDelete } from "@/hooks/useUndoableDelete";
import { RoundIconButton } from "@/components/ds/RoundIconButton";
import { PillButton } from "@/components/ds/PillButton";
import { PillTabs } from "@/components/ds/PillTabs";

const FREQ_OPT = [
  { value: "daily", label: "每天" }, { value: "weekly", label: "每周" },
  { value: "monthly", label: "每月" }, { value: "yearly", label: "每年" },
];

type Tab = "expense" | "income";

export default function Recurring() {
  const { user } = useAuth();
  const { toast } = useToast();
  const cur = getCurrencyInfo(user?.defaultCurrency || "MYR");

  const [tab, setTab] = useState<Tab>("expense");
  const [modalOpen, setModalOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringTransaction | null>(null);
  const [form, setForm] = useState<any>({
    type: "expense", walletId: "", categoryId: "", amount: "", description: "",
    frequency: "monthly", nextExecutionDate: format(new Date(), "yyyy-MM-dd"),
    dayOfMonth: null, dayOfWeek: null,
  });
  const [eForm, setEForm] = useState<any>({ amount: "", frequency: "monthly", walletId: "", categoryId: "", description: "", nextExecutionDate: "" });

  const { data: recurring = [], isLoading } = useQuery<RecurringTransaction[]>({ queryKey: ["/api/recurring-transactions"] });
  const { data: wallets = [] } = useQuery<Wallet[]>({ queryKey: ["/api/wallets"] });
  const { data: categories = [] } = useQuery<Category[]>({ queryKey: ["/api/categories"] });

  const createMut = useMutation({
    mutationFn: async (d: any) => apiRequest("POST", "/api/recurring-transactions", d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-transactions"] });
      toast({ title: "已创建" });
      setModalOpen(false);
      setForm({ type: tab, walletId: "", categoryId: "", amount: "", description: "", frequency: "monthly", nextExecutionDate: format(new Date(), "yyyy-MM-dd"), dayOfMonth: null, dayOfWeek: null });
    },
    onError: (e: any) => toast({ title: "创建失败", description: e.message, variant: "destructive" }),
  });
  const toggleMut = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => apiRequest("PATCH", `/api/recurring-transactions/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/recurring-transactions"] }),
  });
  const editMut = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      return apiRequest("PATCH", `/api/recurring-transactions/${editing.id}`, {
        amount: parseFloat(eForm.amount),
        frequency: eForm.frequency,
        description: eForm.description || null,
        walletId: parseInt(eForm.walletId),
        categoryId: eForm.categoryId ? parseInt(eForm.categoryId) : null,
        nextExecutionDate: eForm.nextExecutionDate ? new Date(eForm.nextExecutionDate).toISOString() : undefined,
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/recurring-transactions"] }); toast({ title: "已更新" }); setEditOpen(false); },
    onError: (e: any) => toast({ title: "更新失败", description: e.message, variant: "destructive" }),
  });

  const undoableDelete = useUndoableDelete();
  function deleteWithUndo(item: RecurringTransaction) {
    void undoableDelete({
      deleteUrl: `/api/recurring-transactions/${item.id}`,
      restoreUrl: "/api/recurring-transactions",
      restorePayload: {
        type: item.type, amount: parseFloat(item.amount), walletId: item.walletId, categoryId: item.categoryId,
        description: item.description, frequency: item.frequency, dayOfMonth: item.dayOfMonth, dayOfWeek: item.dayOfWeek, nextExecutionDate: item.nextExecutionDate,
      },
      invalidateKeys: [["/api/recurring-transactions"]],
      label: "已删除定期交易",
    });
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.walletId || !form.categoryId || !form.amount) { toast({ title: "请填写完整", variant: "destructive" }); return; }
    const picked = new Date(form.nextExecutionDate);
    const payload: any = {
      type: form.type, walletId: parseInt(form.walletId), categoryId: parseInt(form.categoryId),
      amount: parseFloat(form.amount), currency: user?.defaultCurrency || "MYR",
      description: form.description || null, frequency: form.frequency,
      nextExecutionDate: form.nextExecutionDate,
    };
    if (form.frequency === "monthly") payload.dayOfMonth = form.dayOfMonth ?? picked.getDate();
    if (form.frequency === "weekly") payload.dayOfWeek = form.dayOfWeek ?? picked.getDay();
    createMut.mutate(payload);
  }

  function openEdit(item: RecurringTransaction) {
    setEditing(item);
    setEForm({
      amount: item.amount, frequency: item.frequency, walletId: String(item.walletId),
      categoryId: item.categoryId ? String(item.categoryId) : "",
      description: item.description || "",
      nextExecutionDate: item.nextExecutionDate ? format(new Date(item.nextExecutionDate), "yyyy-MM-dd") : "",
    });
    setEditOpen(true);
  }

  const filteredCats = categories.filter(c => c.type === form.type);
  const list = recurring.filter(r => r.type === tab);
  const expCount = recurring.filter(r => r.type === "expense").length;
  const incCount = recurring.filter(r => r.type === "income").length;

  return (
    <div className="text-foreground">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-5 md:py-7 pb-20 md:pb-10 space-y-5">

        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/planning">
              <RoundIconButton size="sm" aria-label="返回"><ArrowLeft className="w-4 h-4" /></RoundIconButton>
            </Link>
            <h1 className="text-[22px] md:text-[28px] font-semibold tracking-tight m-0 flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-primary" /> 定期交易
            </h1>
          </div>
          <PillButton onClick={() => { setForm({ ...form, type: tab }); setModalOpen(true); }} leftIcon={<Plus className="w-4 h-4" />} className="h-10 px-5 text-[13px]">新建</PillButton>
        </header>

        <PillTabs<Tab>
          value={tab}
          onChange={setTab}
          options={[{ id: "expense", label: `支出 ${expCount}` }, { id: "income", label: `收入 ${incCount}` }]}
        />

        {isLoading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="asset-card h-20 animate-pulse" />)}</div>
        ) : list.length === 0 ? (
          <div className="asset-card text-center py-16">
            {tab === "expense" ? <TrendingDown className="w-10 h-10 mx-auto text-foreground-muted mb-3" /> : <TrendingUp className="w-10 h-10 mx-auto text-foreground-muted mb-3" />}
            <p className="text-sm font-medium">{tab === "expense" ? "暂无定期支出" : "暂无定期收入"}</p>
            <p className="text-xs text-foreground-muted mt-1">{tab === "expense" ? "添加房租、订阅等" : "添加工资、租金等"}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {list.map(item => {
              const w = wallets.find(x => x.id === item.walletId);
              const c = categories.find(x => x.id === item.categoryId);
              const freq = FREQ_OPT.find(f => f.value === item.frequency)?.label || item.frequency;
              return (
                <div key={item.id} className={`asset-card flex items-center justify-between gap-3 ${!item.isActive ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${item.type === "expense" ? "bg-expense/15" : "bg-income/15"}`}>
                      {item.type === "expense" ? <TrendingDown className="w-[18px] h-[18px] text-expense" /> : <TrendingUp className="w-[18px] h-[18px] text-income" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-medium m-0 truncate">{item.description || c?.name || "未命名"}</p>
                      <p className="text-[10.5px] text-foreground-muted m-0">{w?.name || "—"} · {freq}</p>
                    </div>
                  </div>
                  <p className={`text-[14px] font-mono font-semibold shrink-0 ${item.type === "expense" ? "text-expense" : "text-income"}`}>
                    {item.type === "expense" ? "−" : "+"}{cur.symbol}{parseFloat(item.amount).toFixed(2)}
                  </p>
                  <div className="flex items-center gap-1 shrink-0">
                    <Switch checked={item.isActive ?? true} onCheckedChange={c => toggleMut.mutate({ id: item.id, isActive: c })} />
                    <button onClick={() => openEdit(item)} className="w-7 h-7 rounded-md hover:bg-surface-3 flex items-center justify-center text-foreground-muted" aria-label="编辑"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => deleteWithUndo(item)} className="w-7 h-7 rounded-md hover:bg-expense/15 flex items-center justify-center text-foreground-muted hover:text-expense" aria-label="删除"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>新建定期交易</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="space-y-2">
                <Label>类型</Label>
                <Select value={form.type} onValueChange={(v: any) => setForm({ ...form, type: v, categoryId: "" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">支出</SelectItem>
                    <SelectItem value="income">收入</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>钱包</Label>
                <Select value={form.walletId} onValueChange={v => setForm({ ...form, walletId: v })}>
                  <SelectTrigger><SelectValue placeholder="选择" /></SelectTrigger>
                  <SelectContent>{wallets.map(w => <SelectItem key={w.id} value={w.id.toString()}>{w.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>分类</Label>
                <Select value={form.categoryId} onValueChange={v => setForm({ ...form, categoryId: v })}>
                  <SelectTrigger><SelectValue placeholder="选择" /></SelectTrigger>
                  <SelectContent>{filteredCats.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>金额 ({cur.symbol})</Label><Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>频率</Label>
                <Select value={form.frequency} onValueChange={v => setForm({ ...form, frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FREQ_OPT.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {form.frequency === "monthly" && (
                <div className="space-y-2"><Label>每月哪一天 (1-31)</Label>
                  <Input type="number" min={1} max={31} value={form.dayOfMonth || ""} onChange={e => setForm({ ...form, dayOfMonth: e.target.value ? parseInt(e.target.value) : null })} placeholder="例如 1" />
                </div>
              )}
              {form.frequency === "weekly" && (
                <div className="space-y-2"><Label>每周哪一天</Label>
                  <Select value={String(form.dayOfWeek ?? "")} onValueChange={v => setForm({ ...form, dayOfWeek: v ? parseInt(v) : null })}>
                    <SelectTrigger><SelectValue placeholder="选择" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">周日</SelectItem><SelectItem value="1">周一</SelectItem><SelectItem value="2">周二</SelectItem>
                      <SelectItem value="3">周三</SelectItem><SelectItem value="4">周四</SelectItem><SelectItem value="5">周五</SelectItem>
                      <SelectItem value="6">周六</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2"><Label>首次执行</Label><Input type="date" value={form.nextExecutionDate} onChange={e => setForm({ ...form, nextExecutionDate: e.target.value })} /></div>
              <div className="space-y-2"><Label>备注</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} className="flex-1">取消</Button>
                <Button type="submit" className="flex-1 bg-primary" disabled={createMut.isPending}>{createMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}创建</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>编辑定期交易</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2"><Label>金额 ({cur.symbol})</Label><Input type="number" step="0.01" value={eForm.amount} onChange={e => setEForm({ ...eForm, amount: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>频率</Label>
                <Select value={eForm.frequency} onValueChange={v => setEForm({ ...eForm, frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FREQ_OPT.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>下次执行</Label><Input type="date" value={eForm.nextExecutionDate} onChange={e => setEForm({ ...eForm, nextExecutionDate: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>钱包</Label>
                <Select value={eForm.walletId} onValueChange={v => setEForm({ ...eForm, walletId: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{wallets.map(w => <SelectItem key={w.id} value={w.id.toString()}>{w.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>分类</Label>
                <Select value={eForm.categoryId} onValueChange={v => setEForm({ ...eForm, categoryId: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.filter(c => editing ? c.type === editing.type : true).map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>备注</Label><Input value={eForm.description} onChange={e => setEForm({ ...eForm, description: e.target.value })} /></div>
            </div>
            <div className="flex gap-2 pt-3">
              <Button variant="ghost" onClick={() => setEditOpen(false)} className="flex-1">取消</Button>
              <Button className="flex-1 bg-primary" disabled={editMut.isPending} onClick={() => editMut.mutate()}>{editMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}保存</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
