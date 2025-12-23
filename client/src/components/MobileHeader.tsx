import { useLocation } from "wouter";
import { Target } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { User } from "@shared/schema";

interface MobileHeaderProps {
  user: User;
}

const pageTitles: Record<string, string> = {
  "/": "首页",
  "/transactions": "交易记录",
  "/wallets": "钱包管理",
  "/exchange": "交易所",
  "/categories": "分类管理",
  "/budgets": "预算管理",
  "/savings": "储蓄目标",
  "/recurring": "定期交易",
  "/reminders": "账单提醒",
  "/analytics": "数据分析",
  "/reports": "财务报表",
  "/settings": "设置",
};

export function MobileHeader({ user }: MobileHeaderProps) {
  const [location] = useLocation();
  const pageTitle = pageTitles[location] || "PRISMX";
  const isHome = location === "/";

  const displayName =
    user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.firstName || user.email?.split("@")[0] || "用户";

  const initials =
    user.firstName && user.lastName
      ? `${user.firstName[0]}${user.lastName[0]}`
      : displayName.slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-40 bg-background/40 backdrop-blur-xl border-b border-primary/10 safe-area-top">
      <div className="flex h-14 items-center justify-between px-4">
        {isHome ? (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/25">
              <Target className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg">PRISMX</span>
          </div>
        ) : (
          <h1 className="font-semibold text-lg">{pageTitle}</h1>
        )}
        <Avatar className="h-8 w-8 border border-primary/20">
          <AvatarImage
            src={user.profileImageUrl || undefined}
            alt={displayName}
            className="object-cover"
          />
          <AvatarFallback className="text-xs bg-primary/10">{initials}</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
