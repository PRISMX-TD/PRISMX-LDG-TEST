import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Calculator, Trash2, Pencil, Users, Loader2, ArrowLeft, ArrowRight,
  Receipt, Sparkles, UserPlus, X,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { supportedCurrencies } from "@shared/schema";

/* r7 — Split rewritten from scratch.
   - Activity list as bento cards with member avatar stack
   - Full editor with three columns: meta / members → expenses → settlement
   - Expense rows redesigned as compact pill rows
   - All settlement math preserved verbatim. */

type Member = { id: string; name: string; weight?: number };
type ExpenseShareType = "equal" | "ratio" | "fixed" | "weight";
type ExpenseShare = { memberId: string; type: ExpenseShareType; value: number };
type Expense = {
  id: string; payerId: string; amount: number; date?: string;
  originalCurrency?: string; exchangeRate?: number; note?: string;
  participants: string[]; shares: ExpenseShare[];
};
type GroupPayload = {
  members: Member[]; expenses: Expense[]; currency: string;
  computed?: { net: Record<string, number>; settlements: { fromId: string; toId: string; amount: number }[]; timestamp: string };
};

function colorFor(id: string): [string, string] {
  const palette: [string, string][] = [
    ["#a78bfa", "#7c3aed"], ["#fbbf24", "#f59e0b"], ["#f472b6", "#db2777"],
    ["#34d399", "#059669"], ["#60a5fa", "#2563eb"], ["#fb923c", "#ea580c"],
    ["#22d3ee", "#0891b2"], ["#c084fc", "#a855f7"],
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export default function Split() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [currency, setCurrency] = useState<string>(supportedCurrencies[0].code);
  const [, params] = useRoute("/split/:id");
  const [, setLoc] = useLocation();
  const routeId = params?.id ? parseInt(params.id) : null;
  const [editingId, setEditingId] = useState<number | null>(routeId);
  const [current, setCurrent] = useState<GroupPayload | null>(null);
  const firstLoad = useRef(true);
  const [newMemberName, setNewMemberName] = useState("");

  useEffect(() => {
    if (routeId && routeId !== editingId) setEditingId(routeId);
    if (!routeId && editingId) setEditingId(null);
  }, [routeId]);

  const { data: groups = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/groups"] });

  useEffect(() => {
    if (editingId) {
      apiRequest("GET", `/api/groups/${editingId}`)
        .then((res) => res.json())
        .then((g: any) => {
          const payload: GroupPayload = g.payload || { members: [], expenses: [], currency: g.currency };
          setCurrent({ members: payload.members || [], expenses: payload.expenses || [], currency: g.currency, computed: payload.computed });
          firstLoad.current = false;
        })
        .catch((err: any) => {
          const msg = (err && err.message) ? err.message : String(err || "");
          if (msg.toLowerCase().includes("unauthorized")) toast({ title: "请登录后使用", variant: "destructive" });
          else toast({ title: "活动不存在或已删除", variant: "destructive" });
          setLoc("/split");
        });
    } else {
      setCurrent(null);
    }
  }, [editingId]);

  const invalidateGroups = () => queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === "/api/groups" });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/groups", data).then((res) => res.json()),
    onSuccess: (created: any) => {
      invalidateGroups();
      setCreateOpen(false);
      setTitle("");
      toast({ title: "活动已创建" });
      if (created?.id) { setEditingId(created.id); setLoc(`/split/${created.id}`); }
    },
    onError: () => toast({ title: "创建失败", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", `/api/groups/${editingId}`, data).then((res) => res.json()),
    onSuccess: (_res, variables) => {
      invalidateGroups();
      if (!variables?.__silent) toast({ title: "已保存" });
    },
    onError: () => toast({ title: "保存失败", variant: "destructive" }),
  });

  useEffect(() => {
    if (!editingId || !current || firstLoad.current) return;
    const handle = setTimeout(() => {
      const payload: GroupPayload = {
        members: current.members, expenses: current.expenses,
        currency: current.currency, computed: current.computed,
      };
      updateMutation.mutate({ payload, __silent: true });
    }, 700);
    return () => clearTimeout(handle);
  }, [editingId, current]);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/groups/${id}`).then((res) => ({ ok: res.ok })),
    onSuccess: () => {
      invalidateGroups();
      if (editingId) setEditingId(null);
      toast({ title: "已删除" });
    },
    onError: () => toast({ title: "删除失败", variant: "destructive" }),
  });

  const addMember = (name: string) => {
    if (!current) return;
    const n = name.trim(); if (!n) return;
    const id = Math.random().toString(36).slice(2);
    const updated = { ...current, members: [...current.members, { id, name: n }] };
    setCurrent(updated);
    setNewMemberName("");
    updateMutation.mutate({ payload: updated, __silent: true });
  };

  const removeMember = (id: string) => {
    if (!current) return;
    const members = current.members.filter(m => m.id !== id);
    const expenses = current.expenses.map(e => ({
      ...e,
      participants: e.participants.filter(pid => pid !== id),
      shares: e.shares.filter(s => s.memberId !== id),
    }));
    setCurrent({ ...current, members, expenses });
  };

  const addExpense = () => {
    if (!current || current.members.length === 0) return;
    const id = Math.random().toString(36).slice(2);
    const payerId = current.members[0].id;
    const participants = current.members.map(m => m.id);
    const shares = participants.map(pid => ({ memberId: pid, type: "equal" as ExpenseShareType, value: 1 }));
    const e: Expense = { id, payerId, amount: 0, date: new Date().toISOString(), participants, shares, note: "", originalCurrency: current.currency, exchangeRate: 1 };
    setCurrent({ ...current, expenses: [...current.expenses, e] });
  };

  const removeExpense = (id: string) => {
    if (!current) return;
    setCurrent({ ...current, expenses: current.expenses.filter(e => e.id !== id) });
  };

  const compute = useMemo(() => {
    if (!current) return { net: {}, settlements: [] as { fromId: string; toId: string; amount: number }[] };
    const net: Record<string, number> = {};
    current.members.forEach(m => { net[m.id] = 0; });
    for (const e of current.expenses) {
      const amt = e.amount || 0;
      net[e.payerId] += amt;
      const active = e.participants;
      if (active.length === 0) continue;
      if (e.shares.every(s => s.type === "equal")) {
        const share = amt / active.length;
        active.forEach(pid => { net[pid] -= share; });
      } else if (e.shares.every(s => s.type === "ratio")) {
        const total = e.shares.filter(s => active.includes(s.memberId)).reduce((sum, s) => sum + s.value, 0);
        active.forEach(pid => {
          const s = e.shares.find(x => x.memberId === pid);
          const val = s ? (amt * (s.value / (total || 1))) : 0;
          net[pid] -= val;
        });
      } else if (e.shares.every(s => s.type === "fixed")) {
        active.forEach(pid => {
          const s = e.shares.find(x => x.memberId === pid);
          net[pid] -= s ? s.value : 0;
        });
      } else {
        const totalW = e.shares.filter(s => active.includes(s.memberId)).reduce((sum, s) => sum + s.value, 0);
        active.forEach(pid => {
          const s = e.shares.find(x => x.memberId === pid);
          const val = s ? (amt * (s.value / (totalW || 1))) : 0;
          net[pid] -= val;
        });
      }
    }
    const creditors = Object.entries(net).filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
    const debtors   = Object.entries(net).filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
    creditors.sort((a, b) => b.v - a.v);
    debtors.sort((a, b) => b.v - a.v);
    const settlements: { fromId: string; toId: string; amount: number }[] = [];
    let i = 0, j = 0;
    while (i < creditors.length && j < debtors.length) {
      const c = creditors[i], d = debtors[j];
      const x = Math.min(c.v, d.v);
      if (x > 0) settlements.push({ fromId: d.id, toId: c.id, amount: parseFloat(x.toFixed(2)) });
      c.v -= x; d.v -= x;
      if (c.v <= 1e-6) i++;
      if (d.v <= 1e-6) j++;
    }
    return { net, settlements };
  }, [current]);

  const saveComputed = () => {
    if (!current || !editingId) return;
    const payload: GroupPayload = {
      members: current.members, expenses: current.expenses, currency: current.currency,
      computed: { net: compute.net, settlements: compute.settlements, timestamp: new Date().toISOString() },
    };
    updateMutation.mutate({ payload });
  };

  return (
    <div className="min-h-screen text-foreground relative">
      <div aria-hidden className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute -top-40 left-1/4 w-[520px] h-[520px] rounded-full opacity-40 blur-3xl"
             style={{ background: "radial-gradient(circle, rgba(167,139,250,0.35) 0%, transparent 70%)" }} />
        <div className="absolute top-1/3 right-0 w-[420px] h-[420px] rounded-full opacity-30 blur-3xl"
             style={{ background: "radial-gradient(circle, rgba(245,158,11,0.25) 0%, transparent 70%)" }} />
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-5 md:py-8 pb-20 md:pb-12 relative">
        {/* HEADER */}
        <header className="flex items-center justify-between mb-6 md:mb-8">
          <div className="flex items-center gap-3">
            <Link href="/people">
              <button className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.10] hover:bg-white/[0.10] flex items-center justify-center text-foreground/70 hover:text-foreground transition-all">
                <ArrowLeft className="w-[18px] h-[18px]" />
              </button>
            </Link>
            <div>
              <p className="text-[11px] tracking-[0.2em] uppercase text-foreground/45 m-0">Split</p>
              <h1 className="text-[22px] md:text-[28px] font-bold tracking-tight m-0 flex items-center gap-2">
                <Users className="w-5 h-5 text-[#a78bfa]" />费用分摊
              </h1>
            </div>
          </div>
          <Button onClick={() => setCreateOpen(true)} data-testid="button-add-group">
            <Plus className="w-4 h-4" />新建活动
          </Button>
        </header>

        {/* GROUP LIST */}
        {!editingId && (
          isLoading ? (
            <div className="rounded-3xl p-12 text-center bg-white/[0.025] border border-white/[0.06]">
              <Loader2 className="w-6 h-6 animate-spin text-[#a78bfa] mx-auto" />
            </div>
          ) : groups.length === 0 ? (
            <div className="rounded-3xl p-12 text-center bg-white/[0.025] border border-dashed border-white/[0.10]">
              <Users className="w-9 h-9 mx-auto text-foreground/35 mb-3" />
              <p className="text-[14px] font-medium m-0">还没有分摊活动</p>
              <p className="text-[12px] text-foreground/50 m-0 mt-1">新建一个开始记录与朋友的开销</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {groups.map((g) => {
                const members = g.payload?.members || [];
                const expenses = g.payload?.expenses || [];
                const total = expenses.reduce((s: number, e: any) => s + (e.amount || 0), 0);
                const settlements = g.payload?.computed?.settlements || [];
                return (
                  <Link key={g.id} href={`/split/${g.id}`} className="block group">
                    <div className="rounded-2xl p-5 bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.18] hover:bg-white/[0.05] transition-all hover:-translate-y-0.5 relative overflow-hidden">
                      <div aria-hidden className="absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-0 group-hover:opacity-100 blur-3xl transition-opacity"
                           style={{ background: "radial-gradient(circle, rgba(167,139,250,0.4) 0%, transparent 70%)" }} />
                      <div className="relative">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="text-[16px] font-bold m-0 truncate">{g.title}</h3>
                            <p className="text-[10.5px] tracking-[0.18em] uppercase text-foreground/45 m-0 mt-0.5">{g.currency} · {expenses.length} 笔</p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                            <button onClick={(e) => { e.preventDefault(); setLoc(`/split/${g.id}`); }}
                                    className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.10] flex items-center justify-center text-foreground/65 hover:text-foreground transition-all">
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button onClick={(e) => { e.preventDefault(); if (confirm("确定删除该活动？")) deleteMutation.mutate(g.id); }}
                                    className="w-7 h-7 rounded-lg bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/15 flex items-center justify-center text-rose-300 transition-all">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Avatar stack */}
                        {members.length > 0 && (
                          <div className="flex items-center -space-x-2 mb-3">
                            {members.slice(0, 5).map((m: Member) => {
                              const [from, to] = colorFor(m.id);
                              return (
                                <div key={m.id}
                                     className="w-7 h-7 rounded-full border-2 border-[#0a0612] flex items-center justify-center text-white text-[10px] font-bold"
                                     style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}>
                                  {m.name.slice(0, 1)}
                                </div>
                              );
                            })}
                            {members.length > 5 && (
                              <div className="w-7 h-7 rounded-full border-2 border-[#0a0612] bg-white/[0.06] flex items-center justify-center text-[10px] font-bold text-foreground/65">
                                +{members.length - 5}
                              </div>
                            )}
                          </div>
                        )}

                        {/* total */}
                        <div className="flex items-baseline justify-between mb-3">
                          <span className="text-[11px] text-foreground/50">总开销</span>
                          <span className="text-[18px] font-bold tabular-nums">
                            {g.currency} {total.toFixed(2)}
                          </span>
                        </div>

                        {/* settlement preview */}
                        {settlements.length > 0 ? (
                          <div className="space-y-1 pt-3 border-t border-white/[0.04]">
                            {settlements.slice(0, 2).map((s: any, idx: number) => {
                              const from = members.find((m: Member) => m.id === s.fromId);
                              const to = members.find((m: Member) => m.id === s.toId);
                              return (
                                <div key={idx} className="flex items-center justify-between text-[11.5px]">
                                  <span className="truncate flex items-center gap-1 text-foreground/70">
                                    {from?.name} <ArrowRight className="w-3 h-3 text-foreground/40" /> {to?.name}
                                  </span>
                                  <span className="font-mono text-amber-300 shrink-0">{Number(s.amount).toFixed(2)}</span>
                                </div>
                              );
                            })}
                            {settlements.length > 2 && (
                              <p className="text-[10.5px] text-foreground/45 m-0 pt-1">还有 {settlements.length - 2} 笔清算...</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-[11.5px] text-foreground/45 pt-3 border-t border-white/[0.04] m-0">点击查看 / 计算清算</p>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )
        )}

        {/* CREATE DIALOG */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>新建活动</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>名称</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：泰国旅行 2026" /></div>
              <div className="space-y-1.5">
                <Label>币种</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {supportedCurrencies.map(c => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
              <Button onClick={() => createMutation.mutate({ title: title.trim(), currency })} disabled={!title.trim()}>
                {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}创建
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* EDITOR */}
        {editingId && current && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5">

            {/* LEFT — meta + members */}
            <aside className="lg:col-span-4 space-y-4">
              <div className="rounded-3xl p-5 bg-white/[0.025] border border-white/[0.06]">
                <p className="text-[10.5px] tracking-[0.18em] uppercase text-foreground/45 m-0 mb-3">Group</p>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>币种</Label>
                    <Select value={current.currency} onValueChange={(v) => setCurrent({ ...current, currency: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {supportedCurrencies.map(c => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl p-5 bg-white/[0.025] border border-white/[0.06]">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10.5px] tracking-[0.18em] uppercase text-foreground/45 m-0">Members</p>
                  <span className="text-[11px] text-foreground/55">{current.members.length}</span>
                </div>
                <div className="flex gap-2 mb-3">
                  <Input placeholder="姓名" value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)}
                         onKeyDown={(e) => { if (e.key === "Enter") addMember(newMemberName); }} />
                  <Button onClick={() => addMember(newMemberName)} disabled={!newMemberName.trim()}>
                    <UserPlus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  {current.members.map(m => {
                    const [from, to] = colorFor(m.id);
                    return (
                      <div key={m.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.05] group">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-bold shrink-0"
                             style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}>
                          {m.name.slice(0, 1)}
                        </div>
                        <span className="flex-1 text-[13px] font-medium truncate">{m.name}</span>
                        <button onClick={() => removeMember(m.id)}
                                className="w-7 h-7 rounded-lg bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/15 flex items-center justify-center text-rose-300 opacity-0 group-hover:opacity-100 transition-opacity">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                  {current.members.length === 0 && (
                    <p className="text-[12px] text-foreground/45 text-center py-4 m-0">添加成员后再记录开销</p>
                  )}
                </div>
              </div>
            </aside>

            {/* MIDDLE — expenses */}
            <main className="lg:col-span-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-bold tracking-tight m-0 flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-[#a78bfa]" />开销 ({current.expenses.length})
                </h3>
                <Button onClick={addExpense} size="sm" disabled={current.members.length === 0}>
                  <Plus className="w-4 h-4" />添加
                </Button>
              </div>

              {current.expenses.length === 0 ? (
                <div className="rounded-2xl p-8 text-center bg-white/[0.025] border border-dashed border-white/[0.10]">
                  <Receipt className="w-7 h-7 mx-auto text-foreground/35 mb-2" />
                  <p className="text-[13px] font-medium m-0">尚无开销</p>
                  <p className="text-[11px] text-foreground/50 m-0 mt-1">点击上方「添加」开始记录</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {current.expenses.map((e, idx) => {
                    const payer = current.members.find(m => m.id === e.payerId);
                    const shareType = e.shares[0]?.type || "equal";
                    return (
                      <div key={e.id} className="rounded-2xl p-4 bg-white/[0.03] border border-white/[0.06]">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-[10px] tracking-[0.18em] uppercase text-foreground/45">#{idx + 1}</span>
                              <span className="text-[10px] tracking-[0.18em] uppercase text-foreground/45 ml-auto">
                                {shareType === "equal" ? "均分" : shareType === "ratio" ? "比例" : shareType === "fixed" ? "固定" : "权重"}
                              </span>
                            </div>
                          </div>
                          <button onClick={() => removeExpense(e.id)}
                                  className="w-7 h-7 rounded-lg bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/15 flex items-center justify-center text-rose-300 transition-all">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5 mb-3">
                          <div className="space-y-1">
                            <Label className="text-[11px]">付款人</Label>
                            <Select value={e.payerId} onValueChange={(v) => {
                              const expenses = [...current.expenses];
                              expenses[idx] = { ...e, payerId: v };
                              setCurrent({ ...current, expenses });
                            }}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {current.members.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px]">金额 ({current.currency})</Label>
                            <Input type="number" placeholder="0.00" value={e.amount} onChange={(ev) => {
                              const expenses = [...current.expenses];
                              expenses[idx] = { ...e, amount: parseFloat(ev.target.value || "0") };
                              setCurrent({ ...current, expenses });
                            }} />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5 mb-3">
                          <div className="space-y-1">
                            <Label className="text-[11px]">分摊方式</Label>
                            <Select value={shareType} onValueChange={(v: ExpenseShareType) => {
                              const expenses = [...current.expenses];
                              const participants = e.participants;
                              let shares: ExpenseShare[];
                              if (v === "equal") shares = participants.map(pid => ({ memberId: pid, type: "equal", value: 1 }));
                              else if (v === "ratio") shares = participants.map(pid => ({ memberId: pid, type: "ratio", value: 1 }));
                              else if (v === "fixed") shares = participants.map(pid => ({ memberId: pid, type: "fixed", value: 0 }));
                              else shares = participants.map(pid => ({ memberId: pid, type: "weight", value: 1 }));
                              expenses[idx] = { ...e, shares };
                              setCurrent({ ...current, expenses });
                            }}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="equal">均分</SelectItem>
                                <SelectItem value="ratio">比例</SelectItem>
                                <SelectItem value="fixed">固定</SelectItem>
                                <SelectItem value="weight">权重</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px]">备注</Label>
                            <Input placeholder="可选" value={e.note || ""} onChange={(ev) => {
                              const expenses = [...current.expenses];
                              expenses[idx] = { ...e, note: ev.target.value };
                              setCurrent({ ...current, expenses });
                            }} />
                          </div>
                        </div>

                        {/* Participant pills */}
                        <div className="space-y-1.5">
                          <Label className="text-[11px]">参与者</Label>
                          <div className="flex flex-wrap gap-1.5">
                            {current.members.map(m => {
                              const active = e.participants.includes(m.id);
                              const [from, to] = colorFor(m.id);
                              return (
                                <button key={m.id} onClick={() => {
                                  const expenses = [...current.expenses];
                                  const participants = active ? e.participants.filter(x => x !== m.id) : [...e.participants, m.id];
                                  const type: ExpenseShareType = (e.shares[0]?.type || "equal") as ExpenseShareType;
                                  const normalized = participants.map(pid => ({ memberId: pid, type, value: type === "fixed" ? 0 : 1 }));
                                  expenses[idx] = { ...e, participants, shares: normalized };
                                  setCurrent({ ...current, expenses });
                                }}
                                  className={`px-2.5 py-1 rounded-full text-[11.5px] font-medium transition-all flex items-center gap-1.5 ${
                                    active
                                      ? "text-white border border-transparent shadow-[0_4px_12px_-4px_rgba(124,58,237,0.4)]"
                                      : "bg-white/[0.04] border border-white/[0.10] text-foreground/55 hover:text-foreground"
                                  }`}
                                  style={active ? { background: `linear-gradient(135deg, ${from}, ${to})` } : {}}
                                >
                                  {m.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Per-participant share values */}
                        {shareType !== "equal" && (
                          <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/[0.04]">
                            {e.participants.map(pid => {
                              const m = current.members.find(mm => mm.id === pid);
                              const s = e.shares.find(ss => ss.memberId === pid);
                              if (!m || !s) return null;
                              return (
                                <div key={pid} className="flex items-center gap-2">
                                  <span className="text-[12px] w-14 truncate">{m.name}</span>
                                  <Input type="number" value={s.value} className="h-9" onChange={(ev) => {
                                    const expenses = [...current.expenses];
                                    const shares = e.shares.map(x => x.memberId === pid ? { ...x, value: parseFloat(ev.target.value || "0") } : x);
                                    expenses[idx] = { ...e, shares };
                                    setCurrent({ ...current, expenses });
                                  }} />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </main>

            {/* RIGHT — net + settlements */}
            <aside className="lg:col-span-3 space-y-4 lg:sticky lg:top-4 lg:self-start">
              <div className="rounded-3xl p-5 bg-white/[0.025] border border-white/[0.06]">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10.5px] tracking-[0.18em] uppercase text-foreground/45 m-0">Net balance</p>
                  <Sparkles className="w-3.5 h-3.5 text-[#fbbf24]" />
                </div>
                {Object.entries(compute.net).length === 0 ? (
                  <p className="text-[12px] text-foreground/50 m-0">添加成员与开销后自动计算</p>
                ) : (
                  <div className="space-y-1.5">
                    {current.members.map(m => {
                      const v = compute.net[m.id] || 0;
                      return (
                        <div key={m.id} className="flex items-center justify-between text-[12.5px]">
                          <span className="truncate">{m.name}</span>
                          <span className={`font-mono font-semibold ${v > 0.005 ? "text-emerald-300" : v < -0.005 ? "text-rose-300" : "text-foreground/55"}`}>
                            {v >= 0 ? "+" : ""}{v.toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-3xl p-5 bg-white/[0.025] border border-white/[0.06]">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10.5px] tracking-[0.18em] uppercase text-foreground/45 m-0">Settlement</p>
                  <span className="text-[11px] text-foreground/55">{compute.settlements.length} 笔</span>
                </div>
                {compute.settlements.length === 0 ? (
                  <p className="text-[12px] text-foreground/50 m-0">尚无清算建议</p>
                ) : (
                  <div className="space-y-2">
                    {compute.settlements.map((s, i) => {
                      const fr = current.members.find(m => m.id === s.fromId);
                      const to = current.members.find(m => m.id === s.toId);
                      return (
                        <div key={i} className="rounded-xl p-2.5 bg-amber-400/8 border border-amber-400/15 flex items-center justify-between">
                          <span className="text-[12px] flex items-center gap-1 truncate">
                            <span className="font-semibold">{fr?.name}</span>
                            <ArrowRight className="w-3 h-3 text-foreground/45" />
                            <span className="font-semibold">{to?.name}</span>
                          </span>
                          <span className="text-[12.5px] font-mono font-bold text-amber-300 shrink-0">{s.amount.toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <Button onClick={saveComputed} className="w-full">
                <Calculator className="w-4 h-4" />计算并保存
              </Button>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
