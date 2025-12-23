import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, Plus, Pencil, Trash2, Loader2, Tag,
  Utensils, ShoppingBag, Car, Home, Gamepad2, Pill, 
  GraduationCap, Gift, CreditCard, Smartphone, Plane, 
  Shirt, Music, Coffee, Wallet, Briefcase, TrendingUp,
  DollarSign, Heart, Zap
} from "lucide-react";
import { Link } from "wouter";
import type { Category } from "@shared/schema";

const COLORS = [
  "#EF4444", "#F97316", "#F59E0B", "#84CC16", "#22C55E", 
  "#10B981", "#14B8A6", "#06B6D4", "#0EA5E9", "#3B82F6",
  "#6366F1", "#8B5CF6", "#A855F7", "#D946EF", "#EC4899",
  "#F43F5E", "#78716C", "#64748B",
];

const ICON_OPTIONS = [
  { value: "utensils", label: "餐饮", Icon: Utensils },
  { value: "shopping-bag", label: "购物", Icon: ShoppingBag },
  { value: "car", label: "交通", Icon: Car },
  { value: "home", label: "住房", Icon: Home },
  { value: "gamepad", label: "娱乐", Icon: Gamepad2 },
  { value: "pill", label: "医疗", Icon: Pill },
  { value: "graduation-cap", label: "教育", Icon: GraduationCap },
  { value: "gift", label: "礼物", Icon: Gift },
  { value: "credit-card", label: "支付", Icon: CreditCard },
  { value: "smartphone", label: "通讯", Icon: Smartphone },
  { value: "plane", label: "旅行", Icon: Plane },
  { value: "shirt", label: "服饰", Icon: Shirt },
  { value: "music", label: "音乐", Icon: Music },
  { value: "coffee", label: "饮品", Icon: Coffee },
  { value: "wallet", label: "钱包", Icon: Wallet },
  { value: "briefcase", label: "工作", Icon: Briefcase },
  { value: "trending-up", label: "投资", Icon: TrendingUp },
  { value: "dollar-sign", label: "收入", Icon: DollarSign },
  { value: "heart", label: "健康", Icon: Heart },
  { value: "zap", label: "其他", Icon: Zap },
];

const getIconComponent = (iconName: string | null | undefined) => {
  const found = ICON_OPTIONS.find((i) => i.value === iconName);
  return found ? found.Icon : Tag;
};

export default function Categories() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("expense");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [color, setColor] = useState(COLORS[0]);

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; type: string; icon: string; color: string }) => {
      return apiRequest("POST", "/api/categories", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "分类已创建" });
      closeModal();
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
    mutationFn: async ({ id, data }: { id: number; data: { name?: string; icon?: string; color?: string } }) => {
      return apiRequest("PATCH", `/api/categories/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "分类已更新" });
      closeModal();
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
      return apiRequest("DELETE", `/api/categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "分类已删除" });
    },
    onError: (error: any) => {
      toast({
        title: "删除失败",
        description: error.message || "该分类可能正在被使用",
        variant: "destructive",
      });
    },
  });

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCategory(null);
    setName("");
    setIcon("");
    setColor(COLORS[0]);
  };

  const openEditModal = (category: Category) => {
    setEditingCategory(category);
    setName(category.name);
    setIcon(category.icon || "");
    setColor(category.color || COLORS[0]);
    setIsModalOpen(true);
  };

  const openCreateModal = () => {
    setEditingCategory(null);
    setName("");
    setIcon("");
    setColor(COLORS[0]);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: "请输入分类名称", variant: "destructive" });
      return;
    }

    if (editingCategory) {
      updateMutation.mutate({
        id: editingCategory.id,
        data: { name: name.trim(), icon, color },
      });
    } else {
      createMutation.mutate({
        name: name.trim(),
        type: activeTab,
        icon,
        color,
      });
    }
  };

  const expenseCategories = categories.filter((c) => c.type === "expense");
  const incomeCategories = categories.filter((c) => c.type === "income");

  if (isAuthLoading || !user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header user={user} />

      <main className="container mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-back-home">
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
          </Link>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Tag className="w-6 h-6" />
            分类管理
          </h1>
        </div>

        <Card>
          <CardContent className="p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
                <TabsList>
                  <TabsTrigger value="expense" data-testid="tab-expense">
                    支出 ({expenseCategories.length})
                  </TabsTrigger>
                  <TabsTrigger value="income" data-testid="tab-income">
                    收入 ({incomeCategories.length})
                  </TabsTrigger>
                </TabsList>
                <Button onClick={openCreateModal} data-testid="button-add-category">
                  <Plus className="w-4 h-4 mr-1" />
                  添加分类
                </Button>
              </div>

              <TabsContent value="expense">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : expenseCategories.length === 0 ? (
                  <p className="text-center text-muted-foreground py-12">暂无支出分类</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {expenseCategories.map((category) => (
                      <CategoryItem
                        key={category.id}
                        category={category}
                        onEdit={() => openEditModal(category)}
                        onDelete={() => deleteMutation.mutate(category.id)}
                        isDeleting={deleteMutation.isPending}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="income">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : incomeCategories.length === 0 ? (
                  <p className="text-center text-muted-foreground py-12">暂无收入分类</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {incomeCategories.map((category) => (
                      <CategoryItem
                        key={category.id}
                        category={category}
                        onEdit={() => openEditModal(category)}
                        onDelete={() => deleteMutation.mutate(category.id)}
                        isDeleting={deleteMutation.isPending}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCategory ? "编辑分类" : "添加分类"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>分类名称</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="输入分类名称"
                data-testid="input-category-name"
              />
            </div>

            <div className="space-y-2">
              <Label>图标</Label>
              <div className="grid grid-cols-5 gap-2">
                {ICON_OPTIONS.map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    className={`flex items-center justify-center w-10 h-10 rounded-lg border transition-all ${
                      icon === value
                        ? "border-primary bg-primary/10 ring-2 ring-primary"
                        : "border-border hover-elevate"
                    }`}
                    onClick={() => setIcon(value)}
                    title={label}
                    data-testid={`icon-${value}`}
                  >
                    <Icon className="w-5 h-5" />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>颜色</Label>
              <div className="grid grid-cols-9 gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`w-6 h-6 rounded-full transition-transform ${
                      color === c ? "ring-2 ring-offset-2 ring-primary scale-110" : ""
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                    data-testid={`color-${c}`}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={closeModal} className="flex-1">
                取消
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="flex-1"
                data-testid="button-save-category"
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                保存
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface CategoryItemProps {
  category: Category;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

function CategoryItem({ category, onEdit, onDelete, isDeleting }: CategoryItemProps) {
  const IconComponent = getIconComponent(category.icon);
  
  return (
    <div
      className="flex items-center justify-between p-3 rounded-lg border bg-card hover-elevate"
      data-testid={`category-item-${category.id}`}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white"
          style={{ backgroundColor: category.color || "#6366F1" }}
        >
          <IconComponent className="w-4 h-4" />
        </div>
        <div>
          <p className="font-medium">{category.name}</p>
          {category.isDefault && (
            <span className="text-xs text-muted-foreground">默认</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onEdit}
          data-testid={`button-edit-category-${category.id}`}
        >
          <Pencil className="w-4 h-4" />
        </Button>
        {!category.isDefault && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            disabled={isDeleting}
            data-testid={`button-delete-category-${category.id}`}
          >
            {isDeleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4 text-expense" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
