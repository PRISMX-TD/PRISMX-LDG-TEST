import { PageContainer } from "@/components/PageContainer";
import { WalletCard, WalletCardSkeleton } from "@/components/WalletCard";
import { WalletModal } from "@/components/WalletModal";
import { TotalAssetsCard } from "@/components/TotalAssetsCard";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { FloatingActionButton } from "@/components/FloatingActionButton";
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
  ArrowLeft
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
import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

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

  const handleDragMove = useCallback((e: TouchEvent | MouseEvent) => {
    if (!isDragging.current) return;
    
    // e.preventDefault(); // Prevent scrolling while dragging - optional, but good for UX
    const clientY = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
    
    setDragState(prev => prev ? { ...prev, currentY: clientY } : null);
    
    // Handle touch move element detection for drag over
    if ('touches' in e) {
        const touch = (e as TouchEvent).touches[0];
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        const walletElement = element?.closest('[data-wallet-id]');
        if (walletElement) {
          const id = parseInt(walletElement.getAttribute('data-wallet-id') || '0');
          // We need access to the current dragOverWalletId here, but since this is a callback
          // passed to addEventListener, we might have stale closure issues if not careful.
          // However, we are setting state based on the detected ID.
          setDragOverWalletId(current => current !== id ? id : current);
        }
    }
  }, []);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    
    if (isDragging.current) {
      // Clean up listeners
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleLongPressEnd);
      window.removeEventListener('touchmove', handleDragMove);
      window.removeEventListener('touchend', handleLongPressEnd);
      window.removeEventListener('touchcancel', handleLongPressEnd);

      // Perform reorder logic
      // Note: We need to access the LATEST state here. Since this function is memoized with deps,
      // it should have access to the latest state when re-created.
      // BUT, since we attach it as an event listener, we might be calling an old version?
      // Actually, we attach it in handleLongPressStart, which closes over the current scope.
      // But dragOverWalletId is state. 
      // To be safe, we should probably use a ref for dragOverWalletId if we were attaching once,
      // but here we are attaching/detaching dynamically.
      // The issue is that handleLongPressEnd is defined with deps [dragState, dragOverWalletId...].
      // When these change, handleLongPressEnd is redefined.
      // BUT the event listener attached to window is the OLD handleLongPressEnd.
      // This is a classic React Event Listener trap.
      // FIX: Use refs for the values needed inside the event handler, OR use a stable handler that reads from refs.
    }
    
    // We will handle the state update logic in a useEffect that watches for isDragging change to false?
    // Or just rely on the fact that we need to execute the logic NOW.
    
    // Let's implement the logic using refs to ensure we have fresh data
    // We can't easily change to refs for everything now without refactoring.
    // ALTERNATIVE: Use a stable "end" handler that calls a ref-held function.
  }, [handleDragMove]); // We will fix the logic below

  // Ref to hold current state for event handlers
  const stateRef = useRef({ dragState, dragOverWalletId, groupedWallets, walletPreferences });
  useEffect(() => {
    stateRef.current = { dragState, dragOverWalletId, groupedWallets, walletPreferences };
  }, [dragState, dragOverWalletId, groupedWallets, walletPreferences]);

  const onDragEnd = useCallback(() => {
    const { dragState, dragOverWalletId, groupedWallets, walletPreferences } = stateRef.current;
    
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

    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', onDragEnd);
    window.removeEventListener('touchmove', handleDragMove);
    window.removeEventListener('touchend', onDragEnd);
    window.removeEventListener('touchcancel', onDragEnd);
  }, [handleDragMove, updatePreferencesMutation]); // updatePreferencesMutation is stable

  const handleLongPressStart = useCallback((e: React.TouchEvent | React.MouseEvent, wallet: WalletType) => {
    // Only allow left click or touch
    if ('button' in e && e.button !== 0) return;

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

      // Attach global listeners
      window.addEventListener('mousemove', handleDragMove, { passive: false });
      window.addEventListener('mouseup', onDragEnd);
      window.addEventListener('touchmove', handleDragMove, { passive: false });
      window.addEventListener('touchend', onDragEnd);
      window.addEventListener('touchcancel', onDragEnd);

    }, 400);
  }, [handleDragMove, onDragEnd]);

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

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

  if (!user) {
    return null;
  }

  return (
    <PageContainer scrollable={false}>
      <div className="flex-1 flex flex-col min-h-0 space-y-4 md:space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-back-home" className="text-gray-400 hover:text-white">
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
          </Link>
          <h1 className="text-2xl font-semibold flex items-center gap-2 text-white">
            <Wallet className="w-6 h-6 text-neon-purple" />
            钱包管理
          </h1>
          <Button
            onClick={() => {
              setSelectedWallet(null);
              setIsModalOpen(true);
            }}
            data-testid="button-add-wallet"
            className="ml-auto bg-neon-purple hover:bg-neon-dark text-white shadow-neon border-none"
          >
            <Plus className="w-4 h-4 mr-1" />
            添加钱包
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scroll pr-2 space-y-6">
          <TotalAssetsCard
            wallets={wallets.filter((w)=>!(w.isFlexible === false && (w.name || '').endsWith(' (归档)')))}
            defaultCurrency={defaultCurrency}
            isLoading={isLoading}
          />



          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-5 w-20 bg-white/10 rounded animate-pulse" />
                  <div className="space-y-2">
                    {[1, 2].map((j) => (
                      <WalletCardSkeleton key={j} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : wallets.length === 0 ? (
            <div className="glass-card rounded-xl p-6">
              <EmptyState
                icon={Wallet}
                title="还没有钱包"
                description="添加您的第一个钱包开始记账"
                actionLabel="添加钱包"
                onAction={() => setIsModalOpen(true)}
              />
            </div>
          ) : (
            <div className="space-y-4 pb-20 md:pb-0">
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
                    <div className="space-y-3">
                      <CollapsibleTrigger asChild>
                        <button
                          className="flex items-center justify-between w-full p-2 rounded-lg hover:bg-white/5 transition-colors group"
                          data-testid={`button-toggle-${type}`}
                        >
                          <div className="flex items-center gap-2">
                            <TypeIcon className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
                            <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">
                              {walletTypeLabels[type] || type}
                            </span>
                            <span className="text-xs text-gray-500">
                              ({typeWallets.length})
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-gray-400 group-hover:text-gray-200 transition-colors">
                              {currencyInfo.symbol} {totalBalance >= 0 ? '+' : ''}{totalBalance.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                            </span>
                            {isCollapsed ? (
                              <ChevronRight className="w-4 h-4 text-gray-500" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-gray-500" />
                            )}
                          </div>
                        </button>
                      </CollapsibleTrigger>

                      <CollapsibleContent>
                        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {typeWallets.map((wallet) => (
                            <div
                              key={wallet.id}
                              className={`relative transition-all duration-200 ${
                                dragState?.walletId === wallet.id ? 'opacity-50 scale-95' : ''
                              } ${
                                dragOverWalletId === wallet.id && dragState?.type === type ? 'ring-2 ring-neon-purple rounded-xl' : ''
                              }`}
                              onMouseDown={(e) => handleLongPressStart(e, wallet)}
                              onMouseUp={cancelLongPress}
                              onMouseLeave={cancelLongPress}
                              onMouseEnter={() => handleDragEnter(wallet.id)}
                              onTouchStart={(e) => handleLongPressStart(e, wallet)}
                              onTouchEnd={cancelLongPress}
                              onTouchCancel={cancelLongPress}
                              // Removed onTouchMove from here to prevent scroll locking
                              data-wallet-id={wallet.id}
                            >
                              <div className="h-full">
                                {dragState?.type === type && (
                                  <div className="absolute right-2 top-2 z-10 md:hidden flex-shrink-0 touch-none cursor-grab active:cursor-grabbing p-2 bg-black/50 rounded-full backdrop-blur-sm">
                                    <GripVertical className="w-4 h-4 text-white" />
                                  </div>
                                )}
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

          <div className="md:hidden text-center text-xs text-gray-500 mt-4 pb-8">
            长按钱包可拖动排序
          </div>
        </div>
      </div>

      <FloatingActionButton onClick={() => {
        setSelectedWallet(null);
        setIsModalOpen(true);
      }} />

      <WalletModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        wallet={selectedWallet}
        defaultCurrency={user?.defaultCurrency || "MYR"}
      />
    </PageContainer>
  );
}
