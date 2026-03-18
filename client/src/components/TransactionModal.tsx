import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
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
import { CalendarIcon, Loader2, ArrowRightLeft, RefreshCw, Trash2, BookOpen, Scan, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { Wallet, Category, TransactionType, Transaction, SubLedger } from "@shared/schema";
import { supportedCurrencies, getCurrencyInfo } from "@shared/schema";
import Tesseract from "tesseract.js";
// @ts-expect-error vite asset import
import workerUrl from "tesseract.js/dist/worker.min.js?url";
// @ts-expect-error vite asset import
import coreUrl from "tesseract.js-core/tesseract-core-simd.wasm.js?url";

interface TransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallets: Wallet[];
  categories: Category[];
  subLedgers?: SubLedger[];
  defaultCurrency?: string;
  transaction?: Transaction | null;
  onDelete?: (transaction: Transaction) => void;
  defaultSubLedgerId?: number;
}

const transactionSchema = z.object({
  type: z.enum(["expense", "income", "transfer"]),
  amount: z.string().min(1, "请输入金额").refine(
    (val) => {
      // Allow expressions like "15+5" or "10*2" to pass initial validation
      if (/^[0-9+\-*/.\s]+$/.test(val)) return true;
      const num = parseFloat(val);
      return !isNaN(num) && num > 0;
    },
    "请输入有效金额或计算公式"
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
  defaultSubLedgerId,
}: TransactionModalProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const isEditing = !!transaction;
  const [activeTab, setActiveTab] = useState<TransactionType>("expense");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [expressionResult, setExpressionResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const evaluateExpression = (expr: string): string | null => {
    try {
      if (!/^[0-9+\-*/.\s]+$/.test(expr)) return null;
      const normalized = expr.replace(/\s+/g, "");
      if (!normalized) return null;
      const tokens = normalized.match(/(\d+(\.\d+)?)|[+\-*/]/g);
      if (!tokens || tokens.join("") !== normalized) return null;

      const values: number[] = [];
      const ops: string[] = [];
      const precedence = (op: string) => (op === "+" || op === "-" ? 1 : 2);
      const applyOp = () => {
        const op = ops.pop();
        const b = values.pop();
        const a = values.pop();
        if (!op || a === undefined || b === undefined) return false;
        if (op === "+") values.push(a + b);
        if (op === "-") values.push(a - b);
        if (op === "*") values.push(a * b);
        if (op === "/") {
          if (b === 0) return false;
          values.push(a / b);
        }
        return true;
      };

      for (const token of tokens) {
        if (/^\d+(\.\d+)?$/.test(token)) {
          values.push(parseFloat(token));
        } else {
          while (ops.length && precedence(ops[ops.length - 1]) >= precedence(token)) {
            if (!applyOp()) return null;
          }
          ops.push(token);
        }
      }

      while (ops.length) {
        if (!applyOp()) return null;
      }

      const result = values[0];
      if (typeof result === "number" && !isNaN(result) && isFinite(result)) {
        return result.toFixed(2);
      }
      return null;
    } catch {
      return null;
    }
  };

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
      subLedgerId: defaultSubLedgerId ? String(defaultSubLedgerId) : "",
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
  const watchDescription = form.watch("description");

  const getUsageMap = (key: string): Record<string, number> => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed ? parsed : {};
    } catch {
      return {};
    }
  };

  const bumpUsage = (key: string, id: string) => {
    if (!id) return;
    const map = getUsageMap(key);
    map[id] = (map[id] || 0) + 1;
    try {
      localStorage.setItem(key, JSON.stringify(map));
    } catch {}
  };

  useEffect(() => {
    if (watchAmount) {
      if (/[+\-*/]/.test(watchAmount)) {
        const result = evaluateExpression(watchAmount);
        setExpressionResult(result);
      } else {
        setExpressionResult(null);
      }
    } else {
      setExpressionResult(null);
    }
  }, [watchAmount]);

  const handleAmountBlur = () => {
    if (expressionResult) {
      form.setValue("amount", expressionResult, { shouldValidate: true });
      setExpressionResult(null);
    }
  };

  const isOperator = (char: string) => ["+", "-", "*", "/"].includes(char);

  const handleKeypadInput = (key: string) => {
    const current = form.getValues("amount") || "";

    if (key === "AC") {
      form.setValue("amount", "", { shouldValidate: true });
      setExpressionResult(null);
      return;
    }

    if (key === "⌫") {
      form.setValue("amount", current.slice(0, -1), { shouldValidate: true });
      return;
    }

    if (key === "=") {
      const result = evaluateExpression(current);
      if (result) {
        form.setValue("amount", result, { shouldValidate: true });
        setExpressionResult(null);
      }
      return;
    }

    if (isOperator(key)) {
      if (!current) return;
      const last = current[current.length - 1];
      if (isOperator(last)) {
        form.setValue("amount", `${current.slice(0, -1)}${key}`, { shouldValidate: true });
      } else {
        form.setValue("amount", `${current}${key}`, { shouldValidate: true });
      }
      return;
    }

    if (key === ".") {
      const parts = current.split(/[\+\-\*\/]/);
      const currentPart = parts[parts.length - 1] || "";
      if (currentPart.includes(".")) return;
      if (!current || isOperator(current[current.length - 1])) {
        form.setValue("amount", `${current}0.`, { shouldValidate: true });
      } else {
        form.setValue("amount", `${current}.`, { shouldValidate: true });
      }
      return;
    }

    form.setValue("amount", `${current}${key}`, { shouldValidate: true });
  };

  const selectedWallet = wallets.find((w) => String(w.id) === watchWalletId);
  const selectedToWallet = wallets.find((w) => String(w.id) === watchToWalletId);

  const needsCurrencyConversion = selectedWallet && watchCurrency !== selectedWallet.currency;
  const needsTransferConversion = activeTab === "transfer" && selectedWallet && selectedToWallet && selectedWallet.currency !== selectedToWallet.currency;

  const filteredCategories = categories.filter(
    (c) => c.type === (activeTab === "income" ? "income" : "expense")
  );

  const sortedWallets = useMemo(() => {
    const usage = getUsageMap("tx_wallet_usage");
    return [...wallets].sort((a, b) => (usage[String(b.id)] || 0) - (usage[String(a.id)] || 0));
  }, [wallets]);

  const sortedFilteredCategories = useMemo(() => {
    const usage = getUsageMap("tx_category_usage");
    return [...filteredCategories].sort(
      (a, b) => (usage[String(b.id)] || 0) - (usage[String(a.id)] || 0)
    );
  }, [filteredCategories]);

  const [categoryLocked, setCategoryLocked] = useState(false);
  const learnedMapRef = useRef<Record<string, { type: TransactionType; name: string }>>(
    (() => {
      try {
        const raw = localStorage.getItem("tx_category_learn_map");
        return raw ? JSON.parse(raw) : {};
      } catch {
        return {};
      }
    })()
  );
  const saveLearnMap = (m: Record<string, { type: TransactionType; name: string }>) => {
    try {
      localStorage.setItem("tx_category_learn_map", JSON.stringify(m));
    } catch {}
  };
  const findCategoryIdByName = (name: string, type: TransactionType): string | null => {
    const list = categories.filter(c => c.type === (type === "income" ? "income" : "expense"));
    const match = list.find(c => c.name === name);
    return match ? String(match.id) : null;
  };
  const suggestCategoryFromText = (text: string, type: TransactionType): string | null => {
    if (!text || type === "transfer") return null;
    const lower = text.toLowerCase();
    const learnedKeys = Object.keys(learnedMapRef.current || {});
    for (const k of learnedKeys) {
      const v = learnedMapRef.current[k];
      if (v && v.type === type && lower.includes(k.toLowerCase())) {
        const id = findCategoryIdByName(v.name, type);
        if (id) return id;
      }
    }
    const expenseRules: Array<{ re: RegExp; name: string }> = [
      { re: /(麦当劳|mcdonald|肯德基|kfc|星巴克|starbucks|必胜客|pizza|外卖|美团|饿了么|奶茶|咖啡|餐厅|饭店|burger\s*king|汉堡王)/i, name: "餐饮" },
      { re: /(淘宝|天猫|京东|jd|拼多多|pdd|shopee|lazada|闲鱼|当当|购物|超市|mall|沃尔玛|walmart|carrefour|家乐福)/i, name: "购物" },
      { re: /(打车|出租|滴滴|didi|uber|grab|公交|地铁|火车|高铁|航空|机票|停车|加油|油费|tng|touch\s*n\s*go|etc|过路费)/i, name: "交通" },
      { re: /(房租|租金|水费|电费|煤气|燃气|网费|宽带|物业|维修|装修)/i, name: "住房" },
      { re: /(游戏|steam|nintendo|playstation|netflix|spotify|电影|影院|ktv|酒吧|夜店|娱乐|腾讯视频|爱奇艺|优酷)/i, name: "娱乐" },
      { re: /(医院|药房|pharmacy|挂号|体检|牙科|dental|医保|药品|drug|health)/i, name: "医疗" },
      { re: /(学费|培训|课程|书籍|教材|考试|辅导|网课|udemy|coursera|edx)/i, name: "教育" },
      { re: /(礼物|礼品|gift|纪念|生日|节日|红包)/i, name: "礼物" },
    ];
    const incomeRules: Array<{ re: RegExp; name: string }> = [
      { re: /(工资|薪资|salary|payroll|paycheck|发薪)/i, name: "工资" },
      { re: /(奖金|提成|bonus|分红|佣金|reward)/i, name: "奖金" },
      { re: /(投资|收益|股息|dividend|利息|interest|理财|基金|回款|返利)/i, name: "投资" },
    ];
    const rules = type === "income" ? incomeRules : expenseRules;
    for (const r of rules) {
      if (r.re.test(text)) {
        const id = findCategoryIdByName(r.name, type);
        if (id) return id;
      }
    }
    return null;
  };

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
      setCategoryLocked(false);
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

  useEffect(() => {
    if (activeTab === "transfer") return;
    if (categoryLocked) return;
    const id = suggestCategoryFromText(watchDescription || "", activeTab);
    if (id) {
      const current = form.getValues("categoryId");
      if (!current) {
        form.setValue("categoryId", id, { shouldValidate: true });
      }
    }
  }, [watchDescription, activeTab, categoryLocked, filteredCategories]);

  const handleConvertedInputChange = (value: string) => {
    form.setValue("convertedAmount", value, { shouldValidate: false });
    const num = parseFloat(value);
    const amountStr = form.getValues("amount");
    const amount = parseFloat(amountStr);
    if (!isNaN(num) && num >= 0 && !isNaN(amount) && amount > 0) {
      const newRate = (num / amount).toFixed(4);
      form.setValue("exchangeRate", newRate, { shouldValidate: false });
      setConversionPref("byConverted");
      try { localStorage.setItem("tx_conversion_pref", "byConverted"); } catch {}
    }
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
      const desc = form.getValues("description") || "";
      const type = form.getValues("type");
      const catId = form.getValues("categoryId");
      const walletId = form.getValues("walletId");
      if (walletId) {
        bumpUsage("tx_wallet_usage", walletId);
      }
      if (catId && type !== "transfer") {
        bumpUsage("tx_category_usage", catId);
      }
      if (desc && catId && type !== "transfer") {
        const cat = categories.find(c => String(c.id) === catId);
        if (cat) {
          const tokens: string[] = [];
          const cn = Array.from(desc.match(/[\u4e00-\u9fa5]{2,}/g) || []);
          const en = Array.from(desc.match(/[A-Za-z0-9][A-Za-z0-9&\-\s]{2,}/g) || []);
          for (const t of [...cn, ...en]) {
            const key = t.trim().toLowerCase();
            if (key.length >= 2 && !tokens.includes(key)) tokens.push(key);
            if (tokens.length >= 3) break;
          }
          let map = learnedMapRef.current || {};
          for (const tk of tokens) {
            map[tk] = { type: type, name: cat.name };
          }
          learnedMapRef.current = map;
          saveLearnMap(map);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      toast({
        title: isEditing ? "更新成功" : "记录成功",
        description: isEditing ? "交易已成功更新" : "交易已成功添加",
      });
      onOpenChange(false);
      form.reset();
      setActiveTab("expense");
      setCategoryLocked(false);
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
    
    // Ensure amount is evaluated before submitting if there's an expression
    if (expressionResult) {
      data.amount = expressionResult;
    }
    
    mutation.mutate(data);
  };

  const typeLabels = {
    expense: "支出",
    income: "收入",
    transfer: "转账",
  };

  const currencyInfo = getCurrencyInfo(watchCurrency);
  const walletCurrencyInfo = selectedWallet ? getCurrencyInfo(selectedWallet.currency) : null;

  const parseAmountFromText = (text: string) => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const keywordRegex = /(合计|总计|小计|应付|应收|金额|Total|TOTAL|Amount|AMT|Grand\s*Total|Balance\s*Due|Subtotal|Total\s*Due|付款金额)/i;
    const numberRegex = /(?:RM|MYR|RMB|CNY|SGD|USD|EUR|GBP|¥|￥|€|£|\$|S\$)?\s*([0-9]{1,3}(?:[,\s][0-9]{3})*(?:\.[0-9]{1,3})|[0-9]+(?:\.[0-9]{1,3})?)/g;
    const normalizeToken = (s: string) => s.replace(/[,\s]/g, "").replace(/[Oo]/g, "0").replace(/S/g, "5").replace(/[Il]/g, "1");
    let candidate = 0;
    for (const line of lines) {
      if (keywordRegex.test(line)) {
        const nums = Array.from(line.matchAll(numberRegex)).map((m) => normalizeToken(m[1]));
        for (const n of nums) {
          const val = parseFloat(n);
          if (!isNaN(val) && val > candidate) candidate = val;
        }
      }
    }
    if (candidate > 0) return candidate;
    const allNums = Array.from(text.matchAll(numberRegex)).map((m) => normalizeToken(m[1]));
    for (const n of allNums) {
      const val = parseFloat(n);
      if (!isNaN(val) && val > candidate) candidate = val;
    }
    return candidate > 0 ? candidate : null;
  };

  const parseDateFromText = (text: string) => {
    const chinese = text.match(/([12]\d{3})年(\d{1,2})月(\d{1,2})日/);
    if (chinese) {
      const y = parseInt(chinese[1], 10);
      const m = parseInt(chinese[2], 10);
      const d = parseInt(chinese[3], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m - 1, d);
    }
    const iso = text.match(/([12]\d{3})[-\/\.](\d{1,2})[-\/\.](\d{1,2})/);
    if (iso) {
      const y = parseInt(iso[1], 10);
      const m = parseInt(iso[2], 10);
      const d = parseInt(iso[3], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m - 1, d);
    }
    const us = text.match(/\b(\d{1,2})[-\/\.](\d{1,2})[-\/\.]([12]\d{3})\b/);
    if (us) {
      const m = parseInt(us[1], 10);
      const d = parseInt(us[2], 10);
      const y = parseInt(us[3], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m - 1, d);
    }
    return null;
  };
  const detectCurrencyCodeFromText = (text: string, fallback: string) => {
    const t = text.toUpperCase();
    if (/\bMYR\b/.test(t) || /\bRM\b/.test(t)) return "MYR";
    if (/S\$/.test(text) || /\bSGD\b/.test(t)) return "SGD";
    if (/\bUSD\b/.test(t) || /\$\s*[0-9]/.test(text)) return "USD";
    if (/[¥￥]/.test(text) || /\bRMB\b/.test(t) || /\bCNY\b/.test(t)) return "CNY";
    if (/€/.test(text) || /\bEUR\b/.test(t)) return "EUR";
    if (/£/.test(text) || /\bGBP\b/.test(t)) return "GBP";
    const codes = new Set(supportedCurrencies.map(c => c.code));
    for (const c of codes) {
      if (new RegExp(`\\b${c}\\b`, "i").test(text)) return c;
    }
    return fallback || null;
  };

  const handleOcrClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsOcrLoading(true);
    try {
      const worker = await Tesseract.createWorker({
        workerPath: workerUrl,
        corePath: coreUrl,
        langPath: "https://tessdata.projectnaptha.com/4.0.0",
        workerBlobURL: false,
        logger: () => {},
      });
      await worker.loadLanguage("eng");
      await worker.loadLanguage("chi_sim");
      await worker.initialize("eng+chi_sim");
      await worker.setParameters({
        tessedit_char_whitelist: "0123456789.,RM MYR USD $ ¥ ￥ RMB CNY SGD EUR € GBP £",
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
      });
      const { data } = await worker.recognize(file);
      await worker.terminate();
      const text = data.text || "";
      const amt = parseAmountFromText(text);
      const dt = parseDateFromText(text);
      const cur = detectCurrencyCodeFromText(text, form.getValues("currency"));
      let updated = false;
      const changes: string[] = [];
      if (amt && amt > 0) {
        form.setValue("amount", amt.toFixed(2), { shouldValidate: true });
        updated = true;
        changes.push("金额");
      }
      if (dt) {
        form.setValue("date", dt, { shouldValidate: true });
        updated = true;
        changes.push("日期");
      }
      if (cur && cur !== form.getValues("currency")) {
        form.setValue("currency", cur, { shouldValidate: true });
        updated = true;
        changes.push("币种");
      }
      if (activeTab !== "transfer" && !categoryLocked) {
        const id = suggestCategoryFromText(text, activeTab);
        if (id) {
          const current = form.getValues("categoryId");
          if (!current) {
            form.setValue("categoryId", id, { shouldValidate: true });
            updated = true;
            changes.push("分类");
          }
        }
      }
      if (updated) {
        toast({ title: "识别成功", description: `已自动填充${changes.join("、")}` });
      } else {
        toast({ title: "未识别到有效信息", description: "请尝试更清晰的票据照片", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "识别失败", description: err?.message || "请稍后重试", variant: "destructive" });
    } finally {
      setIsOcrLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden flex flex-col h-[90vh] sm:h-auto [&>button]:top-4 [&>button]:right-4 [&>button]:h-8 [&>button]:w-8" data-testid="modal-transaction" aria-describedby={undefined}>
        <DialogHeader className="px-4 pr-16 py-3.5 border-b border-border/50 shrink-0 min-h-14">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold">
              {isEditing ? "编辑交易" : "记一笔"}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelected}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleOcrClick}
                disabled={isOcrLoading}
                className="h-8 text-primary mr-2"
                data-testid="button-ocr-receipt"
              >
                {isOcrLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Scan className="mr-2 h-4 w-4" />}
                <span className="hidden sm:inline">智能识别</span>
                <span className="sm:hidden">识别</span>
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              setActiveTab(v as TransactionType);
              form.setValue("type", v as TransactionType);
            }}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-3 bg-muted/50 p-1" data-testid="tabs-transaction-type">
              <TabsTrigger value="expense" className="rounded-md data-[state=active]:bg-expense data-[state=active]:text-expense-foreground" data-testid="tab-expense">
                支出
              </TabsTrigger>
              <TabsTrigger value="income" className="rounded-md data-[state=active]:bg-income data-[state=active]:text-income-foreground" data-testid="tab-income">
                收入
              </TabsTrigger>
              <TabsTrigger value="transfer" className="rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" data-testid="tab-transfer">
                转账
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Form {...form}>
            <form id="transaction-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              
              {/* 金额巨大化显示区 */}
              <div className="flex flex-col items-center justify-center py-4 sm:py-3 bg-muted/30 rounded-2xl border border-border/50">
                
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem className="w-full px-4 sm:px-6">
                      <FormControl>
                        <div className="relative flex items-center justify-center gap-2 sm:gap-4 w-full">
                          <FormField
                            control={form.control}
                            name="currency"
                            render={({ field: currencyField }) => (
                              <Select onValueChange={currencyField.onChange} value={currencyField.value}>
                                <FormControl>
                                  <SelectTrigger 
                                    className="h-auto p-0 w-auto border-0 bg-transparent shadow-none focus:ring-0 hover:bg-transparent font-mono [&>svg]:hidden"
                                    style={{ display: 'flex', alignItems: 'center', flexDirection: 'row', gap: '4px' }}
                                  >
                                    <span className="flex flex-row items-center gap-2 leading-none whitespace-nowrap">
                                      <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
                                      <span className="text-3xl sm:text-4xl font-semibold leading-none">
                                        {currencyInfo.symbol}
                                      </span>
                                    </span>
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {supportedCurrencies.map((currency) => (
                                    <SelectItem key={currency.code} value={currency.code}>
                                      {getCurrencyInfo(currency.code).symbol} {currency.name} ({currency.code})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                          <Input
                            {...field}
                            type="text"
                            inputMode={isMobile ? "none" : "decimal"}
                            readOnly={isMobile}
                            placeholder="0.00"
                            onBlur={(e) => {
                              field.onBlur();
                              handleAmountBlur();
                            }}
                            className="h-16 sm:h-24 font-bold font-mono text-center border-none bg-transparent shadow-none focus-visible:ring-0 px-0 max-w-[340px] sm:max-w-[560px]"
                            style={{ 
                              fontSize: isMobile ? '56px' : '80px',
                              lineHeight: '1',
                              height: isMobile ? '64px' : '90px'
                            }}
                            data-testid="input-amount"
                          />
                        </div>
                      </FormControl>
                      {expressionResult && (
                        <div className="text-center text-sm font-mono text-primary animate-in fade-in slide-in-from-top-1 mt-1">
                          = {expressionResult}
                        </div>
                      )}
                      <FormMessage className="text-center mt-2" />
                    </FormItem>
                  )}
                />
              </div>

              {isMobile && (
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "AC", value: "AC", className: "bg-muted text-muted-foreground" },
                    { label: "⌫", value: "⌫", className: "bg-muted text-muted-foreground" },
                    { label: "÷", value: "/", className: "bg-primary/20 text-primary" },
                    { label: "×", value: "*", className: "bg-primary/20 text-primary" },
                    { label: "7", value: "7", className: "bg-white/5 text-foreground" },
                    { label: "8", value: "8", className: "bg-white/5 text-foreground" },
                    { label: "9", value: "9", className: "bg-white/5 text-foreground" },
                    { label: "-", value: "-", className: "bg-primary/20 text-primary" },
                    { label: "4", value: "4", className: "bg-white/5 text-foreground" },
                    { label: "5", value: "5", className: "bg-white/5 text-foreground" },
                    { label: "6", value: "6", className: "bg-white/5 text-foreground" },
                    { label: "+", value: "+", className: "bg-primary/20 text-primary" },
                    { label: "1", value: "1", className: "bg-white/5 text-foreground" },
                    { label: "2", value: "2", className: "bg-white/5 text-foreground" },
                    { label: "3", value: "3", className: "bg-white/5 text-foreground" },
                    { label: "=", value: "=", className: "bg-primary text-primary-foreground" },
                    { label: "0", value: "0", className: "bg-white/5 text-foreground col-span-2" },
                    { label: ".", value: ".", className: "bg-white/5 text-foreground" },
                  ].map((key) => (
                    <Button
                      key={`${key.label}-${key.value}`}
                      type="button"
                      variant="ghost"
                      className={`h-12 rounded-xl text-lg font-semibold ${key.className}`}
                      onClick={() => handleKeypadInput(key.value)}
                    >
                      {key.label}
                    </Button>
                  ))}
                </div>
              )}

              {/* 汇率转换区 (仅当币种不同时显示) */}
              {needsCurrencyConversion && (
                <div className="p-3 bg-muted/50 rounded-xl space-y-3 border border-border/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <ArrowRightLeft className="h-4 w-4" />
                      <span>{watchCurrency} → {selectedWallet?.currency}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => selectedWallet && fetchExchangeRate(watchCurrency, selectedWallet.currency)}
                      disabled={isLoadingRate}
                      className="h-7 px-2"
                    >
                      <RefreshCw className={`h-3 w-3 ${isLoadingRate ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="exchangeRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">汇率</FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={field.value || ""}
                              onChange={(e) => handleRateInputChange(e.target.value)}
                              onBlur={(e) => handleRateInputBlur(e.target.value)}
                              className="font-mono h-9 text-sm"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormItem>
                      <FormLabel className="text-xs">折合 ({selectedWallet?.currency})</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={watchConvertedAmount || ""}
                          onChange={(e) => handleConvertedInputChange(e.target.value)}
                          onBlur={(e) => handleConvertedInputBlur(e.target.value)}
                          className="font-mono h-9 text-sm"
                        />
                      </FormControl>
                    </FormItem>
                  </div>
                </div>
              )}

              {/* 账户和分类区 */}
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="walletId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground uppercase tracking-wider">
                        {activeTab === "transfer" ? "转出账户" : "支付账户"}
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-12 w-full bg-transparent border-0 border-b border-border/50 rounded-none px-0 focus:ring-0 focus:ring-offset-0 shadow-none focus:border-primary transition-colors data-[placeholder]:text-muted-foreground outline-none ring-0 ring-offset-0">
                            <SelectValue placeholder="选择钱包" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-popover border-border/50">
                          {sortedWallets.map((wallet) => (
                            <SelectItem 
                              key={wallet.id} 
                              value={String(wallet.id)}
                              className="focus:bg-white/10 focus:text-white cursor-pointer"
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

                {activeTab === "transfer" ? (
                  <>
                    <FormField
                      control={form.control}
                      name="toWalletId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground uppercase tracking-wider">转入账户</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-12 w-full bg-transparent border-0 border-b border-border/50 rounded-none px-0 focus:ring-0 focus:ring-offset-0 shadow-none focus:border-primary transition-colors data-[placeholder]:text-muted-foreground outline-none ring-0 ring-offset-0">
                                <SelectValue placeholder="选择转入钱包" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-popover border-border/50">
                              {sortedWallets
                                .filter((w) => String(w.id) !== form.watch("walletId"))
                                .map((wallet) => (
                                  <SelectItem 
                                    key={wallet.id} 
                                    value={String(wallet.id)}
                                    className="focus:bg-white/10 focus:text-white cursor-pointer"
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
                      <FormField
                        control={form.control}
                        name="toWalletAmount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground uppercase tracking-wider">实际到账金额 ({selectedToWallet?.currency})</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="number"
                                step="0.01"
                                className="h-12 font-mono bg-white/5 border-border/50"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </>
                ) : (
                  <FormField
                    control={form.control}
                    name="categoryId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground uppercase tracking-wider">交易分类</FormLabel>
                        <div className="flex overflow-x-auto pb-2 -mx-4 px-4 snap-x hide-scrollbar gap-2 md:hidden">
                          {sortedFilteredCategories.map((category) => (
                            <button
                              key={category.id}
                              type="button"
                              onClick={() => {
                                setCategoryLocked(true);
                                field.onChange(String(category.id));
                              }}
                              className={`
                                shrink-0 snap-start px-4 py-2 rounded-full text-sm font-medium transition-colors border
                                ${field.value === String(category.id) 
                                  ? activeTab === 'expense' 
                                    ? 'bg-expense/20 border-expense text-expense' 
                                    : 'bg-income/20 border-income text-income'
                                  : 'bg-white/5 border-transparent text-muted-foreground hover:bg-white/10'}
                              `}
                            >
                              {category.name}
                            </button>
                          ))}
                        </div>
                        <div className="hidden md:flex md:flex-wrap gap-2">
                          {sortedFilteredCategories.map((category) => (
                            <button
                              key={`desktop-${category.id}`}
                              type="button"
                              onClick={() => {
                                setCategoryLocked(true);
                                field.onChange(String(category.id));
                              }}
                              className={`
                                px-4 py-2 rounded-full text-sm font-medium transition-colors border
                                ${field.value === String(category.id) 
                                  ? activeTab === 'expense' 
                                    ? 'bg-expense/20 border-expense text-expense' 
                                    : 'bg-income/20 border-income text-income'
                                  : 'bg-white/5 border-transparent text-muted-foreground hover:bg-white/10'}
                              `}
                            >
                              {category.name}
                            </button>
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              {/* 附加信息区 (日期、备注、子账本) */}
              <div className="space-y-4 pt-2 border-t border-border/50">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel className="text-xs text-muted-foreground uppercase tracking-wider">日期</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className="w-full justify-start text-left font-normal bg-white/5 border-border/50 h-10"
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value ? format(field.value, "MM/dd/yyyy") : "选择日期"}
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

                  {subLedgers.length > 0 && (
                    <FormField
                      control={form.control}
                      name="subLedgerId"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel className="text-xs text-muted-foreground uppercase tracking-wider">子账本</FormLabel>
                          <Select onValueChange={(value) => field.onChange(value === "none" ? "" : value)} value={field.value || "none"}>
                            <FormControl>
                              <SelectTrigger className="bg-white/5 border-border/50 h-10">
                                <SelectValue placeholder="无关联" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">无关联</SelectItem>
                              {subLedgers.filter(s => !s.isArchived).map((subLedger) => (
                                <SelectItem key={subLedger.id} value={String(subLedger.id)}>
                                  {subLedger.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground uppercase tracking-wider">备注</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="写点什么..."
                          className="bg-white/5 border-border/50 h-10"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

            </form>
          </Form>
        </div>
        
        {/* 底部固定操作栏 */}
        <div className="p-4 border-t border-border/50 bg-background shrink-0 mt-auto">
          <div className="flex gap-3">
            {isEditing && onDelete && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-12 w-12 shrink-0 text-destructive border-destructive/50 hover:bg-destructive/10"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-5 w-5" />
              </Button>
            )}
            <Button
              type="submit"
              form="transaction-form"
              className={`flex-1 h-12 text-base font-medium ${
                activeTab === 'expense' ? 'bg-expense hover:bg-expense/90 text-expense-foreground' : 
                activeTab === 'income' ? 'bg-income hover:bg-income/90 text-income-foreground' : ''
              }`}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  保存中...
                </>
              ) : (
                isEditing ? "保存修改" : `保存${typeLabels[activeTab]}`
              )}
            </Button>
          </div>
        </div>
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
