import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { supportedCurrencies, type Wallet } from "@shared/schema";
import { Loader2, Trash2 } from "lucide-react";
import { ArrowRightLeft } from "lucide-react";

const walletTypes = [
  { value: "cash", label: "现金" },
  { value: "bank_card", label: "银行卡" },
  { value: "digital_wallet", label: "数字钱包" },
  { value: "credit_card", label: "信用卡" },
  { value: "investment", label: "投资账户" },
];

const walletColors = [
  "#10B981", "#3B82F6", "#8B5CF6", "#EC4899", "#F59E0B",
  "#EF4444", "#06B6D4", "#22C55E", "#1677FF", "#07C160",
];

interface WalletFormData {
  name: string;
  type: string;
  currency: string;
  color: string;
  exchangeRateToDefault: string;
  isFlexible: boolean;
}

interface WalletModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallet?: Wallet | null;
  defaultCurrency?: string;
}

export function WalletModal({ open, onOpenChange, wallet, defaultCurrency = "MYR" }: WalletModalProps) {
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteWithTransactions, setDeleteWithTransactions] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [archiveAction, setArchiveAction] = useState<'transfer'|'destroy'>('transfer');
  const [archiveTargetId, setArchiveTargetId] = useState<string>("");
  const [archiveRate, setArchiveRate] = useState<string>("");
  const isEditing = !!wallet;
  const { data: allWallets = [] } = useQuery<Wallet[]>({ queryKey: ["/api/wallets"] });

  const form = useForm<WalletFormData>({
    defaultValues: {
      name: "",
      type: "cash",
      currency: defaultCurrency,
      color: "#3B82F6",
      exchangeRateToDefault: "1",
      isFlexible: true,
    },
  });

  const watchedCurrency = form.watch("currency");
  const showExchangeRate = watchedCurrency !== defaultCurrency;

  useEffect(() => {
    if (wallet) {
      form.reset({
        name: wallet.name,
        type: wallet.type || "cash",
        currency: wallet.currency || defaultCurrency,
        color: wallet.color || "#3B82F6",
        exchangeRateToDefault: wallet.exchangeRateToDefault || "1",
        isFlexible: wallet.isFlexible !== false,
      });
    } else {
      form.reset({
        name: "",
        type: "cash",
        currency: defaultCurrency,
        color: "#3B82F6",
        exchangeRateToDefault: "1",
        isFlexible: true,
      });
    }
  }, [wallet, defaultCurrency, form]);

  const createMutation = useMutation({
    mutationFn: async (data: WalletFormData) => {
      return apiRequest("POST", "/api/wallets", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      toast({ title: "钱包已创建" });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "创建失败",
        description: error.message || "请稍后重试",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: WalletFormData) => {
      return apiRequest("PATCH", `/api/wallets/${wallet!.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      toast({ title: "钱包已更新" });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "更新失败",
        description: error.message || "请稍后重试",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (withTransactions: boolean) => {
      const url = withTransactions 
        ? `/api/wallets/${wallet!.id}?deleteTransactions=true`
        : `/api/wallets/${wallet!.id}`;
      return apiRequest("DELETE", url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      toast({ title: "钱包已删除" });
      setShowDeleteDialog(false);
      setDeleteWithTransactions(false);
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "删除失败",
        description: error.message || "无法删除最后一个钱包",
        variant: "destructive",
      });
      setShowDeleteDialog(false);
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/wallets/${wallet!.id}`, { isDefault: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      toast({ title: "已设为默认钱包" });
    },
    onError: (error: any) => {
      toast({
        title: "设置失败",
        description: error.message || "请稍后重试",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: WalletFormData) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const archiveMutation = useMutation({
    mutationFn: async () => {
      if (!wallet) return Promise.resolve();
      const body: any = { action: archiveAction };
      if (archiveAction === 'transfer') {
        body.targetWalletId = parseInt(archiveTargetId);
        const target = allWallets.find((w)=>String(w.id)===archiveTargetId);
        if (target && (wallet.currency || defaultCurrency) !== (target.currency || defaultCurrency)) {
          body.rate = parseFloat(archiveRate);
        }
      }
      return apiRequest("POST", `/api/wallets/${wallet!.id}/archive`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      setShowArchiveDialog(false);
      onOpenChange(false);
      setArchiveAction('transfer');
      setArchiveTargetId("");
      setArchiveRate("");
      toast({ title: "钱包已归档" });
    },
    onError: (error: any) => {
      toast({ title: "归档失败", description: error.message || "请检查目标钱包与汇率", variant: "destructive" });
    }
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md" data-testid="modal-wallet" aria-describedby={undefined}>
          <DialogHeader className="pb-2">
            <DialogTitle>{isEditing ? "编辑钱包" : "新建钱包"}</DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <FormField
                control={form.control}
                name="name"
                rules={{ required: "请输入钱包名称" }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>名称</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="输入钱包名称"
                        {...field}
                        data-testid="input-wallet-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>类型</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-wallet-type">
                          <SelectValue placeholder="选择类型" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {walletTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>货币</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-wallet-currency">
                          <SelectValue placeholder="选择货币" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {supportedCurrencies.map((currency) => (
                          <SelectItem key={currency.code} value={currency.code}>
                            {currency.symbol} {currency.code} - {currency.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {showExchangeRate && (
                <FormField
                  control={form.control}
                  name="exchangeRateToDefault"
                  rules={{ 
                    required: "请输入汇率",
                    validate: (value) => {
                      const rate = parseFloat(value);
                      if (isNaN(rate) || rate <= 0) {
                        return "汇率必须为正数";
                      }
                      return true;
                    }
                  }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        汇率 (1 {watchedCurrency} = ? {defaultCurrency})
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.0001"
                          min="0.0001"
                          placeholder="输入汇率"
                          {...field}
                          data-testid="input-exchange-rate"
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        用于计算总资产时转换为默认货币
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>颜色</FormLabel>
                    <div className="flex flex-wrap gap-2">
                      {walletColors.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`w-8 h-8 rounded-full border-2 transition-all ${
                            field.value === color
                              ? "border-foreground scale-110"
                              : "border-transparent"
                          }`}
                          style={{ backgroundColor: color }}
                          onClick={() => field.onChange(color)}
                          data-testid={`button-color-${color.replace("#", "")}`}
                        />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isFlexible"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm font-medium">可灵活调用资金</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        非长期储蓄或应急储蓄，可随时使用
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-flexible"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="flex gap-2 pt-3">
                {isEditing && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-11 w-11 shrink-0 text-destructive border-destructive/50 hover:bg-destructive/10"
                      onClick={() => setShowDeleteDialog(true)}
                      disabled={wallet?.isDefault === true}
                      data-testid="button-delete-wallet"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11"
                      onClick={() => setShowArchiveDialog(true)}
                      disabled={wallet?.isDefault === true}
                    >
                      归档
                    </Button>
                    {!wallet?.isDefault && (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11"
                        onClick={() => setDefaultMutation.mutate()}
                        disabled={setDefaultMutation.isPending}
                        data-testid="button-set-default"
                      >
                        设为默认
                      </Button>
                    )}
                  </>
                )}
                <Button
                  type="submit"
                  className="flex-1 h-11"
                  disabled={isPending}
                  data-testid="button-submit-wallet"
                >
                  {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {isEditing ? "保存" : "创建"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={(open) => {
          setShowDeleteDialog(open);
          if (!open) setDeleteWithTransactions(false);
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除钱包</AlertDialogTitle>
            <AlertDialogDescription>
              请选择删除方式：
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <RadioGroup
            value={deleteWithTransactions ? "with-transactions" : "wallet-only"}
            onValueChange={(value) => setDeleteWithTransactions(value === "with-transactions")}
            className="space-y-3 py-2"
          >
            <div 
              className="flex items-start gap-3 p-3 rounded-lg hover-elevate cursor-pointer"
              onClick={() => setDeleteWithTransactions(false)}
              data-testid="option-delete-wallet-only"
            >
              <RadioGroupItem value="wallet-only" id="wallet-only" className="mt-0.5" />
              <div className="flex-1">
                <Label htmlFor="wallet-only" className="text-sm font-medium cursor-pointer">
                  仅删除钱包
                </Label>
                <p className="text-xs text-muted-foreground">
                  保留该钱包的所有交易记录，交易将不再关联任何钱包。
                </p>
              </div>
            </div>
            
            <div 
              className="flex items-start gap-3 p-3 rounded-lg hover-elevate cursor-pointer"
              onClick={() => setDeleteWithTransactions(true)}
              data-testid="option-delete-with-transactions"
            >
              <RadioGroupItem value="with-transactions" id="with-transactions" className="mt-0.5" />
              <div className="flex-1">
                <Label htmlFor="with-transactions" className="text-sm font-medium cursor-pointer text-destructive">
                  删除钱包及所有交易
                </Label>
                <p className="text-xs text-muted-foreground">
                  同时删除该钱包的所有交易记录，此操作无法撤销。
                </p>
              </div>
            </div>
          </RadioGroup>

          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(deleteWithTransactions)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "确认删除"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>归档钱包</AlertDialogTitle>
            <AlertDialogDescription>归档后该钱包将从列表隐藏。当前余额：{wallet ? parseFloat(wallet.balance || '0').toFixed(2) : '0.00'} {wallet?.currency}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <RadioGroup value={archiveAction} onValueChange={(v:any)=>setArchiveAction(v)} className="space-y-2">
              <div className="flex items-start gap-3 p-3 rounded-lg hover-elevate cursor-pointer" onClick={()=>setArchiveAction('transfer')}>
                <RadioGroupItem value="transfer" id="archive-transfer" className="mt-0.5" />
                <div className="flex-1">
                  <Label htmlFor="archive-transfer" className="text-sm font-medium cursor-pointer flex items-center gap-1"><ArrowRightLeft className="w-3.5 h-3.5"/>转入其他钱包</Label>
                  <div className="mt-2 space-y-2">
                    <Select value={archiveTargetId} onValueChange={setArchiveTargetId}>
                      <SelectTrigger>
                        <SelectValue placeholder="选择目标钱包" />
                      </SelectTrigger>
                      <SelectContent>
                        {allWallets.filter(w=> (!wallet || w.id !== wallet.id)).map((w)=> (
                          <SelectItem key={w.id} value={String(w.id)}>
                            {w.name} ({w.currency})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(() => {
                      const target = allWallets.find((w)=>String(w.id)===archiveTargetId);
                      return wallet && target && wallet.currency !== target.currency;
                    })() && (
                      <Input placeholder="跨币种汇率（源→目标）" value={archiveRate} onChange={(e)=>setArchiveRate(e.target.value)} />
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg hover-elevate cursor-pointer" onClick={()=>setArchiveAction('destroy')}>
                <RadioGroupItem value="destroy" id="archive-destroy" className="mt-0.5" />
                <div className="flex-1">
                  <Label htmlFor="archive-destroy" className="text-sm font-medium cursor-pointer text-destructive">销毁余额</Label>
                  <p className="text-xs text-muted-foreground">将余额清零，不生成交易记录</p>
                </div>
              </div>
            </RadioGroup>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={()=>archiveMutation.mutate()}>{archiveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> : '确认归档'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
