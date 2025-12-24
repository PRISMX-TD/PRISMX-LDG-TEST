import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bell, Plus, Loader2, Trash2, Calendar, CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";
import { getCurrencyInfo } from "@shared/schema";
import { format, differenceInDays, isPast, isToday } from "date-fns";
import type { BillReminder, Wallet, Category } from "@shared/schema";
import { Link } from "wouter";

export default function Reminders() {
  const { user } = useAuth();
  const { toast } = useToast();
  const currencyInfo = getCurrencyInfo(user?.defaultCurrency || "MYR");
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    amount: "",
    dueDate: format(new Date(), "yyyy-MM-dd"),
    walletId: "",
    categoryId: "",
    isRecurring: false,
    frequency: "monthly",
    notes: "",
  });

  const { data: reminders = [], isLoading } = useQuery<BillReminder[]>({
    queryKey: ["/api/bill-reminders"],
  });

  const { data: wallets = [] } = useQuery<Wallet[]>({
    queryKey: ["/api/wallets"],
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/bill-reminders", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bill-reminders"] });
      toast({ title: "账单提醒已创建" });
      setIsModalOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "创建失败", description: error.message, variant: "destructive" });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("PATCH", `/api/bill-reminders/${id}`, { isPaid: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bill-reminders"] });
      toast({ title: "已标记为已付" });
    },
    onError: (error: any) => {
      toast({ title: "操作失败", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/bill-reminders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bill-reminders"] });
      toast({ title: "账单提醒已删除" });
    },
    onError: (error: any) => {
      toast({ title: "删除失败", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      amount: "",
      dueDate: format(new Date(), "yyyy-MM-dd"),
      walletId: "",
      categoryId: "",
      isRecurring: false,
      frequency: "monthly",
      notes: "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.amount || !formData.dueDate) {
      toast({ title: "请填写完整信息", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      name: formData.name.trim(),
      amount: parseFloat(formData.amount),
      currency: user?.defaultCurrency || "MYR",
      dueDate: formData.dueDate,
      walletId: formData.walletId ? parseInt(formData.walletId) : null,
      categoryId: formData.categoryId ? parseInt(formData.categoryId) : null,
      isRecurring: formData.isRecurring,
      frequency: formData.isRecurring ? formData.frequency : null,
      notes: formData.notes || null,
    });
  };

  const expenseCategories = categories.filter((c) => c.type === "expense");
  const unpaidReminders = reminders.filter((r) => !r.isPaid);
  const paidReminders = reminders.filter((r) => r.isPaid);

  const getDaysUntilDue = (dueDate: string) => {
    const due = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    return differenceInDays(due, today);
  };

  const getDueStatus = (dueDate: Date | string) => {
    const dueDateStr = typeof dueDate === 'string' ? dueDate : dueDate.toISOString();
    const days = getDaysUntilDue(dueDateStr);
    if (days < 0) return { label: "已逾期", variant: "destructive" as const, urgent: true };
    if (days === 0) return { label: "今天到期", variant: "destructive" as const, urgent: true };
    if (days <= 3) return { label: `${days}天后`, variant: "secondary" as const, urgent: true };
    if (days <= 7) return { label: `${days}天后`, variant: "secondary" as const, urgent: false };
    return { label: `${days}天后`, variant: "outline" as const, urgent: false };
  };

  const isRecurring = (frequency: string) => frequency !== "once";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
            <ArrowLeft className="w-4 h-4 mr-1" />
            返回
          </Button>
        </Link>
        <h1 className="text-2xl font-semibold flex items-center gap-2 text-white">
          <Bell className="w-6 h-6 text-neon-purple" />
          账单提醒
        </h1>
        <Button onClick={() => setIsModalOpen(true)} data-testid="button-add-reminder" className="ml-auto">
          <Plus className="w-4 h-4 mr-1" />
          添加账单
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : reminders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">暂无账单提醒</h3>
            <p className="text-muted-foreground mb-4">添加账单提醒，不再错过付款日期</p>
            <Button onClick={() => setIsModalOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              添加账单
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {unpaidReminders.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-warning" />
                待付账单 ({unpaidReminders.length})
              </h2>
              <div className="space-y-3">
                {unpaidReminders
                  .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                  .map((reminder) => {
                    const status = getDueStatus(reminder.dueDate);
                    return (
                      <Card key={reminder.id} className={status.urgent ? "border-expense/50" : ""}>
                        <CardContent className="flex items-center justify-between p-4">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-expense/10 flex items-center justify-center">
                              <Calendar className="w-5 h-5 text-expense" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{reminder.name}</p>
                                <Badge variant={status.variant}>{status.label}</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                到期日: {format(new Date(reminder.dueDate), "yyyy-MM-dd")}
                                {isRecurring(reminder.frequency) && " · 循环"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <p className="font-mono font-medium text-expense">
                              {currencyInfo.symbol}{parseFloat(reminder.amount || "0").toFixed(2)}
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => markPaidMutation.mutate(reminder.id)}
                              disabled={markPaidMutation.isPending}
                            >
                              <CheckCircle2 className="w-4 h-4 mr-1" />
                              标记已付
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteMutation.mutate(reminder.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            </div>
          )}

          {paidReminders.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-income" />
                已付账单 ({paidReminders.length})
              </h2>
              <div className="space-y-3">
                {paidReminders.slice(0, 5).map((reminder) => (
                  <Card key={reminder.id} className="bg-muted/50">
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-income/10 flex items-center justify-center">
                          <CheckCircle2 className="w-5 h-5 text-income" />
                        </div>
                        <div>
                          <p className="font-medium">{reminder.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(reminder.dueDate), "yyyy-MM-dd")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <p className="font-mono text-muted-foreground">
                          {currencyInfo.symbol}{parseFloat(reminder.amount || "0").toFixed(2)}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(reminder.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>添加账单提醒</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>账单名称</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="如：房租、电话费"
              />
            </div>

            <div className="space-y-2">
              <Label>金额 ({currencyInfo.symbol})</Label>
              <Input
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                placeholder="输入金额"
                min="0"
                step="0.01"
              />
            </div>

            <div className="space-y-2">
              <Label>到期日</Label>
              <Input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>支付钱包 (可选)</Label>
              <Select value={formData.walletId} onValueChange={(v) => setFormData(prev => ({ ...prev, walletId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="选择钱包" />
                </SelectTrigger>
                <SelectContent>
                  {wallets.map((w) => (
                    <SelectItem key={w.id} value={w.id.toString()}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>分类 (可选)</Label>
              <Select value={formData.categoryId} onValueChange={(v) => setFormData(prev => ({ ...prev, categoryId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="选择分类" />
                </SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="isRecurring"
                checked={formData.isRecurring}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isRecurring: !!checked }))}
              />
              <Label htmlFor="isRecurring">循环账单</Label>
            </div>

            {formData.isRecurring && (
              <div className="space-y-2">
                <Label>循环频率</Label>
                <Select value={formData.frequency} onValueChange={(v) => setFormData(prev => ({ ...prev, frequency: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">每周</SelectItem>
                    <SelectItem value="monthly">每月</SelectItem>
                    <SelectItem value="yearly">每年</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>备注 (可选)</Label>
              <Input
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="输入备注"
              />
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} className="flex-1">
                取消
              </Button>
              <Button type="submit" disabled={createMutation.isPending} className="flex-1">
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                添加
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
