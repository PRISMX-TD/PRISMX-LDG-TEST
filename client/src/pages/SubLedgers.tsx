import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BookOpen,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Archive,
  ArchiveRestore,
  Calendar,
  ChartLine,
  Loader2,
  Receipt,
  Target,
  AlertTriangle,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { SubLedgerModal } from "@/components/SubLedgerModal";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/EmptyState";
import type { SubLedger, Transaction, Wallet } from "@shared/schema";

const ICON_LABELS: Record<string, string> = {
  trip: "旅行",
  project: "项目",
  event: "活动",
  wedding: "婚礼",
  renovation: "装修",
  education: "教育",
  business: "业务",
  other: "其他",
};

export default function SubLedgers() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [showArchived, setShowArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSubLedger, setEditingSubLedger] = useState<SubLedger | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SubLedger | null>(null);

  const { data: subLedgers = [], isLoading } = useQuery<SubLedger[]>({
    queryKey: [`/api/sub-ledgers?includeArchived=${showArchived}`],
  });

  const { data: transactions = [] } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
  });

  const { data: wallets = [] } = useQuery<Wallet[]>({
    queryKey: ["/api/wallets"],
  });

  // Helper function to convert transaction amount to user's default currency
  const getConvertedAmount = (t: Transaction): number => {
    const rawAmount = parseFloat(t.amount);
    const defaultCurrency = user?.defaultCurrency || "MYR";
    const wallet = wallets.find((w) => w.id === t.walletId);
    
    if (wallet && wallet.currency !== defaultCurrency) {
      const exchangeRate = parseFloat(wallet.exchangeRateToDefault || "1");
      return rawAmount * exchangeRate;
    }
    return rawAmount;
  };

  const invalidateSubLedgers = () => {
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.startsWith('/api/sub-ledgers');
      }
    });
  };

  const archiveMutation = useMutation({
    mutationFn: ({ id, isArchived }: { id: number; isArchived: boolean }) =>
      apiRequest("PATCH", `/api/sub-ledgers/${id}`, { isArchived }),
    onSuccess: () => {
      invalidateSubLedgers();
      toast({ title: "操作成功" });
    },
    onError: () => {
      toast({ title: "操作失败", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/sub-ledgers/${id}`),
    onSuccess: () => {
      invalidateSubLedgers();
      toast({ title: "子账本已删除" });
      setDeleteTarget(null);
    },
    onError: () => {
      toast({ title: "删除失败", variant: "destructive" });
    },
  });

  const getSubLedgerStats = (subLedgerId: number) => {
    const subLedgerTransactions = transactions.filter(t => t.subLedgerId === subLedgerId);
    let income = 0;
    let expense = 0;
    subLedgerTransactions.forEach(t => {
      const amount = getConvertedAmount(t);
      if (t.type === "income") income += amount;
      else if (t.type === "expense") expense += amount;
    });
    return { count: subLedgerTransactions.length, income, expense, balance: income - expense };
  };

  const handleEdit = (subLedger: SubLedger) => {
    setEditingSubLedger(subLedger);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingSubLedger(null);
  };

  const activeSubLedgers = subLedgers.filter(s => !s.isArchived);
  const archivedSubLedgers = subLedgers.filter(s => s.isArchived);

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="hidden md:flex text-2xl font-bold items-center gap-2">
          <BookOpen className="w-6 h-6" />
          子账本
        </h1>
        <div className="flex items-center gap-3 ml-auto">
          <div className="flex items-center gap-2">
            <Switch
              id="showArchived"
              checked={showArchived}
              onCheckedChange={setShowArchived}
              data-testid="switch-show-archived"
            />
            <label htmlFor="showArchived" className="text-sm text-muted-foreground cursor-pointer">
              显示已归档
            </label>
          </div>
          <Button onClick={() => setModalOpen(true)} data-testid="button-add-subledger">
            <Plus className="w-4 h-4 mr-1" />
            新建子账本
          </Button>
        </div>
      </div>

      {activeSubLedgers.length === 0 && !showArchived ? (
        <EmptyState
          icon={BookOpen}
          title="暂无子账本"
          description="子账本可以帮助你单独追踪特定项目或旅行的收支"
          actionLabel="创建子账本"
          onAction={() => setModalOpen(true)}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeSubLedgers.map((subLedger) => {
            const stats = getSubLedgerStats(subLedger.id);
            return (
              <Card
                key={subLedger.id}
                className="glass-card hover-elevate relative overflow-visible"
                data-testid={`card-subledger-${subLedger.id}`}
              >
                <div
                  className="absolute top-0 left-0 right-0 h-1 rounded-t-lg"
                  style={{ backgroundColor: subLedger.color || "#8B5CF6" }}
                />
                <CardHeader className="pb-2 pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${subLedger.color || "#8B5CF6"}20` }}
                      >
                        <BookOpen className="w-5 h-5" style={{ color: subLedger.color || "#8B5CF6" }} />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">{subLedger.name}</CardTitle>
                        <Badge variant="secondary" className="text-xs mt-0.5">
                          {ICON_LABELS[subLedger.icon || "other"] || "其他"}
                        </Badge>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="shrink-0" data-testid={`button-menu-subledger-${subLedger.id}`}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(subLedger)}>
                          <Pencil className="w-4 h-4 mr-2" />
                          编辑
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => archiveMutation.mutate({ id: subLedger.id, isArchived: true })}>
                          <Archive className="w-4 h-4 mr-2" />
                          归档
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget(subLedger)}
                          className="text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {subLedger.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {subLedger.description}
                    </p>
                  )}
                  
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Receipt className="w-3.5 h-3.5" />
                      <span>{stats.count} 笔交易</span>
                    </div>
                    {(subLedger.startDate || subLedger.endDate) && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>
                          {subLedger.startDate ? format(new Date(subLedger.startDate), "MM/dd") : "?"}
                          {" - "}
                          {subLedger.endDate ? format(new Date(subLedger.endDate), "MM/dd") : "?"}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50">
                    <div>
                      <p className="text-xs text-muted-foreground">收入</p>
                      <p className="text-sm font-mono text-income">+{stats.income.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">支出</p>
                      <p className="text-sm font-mono text-expense">-{stats.expense.toFixed(2)}</p>
                    </div>
                  </div>

                  {subLedger.budgetAmount && parseFloat(subLedger.budgetAmount) > 0 && (
                    <div className="space-y-2 pt-2 border-t border-border/50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Target className="w-3.5 h-3.5" />
                          <span>预算</span>
                        </div>
                        <span className="text-xs font-mono">
                          {stats.expense.toFixed(0)} / {parseFloat(subLedger.budgetAmount).toFixed(0)}
                        </span>
                      </div>
                      {(() => {
                        const budget = parseFloat(subLedger.budgetAmount);
                        const percentage = Math.min((stats.expense / budget) * 100, 100);
                        const isOverBudget = stats.expense > budget;
                        return (
                          <>
                            <Progress 
                              value={percentage} 
                              className={`h-2 ${isOverBudget ? "[&>div]:bg-destructive" : "[&>div]:bg-primary"}`}
                            />
                            <div className="flex items-center justify-between text-xs">
                              <span className={isOverBudget ? "text-destructive flex items-center gap-1" : "text-muted-foreground"}>
                                {isOverBudget && <AlertTriangle className="w-3 h-3" />}
                                {isOverBudget 
                                  ? `超支 ${(stats.expense - budget).toFixed(2)}` 
                                  : `剩余 ${(budget - stats.expense).toFixed(2)}`
                                }
                              </span>
                              <span className={isOverBudget ? "text-destructive font-medium" : "text-muted-foreground"}>
                                {((stats.expense / budget) * 100).toFixed(0)}%
                              </span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2">
                    <ChartLine className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {subLedger.includeInMainAnalytics ? "计入总账分析" : "独立统计"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {showArchived && archivedSubLedgers.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-muted-foreground flex items-center gap-2">
            <Archive className="w-5 h-5" />
            已归档 ({archivedSubLedgers.length})
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {archivedSubLedgers.map((subLedger) => {
              const stats = getSubLedgerStats(subLedger.id);
              return (
                <Card
                  key={subLedger.id}
                  className="glass-card opacity-60"
                  data-testid={`card-subledger-archived-${subLedger.id}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: `${subLedger.color || "#8B5CF6"}20` }}
                        >
                          <BookOpen className="w-5 h-5" style={{ color: subLedger.color || "#8B5CF6" }} />
                        </div>
                        <div>
                          <CardTitle className="text-base">{subLedger.name}</CardTitle>
                          <Badge variant="outline" className="text-xs mt-0.5">已归档</Badge>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => archiveMutation.mutate({ id: subLedger.id, isArchived: false })}>
                            <ArchiveRestore className="w-4 h-4 mr-2" />
                            恢复
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget(subLedger)}
                            className="text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{stats.count} 笔交易</span>
                      <span>余额: {stats.balance.toFixed(2)}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <SubLedgerModal
        open={modalOpen}
        onOpenChange={handleCloseModal}
        subLedger={editingSubLedger}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              删除子账本 "{deleteTarget?.name}" 后，相关的交易记录将保留但不再关联此子账本。此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
