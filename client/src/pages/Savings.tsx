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
import { PiggyBank, Plus, Loader2, Target, Trash2, CheckCircle2, Coins } from "lucide-react";
import { getCurrencyInfo } from "@shared/schema";
import type { SavingsGoal } from "@shared/schema";

export default function Savings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const currencyInfo = getCurrencyInfo(user?.defaultCurrency || "MYR");
  
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
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
      setIsCreateModalOpen(false);
      setName("");
      setTargetAmount("");
    },
    onError: (error: any) => {
      toast({ title: "创建失败", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, currentAmount }: { id: number; currentAmount: number }) => {
      return apiRequest("PATCH", `/api/savings-goals/${id}`, { currentAmount });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/savings-goals"] });
      toast({ title: "已更新存款" });
      setIsEditModalOpen(false);
      setSelectedGoal(null);
      setAddAmount("");
    },
    onError: (error: any) => {
      toast({ title: "更新失败", description: error.message, variant: "destructive" });
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
      toast({ title: "删除失败", description: error.message, variant: "destructive" });
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
      currency: user?.defaultCurrency || "MYR",
    });
  };

  const handleAddSaving = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGoal || !addAmount) return;
    const newAmount = parseFloat(selectedGoal.currentAmount || "0") + parseFloat(addAmount);
    updateMutation.mutate({ id: selectedGoal.id, currentAmount: newAmount });
  };

  const activeGoals = goals.filter((g) => !g.isCompleted);
  const completedGoals = goals.filter((g) => g.isCompleted);
  const totalSaved = goals.reduce((sum, g) => sum + parseFloat(g.currentAmount || "0"), 0);
  const totalTarget = goals.reduce((sum, g) => sum + parseFloat(g.targetAmount), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <PiggyBank className="w-6 h-6" />
          储蓄目标
        </h1>
        <Button onClick={() => setIsCreateModalOpen(true)} data-testid="button-add-goal">
          <Plus className="w-4 h-4 mr-1" />
          新建目标
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-muted-foreground">总储蓄</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold font-mono text-income">
              {currencyInfo.symbol}{totalSaved.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-muted-foreground">总目标</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold font-mono">
              {currencyInfo.symbol}{totalTarget.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-muted-foreground">进度中/已完成</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {activeGoals.length} / {completedGoals.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : goals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <PiggyBank className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">暂无储蓄目标</h3>
            <p className="text-muted-foreground mb-4">设定目标，开始积累财富</p>
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              新建目标
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {activeGoals.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">进行中</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {activeGoals.map((goal) => {
                  const target = parseFloat(goal.targetAmount);
                  const current = parseFloat(goal.currentAmount || "0");
                  const percentage = Math.min((current / target) * 100, 100);

                  return (
                    <Card
                      key={goal.id}
                      className="cursor-pointer hover-elevate"
                      onClick={() => {
                        setSelectedGoal(goal);
                        setIsEditModalOpen(true);
                      }}
                    >
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-full bg-income/20 flex items-center justify-center">
                            <Target className="w-5 h-5 text-income" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{goal.name}</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">已存</span>
                            <span className="font-mono">{currencyInfo.symbol}{current.toFixed(2)}</span>
                          </div>
                          <Progress value={percentage} className="h-2" />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>目标: {currencyInfo.symbol}{target.toFixed(2)}</span>
                            <span>{percentage.toFixed(0)}%</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {completedGoals.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-income" />
                已完成
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {completedGoals.map((goal) => (
                  <Card key={goal.id} className="bg-income/5 border-income/20">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-income flex items-center justify-center">
                          <CheckCircle2 className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{goal.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {currencyInfo.symbol}{parseFloat(goal.targetAmount).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建储蓄目标</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>目标名称</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：买新手机、旅行基金"
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
              <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)} className="flex-1">
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

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedGoal?.name}</DialogTitle>
          </DialogHeader>
          {selectedGoal && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <Coins className="w-12 h-12 mx-auto text-income mb-2" />
                <p className="text-3xl font-bold font-mono">
                  {currencyInfo.symbol}{parseFloat(selectedGoal.currentAmount || "0").toFixed(2)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
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
                    {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </Button>
                  <Button
                    type="submit"
                    disabled={updateMutation.isPending || !addAmount}
                    className="flex-1"
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
    </div>
  );
}
