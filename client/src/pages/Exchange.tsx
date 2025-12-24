import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PageContainer } from "@/components/PageContainer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  ArrowUpDown, 
  ArrowLeft,
  Key, 
  Plus, 
  RefreshCw, 
  Trash2, 
  Shield,
  TrendingUp, 
  Coins,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Edit,
} from "lucide-react";

interface ExchangeCredential {
  id: number;
  exchange: string;
  label: string;
  manualBalance?: string;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  apiKeyPreview: string;
}

interface BalanceItem {
  asset: string;
  free: string;
  locked: string;
  frozen?: string;
  total?: string;
  usdtValue?: string;
  price?: string;
  accountType?: string;
}

interface BalancesResponse {
  balances: BalanceItem[];
  apiTotalValue: string;
  manualBalance: string;
  totalUsdtValue: string;
  lastSyncAt: string;
}

type ExchangeType = 'mexc' | 'pionex';

const exchangeInfo: Record<ExchangeType, { name: string; description: string; placeholder: string; manualNote: string }> = {
  mexc: {
    name: 'MEXC',
    description: '请输入您的MEXC API Key和Secret以查看账户余额。请确保API权限仅包含"读取"，不要开启"交易"权限。',
    placeholder: 'mx0v...',
    manualNote: 'API无法获取的账户余额（理财、DEX+、跟单、交易机器人、Alpha、法币等）',
  },
  pionex: {
    name: '派网 (Pionex)',
    description: '请输入您的派网API Key和Secret以查看账户余额。请确保API权限仅包含"读取"，不要开启"交易"权限。',
    placeholder: 'api...',
    manualNote: 'API仅能获取交易账户余额，机器人和理财账户需手动录入',
  },
};

export default function Exchange() {
  const { toast } = useToast();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedExchange, setSelectedExchange] = useState<ExchangeType>('mexc');
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [label, setLabel] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [manualBalanceInput, setManualBalanceInput] = useState("");
  const [editingManualBalanceId, setEditingManualBalanceId] = useState<number | null>(null);

  const { data: credentials = [], isLoading: isLoadingCredentials } = useQuery<ExchangeCredential[]>({
    queryKey: ["/api/exchange-credentials"],
  });

  const hasMexcCredential = credentials.some(c => c.exchange === 'mexc');
  const hasPionexCredential = credentials.some(c => c.exchange === 'pionex');

  const { data: mexcBalances, isLoading: isLoadingMexcBalances, refetch: refetchMexcBalances, error: mexcBalancesError } = useQuery<BalancesResponse>({
    queryKey: ["/api/mexc/balances"],
    enabled: hasMexcCredential,
    refetchInterval: 60000,
  });

  const { data: pionexBalances, isLoading: isLoadingPionexBalances, refetch: refetchPionexBalances, error: pionexBalancesError } = useQuery<BalancesResponse>({
    queryKey: ["/api/pionex/balances"],
    enabled: hasPionexCredential,
    refetchInterval: 60000,
  });

  const addCredentialMutation = useMutation({
    mutationFn: async (data: { exchange: string; apiKey: string; apiSecret: string; label: string }) => {
      const res = await apiRequest("POST", "/api/exchange-credentials", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "API凭证已保存", description: "正在获取账户信息..." });
      setIsAddModalOpen(false);
      setApiKey("");
      setApiSecret("");
      setLabel("");
      setSelectedExchange('mexc');
      queryClient.invalidateQueries({ queryKey: ["/api/exchange-credentials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mexc/balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pionex/balances"] });
    },
    onError: (error: any) => {
      toast({ 
        title: "保存失败", 
        description: error.message || "请检查API凭证是否正确",
        variant: "destructive",
      });
    },
  });

  const deleteCredentialMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/exchange-credentials/${id}`);
    },
    onSuccess: () => {
      toast({ title: "已删除API凭证" });
      queryClient.invalidateQueries({ queryKey: ["/api/exchange-credentials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mexc/balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pionex/balances"] });
    },
    onError: () => {
      toast({ title: "删除失败", variant: "destructive" });
    },
  });

  const updateManualBalanceMutation = useMutation({
    mutationFn: async ({ id, manualBalance }: { id: number; manualBalance: string }) => {
      const res = await apiRequest("PATCH", `/api/exchange-credentials/${id}/manual-balance`, { manualBalance });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "其他账户余额已更新" });
      setEditingManualBalanceId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/exchange-credentials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mexc/balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pionex/balances"] });
    },
    onError: () => {
      toast({ title: "更新失败", variant: "destructive" });
    },
  });

  const handleAddCredential = () => {
    if (!apiKey.trim() || !apiSecret.trim()) {
      toast({ title: "请填写API Key和Secret", variant: "destructive" });
      return;
    }
    const defaultLabel = selectedExchange === 'pionex' ? '派网账户' : 'MEXC账户';
    addCredentialMutation.mutate({
      exchange: selectedExchange,
      apiKey: apiKey.trim(),
      apiSecret: apiSecret.trim(),
      label: label.trim() || defaultLabel,
    });
  };

  const getExchangeName = (exchange: string) => {
    if (exchange === 'pionex') return '派网';
    if (exchange === 'mexc') return 'MEXC';
    return exchange.toUpperCase();
  };

  const getBalancesForExchange = (exchange: string) => {
    if (exchange === 'pionex') return pionexBalances;
    if (exchange === 'mexc') return mexcBalances;
    return null;
  };

  const getLoadingForExchange = (exchange: string) => {
    if (exchange === 'pionex') return isLoadingPionexBalances;
    if (exchange === 'mexc') return isLoadingMexcBalances;
    return false;
  };

  const getErrorForExchange = (exchange: string) => {
    if (exchange === 'pionex') return pionexBalancesError;
    if (exchange === 'mexc') return mexcBalancesError;
    return null;
  };

  const getRefetchForExchange = (exchange: string) => {
    if (exchange === 'pionex') return refetchPionexBalances;
    if (exchange === 'mexc') return refetchMexcBalances;
    return () => {};
  };

  const calculateGrandTotal = () => {
    let total = 0;
    if (mexcBalances) total += parseFloat(mexcBalances.totalUsdtValue || '0');
    if (pionexBalances) total += parseFloat(pionexBalances.totalUsdtValue || '0');
    return total;
  };

  const formatCurrency = (value: string | number, decimals = 2) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '0.00';
    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatCrypto = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '0';
    if (num === 0) return '0';
    if (num < 0.00001) return num.toExponential(4);
    if (num < 1) return num.toFixed(8);
    if (num < 1000) return num.toFixed(4);
    return formatCurrency(num, 2);
  };

  return (
    <PageContainer>
      <div className="space-y-4 md:space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
          </Link>
          <h1 className="text-2xl font-semibold flex items-center gap-2 text-white">
            <ArrowUpDown className="w-6 h-6 text-neon-purple" />
            交易所账户
          </h1>
          <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-exchange" className="ml-auto">
                <Plus className="w-4 h-4 mr-1" />
                连接交易所
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Key className="w-5 h-5" />
                连接{exchangeInfo[selectedExchange].name}
              </DialogTitle>
              <DialogDescription>
                {exchangeInfo[selectedExchange].description}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>选择交易所</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={selectedExchange === 'mexc' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedExchange('mexc')}
                    disabled={hasMexcCredential}
                    data-testid="button-select-mexc"
                  >
                    MEXC {hasMexcCredential && '(已连接)'}
                  </Button>
                  <Button
                    type="button"
                    variant={selectedExchange === 'pionex' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedExchange('pionex')}
                    disabled={hasPionexCredential}
                    data-testid="button-select-pionex"
                  >
                    派网 {hasPionexCredential && '(已连接)'}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="label">账户标签 (可选)</Label>
                <Input
                  id="label"
                  placeholder={`我的${exchangeInfo[selectedExchange].name}账户`}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  data-testid="input-exchange-label"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  placeholder={exchangeInfo[selectedExchange].placeholder}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  data-testid="input-api-key"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="apiSecret">API Secret</Label>
                <div className="relative">
                  <Input
                    id="apiSecret"
                    type={showSecret ? "text" : "password"}
                    placeholder="输入API Secret"
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    className="pr-10"
                    data-testid="input-api-secret"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowSecret(!showSecret)}
                    data-testid="button-toggle-secret"
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <div className="bg-muted p-3 rounded-md flex items-start gap-2">
                <Shield className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
                <p className="text-xs text-muted-foreground">
                  您的API凭证将被加密存储，只用于读取账户余额。
                  建议创建仅具有"读取"权限的API Key。
                </p>
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setIsAddModalOpen(false)}
                  data-testid="button-cancel-add"
                >
                  取消
                </Button>
                <Button
                  onClick={handleAddCredential}
                  disabled={addCredentialMutation.isPending || (selectedExchange === 'mexc' && hasMexcCredential) || (selectedExchange === 'pionex' && hasPionexCredential)}
                  data-testid="button-save-exchange"
                >
                  {addCredentialMutation.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                      验证中...
                    </>
                  ) : (
                    "保存并验证"
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoadingCredentials ? (
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      ) : credentials.length === 0 ? (
        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <ArrowUpDown className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">连接您的交易所账户</h3>
              <p className="text-muted-foreground max-w-md">
                连接MEXC或派网交易所API以查看您的加密货币资产余额和实时估值。
              </p>
              <Button 
                onClick={() => setIsAddModalOpen(true)}
                data-testid="button-connect-exchange"
              >
                <Plus className="w-4 h-4 mr-1" />
                连接交易所
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {credentials.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Coins className="w-5 h-5" />
                      交易所总资产
                    </CardTitle>
                    <CardDescription>
                      所有已连接交易所的资产汇总
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">总估值 (USDT)</p>
                    <p className="text-3xl font-bold text-primary" data-testid="text-grand-total">
                      ${formatCurrency(calculateGrandTotal())}
                    </p>
                  </div>
                </div>
              </CardHeader>
            </Card>
          )}

          {credentials.map((credential) => {
            const balances = getBalancesForExchange(credential.exchange);
            const isLoading = getLoadingForExchange(credential.exchange);
            const error = getErrorForExchange(credential.exchange);
            const refetch = getRefetchForExchange(credential.exchange);
            const exchangeType = credential.exchange as ExchangeType;
            
            return (
              <Card key={credential.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <TrendingUp className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          {credential.label}
                          <Badge variant="secondary" className="text-xs">
                            {getExchangeName(credential.exchange)}
                          </Badge>
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs">{credential.apiKeyPreview}</span>
                          <Badge variant="outline" className="text-xs">
                            {credential.isActive ? (
                              <><CheckCircle2 className="w-3 h-3 mr-1 text-green-500" />已连接</>
                            ) : (
                              <><AlertCircle className="w-3 h-3 mr-1 text-yellow-500" />已禁用</>
                            )}
                          </Badge>
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {balances?.totalUsdtValue && (
                        <div className="text-right mr-2">
                          <p className="text-sm text-muted-foreground">资产折合</p>
                          <p className="text-lg font-bold text-primary">
                            ${formatCurrency(balances.totalUsdtValue)}
                          </p>
                          <div className="text-xs text-muted-foreground">
                            <span>API: ${formatCurrency(balances.apiTotalValue)}</span>
                            {parseFloat(balances.manualBalance) > 0 && (
                              <span> + 其他: ${formatCurrency(balances.manualBalance)}</span>
                            )}
                          </div>
                        </div>
                      )}
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => refetch()}
                        disabled={isLoading}
                        data-testid={`button-refresh-${credential.exchange}`}
                      >
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="icon"
                            data-testid={`button-delete-${credential.exchange}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>确定要删除此API连接吗？</AlertDialogTitle>
                            <AlertDialogDescription>
                              删除后将无法查看{getExchangeName(credential.exchange)}的资产信息，您可以随时重新添加。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteCredentialMutation.mutate(credential.id)}
                              data-testid="button-confirm-delete"
                            >
                              删除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Skeleton className="w-8 h-8 rounded-full" />
                            <Skeleton className="h-4 w-16" />
                          </div>
                          <Skeleton className="h-4 w-24" />
                        </div>
                      ))}
                    </div>
                  ) : error ? (
                    <div className="text-center py-4 text-muted-foreground">
                      <AlertCircle className="w-8 h-8 mx-auto mb-2 text-destructive" />
                      <p>获取余额失败</p>
                      <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
                        重试
                      </Button>
                    </div>
                  ) : balances?.balances && balances.balances.length > 0 ? (
                    <div className="space-y-2">
                      {balances.balances.map((balance, index) => (
                        <div 
                          key={`${balance.accountType || 'spot'}-${balance.asset}-${index}`} 
                          className="flex items-center justify-between py-2 border-b last:border-0"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center">
                              <span className="text-xs font-bold">{balance.asset.substring(0, 2)}</span>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{balance.asset}</p>
                                {balance.accountType && (
                                  <Badge variant="outline" className="text-xs py-0 px-1">
                                    {balance.accountType}
                                  </Badge>
                                )}
                              </div>
                              {balance.price && balance.asset !== 'USDT' && (
                                <p className="text-xs text-muted-foreground">${formatCurrency(balance.price, 4)}</p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-mono">
                              {formatCrypto(parseFloat(balance.free) + parseFloat(balance.locked || balance.frozen || '0'))}
                            </p>
                            {balance.usdtValue && (
                              <p className="text-xs text-muted-foreground">≈ ${formatCurrency(balance.usdtValue)}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">
                      <Coins className="w-8 h-8 mx-auto mb-2" />
                      <p>暂无资产</p>
                    </div>
                  )}

                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium flex items-center gap-1">
                          <Plus className="w-3 h-3" />
                          其他账户余额
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {exchangeInfo[exchangeType]?.manualNote || 'API无法获取的账户余额'}
                        </p>
                      </div>
                      {editingManualBalanceId === credential.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={manualBalanceInput}
                            onChange={(e) => setManualBalanceInput(e.target.value)}
                            className="w-32"
                            data-testid="input-manual-balance"
                          />
                          <Button
                            size="sm"
                            onClick={() => {
                              updateManualBalanceMutation.mutate({
                                id: credential.id,
                                manualBalance: manualBalanceInput || "0",
                              });
                            }}
                            disabled={updateManualBalanceMutation.isPending}
                            data-testid="button-save-manual-balance"
                          >
                            保存
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingManualBalanceId(null)}
                          >
                            取消
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium">
                            ${formatCurrency(credential.manualBalance || "0")}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setManualBalanceInput(credential.manualBalance || "0");
                              setEditingManualBalanceId(credential.id);
                            }}
                            data-testid="button-edit-manual-balance"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4" />
            安全提示
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• 请仅创建具有"读取"权限的API Key，不要开启交易权限</p>
          <p>• 您的API凭证使用AES-256加密存储，只有您可以访问</p>
          <p>• 本应用仅用于查看余额，不会执行任何交易操作</p>
          <p>• 建议定期更换API Key以确保账户安全</p>
        </CardContent>
      </Card>
      </div>
    </PageContainer>
  );
}
