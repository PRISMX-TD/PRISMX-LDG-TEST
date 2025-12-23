import { useState, useRef, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { WalletCard, WalletCardSkeleton } from "@/components/WalletCard";
import { WalletModal } from "@/components/WalletModal";
import { TotalAssetsCard } from "@/components/TotalAssetsCard";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Wallet, 
  Plus, 
  GripVertical,
  Banknote,
  CreditCard,
  Smartphone,
  TrendingUp,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { walletTypeLabels, getCurrencyInfo } from "@shared/schema";
import type { Wallet as WalletType, UserWalletPreferences } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const walletTypeOrder = ['cash', 'bank_card', 'digital_wallet', 'credit_card', 'investment'];

const walletTypeIcons: Record<string, typeof Wallet> = {
  cash: Banknote,
  bank_card: CreditCard,
  digital_wallet: Smartphone,
  credit_card: CreditCard,
  investment: TrendingUp,
};

interface DragState {
  walletId: number;
  type: string;
  startY: number;
  currentY: number;
}

export default function Wallets() {
  const { user } = useAuth();
  const defaultCurrency = user?.defaultCurrency || "MYR";
  const currencyInfo = getCurrencyInfo(defaultCurrency);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<WalletType | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOverWalletId, setDragOverWalletId] = useState<number | null>(null);
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set());
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDragging = useRef(false);

  const { data: wallets = [], isLoading } = useQuery<WalletType[]>({
    queryKey: ["/api/wallets"],
  });

  const { data: walletPreferences } = useQuery<UserWalletPreferences>({
    queryKey: ["/api/wallet-preferences"],
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: (data: Partial<UserWalletPreferences>) =>
      apiRequest("PATCH", "/api/wallet-preferences", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallet-preferences"] });
    },
  });

  const groupedWallets = useMemo(() => {
    const groups: Record<string, WalletType[]> = {};
    const customOrder = walletPreferences?.walletOrder as Record<string, number[]> | null;

    wallets.filter((w) => !(w.isFlexible === false && (w.name || '').endsWith(' (归档)'))).forEach((wallet) => {
      const type = wallet.type || 'other';
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(wallet);
    });

    Object.keys(groups).forEach((type) => {
      const typeOrder = customOrder?.[type];
      if (typeOrder && typeOrder.length > 0) {
        groups[type].sort((a, b) => {
          const indexA = typeOrder.indexOf(a.id);
          const indexB = typeOrder.indexOf(b.id);
          if (indexA === -1 && indexB === -1) return 0;
          if (indexA === -1) return 1;
          if (indexB === -1) return -1;
          return indexA - indexB;
        });
      }
    });

    const orderedGroups: { type: string; wallets: WalletType[] }[] = [];
    const typeOrderConfig = walletPreferences?.typeOrder || walletTypeOrder;
    
    typeOrderConfig.forEach((type) => {
      if (groups[type] && groups[type].length > 0) {
        orderedGroups.push({ type, wallets: groups[type] });
      }
    });

    Object.keys(groups).forEach((type) => {
      if (!typeOrderConfig.includes(type) && groups[type].length > 0) {
        orderedGroups.push({ type, wallets: groups[type] });
      }
    });

    return orderedGroups;
  }, [wallets, walletPreferences]);

  const handleLongPressStart = useCallback((e: React.TouchEvent | React.MouseEvent, wallet: WalletType) => {
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    longPressTimer.current = setTimeout(() => {
      isDragging.current = true;
      setDragState({
        walletId: wallet.id,
        type: wallet.type,
        startY: clientY,
        currentY: clientY,
      });
      
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    }, 400);
  }, []);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    
    if (dragState && dragOverWalletId && dragState.walletId !== dragOverWalletId) {
      const currentOrder = walletPreferences?.walletOrder as Record<string, number[]> || {};
      const typeWallets = groupedWallets.find(g => g.type === dragState.type)?.wallets || [];
      const walletIds = typeWallets.map(w => w.id);
      
      const fromIndex = walletIds.indexOf(dragState.walletId);
      const toIndex = walletIds.indexOf(dragOverWalletId);
      
      if (fromIndex !== -1 && toIndex !== -1) {
        const newOrder = [...walletIds];
        newOrder.splice(fromIndex, 1);
        newOrder.splice(toIndex, 0, dragState.walletId);
        
        updatePreferencesMutation.mutate({
          walletOrder: { ...currentOrder, [dragState.type]: newOrder },
        });
      }
    }
    
    isDragging.current = false;
    setDragState(null);
    setDragOverWalletId(null);
  }, [dragState, dragOverWalletId, walletPreferences, groupedWallets, updatePreferencesMutation]);

  const handleDragMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!dragState) return;
    
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragState(prev => prev ? { ...prev, currentY: clientY } : null);
  }, [dragState]);

  const handleDragEnter = useCallback((walletId: number) => {
    if (dragState && walletId !== dragState.walletId) {
      setDragOverWalletId(walletId);
    }
  }, [dragState]);

  const toggleCollapse = (type: string) => {
    setCollapsedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const handleWalletClick = (wallet: WalletType) => {
    if (!isDragging.current) {
      navigate(`/wallets/${wallet.id}`);
    }
  };

  const handleWalletEdit = (e: React.MouseEvent, wallet: WalletType) => {
    e.stopPropagation();
    setSelectedWallet(wallet);
    setIsModalOpen(true);
  };

  return (
    <div 
      className="p-4 md:p-6 space-y-4 md:space-y-6"
      onMouseMove={handleDragMove}
      onMouseUp={handleLongPressEnd}
      onMouseLeave={handleLongPressEnd}
      onTouchMove={handleDragMove}
      onTouchEnd={handleLongPressEnd}
      onTouchCancel={handleLongPressEnd}
    >
      <div className="hidden md:flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Wallet className="w-6 h-6" />
          钱包管理
        </h1>
        <Button
          onClick={() => {
            setSelectedWallet(null);
            setIsModalOpen(true);
          }}
          data-testid="button-add-wallet"
        >
          <Plus className="w-4 h-4 mr-1" />
          添加钱包
        </Button>
      </div>

      <TotalAssetsCard
        wallets={wallets.filter((w)=>!(w.isFlexible === false && (w.name || '').endsWith(' (归档)')))}
        defaultCurrency={defaultCurrency}
        isLoading={isLoading}
      />

      <div className="flex md:hidden items-center justify-between">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Wallet className="w-4 h-4" />
          我的钱包
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSelectedWallet(null);
            setIsModalOpen(true);
          }}
          className="text-sm"
          data-testid="button-add-wallet-inline"
        >
          <Plus className="w-4 h-4 mr-1" />
          添加
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-5 w-20 bg-muted rounded animate-pulse" />
              <div className="space-y-2">
                {[1, 2].map((j) => (
                  <WalletCardSkeleton key={j} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : wallets.length === 0 ? (
        <Card>
          <CardContent className="p-4 md:p-6">
            <EmptyState
              icon={Wallet}
              title="还没有钱包"
              description="添加您的第一个钱包开始记账"
              actionLabel="添加钱包"
              onAction={() => setIsModalOpen(true)}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groupedWallets.map(({ type, wallets: typeWallets }) => {
            const TypeIcon = walletTypeIcons[type] || Wallet;
            const isCollapsed = collapsedTypes.has(type);
            const totalBalance = typeWallets.reduce((sum, w) => {
              const balance = parseFloat(w.balance || "0");
              const walletCurrency = w.currency || "MYR";
              if (walletCurrency === defaultCurrency) {
                return sum + balance;
              }
              const rate = parseFloat(w.exchangeRateToDefault || "1");
              return sum + balance * rate;
            }, 0);

            return (
              <Collapsible key={type} open={!isCollapsed} onOpenChange={() => toggleCollapse(type)}>
                <div className="space-y-2">
                  <CollapsibleTrigger asChild>
                    <button
                      className="flex items-center justify-between w-full p-2 rounded-lg hover-elevate transition-colors"
                      data-testid={`button-toggle-${type}`}
                    >
                      <div className="flex items-center gap-2">
                        <TypeIcon className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-muted-foreground">
                          {walletTypeLabels[type] || type}
                        </span>
                        <span className="text-xs text-muted-foreground/70">
                          ({typeWallets.length})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground">
                          {currencyInfo.symbol}{totalBalance >= 0 ? '+' : ''}{totalBalance.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                        </span>
                        {isCollapsed ? (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="hidden md:grid gap-3 grid-cols-2 lg:grid-cols-3">
                      {typeWallets.map((wallet) => (
                        <div
                          key={wallet.id}
                          className={`relative ${
                            dragState?.walletId === wallet.id ? 'opacity-50 scale-95' : ''
                          } ${
                            dragOverWalletId === wallet.id && dragState?.type === type ? 'ring-2 ring-primary' : ''
                          }`}
                          onMouseDown={(e) => handleLongPressStart(e, wallet)}
                          onMouseEnter={() => handleDragEnter(wallet.id)}
                        >
                          <WalletCard
                            wallet={wallet}
                            onClick={() => handleWalletClick(wallet)}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="md:hidden space-y-2">
                      {typeWallets.map((wallet) => (
                        <div
                          key={wallet.id}
                          className={`relative flex items-center gap-2 ${
                            dragState?.walletId === wallet.id ? 'opacity-50 scale-95' : ''
                          } ${
                            dragOverWalletId === wallet.id && dragState?.type === type ? 'ring-2 ring-primary rounded-lg' : ''
                          }`}
                          onTouchStart={(e) => handleLongPressStart(e, wallet)}
                          onTouchMove={(e) => {
                            if (dragState) {
                              const touch = e.touches[0];
                              const element = document.elementFromPoint(touch.clientX, touch.clientY);
                              const walletElement = element?.closest('[data-wallet-id]');
                              if (walletElement) {
                                const id = parseInt(walletElement.getAttribute('data-wallet-id') || '0');
                                if (id !== dragOverWalletId) {
                                  handleDragEnter(id);
                                }
                              }
                            }
                          }}
                          data-wallet-id={wallet.id}
                        >
                          {dragState?.type === type && (
                            <div className="flex-shrink-0 touch-none cursor-grab active:cursor-grabbing">
                              <GripVertical className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1">
                            <WalletCard
                              wallet={wallet}
                              onClick={() => handleWalletClick(wallet)}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>
      )}

      <div className="md:hidden text-center text-xs text-muted-foreground/60 mt-4">
        长按钱包可拖动排序
      </div>

      <WalletModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        wallet={selectedWallet}
        defaultCurrency={user?.defaultCurrency || "MYR"}
      />
    </div>
  );
}
