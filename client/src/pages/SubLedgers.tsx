import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BookOpen, Plus, MoreVertical, Pencil, Trash2, Archive, ArchiveRestore,
  Calendar, ChartLine, Loader2, Receipt, Target, AlertTriangle, ArrowLeft,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import { SubLedgerModal } from "@/components/SubLedgerModal";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SubLedger, Transaction, Wallet, Category } from "@shared/schema";
import { useUndoableDelete } from "@/hooks/useUndoableDelete";

/* r7 — SubLedgers rewritten from scratch.
   - Hero with archive toggle + create button as glass capsule
   - Cards: gradient color stripe + accent corner glow, big balance with sub-currency line,
     budget progress as gradient pill, full hover lift, dropdown intact
   - Archived section uses muted variant of the same card */

const ICON_LABELS: Record<string, string> = {
  trip: "旅行", project: "项目", event: "活动", wedding: "婚礼",
  renovation: "装修", education: "教育", business: "业务", other: "其他",
};

export default function SubLedgers() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [showArchived, setShowArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSubLedger, setEditingSubLedger] = useState<SubLedger | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SubLedger | null>(null);

  const { data: subLedgers = [], isLoading } = useQuery<SubLedger[]>({
    queryKey: [`/api/sub-ledgers?includeArchived=${showArchived}`],
  });
  const { data: transactions = [] } = useQuery<Transaction[]>({ queryKey: ["/api/transactions"] });
  const { data: wallets = [] } = useQuery<Wallet[]>({ queryKey: ["/api/wallets"] });
  const { data: categories = [] } = useQuery<Category[]>({ queryKey: ["/api/categories"] });

  const getConverted = (t: Transaction): number => {
    const raw = parseFloat(t.amount);
    const w = wallets.find((x) => x.id === t.walletId);
    const rate = parseFloat(w?.exchangeRateToDefault || "1");
    return raw * rate;
  };

  const invalidate = () => queryClient.invalidateQueries({
    predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/sub-ledgers"),
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, isArchived }: { id: number; isArchived: boolean }) =>
      apiRequest("PATCH", `/api/sub-ledgers/${id}`, { isArchived }),
    onSuccess: () => { invalidate(); toast({ title: "操作成功" }); },
    onError: () => toast({ title: "操作失败", variant: "destructive" }),
  });

  const undoableDelete = useUndoableDelete();
  function handleSubLedgerDelete(sl: SubLedger) {
    void undoableDelete({
      deleteUrl: `/api/sub-ledgers/${sl.id}`,
      restoreUrl: "/api/sub-ledgers",
      restorePayload: {
        name: sl.name, description: sl.description, icon: sl.icon, color: sl.color,
        budgetAmount: sl.budgetAmount, includeInMainAnalytics: sl.includeInMainAnalytics,
        currency: sl.currency, startDate: sl.startDate, endDate: sl.endDate,
      },
      invalidateKeys: [
        ["/api/sub-ledgers?includeArchived=true"],
        ["/api/sub-ledgers?includeArchived=false"],
      ],
      label: `已删除子账本 "${sl.name}"`,
      onSuccess: () => setDeleteTarget(null),
    });
  }

  const getStats = (sl: SubLedger) => {
    const tx = transactions.filter(t => t.subLedgerId === sl.id);
    let income = 0, expense = 0, originalIncome = 0, originalExpense = 0;
    const target = sl.currency || "MYR";
    tx.forEach(t => {
      const a = getConverted(t);
      if (t.type === "income") income += a;
      else if (t.type === "expense") expense += a;

      let targetAmount = 0;
      if (t.currency === target) {
        if (t.originalAmount) targetAmount = parseFloat(t.originalAmount);
        else targetAmount = parseFloat(t.amount);
      } else {
        const w = wallets.find(x => x.id === t.walletId);
        if (w && w.currency === target) targetAmount = parseFloat(t.amount);
      }
      if (t.type === "income") originalIncome += targetAmount;
      else if (t.type === "expense") originalExpense += targetAmount;
    });
    return { count: tx.length, income, expense, balance: income - expense, originalIncome, originalExpense, originalBalance: originalIncome - originalExpense };
  };

  const handleEdit = (sl: SubLedger) => { setEditingSubLedger(sl); setModalOpen(true); };
  const handleCloseModal = (open?: boolean) => {
    if (open === true) { setModalOpen(true); return; }
    setModalOpen(false); setEditingSubLedger(null);
  };

  const active = subLedgers.filter(s => !s.isArchived);
  const archived = subLedgers.filter(s => s.isArchived);
  const defaultCur = user?.defaultCurrency || "MYR";

  return (
    <div className="min-h-screen text-foreground relative">
      <div aria-hidden className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute -top-40 left-1/3 w-[520px] h-[520px] rounded-full opacity-40 blur-3xl"
             style={{ background: "radial-gradient(circle, rgba(167,139,250,0.30) 0%, transparent 70%)" }} />
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-5 md:py-8 pb-20 md:pb-12 relative">

        {/* HEADER */}
        <header className="flex items-center justify-between mb-6 md:mb-8 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link href="/insights">
              <button className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.10] hover:bg-white/[0.10] flex items-center justify-center text-foreground/70 hover:text-foreground transition-all">
                <ArrowLeft className="w-[18px] h-[18px]" />
              </button>
            </Link>
            <div>
              <p className="text-[11px] tracking-[0.2em] uppercase text-foreground/45 m-0">Sub-ledgers</p>
              <h1 className="text-[22px] md:text-[28px] font-bold tracking-tight m-0 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#a78bfa]" />子账本
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-white/[0.04] border border-white/[0.08] cursor-pointer">
              <Switch id="showArchived" checked={showArchived} onCheckedChange={setShowArchived} data-testid="switch-show-archived" />
              <span className="text-[11.5px] text-foreground/70 hidden sm:inline">显示已归档</span>
            </label>
            <Button onClick={() => setModalOpen(true)} data-testid="button-add-subledger">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">新建子账本</span>
              <span className="sm:hidden">新建</span>
            </Button>
          </div>
        </header>

        {isLoading ? (
          <div className="rounded-3xl p-12 text-center bg-white/[0.025] border border-white/[0.06]">
            <Loader2 className="w-6 h-6 animate-spin text-[#a78bfa] mx-auto" />
          </div>
        ) : (
          <>
            {active.length === 0 && !showArchived ? (
              <div className="rounded-3xl p-10 md:p-12 text-center bg-white/[0.025] border border-dashed border-white/[0.10]">
                <BookOpen className="w-9 h-9 mx-auto text-foreground/35 mb-3" />
                <p className="text-[14px] font-medium m-0">暂无子账本</p>
                <p className="text-[12px] text-foreground/50 m-0 mt-1 mb-5 max-w-sm mx-auto">
                  子账本可以帮助你单独追踪特定项目或旅行的收支
                </p>
                <Button onClick={() => setModalOpen(true)}><Plus className="w-4 h-4" />创建子账本</Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {active.map(sl => {
                  const stats = getStats(sl);
                  const color = sl.color || "#a78bfa";
                  const hasBudget = sl.budgetAmount && parseFloat(sl.budgetAmount) > 0;
                  const budget = hasBudget ? parseFloat(sl.budgetAmount!) : 0;
                  const pct = hasBudget ? Math.min((stats.expense / budget) * 100, 100) : 0;
                  const over = hasBudget && stats.expense > budget;
                  return (
                    <div
                      key={sl.id}
                      onClick={() => setLocation(`/sub-ledgers/${sl.id}`)}
                      className="group cursor-pointer rounded-3xl p-5 bg-white/[0.025] border border-white/[0.06] hover:border-white/[0.18] hover:bg-white/[0.04] transition-all hover:-translate-y-0.5 relative overflow-hidden"
                      data-testid={`card-subledger-${sl.id}`}
                    >
                      {/* color stripe */}
                      <div aria-hidden className="absolute top-0 left-0 right-0 h-1" style={{ background: `linear-gradient(90deg, ${color}, ${color}aa)` }} />
                      <div aria-hidden className="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl opacity-0 group-hover:opacity-50 transition-opacity"
                           style={{ background: `radial-gradient(circle, ${color}66 0%, transparent 70%)` }} />

                      <div className="relative pt-1">
                        {/* header */}
                        <div className="flex items-start justify-between gap-2 mb-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                                 style={{ background: `${color}22`, border: `1px solid ${color}33` }}>
                              <BookOpen className="w-5 h-5" style={{ color }} />
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-[15px] font-bold m-0 truncate">{sl.name}</h3>
                              <span className="text-[10px] tracking-[0.18em] uppercase text-foreground/45 mt-0.5">
                                {ICON_LABELS[sl.icon || "other"] || "其他"}
                              </span>
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                onClick={(e) => e.stopPropagation()}
                                aria-label="更多"
                                data-testid={`button-menu-subledger-${sl.id}`}
                                className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.10] flex items-center justify-center text-foreground/65 hover:text-foreground transition-all"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleEdit(sl); }}>
                                <Pencil className="w-4 h-4 mr-2" />编辑
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); archiveMutation.mutate({ id: sl.id, isArchived: true }); }}>
                                <Archive className="w-4 h-4 mr-2" />归档
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setDeleteTarget(sl); }} className="text-rose-300">
                                <Trash2 className="w-4 h-4 mr-2" />删除
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {sl.description && (
                          <p className="text-[12px] text-foreground/55 m-0 mb-4 line-clamp-2">{sl.description}</p>
                        )}

                        {/* meta pills */}
                        <div className="flex items-center flex-wrap gap-1.5 mb-4">
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/[0.04] border border-white/[0.06] text-[10.5px] font-medium text-foreground/65">
                            <Receipt className="w-3 h-3" />{stats.count} 笔
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/[0.04] border border-white/[0.06] text-[10.5px] font-medium text-foreground/65">
                            {sl.currency || "MYR"}
                          </span>
                          {(sl.startDate || sl.endDate) && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/[0.04] border border-white/[0.06] text-[10.5px] font-medium text-foreground/65">
                              <Calendar className="w-3 h-3" />
                              {sl.startDate ? format(new Date(sl.startDate), "MM/dd") : "?"}–{sl.endDate ? format(new Date(sl.endDate), "MM/dd") : "?"}
                            </span>
                          )}
                        </div>

                        {/* income/expense tiles */}
                        <div className="grid grid-cols-2 gap-2 mb-4">
                          <div className="rounded-2xl p-3 bg-emerald-400/8 border border-emerald-400/15">
                            <p className="text-[10px] tracking-[0.18em] uppercase text-emerald-300/70 m-0">收入</p>
                            <p className="text-[15px] font-bold font-mono m-0 text-emerald-300 truncate">+{stats.income.toFixed(2)}</p>
                            {sl.currency && sl.currency !== defaultCur && stats.originalIncome > 0 && (
                              <p className="text-[9.5px] text-foreground/40 m-0 mt-0.5">({stats.originalIncome.toFixed(2)} {sl.currency})</p>
                            )}
                          </div>
                          <div className="rounded-2xl p-3 bg-rose-400/8 border border-rose-400/15">
                            <p className="text-[10px] tracking-[0.18em] uppercase text-rose-300/70 m-0">支出</p>
                            <p className="text-[15px] font-bold font-mono m-0 text-rose-300 truncate">−{stats.expense.toFixed(2)}</p>
                            {sl.currency && sl.currency !== defaultCur && stats.originalExpense > 0 && (
                              <p className="text-[9.5px] text-foreground/40 m-0 mt-0.5">({stats.originalExpense.toFixed(2)} {sl.currency})</p>
                            )}
                          </div>
                        </div>

                        {/* budget bar */}
                        {hasBudget && (
                          <div className="mb-3">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="inline-flex items-center gap-1 text-[11px] text-foreground/55">
                                <Target className="w-3 h-3" />预算
                              </span>
                              <span className="text-[11px] font-mono tabular-nums">
                                {stats.expense.toFixed(0)} <span className="text-foreground/45">/</span> {budget.toFixed(0)}
                              </span>
                            </div>
                            <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-500"
                                   style={{
                                     width: `${pct}%`,
                                     background: over ? "linear-gradient(90deg, #f87171, #dc2626)" : `linear-gradient(90deg, ${color}cc, ${color})`,
                                     boxShadow: over ? "0 0 8px rgba(248,113,113,0.5)" : `0 0 8px ${color}55`,
                                   }} />
                            </div>
                            <div className="flex items-center justify-between text-[10.5px] mt-1">
                              <span className={over ? "text-rose-300 font-semibold inline-flex items-center gap-1" : "text-foreground/50"}>
                                {over && <AlertTriangle className="w-3 h-3" />}
                                {over ? `超支 ${(stats.expense - budget).toFixed(2)}` : `剩余 ${(budget - stats.expense).toFixed(2)}`}
                              </span>
                              <span className={over ? "text-rose-300 font-bold" : "text-foreground/50"}>{((stats.expense / budget) * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                        )}

                        <p className="text-[10.5px] text-foreground/45 m-0 mt-3 inline-flex items-center gap-1.5">
                          <ChartLine className="w-3 h-3" />
                          {sl.includeInMainAnalytics ? "计入总账分析" : "独立统计"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Archived */}
            {showArchived && archived.length > 0 && (
              <section className="mt-8">
                <h2 className="text-[14px] font-bold text-foreground/55 flex items-center gap-2 mb-4">
                  <Archive className="w-4 h-4" />已归档 ({archived.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {archived.map(sl => {
                    const stats = getStats(sl);
                    const color = sl.color || "#a78bfa";
                    return (
                      <div key={sl.id} className="rounded-2xl p-4 bg-white/[0.015] border border-white/[0.04] opacity-65 hover:opacity-90 transition-opacity">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                                 style={{ background: `${color}1f`, border: `1px solid ${color}33` }}>
                              <BookOpen className="w-4 h-4" style={{ color }} />
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-[13px] font-semibold m-0 truncate">{sl.name}</h3>
                              <span className="text-[9.5px] tracking-[0.18em] uppercase text-foreground/40">已归档</span>
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button onClick={(e) => e.stopPropagation()} aria-label="更多"
                                      className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.10] flex items-center justify-center text-foreground/65 hover:text-foreground transition-all">
                                <MoreVertical className="w-3.5 h-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); archiveMutation.mutate({ id: sl.id, isArchived: false }); }}>
                                <ArchiveRestore className="w-4 h-4 mr-2" />恢复
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setDeleteTarget(sl); }} className="text-rose-300">
                                <Trash2 className="w-4 h-4 mr-2" />删除
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div className="flex items-center justify-between text-[11.5px] text-foreground/55">
                          <span className="inline-flex items-center gap-1"><Receipt className="w-3 h-3" />{stats.count} 笔</span>
                          <span className="font-mono">余额 {stats.balance.toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}

        <SubLedgerModal open={modalOpen} onOpenChange={handleCloseModal} subLedger={editingSubLedger} />

        <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除</AlertDialogTitle>
              <AlertDialogDescription>
                删除子账本 "{deleteTarget?.name}" 后, 相关的交易记录将保留但不再关联此子账本。30 秒内可在 toast 中撤销。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteTarget && handleSubLedgerDelete(deleteTarget)}
                className="bg-gradient-to-br from-rose-400 to-rose-600 text-white border-0">
                删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
