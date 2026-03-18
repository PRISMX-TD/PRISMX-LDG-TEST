import { useState, useCallback, useMemo, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Loader2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  LayoutDashboard,
  Receipt,
  Wallet,
  BarChart3,
  Tags,
  TrendingUp,
  PiggyBank,
  CalendarClock,
  Bell,
  FileText,
  Settings,
  ArrowUpDown,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface MobileNavPreferences {
  navOrder: string[] | null;
}

const defaultPreferences: MobileNavPreferences = { navOrder: ["dashboard", "transactions", "wallets", "analytics"] };

interface NavItem {
  key: string;
  label: string;
  icon: typeof LayoutDashboard;
  defaultMain: boolean;
}

const allNavItems: NavItem[] = [
  { key: "dashboard", label: "仪表盘", icon: LayoutDashboard, defaultMain: true },
  { key: "transactions", label: "交易记录", icon: Receipt, defaultMain: true },
  { key: "wallets", label: "钱包", icon: Wallet, defaultMain: true },
  { key: "analytics", label: "数据分析", icon: BarChart3, defaultMain: true },
  { key: "exchange", label: "交易所", icon: ArrowUpDown, defaultMain: false },
  { key: "categories", label: "分类管理", icon: Tags, defaultMain: false },
  { key: "budgets", label: "预算管理", icon: TrendingUp, defaultMain: false },
  { key: "savings", label: "储蓄目标", icon: PiggyBank, defaultMain: false },
  { key: "recurring", label: "定期交易", icon: CalendarClock, defaultMain: false },
  { key: "reminders", label: "账单提醒", icon: Bell, defaultMain: false },
  { key: "reports", label: "财务报表", icon: FileText, defaultMain: false },
  { key: "settings", label: "设置", icon: Settings, defaultMain: false },
];

interface MobileNavSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SortableNavItemProps {
  item: NavItem;
  index: number;
  total: number;
  onMove: (key: string, direction: 'up' | 'down') => void;
  onToggle: (key: string) => void;
  isPending: boolean;
}

function SortableNavItem({ item, index, total, onMove, onToggle, isPending }: SortableNavItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : undefined,
    touchAction: 'none' as const,
  };

  const Icon = item.icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        flex items-center gap-2 p-3 rounded-lg border transition-all
        ${isDragging ? 'bg-muted shadow-lg' : 'border-border/50 hover:border-border'}
      `}
      data-testid={`nav-item-${item.key}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none p-1 -m-1"
      >
        <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
      </div>
      <Icon className="w-4 h-4 text-primary shrink-0" />
      <span className="flex-1 text-sm font-medium">{item.label}</span>
      
      <div className="flex items-center gap-1 shrink-0">
        <div className="flex flex-col">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => onMove(item.key, 'up')}
            disabled={index === 0 || isPending}
            data-testid={`button-move-up-${item.key}`}
          >
            <ChevronUp className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => onMove(item.key, 'down')}
            disabled={index === total - 1 || isPending}
            data-testid={`button-move-down-${item.key}`}
          >
            <ChevronDown className="w-3 h-3" />
          </Button>
        </div>
        
        <Switch
          checked={true}
          onCheckedChange={() => onToggle(item.key)}
          disabled={isPending}
          data-testid={`switch-${item.key}`}
        />
      </div>
    </div>
  );
}

export function MobileNavSettingsModal({ open, onOpenChange }: MobileNavSettingsModalProps) {
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (isDragging) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [isDragging]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const { data: preferences, isLoading } = useQuery<MobileNavPreferences>({
    queryKey: ["/api/mobile-nav-preferences"],
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<MobileNavPreferences>) => {
      return apiRequest("PATCH", "/api/mobile-nav-preferences", updates);
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ["/api/mobile-nav-preferences"] });
      
      const previousPrefs = queryClient.getQueryData<MobileNavPreferences>(["/api/mobile-nav-preferences"]);
      
      queryClient.setQueryData<MobileNavPreferences>(["/api/mobile-nav-preferences"], (old) => ({
        ...(old ?? defaultPreferences),
        ...updates,
      }));
      
      return { previousPrefs };
    },
    onError: (error: any, _updates, context) => {
      if (context?.previousPrefs) {
        queryClient.setQueryData(["/api/mobile-nav-preferences"], context.previousPrefs);
      }
      toast({
        title: "保存失败",
        description: error.message || "请稍后重试",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mobile-nav-preferences"] });
    },
  });

  const currentPrefs = useMemo(() => ({
    navOrder: preferences?.navOrder ?? defaultPreferences.navOrder,
  }), [preferences]);
  
  const mainNavItems = useMemo(() => {
    const items = currentPrefs.navOrder || [];
    return items
      .map(key => allNavItems.find(item => item.key === key))
      .filter((item): item is NavItem => item !== undefined);
  }, [currentPrefs.navOrder]);

  const moreMenuItems = useMemo(() => {
    const items = currentPrefs.navOrder || [];
    return allNavItems.filter(item => !items.includes(item.key));
  }, [currentPrefs.navOrder]);

  const handleDragStart = () => {
    setIsDragging(true);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setIsDragging(false);
    const { active, over } = event;
    const items = currentPrefs.navOrder || [];
    
    if (over && active.id !== over.id) {
      const oldIndex = items.indexOf(String(active.id));
      const newIndex = items.indexOf(String(over.id));
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove([...items], oldIndex, newIndex);
        updateMutation.mutate({ navOrder: newOrder });
      }
    }
  };

  const moveItem = (key: string, direction: 'up' | 'down') => {
    const items = currentPrefs.navOrder || [];
    const currentIndex = items.indexOf(key);
    
    if (currentIndex === -1) return;
    if (direction === 'up' && currentIndex === 0) return;
    if (direction === 'down' && currentIndex === items.length - 1) return;
    
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const newOrder = arrayMove([...items], currentIndex, targetIndex);
    
    updateMutation.mutate({ navOrder: newOrder });
  };

  const handleToggleMain = (key: string) => {
    const items = currentPrefs.navOrder || [];
    const newMainItems = items.filter(k => k !== key);
    updateMutation.mutate({ navOrder: newMainItems });
  };

  const handleAddToMain = (key: string) => {
    const items = currentPrefs.navOrder || [];
    if (items.length >= 4) {
      toast({
        title: "已达到上限",
        description: "底部导航栏最多显示4个项目",
        variant: "destructive",
      });
      return;
    }
    
    const newMainItems = [...items, key];
    updateMutation.mutate({ navOrder: newMainItems });
  };

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="sr-only">加载中</DialogTitle>
          <DialogDescription className="sr-only">正在加载导航设置...</DialogDescription>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="modal-mobile-nav-settings">
        <DialogHeader className="pb-2">
          <DialogTitle>底部导航设置</DialogTitle>
          <DialogDescription>
            选择显示在底部导航栏的项目（最多4个），其余在"更多"菜单中
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium mb-2 text-muted-foreground">主导航栏（拖拽排序）</h3>
            {mainNavItems.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={mainNavItems.map(item => item.key)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {mainNavItems.map((item, index) => (
                      <SortableNavItem
                        key={item.key}
                        item={item}
                        index={index}
                        total={mainNavItems.length}
                        onMove={moveItem}
                        onToggle={handleToggleMain}
                        isPending={updateMutation.isPending}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className="text-sm text-muted-foreground py-4 text-center">
                没有选择导航项目
              </div>
            )}
          </div>
          
          <div>
            <h3 className="text-sm font-medium mb-2 text-muted-foreground">更多菜单项目</h3>
            <div className="space-y-2">
              {moreMenuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.key}
                    className="flex items-center gap-2 p-3 rounded-lg border border-border/50"
                    data-testid={`more-item-${item.key}`}
                  >
                    <div className="w-4" />
                    <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-sm text-muted-foreground">{item.label}</span>
                    <Switch
                      checked={false}
                      onCheckedChange={() => handleAddToMain(item.key)}
                      disabled={updateMutation.isPending || mainNavItems.length >= 4}
                      data-testid={`switch-add-${item.key}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
