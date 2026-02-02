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
import { CalendarIcon, Loader2, ArrowRightLeft, RefreshCw, Trash2, BookOpen, Scan } from "lucide-react";
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
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
  const watchDescription = form.watch("description");

  const selectedWallet = wallets.find((w) => String(w.id) === watchWalletId);
  const selectedToWallet = wallets.find((w) => String(w.id) === watchToWalletId);

  const needsCurrencyConversion = selectedWallet && watchCurrency !== selectedWallet.currency;
  const needsTransferConversion = activeTab === "transfer" && selectedWallet && selectedToWallet && selectedWallet.currency !== selectedToWallet.currency;

  const filteredCategories = categories.filter(
    (c) => c.type === (activeTab === "income" ? "income" : "expense")
  );

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

            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground"></div>
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
                  variant="outline"
                  size="sm"
                  onClick={handleOcrClick}
                  disabled={isOcrLoading}
                  className="h-8"
                  data-testid="button-ocr-receipt"
                >
                  {isOcrLoading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Scan className="mr-2 h-3.5 w-3.5" />}
                  识别票据
                </Button>
              </div>
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
                    <Select onValueChange={(v) => { setCategoryLocked(true); field.onChange(v); }} value={field.value}>
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
