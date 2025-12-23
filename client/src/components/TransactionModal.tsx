import { useState, useEffect, useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarIcon, Loader2, ArrowRightLeft, RefreshCw, Trash2, BookOpen } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { Wallet, Category, TransactionType, Transaction, SubLedger } from "@shared/schema";
import { supportedCurrencies, getCurrencyInfo } from "@shared/schema";

interface TransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallets: Wallet[];
  categories: Category[];
  subLedgers?: SubLedger[];
  defaultCurrency?: string;
  transaction?: Transaction | null;
  onDelete?: (transaction: Transaction) => void;
}

const transactionSchema = z.object({
  type: z.enum(["expense", "income", "transfer"]),
  amount: z.string().min(1, "请输入金额").refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
    "请输入有效金额"
  ),
  currency: z.string().min(1, "请选择币种"),
  exchangeRate: z
    .string()
    .optional()
    .refine((val) => {
      if (!val) return true;
      const num = parseFloat(val);
      return !isNaN(num) && num > 0;
    }, "汇率必须为正数"),
  convertedAmount: z
    .string()
    .optional()
    .refine((val) => {
      if (!val) return true;
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0;
    }, "转换后金额必须为非负数"),
  walletId: z.string().min(1, "请选择钱包"),
  toWalletId: z.string().optional(),
  toWalletAmount: z.string().optional(),
  categoryId: z.string().optional(),
  subLedgerId: z.string().optional(),
  description: z.string().optional(),
  date: z.date(),
});

type TransactionFormData = z.infer<typeof transactionSchema>;

export function TransactionModal({
  open,
  onOpenChange,
  wallets,
  categories,
  subLedgers = [],
  defaultCurrency = "MYR",
  transaction,
  onDelete,
}: TransactionModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!transaction;
  const [activeTab, setActiveTab] = useState<TransactionType>("expense");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!open) {
      setShowDeleteConfirm(false);
    }
  }, [open]);

  const [isLoadingRate, setIsLoadingRate] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);
  const [conversionPref, setConversionPref] = useState<"byRate" | "byConverted">(() => {
    try {
      const saved = localStorage.getItem("tx_conversion_pref");
      return saved === "byConverted" ? "byConverted" : "byRate";
    } catch {
      return "byRate";
    }
  });
  const originalSnapshot = useRef<{ amount?: string; rate?: string; converted?: string }>({});

  const form = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      type: "expense",
      amount: "",
      currency: defaultCurrency,
      exchangeRate: "1",
      convertedAmount: "",
      walletId: "",
      toWalletId: "",
      toWalletAmount: "",
      categoryId: "",
      subLedgerId: "",
      description: "",
      date: new Date(),
    },
  });

  const watchCurrency = form.watch("currency");
  const watchWalletId = form.watch("walletId");
  const watchToWalletId = form.watch("toWalletId");
  const watchAmount = form.watch("amount");
  const watchExchangeRate = form.watch("exchangeRate");
  const watchConvertedAmount = form.watch("convertedAmount");

  const selectedWallet = wallets.find((w) => String(w.id) === watchWalletId);
  const selectedToWallet = wallets.find((w) => String(w.id) === watchToWalletId);

  const needsCurrencyConversion = selectedWallet && watchCurrency !== selectedWallet.currency;
  const needsTransferConversion = activeTab === "transfer" && selectedWallet && selectedToWallet && selectedWallet.currency !== selectedToWallet.currency;

  const fetchExchangeRate = useCallback(async (from: string, to: string) => {
    if (from === to) {
      form.setValue("exchangeRate", "1");
      return 1;
    }
    
    setIsLoadingRate(true);
    setRateError(null);
    
    try {
      const response = await fetch(`/api/exchange-rate?from=${from}&to=${to}`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        const data = await response.json();
        setRateError(data.message || "无法获取汇率");
        return null;
      }
      
      const data = await response.json();
      const rate = data.rate;
      form.setValue("exchangeRate", rate.toFixed(4));
      return rate;
    } catch (error) {
      setRateError("无法获取汇率，请手动输入");
      return null;
    } finally {
      setIsLoadingRate(false);
    }
  }, [form]);

  useEffect(() => {
    if (open && transaction) {
      const txType = transaction.type as TransactionType;
      setActiveTab(txType);
      
      const wallet = wallets.find(w => w.id === transaction.walletId);
      const walletCurrency = wallet?.currency || defaultCurrency;
      const hasCrossConversion = transaction.originalAmount && transaction.currency !== walletCurrency;
      
      form.reset({
        type: txType,
        amount: hasCrossConversion 
          ? transaction.originalAmount || transaction.amount 
          : transaction.amount,
        currency: transaction.currency || walletCurrency,
        exchangeRate: transaction.exchangeRate || "1",
        convertedAmount: hasCrossConversion ? transaction.amount : "",
        walletId: String(transaction.walletId),
        toWalletId: transaction.toWalletId ? String(transaction.toWalletId) : "",
        toWalletAmount: transaction.toWalletAmount || "",
        categoryId: transaction.categoryId ? String(transaction.categoryId) : "",
        subLedgerId: transaction.subLedgerId ? String(transaction.subLedgerId) : "",
        description: transaction.description || "",
        date: new Date(transaction.date),
      });
    } else if (open && !transaction) {
      setActiveTab("expense");
      form.reset({
        type: "expense",
        amount: "",
        currency: defaultCurrency,
        exchangeRate: "1",
        convertedAmount: "",
        walletId: wallets.find((w) => w.isDefault)?.id.toString() || wallets[0]?.id.toString() || "",
        toWalletId: "",
        toWalletAmount: "",
        categoryId: "",
        subLedgerId: "",
        description: "",
        date: new Date(),
      });
      setRateError(null);
    }
  }, [open, transaction, wallets, form, defaultCurrency]);

  useEffect(() => {
    if (!isEditing) {
      form.setValue("type", activeTab);
      form.setValue("categoryId", "");
      form.setValue("toWalletId", "");
      form.setValue("toWalletAmount", "");
    }
  }, [activeTab, form, isEditing]);

  useEffect(() => {
    if (!isEditing && selectedWallet && watchCurrency === selectedWallet.currency) {
      form.setValue("exchangeRate", "1");
      form.setValue("convertedAmount", "");
      setRateError(null);
    } else if (!isEditing && selectedWallet && watchCurrency && watchCurrency !== selectedWallet.currency) {
      fetchExchangeRate(watchCurrency, selectedWallet.currency);
    }
  }, [watchCurrency, selectedWallet, form, fetchExchangeRate, isEditing]);

  useEffect(() => {
    if (needsCurrencyConversion) {
      if (!originalSnapshot.current.amount) {
        originalSnapshot.current = {
          amount: watchAmount || "",
          rate: watchExchangeRate || "1",
          converted: watchConvertedAmount || "",
        };
      }
    } else {
      originalSnapshot.current = {};
    }
  }, [needsCurrencyConversion]);

  useEffect(() => {
    if (conversionPref !== "byRate") return;
    if (needsCurrencyConversion && watchAmount && watchExchangeRate) {
      const amount = parseFloat(watchAmount);
      const rate = parseFloat(watchExchangeRate);
      if (!isNaN(amount) && !isNaN(rate) && rate > 0) {
        const converted = (amount * rate).toFixed(2);
        if (watchConvertedAmount !== converted) {
          form.setValue("convertedAmount", converted);
        }
      }
    }
  }, [watchAmount, watchExchangeRate, needsCurrencyConversion, form, watchConvertedAmount, conversionPref]);

  const handleConvertedInputChange = (value: string) => {
    form.setValue("convertedAmount", value, { shouldValidate: false });
  };

  const handleConvertedInputBlur = (value: string) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) {
      form.setValue("convertedAmount", value, { shouldValidate: true });
      return;
    }
    const rounded = num.toFixed(2);
    form.setValue("convertedAmount", rounded, { shouldValidate: true });
    setConversionPref("byConverted");
    try { localStorage.setItem("tx_conversion_pref", "byConverted"); } catch {}
    const amountStr = form.getValues("amount");
    const amount = parseFloat(amountStr);
    if (!isNaN(amount) && amount > 0) {
      const newRate = (num / amount).toFixed(4);
      form.setValue("exchangeRate", newRate, { shouldValidate: true });
    }
  };

  const handleRateInputChange = (value: string) => {
    form.setValue("exchangeRate", value, { shouldValidate: false });
  };

  const handleRateInputBlur = (value: string) => {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) {
      form.setValue("exchangeRate", value, { shouldValidate: true });
      return;
    }
    const rounded = num.toFixed(4);
    form.setValue("exchangeRate", rounded, { shouldValidate: true });
    setConversionPref("byRate");
    try { localStorage.setItem("tx_conversion_pref", "byRate"); } catch {}
    const amountStr = form.getValues("amount");
    const amount = parseFloat(amountStr);
    if (!isNaN(amount) && amount > 0) {
      const converted = (amount * num).toFixed(2);
      form.setValue("convertedAmount", converted, { shouldValidate: true });
    }
  };

  const mutation = useMutation({
    mutationFn: async (data: TransactionFormData) => {
      const wallet = wallets.find((w) => String(w.id) === data.walletId);
      const toWallet = wallets.find((w) => String(w.id) === data.toWalletId);
      const walletCurrency = wallet?.currency || "MYR";
      const isCrossCurrency = data.currency !== walletCurrency;
      const isTransferCrossCurrency = data.type === "transfer" && toWallet && wallet && wallet.currency !== toWallet.currency;
      
      const requestData: Record<string, unknown> = {
        type: data.type,
        amount: parseFloat(data.amount),
        walletId: parseInt(data.walletId),
        description: data.description || null,
        date: data.date.toISOString(),
      };

      if (data.toWalletId) {
        requestData.toWalletId = parseInt(data.toWalletId);
      }
      if (data.categoryId) {
        requestData.categoryId = parseInt(data.categoryId);
      }
      if (data.subLedgerId) {
        requestData.subLedgerId = parseInt(data.subLedgerId);
      }

      if (isCrossCurrency) {
        requestData.currency = data.currency;
        const rate = parseFloat(data.exchangeRate || "1");
        requestData.exchangeRate = rate;
        // 保持 amount 为原币种金额，服务器根据 exchangeRate 计算钱包金额
      }

      if (isTransferCrossCurrency && data.toWalletAmount) {
        requestData.toWalletAmount = parseFloat(data.toWalletAmount);
      }
      
      if (isEditing && transaction) {
        await apiRequest("PATCH", `/api/transactions/${transaction.id}`, requestData);
      } else {
        await apiRequest("POST", "/api/transactions", requestData);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      toast({
        title: isEditing ? "更新成功" : "记录成功",
        description: isEditing ? "交易已成功更新" : "交易已成功添加",
      });
      onOpenChange(false);
      form.reset();
      setActiveTab("expense");
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "会话已过期",
          description: "正在重新登录...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: isEditing ? "更新失败" : "记录失败",
        description: error.message || "请稍后重试",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: TransactionFormData) => {
    if (data.type === "transfer" && data.walletId === data.toWalletId) {
      toast({
        title: "转账失败",
        description: "转出和转入钱包不能相同",
        variant: "destructive",
      });
      return;
    }
    
    if (data.type === "transfer") {
      const fromWallet = wallets.find((w) => String(w.id) === data.walletId);
      const toWallet = wallets.find((w) => String(w.id) === data.toWalletId);
      if (fromWallet && toWallet && fromWallet.currency !== toWallet.currency) {
        if (!data.toWalletAmount || parseFloat(data.toWalletAmount) <= 0) {
          toast({
            title: "转账失败",
            description: "跨币种转账需要输入转入金额",
            variant: "destructive",
          });
          return;
        }
      }
    }
    
    mutation.mutate(data);
  };

  const filteredCategories = categories.filter(
    (c) => c.type === (activeTab === "income" ? "income" : "expense")
  );

  const typeLabels = {
    expense: "支出",
    income: "收入",
    transfer: "转账",
  };

  const currencyInfo = getCurrencyInfo(watchCurrency);
  const walletCurrencyInfo = selectedWallet ? getCurrencyInfo(selectedWallet.currency) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="modal-transaction" aria-describedby={undefined}>
        <DialogHeader className="pb-2">
          <DialogTitle className="text-center text-lg font-semibold">
            {isEditing ? "编辑交易" : "记一笔"}
          </DialogTitle>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v as TransactionType);
            form.setValue("type", v as TransactionType);
          }}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-3" data-testid="tabs-transaction-type">
            <TabsTrigger value="expense" data-testid="tab-expense">
              支出
            </TabsTrigger>
            <TabsTrigger value="income" data-testid="tab-income">
              收入
            </TabsTrigger>
            <TabsTrigger value="transfer" data-testid="tab-transfer">
              转账
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <div className="flex gap-2">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>金额</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-muted-foreground">
                          {currencyInfo.symbol}
                        </span>
                        <Input
                          {...field}
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          className="pl-10 text-xl font-mono h-12 text-right"
                          data-testid="input-amount"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem className="w-28">
                    <FormLabel>币种</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-12" data-testid="select-currency">
                          <SelectValue placeholder="币种" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {supportedCurrencies.map((currency) => (
                          <SelectItem
                            key={currency.code}
                            value={currency.code}
                            data-testid={`option-currency-${currency.code}`}
                          >
                            {currency.code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {needsCurrencyConversion && (
              <div className="p-3 bg-muted rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ArrowRightLeft className="h-4 w-4" />
                    <span>需要货币转换 ({watchCurrency} → {selectedWallet?.currency})</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => selectedWallet && fetchExchangeRate(watchCurrency, selectedWallet.currency)}
                    disabled={isLoadingRate}
                    className="h-7 px-2"
                    data-testid="button-refresh-rate"
                  >
                    <RefreshCw className={`h-3 w-3 ${isLoadingRate ? 'animate-spin' : ''}`} />
                  </Button>
                </div>

                <FormField
                  control={form.control}
                  name="exchangeRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">
                        汇率 (1 {watchCurrency} = ? {selectedWallet?.currency})
                        {isLoadingRate && <Loader2 className="inline ml-2 h-3 w-3 animate-spin" />}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={field.value || ""}
                          onChange={(e) => handleRateInputChange(e.target.value)}
                          onBlur={(e) => handleRateInputBlur(e.target.value)}
                          placeholder="1.0000"
                          className="font-mono"
                          data-testid="input-exchange-rate"
                        />
                      </FormControl>
                      {rateError && (
                        <p className="text-xs text-yellow-600 dark:text-yellow-500">{rateError}</p>
                      )}
                      <p className="text-xs text-muted-foreground">可直接编辑汇率，系统会同步更新转换后金额</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormItem>
                  <FormLabel className="text-sm">
                    转换后金额 ({selectedWallet?.currency})
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {walletCurrencyInfo?.symbol}
                      </span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={watchConvertedAmount || ""}
                        onChange={(e) => handleConvertedInputChange(e.target.value)}
                        onBlur={(e) => handleConvertedInputBlur(e.target.value)}
                        placeholder="0.00"
                        className="pl-10 font-mono"
                        data-testid="input-converted-amount"
                      />
                    </div>
                  </FormControl>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">此金额将记入钱包，可直接编辑，系统会同步更新汇率</p>
                    {needsCurrencyConversion && (
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2"
                        onClick={() => {
                          const snap = originalSnapshot.current;
                          if (snap) {
                            if (typeof snap.amount === "string") form.setValue("amount", snap.amount);
                            if (typeof snap.rate === "string") form.setValue("exchangeRate", snap.rate);
                            if (typeof snap.converted === "string") form.setValue("convertedAmount", snap.converted);
                          }
                          setRateError(null);
                        }}
                      >重置</Button>
                    )}
                  </div>
                </FormItem>
              </div>
            )}

            <FormField
              control={form.control}
              name="walletId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {activeTab === "transfer" ? "转出钱包" : "账户"}
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-wallet">
                        <SelectValue placeholder="选择钱包" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {wallets.map((wallet) => (
                        <SelectItem
                          key={wallet.id}
                          value={String(wallet.id)}
                          data-testid={`option-wallet-${wallet.id}`}
                        >
                          {wallet.name} ({wallet.currency})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {activeTab === "transfer" && (
              <>
                <FormField
                  control={form.control}
                  name="toWalletId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>转入钱包</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-to-wallet">
                            <SelectValue placeholder="选择转入钱包" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {wallets
                            .filter((w) => String(w.id) !== form.watch("walletId"))
                            .map((wallet) => (
                              <SelectItem
                                key={wallet.id}
                                value={String(wallet.id)}
                                data-testid={`option-to-wallet-${wallet.id}`}
                              >
                                {wallet.name} ({wallet.currency})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {needsTransferConversion && (
                  <div className="p-3 bg-muted rounded-lg space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <ArrowRightLeft className="h-4 w-4" />
                      <span>不同币种转账 ({selectedWallet?.currency} → {selectedToWallet?.currency})</span>
                    </div>
                    <FormField
                      control={form.control}
                      name="toWalletAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm">转入金额 ({selectedToWallet?.currency})</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                                {getCurrencyInfo(selectedToWallet?.currency || "MYR").symbol}
                              </span>
                              <Input
                                {...field}
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0.00"
                                className="pl-10 font-mono"
                                data-testid="input-to-wallet-amount"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </>
            )}

            {activeTab !== "transfer" && (
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>分类</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-category">
                          <SelectValue placeholder="选择分类" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {filteredCategories.map((category) => (
                          <SelectItem
                            key={category.id}
                            value={String(category.id)}
                            data-testid={`option-category-${category.id}`}
                          >
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {subLedgers.length > 0 && (
              <FormField
                control={form.control}
                name="subLedgerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" />
                      子账本（可选）
                    </FormLabel>
                    <Select onValueChange={(value) => field.onChange(value === "none" ? "" : value)} value={field.value || "none"}>
                      <FormControl>
                        <SelectTrigger data-testid="select-subledger">
                          <SelectValue placeholder="选择子账本" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none" data-testid="option-subledger-none">
                          不关联子账本
                        </SelectItem>
                        {subLedgers.filter(s => !s.isArchived).map((subLedger) => (
                          <SelectItem
                            key={subLedger.id}
                            value={String(subLedger.id)}
                            data-testid={`option-subledger-${subLedger.id}`}
                          >
                            <span className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: subLedger.color || "#8B5CF6" }}
                              />
                              {subLedger.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>日期</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal"
                          data-testid="button-date"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value
                            ? format(field.value, "yyyy年M月d日", {
                                locale: zhCN,
                              })
                            : "选择日期"}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) => date > new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>备注（可选）</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="添加备注..."
                      className="resize-none"
                      rows={2}
                      data-testid="input-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-2 pt-2">
              {isEditing && onDelete && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0 text-destructive border-destructive/50 hover:bg-destructive/10"
                  onClick={() => setShowDeleteConfirm(true)}
                  data-testid="button-delete-transaction"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Button
                type="submit"
                className="flex-1 h-11"
                disabled={mutation.isPending}
                data-testid="button-submit-transaction"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isEditing ? "更新中..." : "保存中..."}
                  </>
                ) : (
                  isEditing ? "更新交易" : `记录${typeLabels[activeTab]}`
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除这笔交易吗？此操作无法撤销，钱包余额将会自动调整。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (transaction && onDelete) {
                  onDelete(transaction);
                  setShowDeleteConfirm(false);
                  onOpenChange(false);
                }
              }}
              data-testid="button-confirm-delete"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
