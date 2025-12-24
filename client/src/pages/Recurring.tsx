import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarClock, Plus, Loader2, Trash2, Pause, Play, TrendingDown, TrendingUp, ArrowLeft } from "lucide-react";
import { getCurrencyInfo } from "@shared/schema";
import { format } from "date-fns";
import type { RecurringTransaction, Wallet, Category } from "@shared/schema";
import { Link } from "wouter";

const FREQUENCY_OPTIONS = [
  { value: "daily", label: "每天" },
  { value: "weekly", label: "每周" },
  { value: "monthly", label: "每月" },
  { value: "yearly", label: "每年" },
];

export default function Recurring() {
  const { user } = useAuth();
  const { toast } = useToast();
  const currencyInfo = getCurrencyInfo(user?.defaultCurrency || "MYR");
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("expense");
  const [formData, setFormData] = useState({
    type: "expense" as "expense" | "income",
    walletId: "",
    categoryId: "",
    amount: "",
    description: "",
    frequency: "monthly",
    startDate: format(new Date(), "yyyy-MM-dd"),
  });

  const { data: recurring = [], isLoading } = useQuery<RecurringTransaction[]>({
    queryKey: ["/api/recurring-transactions"],
  });

  const { data: wallets = [] } = useQuery<Wallet[]>({
    queryKey: ["/api/wallets"],
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/recurring-transactions", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-transactions"] });
      toast({ title: "定期交易已创建" });
      setIsModalOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "创建失败", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/recurring-transactions/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-transactions"] });
    },
    onError: (error: any) => {
      toast({ title: "更新失败", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/recurring-transactions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-transactions"] });
      toast({ title: "定期交易已删除" });
    },
    onError: (error: any) => {
      toast({ title: "删除失败", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      type: activeTab as "expense" | "income",
      walletId: "",
      categoryId: "",
      amount: "",
      description: "",
      frequency: "monthly",
      startDate: format(new Date(), "yyyy-MM-dd"),
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.walletId || !formData.categoryId || !formData.amount) {
      toast({ title: "请填写完整信息", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      type: formData.type,
      walletId: parseInt(formData.walletId),
      categoryId: parseInt(formData.categoryId),
      amount: parseFloat(formData.amount),
      currency: user?.defaultCurrency || "MYR",
      description: formData.description || null,
      frequency: formData.frequency,
      startDate: formData.startDate,
    });
  };

  const filteredCategories = categories.filter((c) => c.type === formData.type);
  const expenseRecurring = recurring.filter((r) => r.type === "expense");
  const incomeRecurring = recurring.filter((r) => r.type === "income");

  const getFrequencyLabel = (freq: string) => {
    return FREQUENCY_OPTIONS.find((f) => f.value === freq)?.label || freq;
  };

  const getWalletName = (walletId: number) => {
    return wallets.find((w) => w.id === walletId)?.name || "未知钱包";
  };

  const getCategoryName = (categoryId: number | null) => {
    if (!categoryId) return "无分类";
    return categories.find((c) => c.id === categoryId)?.name || "未知分类";
  };

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
          <CalendarClock className="w-6 h-6 text-neon-purple" />
          定期交易
        </h1>
        <Button onClick={() => setIsModalOpen(true)} data-testid="button-add-recurring" className="ml-auto">
          <Plus className="w-4 h-4 mr-1" />
          新建定期交易
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="expense" data-testid="tab-expense-recurring">
            定期支出 ({expenseRecurring.length})
          </TabsTrigger>
          <TabsTrigger value="income" data-testid="tab-income-recurring">
            定期收入 ({incomeRecurring.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="expense" className="space-y-4 mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : expenseRecurring.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <TrendingDown className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">暂无定期支出</h3>
                <p className="text-muted-foreground mb-4">添加固定支出如房租、订阅服务等</p>
                <Button onClick={() => { setFormData(prev => ({ ...prev, type: "expense" })); setIsModalOpen(true); }}>
                  <Plus className="w-4 h-4 mr-1" />
                  添加定期支出
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {expenseRecurring.map((item) => (
                <RecurringItem
                  key={item.id}
                  item={item}
                  currencySymbol={currencyInfo.symbol}
                  walletName={getWalletName(item.walletId)}
                  categoryName={getCategoryName(item.categoryId)}
                  frequencyLabel={getFrequencyLabel(item.frequency)}
                  onToggle={(isActive) => updateMutation.mutate({ id: item.id, isActive })}
                  onDelete={() => deleteMutation.mutate(item.id)}
                  isPending={updateMutation.isPending || deleteMutation.isPending}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="income" className="space-y-4 mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : incomeRecurring.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <TrendingUp className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">暂无定期收入</h3>
                <p className="text-muted-foreground mb-4">添加固定收入如工资、租金等</p>
                <Button onClick={() => { setFormData(prev => ({ ...prev, type: "income" })); setIsModalOpen(true); }}>
                  <Plus className="w-4 h-4 mr-1" />
                  添加定期收入
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {incomeRecurring.map((item) => (
                <RecurringItem
                  key={item.id}
                  item={item}
                  currencySymbol={currencyInfo.symbol}
                  walletName={getWalletName(item.walletId)}
                  categoryName={getCategoryName(item.categoryId)}
                  frequencyLabel={getFrequencyLabel(item.frequency)}
                  onToggle={(isActive) => updateMutation.mutate({ id: item.id, isActive })}
                  onDelete={() => deleteMutation.mutate(item.id)}
                  isPending={updateMutation.isPending || deleteMutation.isPending}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建定期交易</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>类型</Label>
              <Select value={formData.type} onValueChange={(v: "expense" | "income") => setFormData(prev => ({ ...prev, type: v, categoryId: "" }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">支出</SelectItem>
                  <SelectItem value="income">收入</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>钱包</Label>
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
              <Label>分类</Label>
              <Select value={formData.categoryId} onValueChange={(v) => setFormData(prev => ({ ...prev, categoryId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="选择分类" />
                </SelectTrigger>
                <SelectContent>
                  {filteredCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Label>频率</Label>
              <Select value={formData.frequency} onValueChange={(v) => setFormData(prev => ({ ...prev, frequency: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>开始日期</Label>
              <Input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>备注 (可选)</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="输入备注"
              />
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} className="flex-1">
                取消
              </Button>
              <Button type="submit" disabled={createMutation.isPending} className="flex-1">
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                创建
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface RecurringItemProps {
  item: RecurringTransaction;
  currencySymbol: string;
  walletName: string;
  categoryName: string;
  frequencyLabel: string;
  onToggle: (isActive: boolean) => void;
  onDelete: () => void;
  isPending: boolean;
}

function RecurringItem({ item, currencySymbol, walletName, categoryName, frequencyLabel, onToggle, onDelete, isPending }: RecurringItemProps) {
  const isActive = item.isActive ?? true;
  
  return (
    <Card className={!isActive ? "opacity-60" : ""}>
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${item.type === "expense" ? "bg-expense/10" : "bg-income/10"}`}>
            {item.type === "expense" ? (
              <TrendingDown className="w-5 h-5 text-expense" />
            ) : (
              <TrendingUp className="w-5 h-5 text-income" />
            )}
          </div>
          <div>
            <p className="font-medium">{item.description || categoryName}</p>
            <p className="text-sm text-muted-foreground">
              {walletName} · {frequencyLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <p className={`font-mono font-medium ${item.type === "expense" ? "text-expense" : "text-income"}`}>
            {item.type === "expense" ? "-" : "+"}{currencySymbol}{parseFloat(item.amount).toFixed(2)}
          </p>
          <Switch
            checked={isActive}
            onCheckedChange={onToggle}
            disabled={isPending}
          />
          <Button variant="ghost" size="icon" onClick={onDelete} disabled={isPending}>
            <Trash2 className="w-4 h-4 text-muted-foreground" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
