import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Download, ChevronLeft, ChevronRight, Loader2, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { getCurrencyInfo } from "@shared/schema";
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import type { Transaction, Wallet as WalletType, Category } from "@shared/schema";

export default function Reports() {
  const { user } = useAuth();
  const currencyInfo = getCurrencyInfo(user?.defaultCurrency || "MYR");
  
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [reportType, setReportType] = useState<"monthly" | "yearly">("monthly");

  const { data: transactions = [], isLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
  });

  const { data: wallets = [] } = useQuery<WalletType[]>({
    queryKey: ["/api/wallets"],
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const reportData = useMemo(() => {
    let startDate: Date, endDate: Date;
    
    if (reportType === "monthly") {
      startDate = startOfMonth(new Date(selectedYear, selectedMonth - 1));
      endDate = endOfMonth(new Date(selectedYear, selectedMonth - 1));
    } else {
      startDate = startOfYear(new Date(selectedYear, 0));
      endDate = endOfYear(new Date(selectedYear, 0));
    }

    const filtered = transactions.filter((t) => {
      const date = new Date(t.date);
      return date >= startDate && date <= endDate;
    });

    let totalIncome = 0;
    let totalExpense = 0;
    const categoryBreakdown: Record<number, { name: string; color: string; income: number; expense: number }> = {};
    const walletBreakdown: Record<number, { name: string; income: number; expense: number }> = {};

    const defaultCurrency = user?.defaultCurrency || "MYR";
    
    filtered.forEach((t) => {
      const rawAmount = parseFloat(t.amount);
      
      // Convert amount to user's default currency
      const wallet = wallets.find((w) => w.id === t.walletId);
      let amount = rawAmount;
      
      if (wallet && wallet.currency !== defaultCurrency) {
        // If wallet currency differs from default currency, convert using exchange rate
        const exchangeRate = parseFloat(wallet.exchangeRateToDefault || "1");
        amount = rawAmount * exchangeRate;
      }
      
      if (t.type === "income") {
        totalIncome += amount;
      } else if (t.type === "expense") {
        totalExpense += amount;
      }

      if (t.categoryId && t.type !== "transfer") {
        if (!categoryBreakdown[t.categoryId]) {
          const cat = categories.find((c) => c.id === t.categoryId);
          categoryBreakdown[t.categoryId] = {
            name: cat?.name || "其他",
            color: cat?.color || "#64748B",
            income: 0,
            expense: 0,
          };
        }
        if (t.type === "income") {
          categoryBreakdown[t.categoryId].income += amount;
        } else {
          categoryBreakdown[t.categoryId].expense += amount;
        }
      }

      if (t.walletId && t.type !== "transfer") {
        if (!walletBreakdown[t.walletId]) {
          walletBreakdown[t.walletId] = {
            name: wallet?.name || "未知钱包",
            income: 0,
            expense: 0,
          };
        }
        if (t.type === "income") {
          walletBreakdown[t.walletId].income += amount;
        } else {
          walletBreakdown[t.walletId].expense += amount;
        }
      }
    });

    return {
      startDate,
      endDate,
      totalIncome,
      totalExpense,
      netIncome: totalIncome - totalExpense,
      transactionCount: filtered.length,
      categoryBreakdown: Object.values(categoryBreakdown).sort((a, b) => (b.income + b.expense) - (a.income + a.expense)),
      walletBreakdown: Object.values(walletBreakdown).sort((a, b) => (b.income + b.expense) - (a.income + a.expense)),
    };
  }, [transactions, categories, wallets, selectedMonth, selectedYear, reportType, user]);

  const navigatePeriod = (direction: number) => {
    if (reportType === "monthly") {
      let newMonth = selectedMonth + direction;
      let newYear = selectedYear;
      if (newMonth > 12) {
        newMonth = 1;
        newYear++;
      } else if (newMonth < 1) {
        newMonth = 12;
        newYear--;
      }
      setSelectedMonth(newMonth);
      setSelectedYear(newYear);
    } else {
      setSelectedYear(selectedYear + direction);
    }
  };

  const handleExport = () => {
    const startDate = format(reportData.startDate, "yyyy-MM-dd");
    const endDate = format(reportData.endDate, "yyyy-MM-dd");
    window.open(`/api/transactions/export?startDate=${startDate}&endDate=${endDate}`, "_blank");
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="w-6 h-6" />
          财务报表
        </h1>
        <Button onClick={handleExport} variant="outline" data-testid="button-export-csv">
          <Download className="w-4 h-4 mr-1" />
          导出CSV
        </Button>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Tabs value={reportType} onValueChange={(v) => setReportType(v as "monthly" | "yearly")}>
          <TabsList>
            <TabsTrigger value="monthly">月度报表</TabsTrigger>
            <TabsTrigger value="yearly">年度报表</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigatePeriod(-1)}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <span className="text-lg font-medium min-w-[100px] text-center">
            {reportType === "monthly" ? `${selectedYear}年${selectedMonth}月` : `${selectedYear}年`}
          </span>
          <Button variant="ghost" size="icon" onClick={() => navigatePeriod(1)}>
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-income" />
              总收入
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono text-income">
              +{currencyInfo.symbol}{reportData.totalIncome.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-muted-foreground flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-expense" />
              总支出
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono text-expense">
              -{currencyInfo.symbol}{reportData.totalExpense.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-muted-foreground">净收入</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold font-mono ${reportData.netIncome >= 0 ? "text-income" : "text-expense"}`}>
              {reportData.netIncome >= 0 ? "+" : ""}{currencyInfo.symbol}{reportData.netIncome.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-muted-foreground">交易笔数</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{reportData.transactionCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>分类明细</CardTitle>
          </CardHeader>
          <CardContent>
            {reportData.categoryBreakdown.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">暂无数据</p>
            ) : (
              <div className="space-y-4">
                {reportData.categoryBreakdown.map((cat, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="font-medium">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      {cat.income > 0 && (
                        <span className="text-income font-mono">
                          +{currencyInfo.symbol}{cat.income.toFixed(2)}
                        </span>
                      )}
                      {cat.expense > 0 && (
                        <span className="text-expense font-mono">
                          -{currencyInfo.symbol}{cat.expense.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              钱包明细
            </CardTitle>
          </CardHeader>
          <CardContent>
            {reportData.walletBreakdown.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">暂无数据</p>
            ) : (
              <div className="space-y-4">
                {reportData.walletBreakdown.map((wallet, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <span className="font-medium">{wallet.name}</span>
                    <div className="flex items-center gap-4 text-sm">
                      {wallet.income > 0 && (
                        <span className="text-income font-mono">
                          +{currencyInfo.symbol}{wallet.income.toFixed(2)}
                        </span>
                      )}
                      {wallet.expense > 0 && (
                        <span className="text-expense font-mono">
                          -{currencyInfo.symbol}{wallet.expense.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>报表说明</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• 报表期间: {format(reportData.startDate, "yyyy-MM-dd")} 至 {format(reportData.endDate, "yyyy-MM-dd")}</p>
          <p>• 所有金额均以{currencyInfo.name} ({currencyInfo.code})为单位显示</p>
          <p>• 转账交易不计入收入或支出统计</p>
          <p>• 点击"导出CSV"可下载详细交易记录</p>
        </CardContent>
      </Card>
    </div>
  );
}
