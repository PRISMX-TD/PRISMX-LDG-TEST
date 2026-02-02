import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Trash2 } from "lucide-react";
import type { Category } from "@shared/schema";

const categoryColors = [
  "#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6",
  "#EC4899", "#06B6D4", "#F97316", "#84CC16", "#6B7280",
];

const categoryIcons = [
  { value: "food", label: "餐饮" },
  { value: "shopping", label: "购物" },
  { value: "transport", label: "交通" },
  { value: "housing", label: "住房" },
  { value: "entertainment", label: "娱乐" },
  { value: "health", label: "医疗" },
  { value: "education", label: "教育" },
  { value: "gift", label: "礼物" },
  { value: "salary", label: "工资" },
  { value: "work", label: "投资" },
  { value: "other", label: "其他" },
];

interface CategoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: Category | null;
  type?: "expense" | "income";
}

export function CategoryModal({
  open,
  onOpenChange,
  category,
  type = "expense",
}: CategoryModalProps) {
  const { toast } = useToast();
  const isEdit = !!category;

  const [name, setName] = useState(category?.name || "");
  const [icon, setIcon] = useState(category?.icon || "other");
  const [color, setColor] = useState(category?.color || categoryColors[0]);
  const [categoryType, setCategoryType] = useState<"expense" | "income">(
    (category?.type as "expense" | "income") || type
  );

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; type: string; icon: string; color: string }) => {
      return apiRequest("POST", "/api/categories", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "分类已创建" });
      onOpenChange(false);
      resetForm();
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
    mutationFn: async (data: { name: string; icon: string; color: string }) => {
      return apiRequest("PATCH", `/api/categories/${category?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "分类已更新" });
      onOpenChange(false);
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
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/categories/${category?.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "分类已删除" });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "删除失败",
        description: error.message || "无法删除默认分类",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setName("");
    setIcon("other");
    setColor(categoryColors[0]);
    setCategoryType(type);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: "请输入分类名称", variant: "destructive" });
      return;
    }

    if (isEdit && !!category?.isDefault) {
      toast({ title: "默认分类不能编辑", variant: "destructive" });
      return;
    }

    if (isEdit) {
      updateMutation.mutate({ name: name.trim(), icon, color });
    } else {
      createMutation.mutate({ name: name.trim(), type: categoryType, icon, color });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader className="pb-2">
          <DialogTitle>{isEdit ? "编辑分类" : "新建分类"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="name">分类名称</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="输入分类名称"
            data-testid="input-category-name"
            disabled={isEdit && !!category?.isDefault}
          />
          </div>

          {!isEdit && (
            <div className="space-y-2">
              <Label>类型</Label>
              <Select value={categoryType} onValueChange={(v) => setCategoryType(v as "expense" | "income")}>
                <SelectTrigger data-testid="select-category-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">支出</SelectItem>
                  <SelectItem value="income">收入</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>图标</Label>
            <Select value={icon} onValueChange={setIcon} disabled={isEdit && !!category?.isDefault}>
              <SelectTrigger data-testid="select-category-icon">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categoryIcons.map((i) => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>颜色</Label>
            <div className="flex gap-2 flex-wrap">
              {categoryColors.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`w-8 h-8 rounded-full border-2 transition-transform ${
                    color === c ? "border-primary scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                  disabled={isEdit && !!category?.isDefault}
                  data-testid={`button-color-${c.replace("#", "")}`}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-3">
            {isEdit && !category?.isDefault && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0 text-destructive border-destructive/50 hover:bg-destructive/10"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                data-testid="button-delete-category"
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 h-11"
            >
              取消
            </Button>
            <Button type="submit" disabled={isPending || (isEdit && !!category?.isDefault)} className="flex-1 h-11" data-testid="button-save-category">
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEdit ? "保存" : "创建"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
