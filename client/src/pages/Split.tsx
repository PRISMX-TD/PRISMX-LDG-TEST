import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Calculator, Trash2, Pencil, Users, Loader2, Info, ArrowLeft } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { supportedCurrencies } from "@shared/schema";

type Member = { id: string; name: string; weight?: number };
type ExpenseShareType = "equal" | "ratio" | "fixed" | "weight";
type ExpenseShare = { memberId: string; type: ExpenseShareType; value: number };
type Expense = { id: string; payerId: string; amount: number; date?: string; originalCurrency?: string; exchangeRate?: number; note?: string; participants: string[]; shares: ExpenseShare[] };

type GroupPayload = {
  members: Member[];
  expenses: Expense[];
  currency: string;
  computed?: {
    net: Record<string, number>;
    settlements: { fromId: string; toId: string; amount: number }[];
    timestamp: string;
  };
};

import { PageContainer } from "@/components/PageContainer";

export default function Split() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [currency, setCurrency] = useState<string>(supportedCurrencies[0].code);
  const [, params] = useRoute("/split/:id");
  const [loc, setLoc] = useLocation();
  const routeId = params?.id ? parseInt(params.id) : null;
  const [editingId, setEditingId] = useState<number | null>(routeId);
  const [current, setCurrent] = useState<GroupPayload | null>(null);
  const firstLoad = useRef(true);
  const [newMemberName, setNewMemberName] = useState("");

  useEffect(() => {
    if (routeId && routeId !== editingId) {
      setEditingId(routeId);
    }
    if (!routeId && editingId) {
      setEditingId(null);
    }
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
          if (msg.toLowerCase().includes("unauthorized")) {
            toast({ title: "请登录后使用", variant: "destructive" });
          } else {
            toast({ title: "活动不存在或已删除", variant: "destructive" });
          }
          setLoc("/split");
        });
    } else {
      setCurrent(null);
    }
  }, [editingId]);

  const invalidateGroups = () => {
    queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === "/api/groups" });
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/groups", data).then((res) => res.json()),
    onSuccess: (created: any) => {
      invalidateGroups();
      setCreateOpen(false);
      setTitle("");
      toast({ title: "活动已创建" });
      if (created?.id) {
        setEditingId(created.id);
        setLoc(`/split/${created.id}`);
      }
    },
    onError: () => toast({ title: "创建失败", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", `/api/groups/${editingId}`, data).then((res) => res.json()),
    onSuccess: (_res, variables) => {
      invalidateGroups();
      if (!variables?.__silent) {
        toast({ title: "已保存" });
      }
    },
    onError: () => toast({ title: "保存失败", variant: "destructive" }),
  });

  // Debounced auto-save of payload while editing
  useEffect(() => {
    if (!editingId || !current) return;
    if (firstLoad.current) return;
    const handle = setTimeout(() => {
      const payload: GroupPayload = {
        members: current.members,
        expenses: current.expenses,
        currency: current.currency,
        computed: current.computed,
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
    const n = name.trim();
    if (!n) return;
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
    const updated = { ...current, members, expenses };
    setCurrent(updated);
    updateMutation.mutate({ payload: updated, __silent: true });
  };

  const addExpense = () => {
    if (!current || current.members.length === 0) return;
    const id = Math.random().toString(36).slice(2);
    const payerId = current.members[0].id;
    const participants = current.members.map(m => m.id);
    const amount = 0;
    const shares = participants.map(pid => ({ memberId: pid, type: "equal" as ExpenseShareType, value: 1 }));
    const e: Expense = { id, payerId, amount, date: new Date().toISOString(), participants, shares, note: "", originalCurrency: current.currency, exchangeRate: 1 };
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
          const val = s ? s.value : 0;
          net[pid] -= val;
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
    const debtors = Object.entries(net).filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
    creditors.sort((a, b) => b.v - a.v);
    debtors.sort((a, b) => b.v - a.v);
    const settlements: { fromId: string; toId: string; amount: number }[] = [];
    let i = 0, j = 0;
    while (i < creditors.length && j < debtors.length) {
      const c = creditors[i];
      const d = debtors[j];
      const x = Math.min(c.v, d.v);
      if (x > 0) settlements.push({ fromId: d.id, toId: c.id, amount: parseFloat(x.toFixed(2)) });
      c.v -= x;
      d.v -= x;
      if (c.v <= 1e-6) i++;
      if (d.v <= 1e-6) j++;
    }
    return { net, settlements };
  }, [current]);

  const saveComputed = () => {
    if (!current || !editingId) return;
    const payload: GroupPayload = {
      members: current.members,
      expenses: current.expenses,
      currency: current.currency,
      computed: { net: compute.net, settlements: compute.settlements, timestamp: new Date().toISOString() },
    };
    updateMutation.mutate({ payload });
  };

  return (
    <PageContainer>
      <div className="space-y-5 md:space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
            <ArrowLeft className="w-4 h-4 mr-1" />
            返回
          </Button>
        </Link>
        <h1 className="text-2xl font-semibold flex items-center gap-2 text-white">
          <Users className="w-6 h-6 text-neon-purple" />
          费用分摊
        </h1>
        <Button onClick={() => setCreateOpen(true)} data-testid="button-add-group" className="ml-auto">
          <Plus className="w-4 h-4 mr-1" />
          新建活动
        </Button>
      </div>

      {isLoading ? (
        <div className="p-6 flex items-center justify-center min-h-[40vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {groups.map((g) => (
            <Link key={g.id} href={`/split/${g.id}`} className="block">
                <Card className="glass-card hover-elevate h-full">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">{g.title}</CardTitle>
                        <Badge variant="secondary" className="text-xs mt-1">{g.currency}</Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.preventDefault(); setLoc(`/split/${g.id}`); }}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={(e) => { e.preventDefault(); deleteMutation.mutate(g.id); }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {g.payload?.computed?.settlements?.length ? (
                      <div className="text-sm space-y-1">
                        {g.payload.computed.settlements.slice(0, 3).map((s: any, idx: number) => (
                          <div key={idx} className="flex justify-between">
                            <span>{(g.payload.members || []).find((m: any) => m.id === s.fromId)?.name} → {(g.payload.members || []).find((m: any) => m.id === s.toId)?.name}</span>
                            <span className="font-mono">{s.amount.toFixed ? s.amount.toFixed(2) : Number(s.amount).toFixed(2)} {g.currency}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">暂无计算结果</p>
                    )}
                  </CardContent>
                </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader className="pb-2">
            <DialogTitle>创建活动</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>名称</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>币种</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {supportedCurrencies.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
              <Button onClick={() => createMutation.mutate({ title: title.trim(), currency })}>
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                创建
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {editingId && current && (
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">编辑活动</CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-8 space-y-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>币种</Label>
                    <Select value={current.currency} onValueChange={(v) => setCurrent({ ...current, currency: v })}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {supportedCurrencies.map((c) => (
                          <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>添加成员</Label>
                    <div className="flex items-center gap-2">
                      <Input placeholder="姓名" value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} />
                      <Button onClick={() => addMember(newMemberName)}>添加</Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {current.members.map(m => (
                        <Badge key={m.id} variant="secondary" className="flex items-center gap-1">
                          {m.name}
                          <Button variant="ghost" size="icon" className="h-4 w-4 p-0" onClick={() => removeMember(m.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>操作</Label>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => updateMutation.mutate({ payload: { members: current.members, expenses: current.expenses, currency: current.currency, computed: current.computed } })}>保存草稿</Button>
                      <Button variant="ghost" onClick={addExpense}>
                        <Plus className="w-4 h-4 mr-1" />添加费用
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-5">
                  {current.expenses.map((e, idx) => (
                    <div key={e.id} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-start p-3 border rounded-lg">
                      <div className="space-y-2">
                        <Label className="mb-1 block">付款人</Label>
                          <Select value={e.payerId} onValueChange={(v) => {
                            const expenses = [...current.expenses];
                            expenses[idx] = { ...e, payerId: v };
                            setCurrent({ ...current, expenses });
                          }}>
                            <SelectTrigger className="w-full md:w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {current.members.map(m => (
                                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="mb-1 block">金额（{current.currency}）</Label>
                        <Input type="number" placeholder={`例如 100.00`} value={e.amount} onChange={(ev) => {
                          const expenses = [...current.expenses];
                          expenses[idx] = { ...e, amount: parseFloat(ev.target.value || "0") };
                          setCurrent({ ...current, expenses });
                        }} />
                        <div className="mt-2">
                          <Label className="mb-1 block">日期</Label>
                          <Input type="datetime-local" value={e.date ? new Date(e.date).toISOString().slice(0,16) : ""} onChange={(ev) => {
                            const expenses = [...current.expenses];
                            const iso = ev.target.value ? new Date(ev.target.value).toISOString() : new Date().toISOString();
                            expenses[idx] = { ...e, date: iso };
                            setCurrent({ ...current, expenses });
                          }} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="mb-1 block">分摊方式</Label>
                        <Select value={e.shares.every(s => s.type === "equal") ? "equal" : e.shares[0]?.type || "equal"} onValueChange={(v: ExpenseShareType) => {
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
                          <SelectTrigger className="w-full md:w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="equal">均分</SelectItem>
                            <SelectItem value="ratio">比例</SelectItem>
                            <SelectItem value="fixed">固定</SelectItem>
                            <SelectItem value="weight">权重</SelectItem>
                          </SelectContent>
                        </Select>
                        {e.shares[0]?.type !== "equal" && (
                          <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                            {e.participants.map(pid => {
                              const m = current.members.find(mm => mm.id === pid)!;
                              const s = e.shares.find(ss => ss.memberId === pid)!;
                              return (
                                <div key={pid} className="flex items-center gap-2">
                                  <span className="text-sm w-16 truncate">{m.name}</span>
                                  <Input type="number" value={s.value} onChange={(ev) => {
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
                      <div className="space-y-2">
                        <Label className="mb-1 block">参与者</Label>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {current.members.map(m => (
                            <Button key={m.id} variant={e.participants.includes(m.id) ? "secondary" : "outline"} onClick={() => {
                              const expenses = [...current.expenses];
                              const participants = e.participants.includes(m.id)
                                ? e.participants.filter(x => x !== m.id)
                                : [...e.participants, m.id];
                              const shares = e.shares.filter(s => participants.includes(s.memberId));
                              const type = shares[0]?.type || "equal";
                              const normalized = participants.map(pid => ({ memberId: pid, type: type as ExpenseShareType, value: type === "fixed" ? 0 : 1 }));
                              expenses[idx] = { ...e, participants, shares: normalized };
                              setCurrent({ ...current, expenses });
                            }}>
                              {m.name}
                            </Button>
                          ))}
                        </div>
                        <div className="mt-2">
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeExpense(e.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="mb-1 block">备注 / 原币与汇率</Label>
                        <Input placeholder="备注（可选）" value={e.note || ""} onChange={(ev) => {
                          const expenses = [...current.expenses];
                          expenses[idx] = { ...e, note: ev.target.value };
                          setCurrent({ ...current, expenses });
                        }} />
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <Select value={e.originalCurrency || current.currency} onValueChange={(v) => {
                            const expenses = [...current.expenses];
                            expenses[idx] = { ...e, originalCurrency: v };
                            setCurrent({ ...current, expenses });
                          }}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {supportedCurrencies.map(c => (
                                <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input type="number" placeholder="汇率（原币→活动币）" value={e.exchangeRate ?? 1} onChange={(ev) => {
                            const rate = parseFloat(ev.target.value || "1");
                            const expenses = [...current.expenses];
                            expenses[idx] = { ...e, exchangeRate: isNaN(rate) ? 1 : rate };
                            setCurrent({ ...current, expenses });
                          }} />
                        </div>
                      </div>
                    </div>
                  ))}
                  </div>
                </div>
              </div>
              <div className="lg:col-span-4 space-y-6 lg:top-4">
                <Card className="flex-1">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Info className="w-4 h-4" />结果说明
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  {Object.entries(compute.net).length > 0 ? (
                    <>
                      <div className="text-muted-foreground">净值：正数=应收，负数=应付</div>
                      <div className="space-y-1">
                        {current.members.map(m => (
                          <div key={m.id} className="flex justify-between">
                            <span>{m.name}</span>
                            <span className="font-mono">{(compute.net[m.id] || 0).toFixed(2)} {current.currency}</span>
                          </div>
                        ))}
                      </div>
                      <div className="pt-2 border-t border-border/50">
                        <div className="font-medium">清算建议（最少笔数）</div>
                        {compute.settlements.length > 0 ? (
                          <div className="space-y-1">
                            {compute.settlements.map((s, i) => (
                              <div key={i} className="flex justify-between">
                                <span>{current.members.find(m => m.id === s.fromId)?.name} → {current.members.find(m => m.id === s.toId)?.name}</span>
                                <span className="font-mono">{s.amount.toFixed(2)} {current.currency}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-muted-foreground">暂无清算建议</div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-muted-foreground">添加费用后可计算净值与清算建议</div>
                  )}
                </CardContent>
                </Card>
                <div className="flex md:items-center">
                  <Button onClick={saveComputed} className="w-full md:w-auto">
                    <Calculator className="w-4 h-4 mr-1" />计算并保存
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      </div>
    </PageContainer>
  );
}
