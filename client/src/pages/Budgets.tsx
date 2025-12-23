import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { TrendingUp, Plus, Loader2, AlertCircle, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { getCurrencyInfo } from "@shared/schema";
import type { Category } from "@shared/schema";

interface BudgetWithSpending {
  id: number;
  categoryId: number;
  amount: string;
  month: number;
  year: number;
  spent: number;
  categoryName: string;
  categoryColor: string;
}

export default function Budgets() {
  const { user } = useAuth();
  const { toast } = useToast();
  const currencyInfo = getCurrencyInfo(user?.defaultCurrency || "MYR");
  
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [amount, setAmount] = useState("");

  const { data: budgets = [], isLoading } = useQuery<BudgetWithSpending[]>({
    queryKey: ["/api/budgets/spending", { month: selectedMonth, year: selectedYear }],
    queryFn: async () => {
      const res = await fetch(`/api/budgets/spending?month=${selectedMonth}&year=${selectedYear}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch budgets");
      return res.json();
    },
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { categoryId: number; amount: number; month: number; year: number }) => {
      return apiRequest("POST", "/api/budgets", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/budgets/spending"] });
      toast({ title: "预算已创建" });
      setIsModalOpen(false);
      setSelectedCategory("");
      setAmount("");
    },
    onError: (error: any) => {
      toast({ title: "创建失败", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/budgets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/budgets/spending"] });
      toast({ title: "预算已删除" });
    },
    onError: (error: any) => {
      toast({ title: "删除失败", description: error.message, variant: "destructive" });
    },
  });

  const expenseCategories = categories.filter((c) => c.type === "expense");
  const existingCategoryIds = budgets.map((b) => b.categoryId);
  const availableCategories = expenseCategories.filter((c) => !existingCategoryIds.includes(c.id));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategory || !amount) {
      toast({ title: "请填写完整信息", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      categoryId: parseInt(selectedCategory),
      amount: parseFloat(amount),
      month: selectedMonth,
      year: selectedYear,
    });
  };

  const navigateMonth = (direction: number) => {
    let newMonth = selectedMonth + direction;
    let newYear = selectedYear;
    if (newMonth > 12) {
      newMonth = 1;
      newYear++;
    } else if (newMonth < 1) {
      newMonth = 12;
      newYear--;
    }
    setSelectedMonth(newMonth);
    setSelectedYear(newYear);
  };

  const totalBudget = budgets.reduce((sum, b) => sum + parseFloat(b.amount), 0);
  const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
  const overallPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="w-6 h-6" />
          预算管理
        </h1>
        <Button
          onClick={() => setIsModalOpen(true)}
          disabled={availableCategories.length === 0}
          data-testid="button-add-budget"
        >
          <Plus className="w-4 h-4 mr-1" />
          添加预算
        </Button>
      </div>

      <div className="flex items-center justify-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigateMonth(-1)}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <span className="text-lg font-medium min-w-[120px] text-center">
          {selectedYear}年{selectedMonth}月
        </span>
        <Button variant="ghost" size="icon" onClick={() => navigateMonth(1)}>
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">总体预算</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">已使用</span>
              <span className={`font-mono font-medium ${overallPercentage > 100 ? "text-expense" : ""}`}>
                {currencyInfo.symbol}{totalSpent.toFixed(2)} / {currencyInfo.symbol}{totalBudget.toFixed(2)}
              </span>
            </div>
            <Progress value={Math.min(overallPercentage, 100)} className={`h-3 ${overallPercentage > 100 ? "[&>div]:bg-expense" : ""}`} />
            <p className="text-sm text-muted-foreground text-center">
              {overallPercentage > 100 ? (
                <span className="text-expense">超支 {(overallPercentage - 100).toFixed(1)}%</span>
              ) : (
                <span>剩余 {currencyInfo.symbol}{(totalBudget - totalSpent).toFixed(2)} ({(100 - overallPercentage).toFixed(1)}%)</span>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : budgets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <TrendingUp className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">本月暂无预算</h3>
            <p className="text-muted-foreground mb-4">设置预算帮助您控制支出</p>
            <Button onClick={() => setIsModalOpen(true)} disabled={availableCategories.length === 0}>
              <Plus className="w-4 h-4 mr-1" />
              添加预算
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {budgets.map((budget) => {
            const budgetAmount = parseFloat(budget.amount);
            const percentage = (budget.spent / budgetAmount) * 100;
            const isOverBudget = budget.spent > budgetAmount;

            return (
              <Card key={budget.id} className="relative group">
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => deleteMutation.mutate(budget.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                </Button>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: budget.categoryColor + "20" }}
                    >
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: budget.categoryColor }}
                      />
                    </div>
                    <div>
                      <p className="font-medium">{budget.categoryName}</p>
                      {isOverBudget && (
                        <div className="flex items-center gap-1 text-xs text-expense">
                          <AlertCircle className="w-3 h-3" />
                          超支
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">已花费</span>
                      <span className={`font-mono ${isOverBudget ? "text-expense" : ""}`}>
                        {currencyInfo.symbol}{budget.spent.toFixed(2)}
                      </span>
                    </div>
                    <Progress
                      value={Math.min(percentage, 100)}
                      className={`h-2 ${isOverBudget ? "[&>div]:bg-expense" : ""}`}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>预算: {currencyInfo.symbol}{budgetAmount.toFixed(2)}</span>
                      <span>{percentage.toFixed(0)}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>添加预算 - {selectedYear}年{selectedMonth}月</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>分类</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger data-testid="select-budget-category">
                  <SelectValue placeholder="选择分类" />
                </SelectTrigger>
                <SelectContent>
                  {availableCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id.toString()}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>预算金额 ({currencyInfo.symbol})</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="输入预算金额"
                min="0"
                step="0.01"
                data-testid="input-budget-amount"
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} className="flex-1">
                取消
              </Button>
              <Button type="submit" disabled={createMutation.isPending} className="flex-1">
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                保存
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
