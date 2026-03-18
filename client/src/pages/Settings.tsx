import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useLogout } from "@/hooks/useLogout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Settings as SettingsIcon, Globe, User, Shield, Loader2, Smartphone, ChevronRight, ArrowLeft } from "lucide-react";
import { supportedCurrencies } from "@shared/schema";
import { MobileNavSettingsModal } from "@/components/MobileNavSettingsModal";
import { PageContainer } from "@/components/PageContainer";

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { logout } = useLogout();

  const handleLogout = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    await logout();
  };
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
    <PageContainer>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
          </Link>
          <h1 className="text-2xl font-semibold flex items-center gap-2 text-white">
            <SettingsIcon className="w-6 h-6 text-neon-purple" />
            设置
          </h1>
        </div>

        <div className="glass-card p-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
          <div className="flex items-center gap-2 mb-4">
            <User className="w-5 h-5 text-primary" />
            <h3 className="text-base font-medium">账户信息</h3>
          </div>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 border-2 border-white/10 shadow-lg">
              <AvatarImage
                src={user.profileImageUrl || undefined}
                alt={displayName}
                className="object-cover"
              />
              <AvatarFallback className="text-lg bg-primary/20 text-primary">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-lg font-medium">{displayName}</p>
              {user.email && <p className="text-muted-foreground">{user.email}</p>}
            </div>
          </div>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-5 h-5 text-primary" />
            <h3 className="text-base font-medium">默认币种</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">选择您的首选货币，此设置将用于显示总资产等汇总数据</p>
          
          <RadioGroup
            value={currentCurrency}
            onValueChange={(value) => currencyMutation.mutate(value)}
            className="grid gap-3 sm:grid-cols-2"
          >
            {supportedCurrencies.map((currency) => (
              <div
                key={currency.code}
                className={`flex items-center space-x-3 rounded-lg border p-3 cursor-pointer transition-all ${
                  currentCurrency === currency.code 
                    ? "bg-primary/10 border-primary/50 shadow-[0_0_10px_rgba(139,92,246,0.2)]" 
                    : "bg-background/30 border-white/5 hover:bg-white/5 hover:border-white/10"
                }`}
                onClick={() => !currencyMutation.isPending && currencyMutation.mutate(currency.code)}
              >
                <RadioGroupItem
                  value={currency.code}
                  id={`currency-${currency.code}`}
                  disabled={currencyMutation.isPending}
                  className="border-primary text-primary"
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
        </div>

        <div className="glass-card p-6 md:hidden">
          <div className="flex items-center gap-2 mb-1">
            <Smartphone className="w-5 h-5 text-primary" />
            <h3 className="text-base font-medium">移动端导航</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">自定义底部导航栏显示的项目</p>
          <Button
            variant="outline"
            className="w-full justify-between bg-background/30 border-white/10 hover:bg-white/5"
            onClick={() => setIsMobileNavSettingsOpen(true)}
            data-testid="button-mobile-nav-settings"
          >
            <span>配置导航栏</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-5 h-5 text-primary" />
            <h3 className="text-base font-medium">账户安全</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">管理您的账户安全设置</p>
          <div className="space-y-3">
            <Button variant="outline" asChild className="w-full bg-background/30 border-white/10 hover:bg-white/5 hover:text-blue-500 hover:border-blue-500/20">
              <a href="/change-password">修改密码</a>
            </Button>
            <Button 
              variant="outline" 
              className="w-full bg-background/30 border-white/10 hover:bg-white/5 hover:text-rose-500 hover:border-rose-500/20"
              onClick={handleLogout}
            >
              退出登录
            </Button>
          </div>
        </div>

        <MobileNavSettingsModal
          open={isMobileNavSettingsOpen}
          onOpenChange={setIsMobileNavSettingsOpen}
        />
      </div>
    </PageContainer>
  );
}
