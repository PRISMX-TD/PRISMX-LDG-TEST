import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  Plus, ArrowUpRight, ArrowDownLeft, Calendar, Clock, Trash2, Pencil,
  HandCoins, Loader2, Users, Sparkles, ChevronRight, ArrowLeft, TrendingUp, TrendingDown,
} from "lucide-react";
import type { Loan, Wallet } from "@shared/schema";
import { supportedCurrencies } from "@shared/schema";
import { Link } from "wouter";
import { useUndoableDelete } from "@/hooks/useUndoableDelete";

/* r7 — Loans page rebuilt from scratch.
   - Hero with 3 gradient stat tiles (asymmetric, not equal grid)
   - People-grouped view as default — see who owes you what at a glance
   - Loan cards now have gradient avatar circle + progress ring
   - All shadcn primitives inherit warm web3 styling from r7 ui/ rewrite */

type LoanFilter = "all" | "active" | "settled" | "bad_debt";

function pickPersonColor(name: string): [string, string] {
  const palette: [string, string][] = [
    ["#a78bfa", "#7c3aed"], ["#fbbf24", "#f59e0b"], ["#f472b6", "#db2777"],
    ["#34d399", "#059669"], ["#60a5fa", "#2563eb"], ["#f87171", "#dc2626"],
    ["#fb923c", "#ea580c"], ["#22d3ee", "#0891b2"],
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export default function Loans() {
  const { user } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [filter, setFilter] = useState<LoanFilter>("all");

  const { data: loans = [], isLoading } = useQuery<Loan[]>({ queryKey: ["/api/loans"] });
  const { data: wallets = [] } = useQuery<Wallet[]>({ queryKey: ["/api/wallets"] });

  const rate = (currency: string) => {
    if (currency === (user?.defaultCurrency || "MYR")) return 1;
    const w = wallets.find(x => x.currency === currency);
    return w ? parseFloat(w.exchangeRateToDefault || "1") : 1;
  };

  const totals = useMemo(() => {
    const lent = loans
      .filter(l => l.type === "lend" && l.status !== "bad_debt")
      .reduce((s, l) => s + (parseFloat(l.totalAmount) - parseFloat(l.paidAmount || "0")) * rate(l.currency), 0);
    const borrowed = loans
      .filter(l => l.type === "borrow")
      .reduce((s, l) => s + (parseFloat(l.totalAmount) - parseFloat(l.paidAmount || "0")) * rate(l.currency), 0);
    return { lent, borrowed, net: lent - borrowed };
  }, [loans, wallets, user]);

  const filtered = useMemo(() => {
    if (filter === "all") return loans;
    return loans.filter(l => l.status === filter);
  }, [loans, filter]);

  // Group by person
  const byPerson = useMemo(() => {
    const map = new Map<string, Loan[]>();
    for (const l of filtered) {
      if (!map.has(l.person)) map.set(l.person, []);
      map.get(l.person)!.push(l);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  const cur = user?.defaultCurrency || "MYR";
  const fmt = (n: number) => n.toLocaleString("zh-CN", { style: "currency", currency: cur });

  return (
    <div className="min-h-screen text-foreground relative">
      <div aria-hidden className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute -top-40 left-1/4 w-[520px] h-[520px] rounded-full opacity-40 blur-3xl"
             style={{ background: "radial-gradient(circle, rgba(167,139,250,0.35) 0%, transparent 70%)" }} />
        <div className="absolute top-1/3 right-0 w-[420px] h-[420px] rounded-full opacity-30 blur-3xl"
             style={{ background: "radial-gradient(circle, rgba(245,158,11,0.25) 0%, transparent 70%)" }} />
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-5 md:py-8 pb-28 md:pb-12 relative">

        {/* HEADER */}
        <header className="flex items-center justify-between mb-6 md:mb-8">
          <div className="flex items-center gap-3">
            <Link href="/people">
              <button className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.10] hover:bg-white/[0.10] flex items-center justify-center text-foreground/70 hover:text-foreground transition-all">
                <ArrowLeft className="w-[18px] h-[18px]" />
              </button>
            </Link>
            <div>
              <p className="text-[11px] tracking-[0.2em] uppercase text-foreground/45 m-0">Loans</p>
              <h1 className="text-[22px] md:text-[28px] font-bold tracking-tight m-0 flex items-center gap-2">
                <HandCoins className="w-5 h-5 text-[#a78bfa]" />借贷管理
              </h1>
            </div>
          </div>
          <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-loan">
            <Plus className="w-4 h-4" />新增借贷
          </Button>
        </header>

        {/* HERO STAT TRIO — asymmetric */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6 lg:mb-8">
          <StatTile
            label="待收回 应收"
            value={fmt(totals.lent)}
            icon={<ArrowUpRight className="w-5 h-5" />}
            tone="emerald"
          />
          <StatTile
            label="待偿还 应付"
            value={fmt(totals.borrowed)}
            icon={<ArrowDownLeft className="w-5 h-5" />}
            tone="rose"
          />
          <StatTile
            label="净头寸"
            value={fmt(totals.net)}
            icon={totals.net >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            tone={totals.net >= 0 ? "violet" : "rose"}
          />
        </section>

        {/* FILTER PILLS */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto custom-scroll">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as LoanFilter)}>
            <TabsList>
              <TabsTrigger value="all">全部 ({loans.length})</TabsTrigger>
              <TabsTrigger value="active">进行中 ({loans.filter(l => l.status === "active").length})</TabsTrigger>
              <TabsTrigger value="settled">已结清 ({loans.filter(l => l.status === "settled").length})</TabsTrigger>
              <TabsTrigger value="bad_debt">坏账 ({loans.filter(l => l.status === "bad_debt").length})</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* LIST */}
        {isLoading ? (
          <div className="rounded-3xl p-12 text-center bg-white/[0.025] border border-white/[0.06]">
            <Loader2 className="w-6 h-6 animate-spin text-[#a78bfa] mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl p-12 text-center bg-white/[0.025] border border-dashed border-white/[0.10]">
            <HandCoins className="w-9 h-9 mx-auto text-foreground/35 mb-3" />
            <p className="text-[14px] font-medium m-0">没有借贷记录</p>
            <p className="text-[12px] text-foreground/50 m-0 mt-1">点击右上角「新增借贷」开始</p>
          </div>
        ) : (
          <div className="space-y-6">
            {byPerson.map(([person, list]) => {
              const [from, to] = pickPersonColor(person);
              const personLent = list.filter(l => l.type === "lend").reduce((s, l) => s + (parseFloat(l.totalAmount) - parseFloat(l.paidAmount || "0")) * rate(l.currency), 0);
              const personBorrowed = list.filter(l => l.type === "borrow").reduce((s, l) => s + (parseFloat(l.totalAmount) - parseFloat(l.paidAmount || "0")) * rate(l.currency), 0);
              const personNet = personLent - personBorrowed;
              return (
                <div key={person}>
                  <div className="flex items-center gap-3 mb-3 px-1">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[14px] font-bold shrink-0"
                         style={{ background: `linear-gradient(135deg, ${from}, ${to})`, boxShadow: `0 6px 18px -8px ${from}` }}>
                      {person.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-bold m-0 truncate">{person}</p>
                      <p className="text-[11px] text-foreground/50 m-0 mt-0.5">{list.length} 笔 · 净 {fmt(personNet)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {list.map(loan => <LoanCard key={loan.id} loan={loan} wallets={wallets} />)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CreateLoanDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} wallets={wallets} />
    </div>
  );
}

/* ---------- Tiles ---------- */
function StatTile({ label, value, icon, tone }: {
  label: string; value: string; icon: React.ReactNode;
  tone: "emerald" | "rose" | "violet";
}) {
  const styles = {
    emerald: { grad: "from-emerald-400/20 to-emerald-600/10", border: "border-emerald-400/20", text: "text-emerald-300", glow: "rgba(52,211,153,0.4)" },
    rose:    { grad: "from-rose-400/20 to-rose-600/10",       border: "border-rose-400/20",    text: "text-rose-300",    glow: "rgba(244,114,182,0.4)" },
    violet:  { grad: "from-violet-400/20 to-violet-600/10",   border: "border-violet-400/20",  text: "text-violet-300",  glow: "rgba(167,139,250,0.4)" },
  }[tone];
  return (
    <div className={`relative overflow-hidden rounded-3xl p-5 md:p-6 bg-gradient-to-br ${styles.grad} border ${styles.border}`}>
      <div aria-hidden className="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl opacity-40"
           style={{ background: `radial-gradient(circle, ${styles.glow} 0%, transparent 70%)` }} />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] tracking-[0.18em] uppercase text-foreground/55 m-0">{label}</p>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${styles.text} bg-white/[0.04] border ${styles.border}`}>
            {icon}
          </div>
        </div>
        <p className={`text-[26px] md:text-[30px] font-bold tabular-nums m-0 ${styles.text}`}>{value}</p>
      </div>
    </div>
  );
}

/* ---------- Loan Card ---------- */
function LoanCard({ loan, wallets }: { loan: Loan; wallets: Wallet[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isRepayOpen, setIsRepayOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editPerson, setEditPerson] = useState(loan.person);
  const [editAmount, setEditAmount] = useState(loan.totalAmount);
  const [editDueDate, setEditDueDate] = useState(loan.dueDate ? format(new Date(loan.dueDate), "yyyy-MM-dd") : "");
  const [editDescription, setEditDescription] = useState(loan.description || "");

  const undoableDeleteFn = useUndoableDelete();
  function deleteLoanWithUndo() {
    void undoableDeleteFn({
      deleteUrl: `/api/loans/${loan.id}`,
      restoreUrl: "/api/loans",
      restorePayload: {
        type: loan.type, person: loan.person, totalAmount: loan.totalAmount,
        currency: loan.currency, paidAmount: loan.paidAmount, status: loan.status,
        startDate: loan.startDate, dueDate: loan.dueDate, description: loan.description,
      },
      invalidateKeys: [["/api/loans"]],
      label: `已删除 ${loan.person} 的借贷`,
    });
  }

  const statusMutation = useMutation({
    mutationFn: async (status: string) => { await apiRequest("PATCH", `/api/loans/${loan.id}`, { status }); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
      toast({ title: "状态已更新" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/loans/${loan.id}`, {
        person: editPerson.trim(),
        totalAmount: editAmount,
        dueDate: editDueDate ? new Date(editDueDate).toISOString() : null,
        description: editDescription || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
      toast({ title: "已更新" });
      setIsEditOpen(false);
    },
    onError: (e: any) => toast({ title: "更新失败", description: e.message, variant: "destructive" }),
  });

  const total = parseFloat(loan.totalAmount);
  const paid = parseFloat(loan.paidAmount || "0");
  const remaining = total - paid;
  const progress = Math.min(100, total > 0 ? (paid / total) * 100 : 0);
  const isLend = loan.type === "lend";
  const isSettled = loan.status === "settled";
  const isBadDebt = loan.status === "bad_debt";
  const isOverdue = loan.dueDate && new Date(loan.dueDate) < new Date() && !isSettled && !isBadDebt;

  return (
    <div className={`relative overflow-hidden rounded-2xl p-4 transition-all hover:-translate-y-0.5 ${
      isSettled || isBadDebt
        ? "bg-white/[0.015] border border-white/[0.04] opacity-65"
        : "bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.16]"
    }`}>
      {/* Status corner badge */}
      {(isSettled || isBadDebt) && (
        <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ${
          isSettled
            ? "bg-emerald-400/15 text-emerald-300 border border-emerald-400/25"
            : "bg-rose-400/15 text-rose-300 border border-rose-400/25"
        }`}>
          {isSettled ? "已结清" : "坏账"}
        </div>
      )}

      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
            isLend
              ? "bg-emerald-400/15 text-emerald-300 border border-emerald-400/25"
              : "bg-rose-400/15 text-rose-300 border border-rose-400/25"
          }`}>
            {isLend ? "借出" : "借入"}
          </span>
          {isOverdue && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/15 text-amber-300 border border-amber-400/25">
              逾期
            </span>
          )}
        </div>
      </div>

      <div className="flex items-baseline gap-1.5 mb-3">
        <span className={`text-[22px] font-bold tabular-nums ${isLend ? "text-emerald-300" : "text-rose-300"}`}>
          {remaining.toFixed(2)}
        </span>
        <span className="text-[11px] text-foreground/55">{loan.currency}</span>
        <span className="ml-auto text-[10.5px] text-foreground/40">总 {total.toFixed(2)}</span>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between text-[10px] text-foreground/45 mb-1.5">
          <span>已还 {paid.toFixed(2)}</span>
          <span>{progress.toFixed(0)}%</span>
        </div>
        <div className="h-1.5 w-full bg-white/[0.04] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progress}%`,
              background: isLend
                ? "linear-gradient(90deg, #34d399, #10b981)"
                : "linear-gradient(90deg, #fb7185, #e11d48)",
              boxShadow: isLend ? "0 0 8px rgba(52,211,153,0.5)" : "0 0 8px rgba(244,114,182,0.5)",
            }}
          />
        </div>
      </div>

      {/* Dates */}
      <div className="flex items-center gap-3 text-[10.5px] text-foreground/50 mb-3">
        <span className="inline-flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          {format(new Date(loan.startDate), "MM-dd")}
        </span>
        {loan.dueDate && (
          <span className={`inline-flex items-center gap-1 ${isOverdue ? "text-amber-300 font-semibold" : ""}`}>
            <Clock className="w-3 h-3" />
            到期 {format(new Date(loan.dueDate), "MM-dd")}
          </span>
        )}
      </div>

      {loan.description && (
        <p className="text-[11.5px] text-foreground/55 m-0 mb-3 line-clamp-2">{loan.description}</p>
      )}

      {/* Action row */}
      <div className="flex gap-1.5 pt-2 border-t border-white/[0.04]">
        {!isSettled && !isBadDebt && (
          <Button size="sm" className="flex-1" onClick={() => setIsRepayOpen(true)}>
            {isLend ? "收款" : "还款"}
          </Button>
        )}
        {!isSettled && !isBadDebt && isLend && (
          <Button size="sm" variant="outline" className="text-rose-300 hover:bg-rose-500/10"
                  onClick={() => { if (confirm("确定要标记为坏账吗？")) statusMutation.mutate("bad_debt"); }}>
            坏账
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setIsEditOpen(true)} aria-label="编辑">
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="text-rose-300 hover:bg-rose-500/10"
                onClick={() => { if (confirm("确定要删除？30 秒内可在 toast 中撤销。")) deleteLoanWithUndo(); }}
                aria-label="删除">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      <RepayDialog open={isRepayOpen} onOpenChange={setIsRepayOpen} loan={loan} />

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>编辑借贷记录</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>对方</Label><Input value={editPerson} onChange={(e) => setEditPerson(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>总金额 ({loan.currency})</Label><Input type="number" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>到期日（可空）</Label><Input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>备注</Label><Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>取消</Button>
            <Button disabled={editMutation.isPending || !editPerson.trim() || !editAmount} onClick={() => editMutation.mutate()}>
              {editMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} 保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- Create dialog ---------- */
function CreateLoanDialog({ open, onOpenChange, wallets }: {
  open: boolean; onOpenChange: (open: boolean) => void; wallets: Wallet[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    type: "lend",
    person: "",
    amount: "",
    currency: "MYR",
    walletId: "",
    startDate: format(new Date(), "yyyy-MM-dd"),
    dueDate: "",
    description: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.person || !formData.amount || !formData.walletId) {
      toast({ title: "请填写必填项", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const loanRes = await apiRequest("POST", "/api/loans", {
        type: formData.type,
        person: formData.person,
        totalAmount: formData.amount,
        currency: formData.currency,
        startDate: new Date(formData.startDate).toISOString(),
        dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : null,
        description: formData.description,
        status: "active",
      });
      const loan = await loanRes.json();

      await apiRequest("POST", "/api/transactions", {
        type: formData.type === "lend" ? "expense" : "income",
        amount: parseFloat(formData.amount),
        walletId: parseInt(formData.walletId),
        date: new Date(formData.startDate).toISOString(),
        description: `${formData.type === "lend" ? "借给" : "向某人借款"}: ${formData.person}`,
        loanId: loan.id,
      });

      toast({ title: "借贷记录已创建", description: "已自动记录资金流水" });
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      onOpenChange(false);
      setFormData({
        type: "lend", person: "", amount: "", currency: "MYR", walletId: "",
        startDate: format(new Date(), "yyyy-MM-dd"), dueDate: "", description: "",
      });
    } catch {
      toast({ title: "创建失败", description: "请重试", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>新增借贷</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>类型</Label>
              <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lend">我借出 (别人欠我)</SelectItem>
                  <SelectItem value="borrow">我借入 (我欠别人)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>对方姓名</Label>
              <Input placeholder="张三" value={formData.person} onChange={(e) => setFormData({ ...formData, person: e.target.value })} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>金额</Label>
              <div className="flex gap-2">
                <Input type="number" placeholder="0.00" min="0.01" step="0.01"
                       value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                       className="flex-1" />
                <Select value={formData.currency} onValueChange={(v) => setFormData({ ...formData, currency: v })}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {supportedCurrencies.map(c => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>关联钱包</Label>
              <Select value={formData.walletId} onValueChange={(v) => setFormData({ ...formData, walletId: v })}>
                <SelectTrigger><SelectValue placeholder="选择钱包" /></SelectTrigger>
                <SelectContent>
                  {wallets.map(w => <SelectItem key={w.id} value={w.id.toString()}>{w.name} ({w.currency})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>借款日期</Label><Input type="date" value={formData.startDate} onChange={(e) => setFormData({ ...formData, startDate: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>约定还款日</Label><Input type="date" value={formData.dueDate} onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })} /></div>
          </div>

          <div className="space-y-1.5">
            <Label>备注</Label>
            <Textarea placeholder="借款用途等..." value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSubmitting ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Repay dialog (FX logic preserved verbatim from r6) ---------- */
function RepayDialog({ open, onOpenChange, loan }: {
  open: boolean; onOpenChange: (open: boolean) => void; loan: Loan;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { data: wallets = [] } = useQuery<Wallet[]>({ queryKey: ["/api/wallets"] });
  const remaining = parseFloat(loan.totalAmount) - parseFloat(loan.paidAmount || "0");

  const [formData, setFormData] = useState({
    amount: remaining.toFixed(2),
    currency: loan.currency,
    walletId: "",
    date: format(new Date(), "yyyy-MM-dd"),
    description: "",
    exchangeRate: "",
  });

  const selectedWallet = wallets.find(w => w.id.toString() === formData.walletId);
  const inputCurrency = formData.currency;
  const walletCurrency = selectedWallet?.currency;
  const isInputDiffWallet = selectedWallet && inputCurrency !== walletCurrency;
  const isInputDiffLoan = inputCurrency !== loan.currency;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || !formData.walletId) {
      toast({ title: "请填写必填项", variant: "destructive" });
      return;
    }
    if ((isInputDiffWallet || isInputDiffLoan) && !formData.exchangeRate) {
      toast({ title: "跨币种还款需要填写汇率", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const type = loan.type === "lend" ? "income" : "expense";
      const inputAmount = parseFloat(formData.amount);
      let walletAmount = inputAmount;
      let finalRate = 1;
      let finalCurrency = inputCurrency;

      if (inputCurrency === walletCurrency) {
        if (isInputDiffLoan) {
          const rateWalletToLoan = parseFloat(formData.exchangeRate);
          finalRate = 1 / rateWalletToLoan;
        } else {
          finalRate = 1;
        }
        walletAmount = inputAmount;
        finalCurrency = walletCurrency!;
      } else {
        const rateLoanToWallet = parseFloat(formData.exchangeRate);
        walletAmount = inputAmount * rateLoanToWallet;
        finalRate = rateLoanToWallet;
        finalCurrency = walletCurrency || loan.currency;
      }

      await apiRequest("POST", "/api/transactions", {
        type, amount: walletAmount, currency: finalCurrency, exchangeRate: finalRate,
        walletId: parseInt(formData.walletId),
        date: new Date(formData.date).toISOString(),
        description: `还款: ${loan.person} ${formData.description ? `(${formData.description})` : ""}`,
        loanId: loan.id,
      });

      toast({ title: "还款记录已保存" });
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      onOpenChange(false);
    } catch {
      toast({ title: "保存失败", description: "请重试", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{loan.type === "lend" ? "收款 (对方还钱)" : "还款 (我还钱)"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>还款金额 (剩余 {remaining.toFixed(2)} {loan.currency})</Label>
            <div className="flex gap-2">
              <Input type="number" placeholder="0.00" min="0.01" step="0.01"
                     value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                     className="flex-1" />
              <Select value={formData.currency} onValueChange={(v) => setFormData({ ...formData, currency: v })}>
                <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={loan.currency}>{loan.currency}</SelectItem>
                  {selectedWallet && selectedWallet.currency !== loan.currency && (
                    <SelectItem value={selectedWallet.currency}>{selectedWallet.currency}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{loan.type === "lend" ? "存入钱包" : "扣款钱包"}</Label>
            <Select value={formData.walletId} onValueChange={(v) => {
              const w = wallets.find(x => x.id.toString() === v);
              let newCurrency = formData.currency;
              if (formData.currency !== loan.currency) newCurrency = w?.currency || loan.currency;
              setFormData({ ...formData, walletId: v, currency: newCurrency });
            }}>
              <SelectTrigger><SelectValue placeholder="选择钱包" /></SelectTrigger>
              <SelectContent>
                {wallets.map(w => <SelectItem key={w.id} value={w.id.toString()}>{w.name} ({w.currency})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {(isInputDiffWallet || isInputDiffLoan) && (
            <div className="space-y-2 p-3 rounded-2xl bg-amber-400/10 border border-amber-400/20">
              <Label className="text-amber-300">汇率换算</Label>
              <p className="text-[11.5px] text-foreground/65 m-0 mb-2">
                {isInputDiffLoan ? <>还款币种 ({inputCurrency}) 与借贷币种 ({loan.currency}) 不同。<br />设置: 1 {inputCurrency} = ? {loan.currency}</>
                                 : <>还款币种 ({inputCurrency}) 与钱包币种 ({walletCurrency}) 不同。<br />设置: 1 {inputCurrency} = ? {walletCurrency}</>}
              </p>
              <Input type="number" placeholder="4.5" min="0.000001" step="0.000001"
                     value={formData.exchangeRate} onChange={(e) => setFormData({ ...formData, exchangeRate: e.target.value })} />
              {formData.amount && formData.exchangeRate && (
                <p className="text-[12px] text-right m-0 mt-1.5">
                  {isInputDiffLoan ? <>抵消借贷 <span className="font-bold text-foreground ml-1">{(parseFloat(formData.amount) * parseFloat(formData.exchangeRate)).toFixed(2)} {loan.currency}</span></>
                                   : <>实际{loan.type === "lend" ? "入账" : "扣款"} <span className="font-bold text-foreground ml-1">{(parseFloat(formData.amount) * parseFloat(formData.exchangeRate)).toFixed(2)} {walletCurrency}</span></>}
                </p>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>日期</Label><Input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>备注</Label><Input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} /></div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSubmitting ? "保存中..." : "确认"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
