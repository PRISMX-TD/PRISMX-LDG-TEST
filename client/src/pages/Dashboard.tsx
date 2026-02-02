import { useState, useEffect, useMemo, startTransition } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { TransactionModal } from "@/components/TransactionModal";
import { WalletModal } from "@/components/WalletModal";
import { Wallet } from "lucide-react";
import type {
  Wallet as WalletType,
  Category,
  Transaction,
  SubLedger,
} from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";

// New Components
import { DashboardHeader } from "@/components/DashboardHeader";
import { MetricsGrid } from "@/components/MetricsGrid";
import { CashFlowChart } from "@/components/CashFlowChart";
import { WalletSection } from "@/components/WalletSection";
import { RecentTransactions } from "@/components/RecentTransactions";
import { DashboardCustomizeModal } from "@/components/DashboardCustomizeModal";

interface TransactionWithRelations extends Transaction {
  category?: Category | null;
  wallet?: WalletType | null;
  toWallet?: WalletType | null;
}

export default function Dashboard() {
  const { user, isLoading: isAuthLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<WalletType | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      window.location.href = "/api/login";
    }
  }, [isAuthenticated, isAuthLoading]);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const action = params.get('action');
    
    if (action === 'add-transaction' && isAuthenticated && !isAuthLoading) {
      setIsModalOpen(true);
      startTransition(() => setLocation('/', { replace: true }));
    }
  }, [searchString, isAuthenticated, isAuthLoading, setLocation]);

  const { data: wallets = [], isLoading: isWalletsLoading } = useQuery<WalletType[]>({
    queryKey: ["/api/wallets"],
    enabled: isAuthenticated,
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    enabled: isAuthenticated,
  });

  const { data: subLedgers = [] } = useQuery<SubLedger[]>({
    queryKey: ["/api/sub-ledgers"],
    enabled: isAuthenticated,
  });

  const { data: transactions = [], isLoading: isTransactionsLoading } =
    useQuery<TransactionWithRelations[]>({
      queryKey: ["/api/transactions", { limit: 100 }],
      enabled: isAuthenticated,
    });

  useEffect(() => {
    if (isAuthenticated) {
      queryClient.prefetchQuery({ queryKey: ["/api/wallets"] });
      queryClient.prefetchQuery({ queryKey: ["/api/categories"] });
      queryClient.prefetchQuery({ queryKey: ["/api/transactions", { limit: 100 }] });
    }
  }, [isAuthenticated]);

  const { data: dashboardPrefs } = useQuery({
    queryKey: ["/api/dashboard-preferences"],
    enabled: isAuthenticated,
  });
  const { data: analyticsPrefs } = useQuery({
    queryKey: ["/api/analytics-preferences"],
    enabled: isAuthenticated,
  });
  // Helper function to convert transaction amount to user's default currency
  const getConvertedAmount = (t: Transaction): number => {
    const rawAmount = parseFloat(t.amount || "0");
    const defaultCurrency = user?.defaultCurrency || "MYR";
    const wallet = wallets.find((w) => w.id === t.walletId);
    
    if (wallet && wallet.currency !== defaultCurrency) {
      const exchangeRate = parseFloat(wallet.exchangeRateToDefault || "1");
      return rawAmount * exchangeRate;
    }
    return rawAmount;
  };

  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const prevMonthStart = new Date(
    now.getFullYear(),
    now.getMonth() === 0 ? 11 : now.getMonth() - 1,
    1
  );
  const prevMonthEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    0
  );

  const { data: currentStats } = useQuery<{ totalIncome: number; totalExpense: number }>({
    queryKey: ["/api/transactions/stats", { startDate: currentMonthStart.toISOString(), endDate: currentMonthEnd.toISOString() }],
    enabled: isAuthenticated,
  });
  const { data: prevStats } = useQuery<{ totalIncome: number; totalExpense: number }>({
    queryKey: ["/api/transactions/stats", { startDate: prevMonthStart.toISOString(), endDate: prevMonthEnd.toISOString() }],
    enabled: isAuthenticated,
  });

  const monthlyIncome = currentStats?.totalIncome || 0;
  const monthlyExpense = currentStats?.totalExpense || 0;
  const prevMonthlyIncome = prevStats?.totalIncome || 0;
  const prevMonthlyExpense = prevStats?.totalExpense || 0;

  const monthlyIncomeFlexible = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => {
      const wallet = wallets.find(w => w.id === t.walletId);
      const date = new Date(t.date);
      const inCurrent = date >= currentMonthStart && date <= currentMonthEnd;
      if (inCurrent && wallet?.isFlexible) {
        return sum + getConvertedAmount(t);
      }
      return sum;
    }, 0);

  const monthlyExpenseFlexible = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => {
      const wallet = wallets.find(w => w.id === t.walletId);
      const date = new Date(t.date);
      const inCurrent = date >= currentMonthStart && date <= currentMonthEnd;
      if (inCurrent && wallet?.isFlexible) {
        return sum + getConvertedAmount(t);
      }
      return sum;
    }, 0);

  const totalAssets = useMemo(() => {
    return wallets.reduce((sum, w) => {
      const balance = parseFloat(w.balance || "0");
      const rate = parseFloat(w.exchangeRateToDefault || "1");
      return sum + balance * rate;
    }, 0);
  }, [wallets]);
  
  const liquidAssets = useMemo(() => {
    return wallets
      .filter(w => w.isFlexible)
      .reduce((sum, w) => {
        const balance = parseFloat(w.balance || "0");
        const rate = parseFloat(w.exchangeRateToDefault || "1");
        return sum + balance * rate;
      }, 0);
  }, [wallets]);

  // Simple approximation for previous month assets: 
  // Current Assets - (Current Month Income - Current Month Expense)
  // This assumes all asset changes come from income/expense, which is not 100% accurate (transfers, adjustments)
  // but good enough for a trend indicator without full historical snapshots.
  const prevTotalAssets = totalAssets - (monthlyIncome - monthlyExpense);
  const prevLiquidAssets = liquidAssets - (monthlyIncomeFlexible - monthlyExpenseFlexible);

  const defaultWallet = wallets.find(w => w.id === user?.defaultWalletId) || wallets[0];
  const defaultWalletBalance = defaultWallet ? parseFloat(defaultWallet.balance) : 0;
  const userCurrency = user?.defaultCurrency || "MYR";

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/transactions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      toast({
        title: "删除成功",
        description: "交易记录已删除",
      });
    },
    onError: () => {
      toast({
        title: "删除失败",
        description: "请稍后重试",
        variant: "destructive",
      });
    },
  });

  const handleDeleteTransaction = (transaction: Transaction) => {
    deleteMutation.mutate(transaction.id);
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#030304] flex items-center justify-center">
        <div className="text-center">
          <Wallet className="w-12 h-12 text-neon-purple mx-auto mb-4 animate-pulse" />
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#030304] relative text-gray-200 font-sans">
      {/* Ambient Background Effects */}
      <div className="ambient-noise"></div>
      <div className="ambient-glow"></div>
      <div className="ambient-glow-2"></div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        <DashboardHeader 
          onAddTransaction={() => {
            setEditingTransaction(null);
            setIsModalOpen(true);
          }}
          onCustomize={() => setIsCustomizeOpen(true)}
        />

        <div className="flex-1 overflow-y-auto custom-scroll p-4 md:p-8 pt-0">
          {/* Key Metrics Grid */}
          <MetricsGrid 
            totalAssets={totalAssets}
            liquidAssets={liquidAssets}
            monthlyExpense={monthlyExpense}
            monthlyIncome={monthlyIncome}
            prevMonthlyExpense={prevMonthlyExpense}
            prevMonthlyIncome={prevMonthlyIncome}
            prevTotalAssets={prevTotalAssets}
            prevLiquidAssets={prevLiquidAssets}
            currencyCode={userCurrency}
            showTotalAssets={dashboardPrefs?.showTotalAssets !== false}
            showMonthlyIncome={dashboardPrefs?.showMonthlyIncome !== false}
            showMonthlyExpense={dashboardPrefs?.showMonthlyExpense !== false}
            showFlexibleFunds={dashboardPrefs?.showFlexibleFunds !== false}
          />

          {/* Charts & Cards Section */}
          <div className="flex flex-col lg:flex-row gap-6 mb-8">
            {(analyticsPrefs?.showCashflowTrend !== false) && (
              <CashFlowChart transactions={transactions.filter(t => !t.loanId)} />
            )}
            {(dashboardPrefs?.showWallets !== false) && (
              <WalletSection 
                userName={user.username} 
                defaultWalletBalance={defaultWalletBalance}
                currency={userCurrency}
              />
            )}
          </div>

          {/* Recent Transactions Table */}
          {(dashboardPrefs?.showRecentTransactions !== false) && (
            <RecentTransactions 
              transactions={transactions} 
              onTransactionClick={(transaction) => {
                console.log("Dashboard transaction clicked:", transaction);
                setEditingTransaction(transaction);
                setIsModalOpen(true);
              }}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      <TransactionModal
        open={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) {
            setEditingTransaction(null);
          }
        }}
        wallets={wallets}
        categories={categories}
        subLedgers={subLedgers}
        defaultCurrency={user?.defaultCurrency || "MYR"}
        transaction={editingTransaction}
        onDelete={handleDeleteTransaction}
      />

      <WalletModal
        open={isWalletModalOpen}
        onOpenChange={setIsWalletModalOpen}
        wallet={selectedWallet}
        defaultCurrency={user?.defaultCurrency || "MYR"}
      />
      <DashboardCustomizeModal open={isCustomizeOpen} onOpenChange={setIsCustomizeOpen} />
    </div>
  );
}
