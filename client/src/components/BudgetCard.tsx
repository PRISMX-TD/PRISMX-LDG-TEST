import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
import { Plus, Loader2, TrendingUp, AlertCircle } from "lucide-react";
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

interface BudgetCardProps {
  currency?: string;
  categories: Category[];
}

export function BudgetCard({ currency = "MYR", categories }: BudgetCardProps) {
  const { toast } = useToast();
  const currencyInfo = getCurrencyInfo(currency);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [amount, setAmount] = useState("");

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const { data: budgets = [], isLoading } = useQuery<BudgetWithSpending[]>({
    queryKey: ["/api/budgets/spending", { month: currentMonth, year: currentYear }],
    queryFn: async () => {
      const res = await fetch(`/api/budgets/spending?month=${currentMonth}&year=${currentYear}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch budgets");
      return res.json();
    },
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
      toast({
        title: "创建失败",
        description: error.message || "请重试",
        variant: "destructive",
      });
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
      month: currentMonth,
      year: currentYear,
    });
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            本月预算
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsModalOpen(true)}
            disabled={availableCategories.length === 0}
            data-testid="button-add-budget"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : budgets.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              暂无预算，点击右上角添加
            </p>
          ) : (
            <div className="space-y-4">
              {budgets.map((budget) => {
                const budgetAmount = parseFloat(budget.amount);
                const percentage = Math.min((budget.spent / budgetAmount) * 100, 100);
                const isOverBudget = budget.spent > budgetAmount;

                return (
                  <div key={budget.id} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: budget.categoryColor }}
                        />
                        <span>{budget.categoryName}</span>
                        {isOverBudget && (
                          <AlertCircle className="w-4 h-4 text-expense" />
                        )}
                      </div>
                      <span className={isOverBudget ? "text-expense font-medium" : "text-muted-foreground"}>
                        {currencyInfo.symbol}{budget.spent.toFixed(2)} / {currencyInfo.symbol}{budgetAmount.toFixed(2)}
                      </span>
                    </div>
                    <Progress
                      value={percentage}
                      className={`h-2 ${isOverBudget ? "[&>div]:bg-expense" : ""}`}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>添加预算</DialogTitle>
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
              <Button type="submit" disabled={createMutation.isPending} className="flex-1" data-testid="button-save-budget">
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                保存
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
