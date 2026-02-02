import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { PageContainer } from "@/components/PageContainer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { 
  Plus, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Wallet as WalletIcon, 
  Calendar, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  Trash2,
  HandCoins
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Loan, Wallet } from "@shared/schema";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export default function Loans() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");

  // Fetch loans
  const { data: loans = [], isLoading: isLoansLoading } = useQuery<Loan[]>({
    queryKey: ["/api/loans"],
  });

  // Fetch wallets for loan creation (money source/destination)
  const { data: wallets = [] } = useQuery<Wallet[]>({
    queryKey: ["/api/wallets"],
  });

  // Calculate totals
  const getExchangeRate = (currency: string) => {
    if (currency === (user?.defaultCurrency || 'MYR')) return 1;
    const wallet = wallets.find(w => w.currency === currency);
    return wallet ? parseFloat(wallet.exchangeRateToDefault || '1') : 1;
  };

  const totalLent = loans
    .filter(l => l.type === 'lend' && l.status !== 'bad_debt')
    .reduce((sum, l) => {
      const amount = parseFloat(l.totalAmount) - parseFloat(l.paidAmount || '0');
      return sum + amount * getExchangeRate(l.currency);
    }, 0);

  const totalBorrowed = loans
    .filter(l => l.type === 'borrow')
    .reduce((sum, l) => {
      const amount = parseFloat(l.totalAmount) - parseFloat(l.paidAmount || '0');
      return sum + amount * getExchangeRate(l.currency);
    }, 0);

  const netPosition = totalLent - totalBorrowed;

  // Filtered loans
  const filteredLoans = loans.filter(loan => {
    if (activeTab === "all") return true;
    if (activeTab === "active") return loan.status === "active";
    if (activeTab === "settled") return loan.status === "settled";
    if (activeTab === "bad_debt") return loan.status === "bad_debt";
    return true;
  });

  return (
    <PageContainer title="借贷管理">
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">待收回 (应收)</CardTitle>
              <ArrowUpRight className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">
                {totalLent.toLocaleString('zh-CN', { style: 'currency', currency: user?.defaultCurrency || 'MYR' })}
              </div>
              <p className="text-xs text-muted-foreground">
                借出未还总额
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">待偿还 (应付)</CardTitle>
              <ArrowDownLeft className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500">
                {totalBorrowed.toLocaleString('zh-CN', { style: 'currency', currency: user?.defaultCurrency || 'MYR' })}
              </div>
              <p className="text-xs text-muted-foreground">
                借入未还总额
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">净头寸</CardTitle>
              <WalletIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={cn(
                "text-2xl font-bold",
                netPosition >= 0 ? "text-primary" : "text-red-500"
              )}>
                {netPosition.toLocaleString('zh-CN', { style: 'currency', currency: user?.defaultCurrency || 'MYR' })}
              </div>
              <p className="text-xs text-muted-foreground">
                应收 - 应付
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Action Bar */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
            <TabsList>
              <TabsTrigger value="all">全部</TabsTrigger>
              <TabsTrigger value="active">进行中</TabsTrigger>
              <TabsTrigger value="settled">已结清</TabsTrigger>
              <TabsTrigger value="bad_debt">坏账</TabsTrigger>
            </TabsList>
          </Tabs>
          
          <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            新增借贷
          </Button>
        </div>

        {/* Loans List */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {isLoansLoading ? (
            <div className="col-span-full text-center py-10 text-muted-foreground">加载中...</div>
          ) : filteredLoans.length === 0 ? (
            <div className="col-span-full text-center py-10 text-muted-foreground">
              <HandCoins className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              暂无借贷记录
            </div>
          ) : (
            filteredLoans.map((loan) => (
              <LoanCard key={loan.id} loan={loan} />
            ))
          )}
        </div>
      </div>

      <CreateLoanDialog 
        open={isCreateOpen} 
        onOpenChange={setIsCreateOpen} 
        wallets={wallets}
      />
    </PageContainer>
  );
}

function LoanCard({ loan }: { loan: Loan }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isRepayOpen, setIsRepayOpen] = useState(false);
  
  // Delete loan mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', `/api/loans/${loan.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
      toast({ title: "已删除", description: "借贷记录已删除" });
    },
  });

  // Mark bad debt mutation
  const statusMutation = useMutation({
    mutationFn: async (status: string) => {
      await apiRequest('PATCH', `/api/loans/${loan.id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
      toast({ title: "状态已更新" });
    },
  });

  const total = parseFloat(loan.totalAmount);
  const paid = parseFloat(loan.paidAmount || '0');
  const remaining = total - paid;
  const progress = Math.min(100, (paid / total) * 100);

  const isLend = loan.type === 'lend';
  const isSettled = loan.status === 'settled';
  const isBadDebt = loan.status === 'bad_debt';

  return (
    <Card className={cn(
      "relative overflow-hidden transition-all hover:shadow-md",
      (isSettled || isBadDebt) && "opacity-75 bg-muted/30"
    )}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant={isLend ? "outline" : "secondary"} className={cn(
                isLend ? "text-green-600 border-green-200" : "text-red-600 bg-red-100 dark:bg-red-900/20"
              )}>
                {isLend ? "借出" : "借入"}
              </Badge>
              <CardTitle className="text-lg">{loan.person}</CardTitle>
            </div>
            <CardDescription className="mt-1 flex items-center gap-1 text-xs">
              <Calendar className="h-3 w-3" />
              {format(new Date(loan.startDate), "yyyy年MM月dd日", { locale: zhCN })}
              {loan.dueDate && (
                <span className={cn(
                  "ml-2 flex items-center gap-1",
                  new Date(loan.dueDate) < new Date() && !isSettled ? "text-red-500 font-medium" : ""
                )}>
                  <Clock className="h-3 w-3" />
                  到期: {format(new Date(loan.dueDate), "MM-dd")}
                </span>
              )}
            </CardDescription>
          </div>
          <div className="text-right z-20">
            <div className="text-lg font-bold">
              {remaining.toLocaleString('zh-CN', { style: 'currency', currency: loan.currency })}
            </div>
            <div className="text-xs text-muted-foreground">
              总额: {parseFloat(loan.totalAmount).toLocaleString()}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Progress Bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>已还: {paid.toLocaleString()}</span>
              <span>{progress.toFixed(0)}%</span>
            </div>
            <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
              <div 
                className={cn("h-full transition-all duration-500", isLend ? "bg-green-500" : "bg-red-500")} 
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {loan.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {loan.description}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {!isSettled && !isBadDebt && (
              <Button 
                variant="default" 
                size="sm" 
                className="flex-1"
                onClick={() => setIsRepayOpen(true)}
              >
                {isLend ? "收款" : "还款"}
              </Button>
            )}
            
            {!isSettled && !isBadDebt && isLend && (
               <Button 
               variant="outline" 
               size="sm"
               className="text-red-500 hover:text-red-600 hover:bg-red-50"
               onClick={() => {
                 if (confirm("确定要标记为坏账吗？这意味着这笔钱可能收不回来了。")) {
                   statusMutation.mutate('bad_debt');
                 }
               }}
             >
               坏账
             </Button>
            )}

            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => {
                if (confirm("确定要删除这个借贷记录吗？关联的交易记录不会被删除，但会解除关联。")) {
                  deleteMutation.mutate();
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
      
      {/* Status Badges Overlay */}
      {isSettled && (
        <div className="absolute top-2 right-2 rotate-12 opacity-80 pointer-events-none">
           <div className="border-2 border-green-500 text-green-500 px-2 py-1 rounded font-bold text-xs uppercase tracking-widest">
             已结清
           </div>
        </div>
      )}
      {isBadDebt && (
        <div className="absolute top-2 right-2 rotate-12 opacity-100 pointer-events-none z-10">
           <div className="border-2 border-red-700 text-red-700 px-2 py-1 rounded font-bold text-xs uppercase tracking-widest bg-background/20 backdrop-blur-[1px]">
             坏账
           </div>
        </div>
      )}

      <RepayDialog 
        open={isRepayOpen} 
        onOpenChange={setIsRepayOpen} 
        loan={loan} 
      />
    </Card>
  );
}

import { supportedCurrencies } from "@shared/schema";

function CreateLoanDialog({ open, onOpenChange, wallets }: { open: boolean, onOpenChange: (open: boolean) => void, wallets: Wallet[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    type: 'lend',
    person: '',
    amount: '',
    currency: 'MYR',
    walletId: '',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    dueDate: '',
    description: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.person || !formData.amount || !formData.walletId) {
      toast({ title: "请填写必填项", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Create Loan Record
      const loanRes = await apiRequest('POST', '/api/loans', {
        type: formData.type,
        person: formData.person,
        totalAmount: formData.amount,
        currency: formData.currency,
        startDate: new Date(formData.startDate).toISOString(),
        dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : null,
        description: formData.description,
        status: 'active'
      });

      const loan = await loanRes.json();

      // 2. Create Initial Transaction (Money moving out/in)
      const txRes = await apiRequest('POST', '/api/transactions', {
        type: formData.type === 'lend' ? 'expense' : 'income',
        amount: parseFloat(formData.amount), // Note: This assumes 1:1 exchange rate if wallet currency differs. 
                                             // Ideal UX would ask for exchange rate if currencies differ.
        walletId: parseInt(formData.walletId),
        date: new Date(formData.startDate).toISOString(),
        description: `${formData.type === 'lend' ? '借给' : '向某人借款'}: ${formData.person}`,
        loanId: loan.id, 
      });

      toast({ title: "借贷记录已创建", description: "已自动记录资金流水" });

      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      onOpenChange(false);
      setFormData({
        type: 'lend',
        person: '',
        amount: '',
        currency: 'MYR',
        walletId: '',
        startDate: format(new Date(), 'yyyy-MM-dd'),
        dueDate: '',
        description: ''
      });
    } catch (error) {
      console.error(error);
      toast({ title: "创建失败", description: "请重试", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>新增借贷</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>类型</Label>
              <Select 
                value={formData.type} 
                onValueChange={(v) => setFormData({...formData, type: v})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lend">我借出 (别人欠我)</SelectItem>
                  <SelectItem value="borrow">我借入 (我欠别人)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>对方姓名</Label>
              <Input 
                placeholder="张三" 
                value={formData.person}
                onChange={(e) => setFormData({...formData, person: e.target.value})}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>金额</Label>
              <div className="flex gap-2">
                <Input 
                  type="number" 
                  placeholder="0.00" 
                  min="0.01"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: e.target.value})}
                  className="flex-1"
                />
                <Select 
                  value={formData.currency} 
                  onValueChange={(v) => setFormData({...formData, currency: v})}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {supportedCurrencies.map(c => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>关联钱包 (资金来源/去向)</Label>
              <Select 
                value={formData.walletId} 
                onValueChange={(v) => setFormData({...formData, walletId: v})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择钱包" />
                </SelectTrigger>
                <SelectContent>
                  {wallets.map(w => (
                    <SelectItem key={w.id} value={w.id.toString()}>
                      {w.name} ({w.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>借款日期</Label>
              <Input 
                type="date" 
                value={formData.startDate}
                onChange={(e) => setFormData({...formData, startDate: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>约定还款日 (可选)</Label>
              <Input 
                type="date" 
                value={formData.dueDate}
                onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>备注</Label>
            <Textarea 
              placeholder="借款用途等..." 
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RepayDialog({ open, onOpenChange, loan }: { open: boolean, onOpenChange: (open: boolean) => void, loan: Loan }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { data: wallets = [] } = useQuery<Wallet[]>({
    queryKey: ["/api/wallets"],
  });

  const remaining = parseFloat(loan.totalAmount) - parseFloat(loan.paidAmount || '0');

  const [formData, setFormData] = useState({
    amount: remaining.toFixed(2),
    currency: loan.currency,
    walletId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    description: '',
    exchangeRate: '' // Optional custom exchange rate
  });

  const selectedWallet = wallets.find(w => w.id.toString() === formData.walletId);
  const inputCurrency = formData.currency;
  const walletCurrency = selectedWallet?.currency;
  
  // Case 1: Input Currency != Wallet Currency (e.g. Input LoanCurrency, Wallet in USD)
  const isInputDiffWallet = selectedWallet && inputCurrency !== walletCurrency;
  
  // Case 2: Input Currency != Loan Currency (e.g. Input WalletCurrency, Loan in CNY)
  const isInputDiffLoan = inputCurrency !== loan.currency;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || !formData.walletId) {
      toast({ title: "请填写必填项", variant: "destructive" });
      return;
    }

    if ((isInputDiffWallet || isInputDiffLoan) && !formData.exchangeRate) {
        toast({ title: "跨币种还款需要填写汇率", variant: "destructive" });
        return;
    }

    setIsSubmitting(true);
    try {
      const type = loan.type === 'lend' ? 'income' : 'expense';
      const inputAmount = parseFloat(formData.amount);
      let walletAmount = inputAmount;
      let finalRate = 1;
      let finalCurrency = inputCurrency;

      // Logic:
      // 1. If Input Currency == Wallet Currency (e.g. Pay 100 USD from USD Wallet to CNY Loan)
      //    We need to send: amount=100, currency=USD, exchangeRate = 1 / (Rate USD->CNY)
      //    So backend sees: Currency USD != Loan CNY. Rate = 1/R. 
      //    Backend calculates PaidIncrement = Amount / Rate = 100 / (1/R) = 100 * R (CNY). Correct.
      //
      // 2. If Input Currency == Loan Currency (e.g. Pay 100 CNY from USD Wallet)
      //    We need to send: amount=100*Rate(CNY->USD), currency=USD, exchangeRate = Rate(CNY->USD)
      //    Backend sees: Currency USD != Loan CNY. Rate = R.
      //    Backend calculates PaidIncrement = WalletAmount / Rate = (100*R) / R = 100. Correct.
      
      if (inputCurrency === walletCurrency) {
         // User entered amount in Wallet Currency.
         // If Wallet Currency != Loan Currency, we need Rate (Wallet -> Loan).
         // Let's say User inputs Rate R (1 Wallet = R Loan).
         // We send ExchangeRate = 1/R.
         if (isInputDiffLoan) {
             const rateWalletToLoan = parseFloat(formData.exchangeRate); // 1 Wallet = ? Loan
             finalRate = 1 / rateWalletToLoan; // Backend expects Rate Input(Wallet) -> Wallet(Same) ?? No.
             // Backend Logic:
             // if (transaction.currency != loan.currency)
             //    paidIncrement = transaction.amount / transaction.exchangeRate
             // Here transaction.currency = Wallet Currency. loan.currency = Loan Currency.
             // transaction.amount = Input Amount (Wallet Currency).
             // We want paidIncrement = Input Amount * Rate(Wallet->Loan).
             // So Input * Rate = Input / exchangeRate
             // => exchangeRate = 1 / Rate.
             // Correct.
         } else {
             finalRate = 1;
         }
         walletAmount = inputAmount;
         finalCurrency = walletCurrency;
      } else {
         // User entered amount in Loan Currency (or other).
         // Assume Input Currency == Loan Currency (as we only allow picking Loan or Wallet currency).
         // So Input is Loan Currency.
         // We need Rate (Loan -> Wallet).
         // User inputs Rate R (1 Loan = ? Wallet).
         // walletAmount = Input * R.
         // exchangeRate = R.
         // Backend sees:
         // transaction.currency = Wallet Currency (we should send wallet currency if we converted).
         // No wait, backend uses transaction.currency.
         
         const rateLoanToWallet = parseFloat(formData.exchangeRate);
         walletAmount = inputAmount * rateLoanToWallet;
         finalRate = rateLoanToWallet;
         finalCurrency = walletCurrency || loan.currency; // Should be Wallet Currency since we converted
      }

      await apiRequest('POST', '/api/transactions', {
        type,
        amount: walletAmount, 
        currency: finalCurrency,
        exchangeRate: finalRate,
        walletId: parseInt(formData.walletId),
        date: new Date(formData.date).toISOString(),
        description: `还款: ${loan.person} ${formData.description ? `(${formData.description})` : ''}`,
        loanId: loan.id, 
      });

      toast({ title: "还款记录已保存", description: "借贷状态已更新" });
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast({ title: "保存失败", description: "请重试", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{loan.type === 'lend' ? "收款 (对方还钱)" : "还款 (我还钱)"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>还款金额 (剩余: {remaining.toFixed(2)} {loan.currency})</Label>
            <div className="flex gap-2">
                <Input 
                  type="number" 
                  placeholder="0.00" 
                  min="0.01"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: e.target.value})}
                  className="flex-1"
                />
                <Select 
                  value={formData.currency} 
                  onValueChange={(v) => setFormData({...formData, currency: v})}
                >
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={loan.currency}>{loan.currency}</SelectItem>
                    {selectedWallet && selectedWallet.currency !== loan.currency && (
                        <SelectItem value={selectedWallet.currency}>{selectedWallet.currency}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>{loan.type === 'lend' ? "存入钱包" : "扣款钱包"}</Label>
            <Select 
              value={formData.walletId} 
              onValueChange={(v) => {
                  const w = wallets.find(w => w.id.toString() === v);
                  // If currency was set to old wallet currency, update to new wallet currency?
                  // Better logic: if current currency is NOT loan currency, switch to new wallet currency.
                  let newCurrency = formData.currency;
                  if (formData.currency !== loan.currency) {
                      newCurrency = w?.currency || loan.currency;
                  }
                  setFormData({...formData, walletId: v, currency: newCurrency});
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择钱包" />
              </SelectTrigger>
              <SelectContent>
                {wallets.map(w => (
                  <SelectItem key={w.id} value={w.id.toString()}>
                    {w.name} ({w.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(isInputDiffWallet || isInputDiffLoan) && (
            <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
              <Label className="text-yellow-500">汇率换算</Label>
              <div className="text-xs text-muted-foreground mb-2">
                {isInputDiffLoan ? (
                    // Input is Wallet Currency. Need Rate Wallet -> Loan.
                    <>
                    还款币种 ({inputCurrency}) 与 借贷币种 ({loan.currency}) 不同。
                    <br />
                    请设置汇率: 1 {inputCurrency} = ? {loan.currency}
                    </>
                ) : (
                    // Input is Loan Currency. Need Rate Loan -> Wallet.
                    <>
                    还款币种 ({inputCurrency}) 与 钱包币种 ({walletCurrency}) 不同。
                    <br />
                    请设置汇率: 1 {inputCurrency} = ? {walletCurrency}
                    </>
                )}
              </div>
              <Input 
                type="number" 
                placeholder="例如: 4.5" 
                min="0.000001"
                step="0.000001"
                value={formData.exchangeRate}
                onChange={(e) => setFormData({...formData, exchangeRate: e.target.value})}
              />
              {formData.amount && formData.exchangeRate && (
                <div className="mt-2 text-sm text-right">
                    {isInputDiffLoan ? (
                        <>
                        实际抵消借贷: 
                        <span className="font-bold ml-1">
                            {(parseFloat(formData.amount) * parseFloat(formData.exchangeRate)).toFixed(2)} {loan.currency}
                        </span>
                        </>
                    ) : (
                        <>
                        实际{loan.type === 'lend' ? "入账" : "扣款"}: 
                        <span className="font-bold ml-1">
                            {(parseFloat(formData.amount) * parseFloat(formData.exchangeRate)).toFixed(2)} {walletCurrency}
                        </span>
                        </>
                    )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>日期</Label>
            <Input 
              type="date" 
              value={formData.date}
              onChange={(e) => setFormData({...formData, date: e.target.value})}
            />
          </div>

          <div className="space-y-2">
            <Label>备注</Label>
            <Input 
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "保存中..." : "确认"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
