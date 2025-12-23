import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Settings as SettingsIcon, Globe, User, Shield, Loader2, Smartphone, ChevronRight } from "lucide-react";
import { supportedCurrencies } from "@shared/schema";
import { MobileNavSettingsModal } from "@/components/MobileNavSettingsModal";

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isMobileNavSettingsOpen, setIsMobileNavSettingsOpen] = useState(false);

  const displayName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.firstName || user?.email?.split("@")[0] || "用户";

  const initials = user?.firstName && user?.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`
    : displayName.slice(0, 2).toUpperCase();

  const currentCurrency = user?.defaultCurrency || "MYR";

  const currencyMutation = useMutation({
    mutationFn: async (currency: string) => {
      await apiRequest("PATCH", "/api/user/currency", { currency });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "设置已更新", description: "默认币种已更改" });
    },
    onError: () => {
      toast({ title: "更新失败", description: "请稍后重试", variant: "destructive" });
    },
  });

  if (!user) {
    return null;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-3xl">
      <h1 className="hidden md:flex text-2xl font-bold items-center gap-2">
        <SettingsIcon className="w-6 h-6" />
        设置
      </h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            账户信息
          </CardTitle>
          <CardDescription>查看您的账户基本信息</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage
                src={user.profileImageUrl || undefined}
                alt={displayName}
                className="object-cover"
              />
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-lg font-medium">{displayName}</p>
              {user.email && <p className="text-muted-foreground">{user.email}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            默认币种
          </CardTitle>
          <CardDescription>选择您的首选货币，此设置将用于显示总资产等汇总数据</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={currentCurrency}
            onValueChange={(value) => currencyMutation.mutate(value)}
            className="grid gap-3 sm:grid-cols-2"
          >
            {supportedCurrencies.map((currency) => (
              <div
                key={currency.code}
                className="flex items-center space-x-3 rounded-lg border p-3 hover-elevate cursor-pointer"
                onClick={() => !currencyMutation.isPending && currencyMutation.mutate(currency.code)}
              >
                <RadioGroupItem
                  value={currency.code}
                  id={`currency-${currency.code}`}
                  disabled={currencyMutation.isPending}
                />
                <Label
                  htmlFor={`currency-${currency.code}`}
                  className="flex items-center gap-2 cursor-pointer flex-1"
                >
                  <span className="w-10 font-mono text-muted-foreground">{currency.symbol}</span>
                  <span>{currency.name}</span>
                  <span className="text-xs text-muted-foreground">({currency.code})</span>
                </Label>
              </div>
            ))}
          </RadioGroup>
          {currencyMutation.isPending && (
            <div className="flex items-center gap-2 mt-4 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">正在更新...</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="md:hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5" />
            移动端导航
          </CardTitle>
          <CardDescription>自定义底部导航栏显示的项目</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="w-full justify-between"
            onClick={() => setIsMobileNavSettingsOpen(true)}
            data-testid="button-mobile-nav-settings"
          >
            <span>配置导航栏</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            账户安全
          </CardTitle>
          <CardDescription>管理您的账户安全设置</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <a href="/api/logout">退出登录</a>
          </Button>
        </CardContent>
      </Card>

      <MobileNavSettingsModal
        open={isMobileNavSettingsOpen}
        onOpenChange={setIsMobileNavSettingsOpen}
      />
    </div>
  );
}
