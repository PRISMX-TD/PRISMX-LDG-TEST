import { useState, useMemo, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Wallet,
  PieChart as PieChartIcon,
  Calendar,
  Settings2,
  Target,
  Percent,
  Activity,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Coins,
  ArrowUp,
  ArrowDown,
  CreditCard,
  BookOpen,
  ArrowLeft,
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
import { getCurrencyInfo } from "@shared/schema";
import { LazyRecharts } from "@/components/LazyRecharts";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Transaction, Category, Wallet as WalletType, Budget, SavingsGoal, SubLedger } from "@shared/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PageContainer } from "@/components/PageContainer";

const CHART_COLORS = [
  "#8B5CF6", "#A78BFA", "#C4B5FD", "#DDD6FE",
  "#10B981", "#34D399", "#6EE7B7", "#A7F3D0",
];

interface AnalyticsPreferences {
  showYearlyStats: boolean;
  showMonthlyTrend: boolean;
  showExpenseDistribution: boolean;
  showIncomeDistribution: boolean;
  showBudgetProgress: boolean;
  showSavingsProgress: boolean;
  showWalletDistribution: boolean;
  showCashflowTrend: boolean;
  showTopCategories: boolean;
  showMonthlyComparison: boolean;
  showFullAmount: boolean;
  cardOrder: string[] | null;
}

const defaultPreferences: AnalyticsPreferences = {
  showYearlyStats: true,
  showMonthlyTrend: true,
  showExpenseDistribution: true,
  showIncomeDistribution: true,
  showBudgetProgress: true,
  showSavingsProgress: true,
  showWalletDistribution: true,
  showCashflowTrend: true,
  showTopCategories: true,
  showMonthlyComparison: true,
  showFullAmount: false,
  cardOrder: null,
};

interface SettingsItem {
  key: keyof AnalyticsPreferences;
  label: string;
  description: string;
}

const defaultSettingsItems: SettingsItem[] = [
  { key: "showYearlyStats", label: "年度统计", description: "显示年度收入、支出和结余统计" },
  { key: "showMonthlyTrend", label: "月度收支趋势", description: "显示每月收支趋势图表" },
  { key: "showExpenseDistribution", label: "支出分布", description: "显示支出分类饼图" },
  { key: "showIncomeDistribution", label: "收入分布", description: "显示收入分类饼图" },
  { key: "showBudgetProgress", label: "预算执行情况", description: "显示预算使用进度" },
  { key: "showSavingsProgress", label: "储蓄目标进度", description: "显示储蓄目标完成情况" },
  { key: "showWalletDistribution", label: "账户分布", description: "显示各钱包余额分布" },
  { key: "showCashflowTrend", label: "累计现金流", description: "显示累计储蓄趋势" },
];

interface SortableSettingsItemProps {
  item: SettingsItem;
  isChecked: boolean;
  onToggle: (key: keyof AnalyticsPreferences) => void;
  onMove: (key: string, direction: 'up' | 'down') => void;
  index: number;
  total: number;
  isPending: boolean;
}

function SortableSettingsItem({ item, isChecked, onToggle, onMove, index, total, isPending }: SortableSettingsItemProps) {
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
        flex items-center gap-2 p-2.5 rounded-lg border transition-all
        ${isDragging ? 'bg-muted shadow-lg' : 'border-border/50 hover:border-border'}
      `}
      data-testid={`card-item-${item.key}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none p-1 -m-1"
      >
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      </div>
      <div className="flex-1 min-w-0">
        <Label className="text-xs font-medium">{item.label}</Label>
        <p className="text-[10px] text-muted-foreground truncate">{item.description}</p>
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
          onCheckedChange={() => onToggle(item.key)}
          disabled={isPending}
          data-testid={`switch-${item.key}`}
        />
      </div>
    </div>
  );
}

export default function Analytics() {
  const { user } = useAuth();
  const currencyInfo = getCurrencyInfo(user?.defaultCurrency || "MYR");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [timePeriod, setTimePeriod] = useState<"year" | "month" | "week">("year");
  const [dataView, setDataView] = useState<"overview" | "income" | "expense" | "savings" | "ai">("overview");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedSubLedgerId, setSelectedSubLedgerId] = useState<string>("all");

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

  const { data: preferences = defaultPreferences } = useQuery<AnalyticsPreferences>({
    queryKey: ["/api/analytics-preferences"],
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: (data: Partial<AnalyticsPreferences>) =>
      apiRequest("PATCH", "/api/analytics-preferences", data),
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ["/api/analytics-preferences"] });
      const previousPrefs = queryClient.getQueryData<AnalyticsPreferences>(["/api/analytics-preferences"]);
      queryClient.setQueryData<AnalyticsPreferences>(["/api/analytics-preferences"], (old) => ({
        ...(old ?? defaultPreferences),
        ...updates,
      }));
      return { previousPrefs };
    },
    onError: (_error, _updates, context) => {
      if (context?.previousPrefs) {
        queryClient.setQueryData(["/api/analytics-preferences"], context.previousPrefs);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/analytics-preferences"] });
    },
  });

  const orderedItems = useMemo(() => {
    const order = preferences.cardOrder;
    if (!order || order.length === 0) {
      return defaultSettingsItems;
    }
    const orderedList: SettingsItem[] = [];
    const itemsMap = new Map(defaultSettingsItems.map(item => [item.key, item]));
    order.forEach(key => {
      const item = itemsMap.get(key as keyof AnalyticsPreferences);
      if (item) {
        orderedList.push(item);
        itemsMap.delete(key as keyof AnalyticsPreferences);
      }
    });
    itemsMap.forEach(item => orderedList.push(item));
    return orderedList;
  }, [preferences.cardOrder]);

  const handleDragStart = () => {
    setIsDragging(true);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setIsDragging(false);
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const currentOrder = orderedItems.map(item => item.key as string);
      const oldIndex = currentOrder.indexOf(String(active.id));
      const newIndex = currentOrder.indexOf(String(over.id));
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(currentOrder, oldIndex, newIndex);
        updatePreferencesMutation.mutate({ cardOrder: newOrder });
      }
    }
  };

  const moveItem = (key: string, direction: 'up' | 'down') => {
    const currentOrder = orderedItems.map(item => item.key as string);
    const currentIndex = currentOrder.indexOf(key);
    if (currentIndex === -1) return;
    if (direction === 'up' && currentIndex === 0) return;
    if (direction === 'down' && currentIndex === currentOrder.length - 1) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const newOrder = arrayMove(currentOrder, currentIndex, targetIndex);
    updatePreferencesMutation.mutate({ cardOrder: newOrder });
  };

  const { data: transactions = [], isLoading: isTransactionsLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: wallets = [] } = useQuery<WalletType[]>({
    queryKey: ["/api/wallets"],
  });

  const { data: budgets = [] } = useQuery<Budget[]>({
    queryKey: ["/api/budgets"],
  });

  const { data: savingsGoals = [] } = useQuery<SavingsGoal[]>({
    queryKey: ["/api/savings-goals"],
  });

  const { data: subLedgers = [] } = useQuery<SubLedger[]>({
    queryKey: ["/api/sub-ledgers"],
  });

  const { data: budgetSpending = [] } = useQuery<any[]>({
    queryKey: ["/api/budgets/spending", { month: new Date().getMonth() + 1, year: selectedYear }],
  });

  // Helper function to convert transaction amount to user's default currency
  const getConvertedAmount = (t: Transaction): number => {
    const rawAmount = parseFloat(t.amount);
    const defaultCurrency = user?.defaultCurrency || "MYR";
    const wallet = wallets.find((w) => w.id === t.walletId);
    
    if (wallet && wallet.currency !== defaultCurrency) {
      const exchangeRate = parseFloat(wallet.exchangeRateToDefault || "1");
      return rawAmount * exchangeRate;
    }
    return rawAmount;
  };

  const filteredTransactions = useMemo(() => {
    if (selectedSubLedgerId === "all") {
      return transactions;
    }
    if (selectedSubLedgerId === "main") {
      return transactions.filter((t) => {
        if (!t.subLedgerId) return true;
        const subLedger = subLedgers.find((s) => s.id === t.subLedgerId);
        if (subLedger && subLedger.includeInMainAnalytics === false) return false;
        return true;
      });
    }
    return transactions.filter((t) => String(t.subLedgerId) === selectedSubLedgerId);
  }, [transactions, selectedSubLedgerId, subLedgers]);

  const monthlyData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => {
      const date = new Date(selectedYear, i, 1);
      return {
        month: format(date, "M月"),
        shortMonth: format(date, "M"),
        income: 0,
        expense: 0,
        savings: 0,
      };
    });

    filteredTransactions.forEach((t) => {
      const date = new Date(t.date);
      if (date.getFullYear() !== selectedYear) return;
      const monthIndex = date.getMonth();
      const amount = getConvertedAmount(t);
      if (t.type === "income") {
        months[monthIndex].income += amount;
      } else if (t.type === "expense") {
        months[monthIndex].expense += amount;
      }
    });

    months.forEach((m) => {
      m.savings = m.income - m.expense;
    });

    return months;
  }, [filteredTransactions, selectedYear, wallets, user]);

  const expenseCategoryData = useMemo(() => {
    const categoryTotals: Record<number, { name: string; color: string; total: number }> = {};
    const targetMonth = selectedMonth !== null ? selectedMonth : new Date().getMonth();
    
    filteredTransactions.forEach((t) => {
      if (t.type !== "expense") return;
      const date = new Date(t.date);
      if (date.getFullYear() !== selectedYear) return;
      if (timePeriod === "month" && date.getMonth() !== targetMonth) return;
      
      const categoryId = t.categoryId || 0;
      if (!categoryTotals[categoryId]) {
        const category = categories.find((c) => c.id === categoryId);
        categoryTotals[categoryId] = {
          name: category?.name || "其他",
          color: category?.color || CHART_COLORS[Object.keys(categoryTotals).length % CHART_COLORS.length],
          total: 0,
        };
      }
      categoryTotals[categoryId].total += getConvertedAmount(t);
    });

    return Object.values(categoryTotals)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [filteredTransactions, categories, selectedYear, timePeriod, selectedMonth, wallets, user]);

  const incomeCategoryData = useMemo(() => {
    const categoryTotals: Record<number, { name: string; color: string; total: number }> = {};
    const targetMonth = selectedMonth !== null ? selectedMonth : new Date().getMonth();
    
    filteredTransactions.forEach((t) => {
      if (t.type !== "income") return;
      const date = new Date(t.date);
      if (date.getFullYear() !== selectedYear) return;
      if (timePeriod === "month" && date.getMonth() !== targetMonth) return;
      
      const categoryId = t.categoryId || 0;
      if (!categoryTotals[categoryId]) {
        const category = categories.find((c) => c.id === categoryId);
        categoryTotals[categoryId] = {
          name: category?.name || "其他",
          color: category?.color || CHART_COLORS[Object.keys(categoryTotals).length % CHART_COLORS.length],
          total: 0,
        };
      }
      categoryTotals[categoryId].total += getConvertedAmount(t);
    });

    return Object.values(categoryTotals)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [filteredTransactions, categories, selectedYear, timePeriod, selectedMonth, wallets, user]);

  const walletData = useMemo(() => {
    return wallets.map((w, i) => ({
      name: w.name,
      balance: parseFloat(w.balance || "0"),
      color: w.color || CHART_COLORS[i % CHART_COLORS.length],
    })).filter(w => w.balance > 0);
  }, [wallets]);

  const yearlyTotals = useMemo(() => {
    let income = 0;
    let expense = 0;

    filteredTransactions.forEach((t) => {
      const date = new Date(t.date);
      if (date.getFullYear() !== selectedYear) return;
      const amount = getConvertedAmount(t);
      if (t.type === "income") {
        income += amount;
      } else if (t.type === "expense") {
        expense += amount;
      }
    });

    return { income, expense, savings: income - expense };
  }, [filteredTransactions, selectedYear, wallets, user]);

  const currentMonthTotals = useMemo(() => {
    const targetMonth = selectedMonth !== null ? selectedMonth : new Date().getMonth();
    let income = 0;
    let expense = 0;

    filteredTransactions.forEach((t) => {
      const date = new Date(t.date);
      if (date.getFullYear() !== selectedYear) return;
      if (date.getMonth() !== targetMonth) return;
      const amount = getConvertedAmount(t);
      if (t.type === "income") {
        income += amount;
      } else if (t.type === "expense") {
        expense += amount;
      }
    });

    return { income, expense, savings: income - expense };
  }, [filteredTransactions, selectedYear, selectedMonth, wallets, user]);

  const displayTotals = useMemo(() => {
    return timePeriod === "month" ? currentMonthTotals : yearlyTotals;
  }, [timePeriod, currentMonthTotals, yearlyTotals]);

  const periodLabel = timePeriod === "month" ? "月度" : "年度";

  const compareData = useMemo(() => {
    const targetMonth = selectedMonth !== null ? selectedMonth : new Date().getMonth();
    const currentMonthData = monthlyData[targetMonth];
    const lastMonthData = targetMonth > 0 ? monthlyData[targetMonth - 1] : null;
    
    const expenseChange = lastMonthData && lastMonthData.expense > 0 
      ? ((currentMonthData.expense - lastMonthData.expense) / lastMonthData.expense) * 100 
      : 0;

    const incomeChange = lastMonthData && lastMonthData.income > 0 
      ? ((currentMonthData.income - lastMonthData.income) / lastMonthData.income) * 100 
      : 0;

    return { expenseChange, incomeChange };
  }, [monthlyData, selectedMonth]);

  const totalBalance = useMemo(() => {
    return wallets.reduce((sum, w) => sum + parseFloat(w.balance || "0"), 0);
  }, [wallets]);

  const cumulativeSavingsData = useMemo(() => {
    const targetMonth = selectedMonth !== null ? selectedMonth : new Date().getMonth();
    let cumulative = 0;
    
    if (timePeriod === "month") {
      return monthlyData.slice(0, targetMonth + 1).map((m) => {
        cumulative += m.savings;
        return {
          ...m,
          cumulative,
        };
      });
    }
    
    return monthlyData.map((m) => {
      cumulative += m.savings;
      return {
        ...m,
        cumulative,
      };
    });
  }, [monthlyData, timePeriod, selectedMonth]);

  const budgetProgressData = useMemo(() => {
    return budgetSpending.map((b: any) => ({
      name: b.categoryName,
      budget: parseFloat(b.amount),
      spent: b.spent,
      remaining: Math.max(0, parseFloat(b.amount) - b.spent),
      percentage: (b.spent / parseFloat(b.amount)) * 100,
      color: b.categoryColor,
    })).slice(0, 5);
  }, [budgetSpending]);

  const savingsGoalsProgress = useMemo(() => {
    return savingsGoals.map((g: SavingsGoal) => {
      const current = parseFloat(g.currentAmount);
      const target = parseFloat(g.targetAmount);
      return {
        name: g.name,
        current,
        target,
        percentage: target > 0 ? (current / target) * 100 : 0,
        isCompleted: g.isCompleted,
      };
    });
  }, [savingsGoals]);

  const formatCompactAmount = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return value.toFixed(0);
  };

  const formatFullAmount = (value: number) => {
    return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatAmount = (value: number) => {
    return preferences.showFullAmount ? formatFullAmount(value) : formatCompactAmount(value);
  };

  const togglePreference = (key: keyof AnalyticsPreferences) => {
    updatePreferencesMutation.mutate({ [key]: !preferences[key] });
  };



  const months = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
  const currentMonth = new Date().getMonth();
  
  const handlePrevPeriod = () => {
    if (timePeriod === "year") {
      setSelectedYear(selectedYear - 1);
    } else if (timePeriod === "month") {
      if (selectedMonth === null) {
        setSelectedMonth(currentMonth);
      } else if (selectedMonth === 0) {
        setSelectedMonth(11);
        setSelectedYear(selectedYear - 1);
      } else {
        setSelectedMonth(selectedMonth - 1);
      }
    }
  };

  const handleNextPeriod = () => {
    if (timePeriod === "year") {
      setSelectedYear(selectedYear + 1);
    } else if (timePeriod === "month") {
      if (selectedMonth === null) {
        setSelectedMonth(currentMonth);
      } else if (selectedMonth === 11) {
        setSelectedMonth(0);
        setSelectedYear(selectedYear + 1);
      } else {
        setSelectedMonth(selectedMonth + 1);
      }
    }
  };

  const getPeriodLabel = () => {
    if (timePeriod === "year") {
      return `${selectedYear}年`;
    } else if (timePeriod === "month") {
      const month = selectedMonth ?? currentMonth;
      return `${selectedYear}年${months[month]}`;
    }
    return `${selectedYear}年`;
  };

  const savingsRate = yearlyTotals.income > 0 ? ((yearlyTotals.savings / yearlyTotals.income) * 100) : 0;

  return (
    <PageContainer>
      <div className="space-y-5 md:space-y-6 max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                <ArrowLeft className="w-4 h-4 mr-1" />
                返回
              </Button>
            </Link>
            <h1 className="text-2xl font-semibold flex items-center gap-2 text-white">
              <BarChart3 className="w-6 h-6 text-neon-purple" />
              数据分析
            </h1>
            <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} data-testid="button-analytics-settings" className="ml-auto">
              <Settings2 className="w-5 h-5" />
            </Button>
          </div>
        </div>
          
        {isTransactionsLoading ? (
          <div className="p-6 flex items-center justify-center min-h-[60vh]">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
          {/* Time Period Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-xl glass-card border-0">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handlePrevPeriod} data-testid="button-prev-period">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background/50 min-w-[120px] justify-center">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm font-medium" data-testid="text-selected-period">{getPeriodLabel()}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={handleNextPeriod} data-testid="button-next-period">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="flex items-center gap-2">
              <Tabs value={timePeriod} onValueChange={(v) => {
                setTimePeriod(v as "year" | "month");
                if (v === "month" && selectedMonth === null) {
                  setSelectedMonth(currentMonth);
                }
              }}>
                <TabsList className="h-8 bg-background/50">
                  <TabsTrigger value="month" className="text-xs px-3 h-6" data-testid="button-period-month">按月</TabsTrigger>
                  <TabsTrigger value="year" className="text-xs px-3 h-6" data-testid="button-period-year">按年</TabsTrigger>
                </TabsList>
              </Tabs>
              
              {subLedgers.length > 0 && (
                <Select value={selectedSubLedgerId} onValueChange={setSelectedSubLedgerId}>
                  <SelectTrigger className="w-[130px] h-8 text-xs bg-background/50 border-0" data-testid="select-subledger-filter">
                    <BookOpen className="w-3 h-3 mr-1" />
                    <SelectValue placeholder="账本" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" data-testid="option-subledger-all">全部账本</SelectItem>
                    <SelectItem value="main" data-testid="option-subledger-main">仅主账本</SelectItem>
                    {subLedgers.filter(s => !s.isArchived).map((subLedger) => (
                      <SelectItem key={subLedger.id} value={String(subLedger.id)} data-testid={`option-subledger-${subLedger.id}`}>
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: subLedger.color || "#8B5CF6" }} />
                          {subLedger.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

        <Tabs value={dataView} onValueChange={(v) => setDataView(v as any)} className="w-full">
          <TabsList className="w-full justify-start bg-transparent gap-1 p-0 h-auto flex-wrap">
            {[
              { key: "overview", label: "总览", icon: BarChart3 },
              { key: "income", label: "收入", icon: TrendingUp },
              { key: "expense", label: "支出", icon: TrendingDown },
              { key: "savings", label: "储蓄", icon: Wallet },
              { key: "ai", label: "AI 建议", icon: Activity },
            ].map((item) => (
              <TabsTrigger
                key={item.key}
                value={item.key}
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg gap-1.5 px-3 py-1.5"
                data-testid={`button-view-${item.key}`}
              >
                <item.icon className="w-3.5 h-3.5" />
                <span className="text-sm">{item.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Main Stats Cards */}
        {preferences.showYearlyStats && (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {/* Income Card */}
            <div className="glass-card p-4 relative overflow-hidden" data-testid="card-yearly-income">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 opacity-50 pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/20">
                    <ArrowUp className="w-4 h-4 text-emerald-500" />
                  </div>
                  {timePeriod === "month" && compareData.incomeChange !== 0 && (
                    <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${compareData.incomeChange > 0 ? "text-emerald-500" : "text-rose-500"}`}>
                      {compareData.incomeChange > 0 ? "+" : ""}{compareData.incomeChange.toFixed(1)}%
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-1">{periodLabel}收入</p>
                <p className="text-lg md:text-xl font-bold font-mono text-emerald-500">
                  {currencyInfo.symbol}{formatAmount(displayTotals.income)}
                </p>
              </div>
            </div>

            {/* Expense Card */}
            <div className="glass-card p-4 relative overflow-hidden" data-testid="card-yearly-expense">
              <div className="absolute inset-0 bg-gradient-to-br from-rose-500/10 to-rose-600/5 opacity-50 pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-rose-500/20">
                    <ArrowDown className="w-4 h-4 text-rose-500" />
                  </div>
                  {timePeriod === "month" && compareData.expenseChange !== 0 && (
                    <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${compareData.expenseChange > 0 ? "text-rose-500" : "text-emerald-500"}`}>
                      {compareData.expenseChange > 0 ? "+" : ""}{compareData.expenseChange.toFixed(1)}%
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-1">{periodLabel}支出</p>
                <p className="text-lg md:text-xl font-bold font-mono text-rose-500">
                  {currencyInfo.symbol}{formatAmount(displayTotals.expense)}
                </p>
              </div>
            </div>

            {/* Savings Card */}
            <div className="glass-card p-4 relative overflow-hidden" data-testid="card-yearly-savings">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 to-violet-600/5 opacity-50 pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-500/20">
                    <Coins className="w-4 h-4 text-violet-500" />
                  </div>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {(displayTotals.income > 0 ? (displayTotals.savings / displayTotals.income * 100) : 0).toFixed(0)}%
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-1">{periodLabel}结余</p>
                <p className={`text-lg md:text-xl font-bold font-mono ${displayTotals.savings >= 0 ? "text-violet-500" : "text-rose-500"}`}>
                  {displayTotals.savings >= 0 ? "+" : "-"}{currencyInfo.symbol}{formatAmount(Math.abs(displayTotals.savings))}
                </p>
              </div>
            </div>

            {/* Total Assets Card */}
            <div className="glass-card p-4 relative overflow-hidden" data-testid="card-total-assets">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-blue-600/5 opacity-50 pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/20">
                    <CreditCard className="w-4 h-4 text-blue-500" />
                  </div>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {wallets.length} 账户
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-1">总资产</p>
                <p className="text-lg md:text-xl font-bold font-mono text-blue-500">
                  {currencyInfo.symbol}{formatAmount(totalBalance)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Overview View */}
        {dataView === "overview" && (
          <div className="space-y-4">
            {/* AI Insights summary slice for overview (mobile-first grid) */}
            <AiInsightsSection compact />
            {/* Trend Chart */}
            {preferences.showMonthlyTrend && (
              <div className="glass-card p-4" data-testid="card-monthly-trend">
                <div className="pb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">收支趋势</span>
                </div>
                <div className="h-[220px] md:h-[280px]">
                  <LazyRecharts>
                    {(R) => (
                      <R.ResponsiveContainer width="100%" height="100%">
                        <R.AreaChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <R.CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} vertical={false} />
                          <R.XAxis dataKey="shortMonth" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} />
                          <R.YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatAmount(v)} />
                          <R.Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} formatter={(value: number, name: string) => [`${currencyInfo.symbol}${formatFullAmount(value)}`, name === 'income' ? '收入' : '支出']} labelFormatter={(label: string | number) => `${label}月`} />
                          <R.Area type="monotone" dataKey="income" stroke="#10B981" strokeWidth={2} fill="url(#colorIncome)" />
                          <R.Area type="monotone" dataKey="expense" stroke="#EF4444" strokeWidth={2} fill="url(#colorExpense)" />
                        </R.AreaChart>
                      </R.ResponsiveContainer>
                    )}
                  </LazyRecharts>
                </div>
              </div>
            )}

            {/* Distribution Charts Row */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
              {/* Expense Distribution */}
              {preferences.showExpenseDistribution && expenseCategoryData.length > 0 && (
                <div className="glass-card p-4" data-testid="card-expense-distribution">
                  <div className="pb-4 flex items-center gap-2">
                    <PieChartIcon className="w-4 h-4 text-rose-500" />
                    <span className="text-sm font-medium">支出构成</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-[120px] h-[120px] md:w-[140px] md:h-[140px] flex-shrink-0">
                      <LazyRecharts className="w-full h-full">
                        {(R) => (
                          <R.ResponsiveContainer width="100%" height="100%">
                            <R.PieChart>
                              <R.Pie data={expenseCategoryData} cx="50%" cy="50%" innerRadius="55%" outerRadius="85%" dataKey="total" paddingAngle={3} strokeWidth={0}>
                                {expenseCategoryData.map((entry, index) => (
                                  <R.Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </R.Pie>
                            </R.PieChart>
                          </R.ResponsiveContainer>
                        )}
                      </LazyRecharts>
                    </div>
                    <div className="flex-1 space-y-2">
                      {expenseCategoryData.slice(0, 4).map((cat, index) => {
                        const percentage = (cat.total / yearlyTotals.expense) * 100;
                        return (
                          <div key={index} className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                            <span className="text-xs text-muted-foreground flex-1 truncate">{cat.name}</span>
                            <span className="text-xs font-mono">{percentage.toFixed(0)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Income Distribution */}
              {preferences.showIncomeDistribution && incomeCategoryData.length > 0 && (
                <div className="glass-card p-4" data-testid="card-income-distribution">
                  <div className="pb-4 flex items-center gap-2">
                    <PieChartIcon className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-medium">收入构成</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-[120px] h-[120px] md:w-[140px] md:h-[140px] flex-shrink-0">
                      <LazyRecharts className="w-full h-full">
                        {(R) => (
                          <R.ResponsiveContainer width="100%" height="100%">
                            <R.PieChart>
                              <R.Pie data={incomeCategoryData} cx="50%" cy="50%" innerRadius="55%" outerRadius="85%" dataKey="total" paddingAngle={3} strokeWidth={0}>
                                {incomeCategoryData.map((entry, index) => (
                                  <R.Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </R.Pie>
                            </R.PieChart>
                          </R.ResponsiveContainer>
                        )}
                      </LazyRecharts>
                    </div>
                    <div className="flex-1 space-y-2">
                      {incomeCategoryData.slice(0, 4).map((cat, index) => {
                        const percentage = (cat.total / yearlyTotals.income) * 100;
                        return (
                          <div key={index} className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                            <span className="text-xs text-muted-foreground flex-1 truncate">{cat.name}</span>
                            <span className="text-xs font-mono">{percentage.toFixed(0)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Budget & Savings Progress */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
              {preferences.showBudgetProgress && budgetProgressData.length > 0 && (
                <div className="glass-card p-4" data-testid="card-budget-progress">
                  <div className="pb-4 flex items-center gap-2">
                    <Target className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">预算执行</span>
                  </div>
                  <div className="space-y-3">
                    {budgetProgressData.map((b, index) => (
                      <div key={index} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: b.color }} />
                            <span className="text-xs">{b.name}</span>
                          </div>
                          <span className={`text-xs font-mono ${b.percentage > 100 ? "text-rose-500" : b.percentage > 80 ? "text-amber-500" : "text-muted-foreground"}`}>
                            {b.percentage.toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all duration-500"
                            style={{ 
                              width: `${Math.min(b.percentage, 100)}%`, 
                              backgroundColor: b.percentage > 100 ? "#EF4444" : b.color 
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {preferences.showSavingsProgress && savingsGoalsProgress.length > 0 && (
                <div className="glass-card p-4" data-testid="card-savings-progress">
                  <div className="pb-4 flex items-center gap-2">
                    <Percent className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-medium">储蓄目标</span>
                  </div>
                  <div className="space-y-3">
                    {savingsGoalsProgress.slice(0, 4).map((g, index) => (
                      <div key={index} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className={`text-xs ${g.isCompleted ? "line-through text-muted-foreground" : ""}`}>{g.name}</span>
                          <span className={`text-xs font-mono ${g.isCompleted ? "text-emerald-500" : "text-muted-foreground"}`}>
                            {g.percentage.toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                            style={{ width: `${Math.min(g.percentage, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Cashflow Trend */}
            {preferences.showCashflowTrend && (
              <div className="glass-card p-4" data-testid="card-cashflow-trend">
                <div className="pb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">累计现金流</span>
                </div>
                <div className="h-[200px]">
                  <LazyRecharts>
                    {(R) => (
                      <R.ResponsiveContainer width="100%" height="100%">
                        <R.ComposedChart data={cumulativeSavingsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <R.CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} vertical={false} />
                        <R.XAxis dataKey="shortMonth" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <R.YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatAmount(v)} />
                        <R.Tooltip
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                          }}
                          formatter={(value: number, name: string) => [
                            `${currencyInfo.symbol}${formatFullAmount(value)}`,
                            name === "savings" ? "月结余" : "累计"
                          ]}
                          labelFormatter={(label: string | number) => `${label}月`}
                        />
                        <R.Bar dataKey="savings" fill="#8B5CF6" opacity={0.5} radius={[4, 4, 0, 0]} />
                        <R.Line type="monotone" dataKey="cumulative" stroke="#10B981" strokeWidth={2} dot={{ fill: '#10B981', strokeWidth: 0, r: 3 }} />
                      </R.ComposedChart>
                    </R.ResponsiveContainer>
                    )}
                  </LazyRecharts>
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI View */}
        {dataView === "ai" && (
          <div className="space-y-4">
            <AiInsightsSection />
          </div>
        )}

        {/* Income View */}
        {dataView === "income" && (
          <div className="space-y-4">
            <div className="glass-card p-4">
              <div className="pb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-medium">月度收入</span>
              </div>
              <div className="h-[240px]">
                <LazyRecharts>
                  {(R) => (
                    <R.ResponsiveContainer width="100%" height="100%">
                      <R.BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <R.CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} vertical={false} />
                      <R.XAxis dataKey="shortMonth" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <R.YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatAmount(v)} />
                      <R.Tooltip
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number) => [`${currencyInfo.symbol}${formatFullAmount(value)}`, "收入"]}
                      />
                      <R.Bar dataKey="income" fill="#10B981" radius={[4, 4, 0, 0]} />
                    </R.BarChart>
                  </R.ResponsiveContainer>
                  )}
                </LazyRecharts>
              </div>
            </div>

            <div className="glass-card p-4">
              <div className="pb-4">
                <h3 className="text-sm font-medium">收入来源排行</h3>
              </div>
              <div className="space-y-3">
                {incomeCategoryData.map((cat, index) => {
                  const maxTotal = incomeCategoryData[0]?.total || 1;
                  const percentage = (cat.total / maxTotal) * 100;
                  return (
                    <div key={index} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">{index + 1}</Badge>
                          <span className="text-sm">{cat.name}</span>
                        </div>
                        <span className="text-sm font-mono text-emerald-500">{currencyInfo.symbol}{formatAmount(cat.total)}</span>
                      </div>
                      <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${percentage}%`, backgroundColor: cat.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Expense View */}
        {dataView === "expense" && (
          <div className="space-y-4">
            <div className="glass-card p-4">
              <div className="pb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-rose-500" />
                <span className="text-sm font-medium">月度支出</span>
              </div>
              <div className="h-[240px]">
                <LazyRecharts>
                  {(R) => (
                    <R.ResponsiveContainer width="100%" height="100%">
                      <R.BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <R.CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} vertical={false} />
                      <R.XAxis dataKey="shortMonth" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <R.YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatAmount(v)} />
                      <R.Tooltip
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number) => [`${currencyInfo.symbol}${formatFullAmount(value)}`, "支出"]}
                      />
                      <R.Bar dataKey="expense" fill="#EF4444" radius={[4, 4, 0, 0]} />
                    </R.BarChart>
                  </R.ResponsiveContainer>
                  )}
                </LazyRecharts>
              </div>
            </div>

            <div className="glass-card p-4">
              <div className="pb-4">
                <h3 className="text-sm font-medium">支出分类排行</h3>
              </div>
              <div className="space-y-3">
                {expenseCategoryData.map((cat, index) => {
                  const maxTotal = expenseCategoryData[0]?.total || 1;
                  const percentage = (cat.total / maxTotal) * 100;
                  return (
                    <div key={index} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">{index + 1}</Badge>
                          <span className="text-sm">{cat.name}</span>
                        </div>
                        <span className="text-sm font-mono text-rose-500">{currencyInfo.symbol}{formatAmount(cat.total)}</span>
                      </div>
                      <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${percentage}%`, backgroundColor: cat.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Savings View */}
        {dataView === "savings" && (
          <div className="space-y-4">
            <div className="glass-card p-4">
              <div className="pb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-violet-500" />
                <span className="text-sm font-medium">月度储蓄趋势</span>
              </div>
              <div className="h-[240px]">
                <LazyRecharts>
                  {(R) => (
                    <R.ResponsiveContainer width="100%" height="100%">
                      <R.AreaChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorSavings" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <R.CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} vertical={false} />
                      <R.XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <R.YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatAmount(v)} />
                      <R.Tooltip
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number) => [`${currencyInfo.symbol}${formatFullAmount(value)}`, "结余"]}
                      />
                      <R.Area type="monotone" dataKey="savings" stroke="#8B5CF6" strokeWidth={2} fill="url(#colorSavings)" />
                    </R.AreaChart>
                  </R.ResponsiveContainer>
                  )}
                </LazyRecharts>
              </div>
            </div>

            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
              {preferences.showWalletDistribution && walletData.length > 0 && (
                <div className="glass-card p-4">
                  <div className="pb-4 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-medium">账户分布</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-[100px] h-[100px] flex-shrink-0">
                      <LazyRecharts className="w-full h-full">
                        {(R) => (
                          <R.ResponsiveContainer width="100%" height="100%">
                            <R.PieChart>
                              <R.Pie data={walletData} cx="50%" cy="50%" innerRadius="50%" outerRadius="80%" dataKey="balance" paddingAngle={3} strokeWidth={0}>
                                {walletData.map((entry, index) => (
                                  <R.Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </R.Pie>
                            </R.PieChart>
                          </R.ResponsiveContainer>
                        )}
                      </LazyRecharts>
                    </div>
                    <div className="flex-1 space-y-2">
                      {walletData.slice(0, 4).map((wallet, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: wallet.color }} />
                          <span className="text-xs text-muted-foreground flex-1 truncate">{wallet.name}</span>
                          <span className="text-xs font-mono">{currencyInfo.symbol}{formatAmount(wallet.balance)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="glass-card p-4">
                <div className="pb-4">
                  <h3 className="text-sm font-medium">储蓄概览</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-border/30">
                    <span className="text-xs text-muted-foreground">平均月储蓄</span>
                    <span className="text-sm font-mono">{currencyInfo.symbol}{formatAmount(yearlyTotals.savings / 12)}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-border/30">
                    <span className="text-xs text-muted-foreground">最高月储蓄</span>
                    <span className="text-sm font-mono text-emerald-500">{currencyInfo.symbol}{formatAmount(Math.max(...monthlyData.map(m => m.savings)))}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-border/30">
                    <span className="text-xs text-muted-foreground">最低月储蓄</span>
                    <span className="text-sm font-mono text-rose-500">{currencyInfo.symbol}{formatAmount(Math.min(...monthlyData.map(m => m.savings)))}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs text-muted-foreground">储蓄率</span>
                    <span className="text-sm font-mono">{savingsRate.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Settings Dialog */}
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col glass-card border-0" data-testid="modal-analytics-settings" aria-describedby={undefined}>
            <DialogHeader className="pb-2">
              <DialogTitle className="flex items-center gap-2 text-base">
                <Settings2 className="w-4 h-4" />
                分析页设置
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                选择要显示的卡片，拖拽或使用箭头调整顺序
              </p>
            </DialogHeader>
            
            {/* Amount Display Format Toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/30 mb-2">
              <div className="flex-1 min-w-0">
                <Label className="text-xs font-medium">显示完整金额</Label>
                <p className="text-[10px] text-muted-foreground">关闭时显示缩写(如 8.4k)，开启后显示完整数字</p>
              </div>
              <Switch
                checked={preferences.showFullAmount}
                onCheckedChange={() => togglePreference("showFullAmount")}
                disabled={updatePreferencesMutation.isPending}
                data-testid="switch-showFullAmount"
              />
            </div>
            
            {orderedItems.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={orderedItems.map(item => item.key)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2 overflow-y-auto flex-1 pr-1">
                    {orderedItems.map((item, index) => {
                      const isChecked = preferences[item.key] as boolean;
                      return (
                        <SortableSettingsItem
                          key={item.key}
                          item={item}
                          isChecked={isChecked}
                          onToggle={togglePreference}
                          onMove={moveItem}
                          index={index}
                          total={orderedItems.length}
                          isPending={updatePreferencesMutation.isPending}
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
          </DialogContent>
        </Dialog>
          </>
        )}
      </div>
    </PageContainer>
  );
}

interface AiResponse {
  metrics: {
    rangeMonths: number;
    totalIncome: number;
    totalExpense: number;
    avgMonthlyExpense: number;
    savingsRate: number;
    emergencyFundMonths: number | null;
    monthly: Record<string, { income: number; expense: number }>;
    topExpenseCategories: { categoryId: number; categoryName: string; total: number; color: string }[];
    budgetDeviations: { categoryId: number; categoryName: string; budget: number; spent: number; deviation: number; color: string }[];
    topRecurringPayments: { amount: number; months: number; categoryName: string; walletName: string; sampleDate: string | null }[];
  };
  ai: {
    summary?: string;
    insights?: { title: string; explanation: string; relatedMetrics?: string[] }[];
    actions?: { title: string; impact?: string; effort?: string; steps?: string[] }[];
    disclaimer?: string;
  } | null;
  aiEnabled: boolean;
  message?: string;
  fromCache?: boolean;
  cooldownRemainingMs?: number;
  cachedAt?: string;
  nextAllowedAt?: string;
}

function AiInsightsSection({ compact = false }: { compact?: boolean }) {
  const { isAuthenticated } = useAuth();
  const [rangeMonths, setRangeMonths] = useState<string>("6");

  const queryKey = useMemo(() => {
    return ["/api", "ai", `insights?rangeMonths=${rangeMonths}`];
  }, [rangeMonths]);

  const { data, isLoading, refetch } = useQuery<AiResponse>({
    queryKey,
    enabled: isAuthenticated,
  });

  const currency = getCurrencyInfo(undefined as any)?.symbol || "RM";

  return (
    <div className="glass-card p-4">
      <div className="flex flex-row items-center justify-between gap-2 pb-2">
        <div className="text-sm font-medium flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          AI 建议
        </div>
        <div className="flex items-center gap-2">
          <Select value={rangeMonths} onValueChange={(v) => setRangeMonths(v)}>
            <SelectTrigger className="w-24 h-8 bg-background/50 border-0" data-testid="select-ai-range-analytics">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">近3个月</SelectItem>
              <SelectItem value="6">近6个月</SelectItem>
              <SelectItem value="12">近12个月</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-ai-analytics" disabled={!!data && !!data.fromCache && (data.cooldownRemainingMs ?? 0) > 0}>刷新</Button>
        </div>
      </div>
      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">暂无数据</p>
        ) : (
          <div className="space-y-5">
            {data.ai?.summary && (
              <div className="p-3 rounded-lg bg-primary/10 text-sm leading-relaxed">
                {data.ai.summary}
              </div>
            )}
            <div className={`grid gap-3 ${compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
              <div className="glass-card p-4 bg-white/5">
                <div className="pb-1">
                  <h4 className="text-xs text-muted-foreground">储蓄率</h4>
                </div>
                <div>
                  <p className="text-2xl font-mono">{(data.metrics.savingsRate * 100).toFixed(1)}%</p>
                </div>
              </div>
              <div className="glass-card p-4 bg-white/5">
                <div className="pb-1">
                  <h4 className="text-xs text-muted-foreground">应急金月数</h4>
                </div>
                <div>
                  <p className="text-2xl font-mono">{data.metrics.emergencyFundMonths == null ? "未知" : data.metrics.emergencyFundMonths.toFixed(2)}</p>
                </div>
              </div>
              <div className="glass-card p-4 bg-white/5">
                <div className="pb-1">
                  <h4 className="text-xs text-muted-foreground">平均月支出</h4>
                </div>
                <div>
                  <p className="text-2xl font-mono">{currency}{data.metrics.avgMonthlyExpense.toFixed(2)}</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-medium">当月预算偏差 Top</h3>
              {data.metrics.budgetDeviations.length === 0 ? (
                <p className="text-xs text-muted-foreground">暂无偏差</p>
              ) : (
                <div className="space-y-2">
                  {data.metrics.budgetDeviations.map((b) => {
                    const percent = b.budget > 0 ? Math.min(100, (b.spent / b.budget) * 100) : 0;
                    return (
                      <div key={b.categoryId} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground truncate">{b.categoryName}</span>
                          <span className="text-xs font-mono">{currency}{b.deviation.toFixed(2)}</span>
                        </div>
                        <Progress value={percent} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {data.ai?.actions && data.ai.actions.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">可执行建议</h3>
                <Accordion type="single" collapsible className="w-full">
                  {(compact ? (data.ai.actions || []).slice(0, 2) : (data.ai.actions || [])).map((a, idx) => (
                    <AccordionItem key={idx} value={`item-${idx}`}>
                      <AccordionTrigger className="text-sm">{a.title}</AccordionTrigger>
                      <AccordionContent>
                        {a.steps && a.steps.length > 0 ? (
                          <ol className="list-decimal ml-5 text-xs text-muted-foreground space-y-1">
                            {a.steps.map((s, i) => (<li key={i}>{s}</li>))}
                          </ol>
                        ) : (
                          <p className="text-xs text-muted-foreground">无具体步骤</p>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            )}
            {data.aiEnabled === false && (
              <p className="text-xs text-muted-foreground">AI 未启用：{data.message || "未配置密钥"}</p>
            )}
            {data.fromCache && (data.cooldownRemainingMs ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground">冷却中：约 {Math.ceil((data.cooldownRemainingMs || 0)/60000)} 分钟后可重新分析</p>
            )}
            {!compact && data.ai?.disclaimer && (
              <p className="text-xs text-muted-foreground">{data.ai.disclaimer}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
