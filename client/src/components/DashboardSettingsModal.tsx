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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, GripVertical, ChevronUp, ChevronDown, Wallet } from "lucide-react";
import type { Wallet as WalletType } from "@shared/schema";
import { walletTypes, walletTypeLabels } from "@shared/schema";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface DashboardPreferences {
  showTotalAssets: boolean;
  showMonthlyIncome: boolean;
  showMonthlyExpense: boolean;
  showWallets: boolean;
  showBudgets: boolean;
  showSavingsGoals: boolean;
  showRecentTransactions: boolean;
  showFlexibleFunds: boolean;
  cardOrder: string[] | null;
}

interface WalletPreferences {
  walletOrder: Record<string, number[]> | null;
  typeOrder: string[] | null;
  groupByType: boolean;
}

const defaultPreferences: DashboardPreferences = {
  showTotalAssets: true,
  showMonthlyIncome: true,
  showMonthlyExpense: true,
  showWallets: true,
  showBudgets: true,
  showSavingsGoals: true,
  showRecentTransactions: true,
  showFlexibleFunds: false,
  cardOrder: null,
};

interface DashboardSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SettingsItem {
  key: string;
  label: string;
  description: string;
}

const defaultSettingsItems: SettingsItem[] = [
  { key: "showTotalAssets", label: "总资产卡片", description: "显示所有钱包的总余额" },
  { key: "showMonthlyIncome", label: "本月收入", description: "显示当月收入统计" },
  { key: "showMonthlyExpense", label: "本月支出", description: "显示当月支出统计" },
  { key: "showFlexibleFunds", label: "可灵活调用资金", description: "仅显示可灵活调用的账户余额" },
  { key: "showWallets", label: "钱包列表", description: "显示所有钱包卡片" },
  { key: "showBudgets", label: "预算进度", description: "显示本月预算使用情况" },
  { key: "showSavingsGoals", label: "储蓄目标", description: "显示储蓄目标进度" },
  { key: "showRecentTransactions", label: "最近交易", description: "显示最近的交易记录" },
];

interface SortableCardItemProps {
  item: SettingsItem;
  isChecked: boolean;
  onToggle: (key: string, value: boolean) => void;
  onMove: (key: string, direction: 'up' | 'down') => void;
  index: number;
  total: number;
  isPending: boolean;
}

function SortableCardItem({ item, isChecked, onToggle, onMove, index, total, isPending }: SortableCardItemProps) {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        flex items-center gap-2 p-3 rounded-lg border transition-all
        ${isDragging ? 'bg-muted shadow-lg' : 'border-border/50 hover:border-border'}
      `}
      data-testid={`card-item-${item.key}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none p-1 -m-1"
      >
        <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
      </div>
      
      <div className="flex-1 min-w-0">
        <Label className="text-sm font-medium">{item.label}</Label>
        <p className="text-xs text-muted-foreground truncate">{item.description}</p>
      </div>
      
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
          checked={isChecked}
          onCheckedChange={(checked) => onToggle(item.key, checked)}
          disabled={isPending}
          data-testid={`switch-${item.key}`}
        />
      </div>
    </div>
  );
}

interface SortableTypeItemProps {
  type: string;
  walletsInType: WalletType[];
  walletOrder: Record<string, number[]> | null;
  typeIndex: number;
  totalTypes: number;
  onMoveType: (type: string, direction: 'up' | 'down') => void;
  onMoveWallet: (type: string, walletId: number, direction: 'up' | 'down') => void;
  onWalletDragEnd: (type: string, activeId: number, overId: number) => void;
  isPending: boolean;
}

function SortableTypeItem({
  type,
  walletsInType,
  typeIndex,
  totalTypes,
  onMoveType,
  onMoveWallet,
  onWalletDragEnd,
  isPending,
}: SortableTypeItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: type });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : undefined,
    touchAction: 'none' as const,
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleWalletDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onWalletDragEnd(type, Number(active.id), Number(over.id));
    }
  };

  const walletIds = walletsInType.map(w => w.id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        rounded-lg border transition-all
        ${isDragging ? 'bg-muted shadow-lg' : 'border-border/50'}
      `}
      data-testid={`type-item-${type}`}
    >
      <div className="flex items-center gap-2 p-3 border-b border-border/30">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none p-1 -m-1"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
        </div>
        <Wallet className="w-4 h-4 text-primary shrink-0" />
        <span className="flex-1 text-sm font-medium">
          {walletTypeLabels[type as keyof typeof walletTypeLabels] || type}
        </span>
        <span className="text-xs text-muted-foreground">
          {walletsInType.length} 个钱包
        </span>
        <div className="flex flex-col">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => onMoveType(type, 'up')}
            disabled={typeIndex === 0 || isPending}
            data-testid={`button-move-type-up-${type}`}
          >
            <ChevronUp className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => onMoveType(type, 'down')}
            disabled={typeIndex === totalTypes - 1 || isPending}
            data-testid={`button-move-type-down-${type}`}
          >
            <ChevronDown className="w-3 h-3" />
          </Button>
        </div>
      </div>
      
      {walletsInType.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleWalletDragEnd}
        >
          <SortableContext items={walletIds} strategy={verticalListSortingStrategy}>
            <div className="px-2 pb-2 pt-1 space-y-1">
              {walletsInType.map((wallet, walletIndex) => (
                <SortableWalletItem
                  key={wallet.id}
                  wallet={wallet}
                  type={type}
                  walletIndex={walletIndex}
                  totalWallets={walletsInType.length}
                  onMove={onMoveWallet}
                  isPending={isPending}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

interface SortableWalletItemProps {
  wallet: WalletType;
  type: string;
  walletIndex: number;
  totalWallets: number;
  onMove: (type: string, walletId: number, direction: 'up' | 'down') => void;
  isPending: boolean;
}

function SortableWalletItem({ wallet, type, walletIndex, totalWallets, onMove, isPending }: SortableWalletItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: wallet.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : undefined,
    touchAction: 'none' as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        flex items-center gap-2 p-2 pl-8 rounded border text-sm
        ${isDragging ? 'bg-muted shadow-lg' : 'border-transparent hover:bg-muted/50'}
      `}
      data-testid={`wallet-item-${wallet.id}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none p-1 -m-1"
      >
        <GripVertical className="w-3 h-3 text-muted-foreground shrink-0" />
      </div>
      <span 
        className="w-3 h-3 rounded-full shrink-0" 
        style={{ backgroundColor: wallet.color || '#8B5CF6' }}
      />
      <span className="flex-1 truncate">{wallet.name}</span>
      <div className="flex flex-col">
        <Button
          variant="ghost"
          size="icon"
          className="h-4 w-4"
          onClick={() => onMove(type, wallet.id, 'up')}
          disabled={walletIndex === 0 || isPending}
          data-testid={`button-move-wallet-up-${wallet.id}`}
        >
          <ChevronUp className="w-2 h-2" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-4 w-4"
          onClick={() => onMove(type, wallet.id, 'down')}
          disabled={walletIndex === totalWallets - 1 || isPending}
          data-testid={`button-move-wallet-down-${wallet.id}`}
        >
          <ChevronDown className="w-2 h-2" />
        </Button>
      </div>
    </div>
  );
}

export function DashboardSettingsModal({ open, onOpenChange }: DashboardSettingsModalProps) {
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

  const { data: preferences, isLoading } = useQuery<DashboardPreferences>({
    queryKey: ["/api/dashboard-preferences"],
  });

  const { data: walletPreferences } = useQuery<WalletPreferences>({
    queryKey: ["/api/wallet-preferences"],
  });

  const { data: wallets = [] } = useQuery<WalletType[]>({
    queryKey: ["/api/wallets"],
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<DashboardPreferences>) => {
      return apiRequest("PATCH", "/api/dashboard-preferences", updates);
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ["/api/dashboard-preferences"] });
      
      const previousPrefs = queryClient.getQueryData<DashboardPreferences>(["/api/dashboard-preferences"]);
      
      queryClient.setQueryData<DashboardPreferences>(["/api/dashboard-preferences"], (old) => ({
        ...(old ?? defaultPreferences),
        ...updates,
      }));
      
      return { previousPrefs };
    },
    onError: (error: any, _updates, context) => {
      if (context?.previousPrefs) {
        queryClient.setQueryData(["/api/dashboard-preferences"], context.previousPrefs);
      }
      toast({
        title: "保存失败",
        description: error.message || "请稍后重试",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard-preferences"] });
    },
  });

  const updateWalletMutation = useMutation({
    mutationFn: async (updates: Partial<WalletPreferences>) => {
      return apiRequest("PATCH", "/api/wallet-preferences", updates);
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ["/api/wallet-preferences"] });
      
      const previousPrefs = queryClient.getQueryData<WalletPreferences>(["/api/wallet-preferences"]);
      
      queryClient.setQueryData<WalletPreferences>(["/api/wallet-preferences"], (old) => ({
        walletOrder: null,
        typeOrder: null,
        groupByType: true,
        ...(old ?? {}),
        ...updates,
      }));
      
      return { previousPrefs };
    },
    onError: (error: any, _updates, context) => {
      if (context?.previousPrefs) {
        queryClient.setQueryData(["/api/wallet-preferences"], context.previousPrefs);
      }
      toast({
        title: "保存失败",
        description: error.message || "请稍后重试",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallet-preferences"] });
    },
  });

  const currentPrefs = preferences ?? defaultPreferences;
  const currentWalletPrefs = walletPreferences ?? { walletOrder: null, typeOrder: null, groupByType: true };
  
  const orderedItems = useMemo(() => {
    const order = currentPrefs.cardOrder;
    if (!order || order.length === 0) {
      return defaultSettingsItems;
    }
    
    const orderedList: SettingsItem[] = [];
    const itemsMap = new Map(defaultSettingsItems.map(item => [item.key, item]));
    
    order.forEach(key => {
      const item = itemsMap.get(key);
      if (item) {
        orderedList.push(item);
        itemsMap.delete(key);
      }
    });
    
    itemsMap.forEach(item => orderedList.push(item));
    
    return orderedList;
  }, [currentPrefs.cardOrder]);

  const orderedTypes = useMemo(() => {
    const order = currentWalletPrefs.typeOrder;
    if (!order || order.length === 0) {
      return [...walletTypes];
    }
    const validOrder = order.filter(type => walletTypes.includes(type as typeof walletTypes[number]));
    const remaining = walletTypes.filter(type => !validOrder.includes(type));
    return [...validOrder, ...remaining];
  }, [currentWalletPrefs.typeOrder]);

  const groupedWallets = useMemo(() => {
    const groups: Record<string, WalletType[]> = {};
    const walletOrderByType = currentWalletPrefs.walletOrder || {};
    
    orderedTypes.forEach(type => {
      groups[type] = [];
    });

    wallets.forEach(wallet => {
      const type = wallet.type || "cash";
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(wallet);
    });

    Object.keys(groups).forEach(type => {
      const order = walletOrderByType[type];
      if (order && order.length > 0) {
        const numOrder = order.map(Number);
        groups[type].sort((a, b) => {
          const aIndex = numOrder.indexOf(a.id);
          const bIndex = numOrder.indexOf(b.id);
          if (aIndex === -1 && bIndex === -1) return 0;
          if (aIndex === -1) return 1;
          if (bIndex === -1) return -1;
          return aIndex - bIndex;
        });
      }
    });

    return groups;
  }, [wallets, currentWalletPrefs.walletOrder, orderedTypes]);

  const handleToggle = (key: string, value: boolean) => {
    updateMutation.mutate({ [key]: value });
  };

  const handleCardDragStart = () => {
    setIsDragging(true);
  };

  const handleCardDragEnd = (event: DragEndEvent) => {
    setIsDragging(false);
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const currentOrder = orderedItems.map(item => item.key);
      const oldIndex = currentOrder.indexOf(String(active.id));
      const newIndex = currentOrder.indexOf(String(over.id));
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(currentOrder, oldIndex, newIndex);
        updateMutation.mutate({ cardOrder: newOrder });
      }
    }
  };

  const moveItem = (key: string, direction: 'up' | 'down') => {
    const currentOrder = orderedItems.map(item => item.key);
    const currentIndex = currentOrder.indexOf(key);
    
    if (currentIndex === -1) return;
    if (direction === 'up' && currentIndex === 0) return;
    if (direction === 'down' && currentIndex === currentOrder.length - 1) return;
    
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const newOrder = arrayMove(currentOrder, currentIndex, targetIndex);
    
    updateMutation.mutate({ cardOrder: newOrder });
  };

  const handleTypeDragStart = () => {
    setIsDragging(true);
  };

  const handleTypeDragEnd = (event: DragEndEvent) => {
    setIsDragging(false);
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = orderedTypes.indexOf(String(active.id));
      const newIndex = orderedTypes.indexOf(String(over.id));
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(orderedTypes, oldIndex, newIndex);
        updateWalletMutation.mutate({ typeOrder: newOrder });
      }
    }
  };

  const moveType = (type: string, direction: 'up' | 'down') => {
    const currentIndex = orderedTypes.indexOf(type);
    
    if (currentIndex === -1) return;
    if (direction === 'up' && currentIndex === 0) return;
    if (direction === 'down' && currentIndex === orderedTypes.length - 1) return;
    
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const newOrder = arrayMove([...orderedTypes], currentIndex, targetIndex);
    
    updateWalletMutation.mutate({ typeOrder: newOrder });
  };

  const handleWalletDragEnd = (type: string, activeId: number, overId: number) => {
    const walletsInType = groupedWallets[type] || [];
    const currentOrder = walletsInType.map(w => w.id);
    
    const oldIndex = currentOrder.indexOf(activeId);
    const newIndex = currentOrder.indexOf(overId);
    
    if (oldIndex !== -1 && newIndex !== -1) {
      const newOrder = arrayMove(currentOrder, oldIndex, newIndex);
      
      const updatedWalletOrder = {
        ...(currentWalletPrefs.walletOrder || {}),
        [type]: newOrder,
      };
      
      updateWalletMutation.mutate({ walletOrder: updatedWalletOrder });
    }
  };

  const moveWallet = (type: string, walletId: number, direction: 'up' | 'down') => {
    const walletsInType = groupedWallets[type] || [];
    const currentOrder = walletsInType.map(w => w.id);
    const currentIndex = currentOrder.indexOf(walletId);
    
    if (currentIndex === -1) return;
    if (direction === 'up' && currentIndex === 0) return;
    if (direction === 'down' && currentIndex === currentOrder.length - 1) return;
    
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const newOrder = arrayMove(currentOrder, currentIndex, targetIndex);
    
    const updatedWalletOrder = {
      ...(currentWalletPrefs.walletOrder || {}),
      [type]: newOrder,
    };
    
    updateWalletMutation.mutate({ walletOrder: updatedWalletOrder });
  };

  const cardItemIds = orderedItems.map(item => item.key);

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="modal-dashboard-settings">
        <DialogHeader className="pb-2">
          <DialogTitle>仪表盘设置</DialogTitle>
          <DialogDescription>
            自定义仪表盘显示内容和顺序
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="cards" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="cards" data-testid="tab-cards">卡片设置</TabsTrigger>
            <TabsTrigger value="wallets" data-testid="tab-wallets">钱包排序</TabsTrigger>
          </TabsList>
          
          <TabsContent value="cards" className="mt-4">
            {cardItemIds.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleCardDragStart}
                onDragEnd={handleCardDragEnd}
              >
                <SortableContext items={cardItemIds} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                    {orderedItems.map((item, index) => {
                      const key = item.key as keyof DashboardPreferences;
                      const isChecked = currentPrefs[key] as boolean;
                      
                      return (
                        <SortableCardItem
                          key={item.key}
                          item={item}
                          isChecked={isChecked}
                          onToggle={handleToggle}
                          onMove={moveItem}
                          index={index}
                          total={orderedItems.length}
                          isPending={updateMutation.isPending}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className="text-sm text-muted-foreground py-4 text-center">
                没有可显示的卡片
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="wallets" className="mt-4">
            {orderedTypes.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleTypeDragStart}
                onDragEnd={handleTypeDragEnd}
              >
                <SortableContext items={orderedTypes} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                    {orderedTypes.map((type, typeIndex) => {
                      const walletsInType = groupedWallets[type] || [];
                      
                      return (
                        <SortableTypeItem
                          key={type}
                          type={type}
                          walletsInType={walletsInType}
                          walletOrder={currentWalletPrefs.walletOrder}
                          typeIndex={typeIndex}
                          totalTypes={orderedTypes.length}
                          onMoveType={moveType}
                          onMoveWallet={moveWallet}
                          onWalletDragEnd={handleWalletDragEnd}
                          isPending={updateWalletMutation.isPending}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className="text-sm text-muted-foreground py-4 text-center">
                没有可排序的钱包类型
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
