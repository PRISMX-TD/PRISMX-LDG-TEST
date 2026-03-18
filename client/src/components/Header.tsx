import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLogout } from "@/hooks/useLogout";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Wallet, LogOut, Globe, Tags } from "lucide-react";
import { Link } from "wouter";
import type { User } from "@shared/schema";
import { supportedCurrencies, getCurrencyInfo } from "@shared/schema";

interface HeaderProps {
  user: User;
}

export function Header({ user }: HeaderProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { logout } = useLogout();
  const [currencyDialogOpen, setCurrencyDialogOpen] = useState(false);
  
  const displayName =
    user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.firstName || user.email?.split("@")[0] || "用户";

  const initials =
    user.firstName && user.lastName
      ? `${user.firstName[0]}${user.lastName[0]}`
      : displayName.slice(0, 2).toUpperCase();

  const currentCurrency = user.defaultCurrency || "MYR";

  const currencyMutation = useMutation({
    mutationFn: async (currency: string) => {
      await apiRequest("PATCH", "/api/user/currency", { currency });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setCurrencyDialogOpen(false);
      toast({
        title: "设置已更新",
        description: "默认币种已更改",
      });
    },
    onError: () => {
      toast({
        title: "更新失败",
        description: "请稍后重试",
        variant: "destructive",
      });
    },
  });

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="container mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Wallet className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg hidden sm:block">
              PRISMX Ledger
            </span>
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-9 w-9 rounded-full"
                  data-testid="button-user-menu"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarImage
                      src={user.profileImageUrl || undefined}
                      alt={displayName}
                      className="object-cover"
                    />
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <div className="flex items-center gap-3 px-2 py-2">
                  <Avatar className="h-10 w-10">
                    <AvatarImage
                      src={user.profileImageUrl || undefined}
                      alt={displayName}
                      className="object-cover"
                    />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col space-y-0.5 min-w-0">
                    <p className="text-sm font-medium truncate" data-testid="text-user-name">
                      {displayName}
                    </p>
                    {user.email && (
                      <p className="text-xs text-muted-foreground truncate">
                        {user.email}
                      </p>
                    )}
                  </div>
                </div>
                <DropdownMenuSeparator />
                <Link href="/categories">
                  <DropdownMenuItem className="cursor-pointer" data-testid="button-categories-settings">
                    <Tags className="mr-2 h-4 w-4" />
                    <span>分类管理</span>
                  </DropdownMenuItem>
                </Link>
                <DropdownMenuItem
                  className="cursor-pointer"
                  onSelect={() => setCurrencyDialogOpen(true)}
                  data-testid="button-currency-settings"
                >
                  <Globe className="mr-2 h-4 w-4" />
                  <span>默认币种</span>
                  <span className="ml-auto text-xs text-muted-foreground">{currentCurrency}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  className="cursor-pointer"
                  onSelect={logout}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>退出登录</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <Dialog open={currencyDialogOpen} onOpenChange={setCurrencyDialogOpen}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-currency-settings">
          <DialogHeader>
            <DialogTitle>选择默认币种</DialogTitle>
            <DialogDescription>
              选择您的首选货币，此设置将用于显示总资产等汇总数据
            </DialogDescription>
          </DialogHeader>
          <RadioGroup 
            value={currentCurrency} 
            onValueChange={(value) => currencyMutation.mutate(value)}
            className="grid gap-2 pt-4"
          >
            {supportedCurrencies.map((currency) => (
              <div key={currency.code} className="flex items-center space-x-3">
                <RadioGroupItem 
                  value={currency.code} 
                  id={`currency-${currency.code}`}
                  data-testid={`option-default-currency-${currency.code}`}
                  disabled={currencyMutation.isPending}
                />
                <Label 
                  htmlFor={`currency-${currency.code}`}
                  className="flex items-center gap-2 cursor-pointer flex-1"
                >
                  <span className="w-8 font-mono text-muted-foreground">{currency.symbol}</span>
                  <span>{currency.name}</span>
                  <span className="text-xs text-muted-foreground">({currency.code})</span>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </DialogContent>
      </Dialog>
    </>
  );
}
