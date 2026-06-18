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
import { Plus, Loader2, PiggyBank, Target, Trash2 } from "lucide-react";
import { getCurrencyInfo } from "@shared/schema";
import type { SavingsGoal } from "@shared/schema";

interface SavingsGoalCardProps {
  currency?: string;
}

export function SavingsGoalCard({ currency = "MYR" }: SavingsGoalCardProps) {
  const { toast } = useToast();
  const currencyInfo = getCurrencyInfo(currency);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<SavingsGoal | null>(null);
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [addAmount, setAddAmount] = useState("");

  const { data: goals = [], isLoading } = useQuery<SavingsGoal[]>({
    queryKey: ["/api/savings-goals"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; targetAmount: number; currency: string }) => {
      return apiRequest("POST", "/api/savings-goals", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/savings-goals"] });
      toast({ title: "储蓄目标已创建" });
      setIsModalOpen(false);
      setName("");
      setTargetAmount("");
    },
    onError: (error: any) => {
      toast({
        title: "创建失败",
        description: error.message || "请重试",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, currentAmount }: { id: number; currentAmount: number }) => {
      return apiRequest("PATCH", `/api/savings-goals/${id}`, { currentAmount });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/savings-goals"] });
      toast({ title: "已添加存款" });
      setIsEditModalOpen(false);
      setSelectedGoal(null);
      setAddAmount("");
    },
    onError: (error: any) => {
      toast({
        title: "更新失败",
        description: error.message || "请重试",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/savings-goals/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/savings-goals"] });
      toast({ title: "储蓄目标已删除" });
      setIsEditModalOpen(false);
      setSelectedGoal(null);
    },
    onError: (error: any) => {
      toast({
        title: "删除失败",
        description: error.message || "请重试",
        variant: "destructive",
      });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !targetAmount) {
      toast({ title: "请填写完整信息", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      name: name.trim(),
      targetAmount: parseFloat(targetAmount),
      currency,
    });
  };

  const handleAddSaving = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGoal || !addAmount) return;
    const newAmount = parseFloat(selectedGoal.currentAmount || "0") + parseFloat(addAmount);
    updateMutation.mutate({ id: selectedGoal.id, currentAmount: newAmount });
  };

  const activeGoals = goals.filter((g) => !g.isCompleted);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <PiggyBank className="w-4 h-4" />
            储蓄目标
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsModalOpen(true)}
            data-testid="button-add-goal"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : activeGoals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              暂无储蓄目标，点击右上角添加
            </p>
          ) : (
            <div className="space-y-4">
              {activeGoals.slice(0, 3).map((goal) => {
                const target = parseFloat(goal.targetAmount);
                const current = parseFloat(goal.currentAmount || "0");
                const percentage = Math.min((current / target) * 100, 100);
                const isComplete = current >= target;

                return (
                  <div
                    key={goal.id}
                    className="space-y-2 cursor-pointer hover:bg-muted/50 p-2 rounded-lg -mx-2"
                    onClick={() => {
                      setSelectedGoal(goal);
                      setIsEditModalOpen(true);
                    }}
                    data-testid={`goal-${goal.id}`}
                  >
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Target className="w-4 h-4" style={{ color: goal.color || "#10B981" }} />
                        <span className="font-medium">{goal.name}</span>
                        {isComplete && (
                          <span className="text-xs bg-income/20 text-income px-2 py-0.5 rounded-full">
                            已达成
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {currencyInfo.symbol}{current.toFixed(2)} / {currencyInfo.symbol}{target.toFixed(2)}
                      </span>
                      <span>{percentage.toFixed(0)}%</span>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </div>
                );
              })}
              {activeGoals.length > 3 && (
                <p className="text-xs text-muted-foreground text-center">
                  还有 {activeGoals.length - 3} 个目标...
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>创建储蓄目标</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>目标名称</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：买新手机"
                data-testid="input-goal-name"
              />
            </div>
            <div className="space-y-2">
              <Label>目标金额 ({currencyInfo.symbol})</Label>
              <Input
                type="number"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                placeholder="输入目标金额"
                min="0"
                step="0.01"
                data-testid="input-goal-target"
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} className="flex-1">
                取消
              </Button>
              <Button type="submit" disabled={createMutation.isPending} className="flex-1" data-testid="button-save-goal">
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                创建
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedGoal?.name}</DialogTitle>
          </DialogHeader>
          {selectedGoal && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <p className="text-3xl font-bold">
                  {currencyInfo.symbol}{parseFloat(selectedGoal.currentAmount || "0").toFixed(2)}
                </p>
                <p className="text-sm text-muted-foreground">
                  目标: {currencyInfo.symbol}{parseFloat(selectedGoal.targetAmount).toFixed(2)}
                </p>
                <Progress
                  value={Math.min(
                    (parseFloat(selectedGoal.currentAmount || "0") / parseFloat(selectedGoal.targetAmount)) * 100,
                    100
                  )}
                  className="h-3 mt-4"
                />
              </div>

              <form onSubmit={handleAddSaving} className="space-y-4">
                <div className="space-y-2">
                  <Label>添加存款 ({currencyInfo.symbol})</Label>
                  <Input
                    type="number"
                    value={addAmount}
                    onChange={(e) => setAddAmount(e.target.value)}
                    placeholder="输入存款金额"
                    min="0"
                    step="0.01"
                    data-testid="input-add-saving"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    onClick={() => deleteMutation.mutate(selectedGoal.id)}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    type="submit"
                    disabled={updateMutation.isPending || !addAmount}
                    className="flex-1"
                    data-testid="button-add-saving"
                  >
                    {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    添加存款
                  </Button>
                </div>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
