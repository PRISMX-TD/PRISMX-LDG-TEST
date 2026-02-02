import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useLogout } from "@/hooks/useLogout";
import {
  LayoutDashboard,
  Receipt,
  Wallet,
  BarChart3,
  MoreHorizontal,
  Tags,
  TrendingUp,
  PiggyBank,
  CalendarClock,
  Bell,
  FileText,
  Settings,
  LogOut,
  ArrowUpDown,
  BookOpen,
  User as UserIcon,
  HandCoins,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { User, BillReminder } from "@shared/schema";

interface MobileNavPreferences {
  navOrder: string[] | null;
}

interface MobileNavBarProps {
  user: User;
}

const allNavItems = [
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboard, label: "首页" },
  { key: "transactions", href: "/transactions", icon: Receipt, label: "交易" },
  { key: "wallets", href: "/wallets", icon: Wallet, label: "钱包" },
  { key: "analytics", href: "/analytics", icon: BarChart3, label: "分析" },
  { key: "exchange", href: "/exchange", icon: ArrowUpDown, label: "交易所" },
  { key: "loans", href: "/loans", icon: HandCoins, label: "借贷" },
  { key: "sub-ledgers", href: "/sub-ledgers", icon: BookOpen, label: "子账本" },
  { key: "split", href: "/split", icon: UserIcon, label: "分摊" },
  { key: "categories", href: "/categories", icon: Tags, label: "分类" },
  { key: "budgets", href: "/budgets", icon: TrendingUp, label: "预算" },
  { key: "savings", href: "/savings", icon: PiggyBank, label: "储蓄" },
  { key: "recurring", href: "/recurring", icon: CalendarClock, label: "定期" },
  { key: "reminders", href: "/reminders", icon: Bell, label: "提醒" },
  { key: "reports", href: "/reports", icon: FileText, label: "报表" },
  { key: "settings", href: "/settings", icon: Settings, label: "设置" },
];

const defaultMainNavKeys = ["dashboard", "transactions", "wallets", "analytics"];

export function MobileNavBar({ user }: MobileNavBarProps) {
  const [location] = useLocation();
  const { logout } = useLogout();

  const { data: reminders = [] } = useQuery<BillReminder[]>({
    queryKey: ["/api/bill-reminders"],
  });

  const { data: navPrefs } = useQuery<MobileNavPreferences>({
    queryKey: ["/api/mobile-nav-preferences"],
  });

  const upcomingReminders = reminders.filter((r) => {
    if (r.isPaid) return false;
    const dueDate = new Date(r.dueDate);
    const now = new Date();
    const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 7 && diffDays >= 0;
  });

  const displayName =
    user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.firstName || user.email?.split("@")[0] || "用户";

  const initials =
    user.firstName && user.lastName
      ? `${user.firstName[0]}${user.lastName[0]}`
      : displayName.slice(0, 2).toUpperCase();

  const mainNavKeys = navPrefs?.navOrder || defaultMainNavKeys;
  
  const mainNavItems = mainNavKeys
    .map(key => allNavItems.find(item => item.key === key))
    .filter((item): item is typeof allNavItems[0] => item !== undefined);

  const moreMenuItems = allNavItems
    .filter(item => !mainNavKeys.includes(item.key))
    .map(item => ({
      ...item,
      badge: item.key === "reminders" ? upcomingReminders.length : undefined,
    }));

  const isMoreActive = moreMenuItems.some((item) => location === item.href);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background border-t safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {mainNavItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
              data-testid={`mobile-nav-${item.href.slice(1) || "home"}`}
            >
              <item.icon className={cn("w-5 h-5", isActive && "stroke-[2.5]")} />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          );
        })}

        <Sheet>
          <SheetTrigger asChild>
            <button
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors",
                isMoreActive ? "text-primary" : "text-muted-foreground"
              )}
              data-testid="mobile-nav-more"
            >
              <MoreHorizontal className={cn("w-5 h-5", isMoreActive && "stroke-[2.5]")} />
              <span className="text-xs font-medium">更多</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-auto max-h-[85vh] rounded-t-3xl">
            <SheetHeader className="pb-4">
              <SheetTitle className="sr-only">更多选项</SheetTitle>
              <div className="flex items-center gap-3 pt-2">
                <Avatar className="h-12 w-12">
                  <AvatarImage
                    src={user.profileImageUrl || undefined}
                    alt={displayName}
                    className="object-cover"
                  />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="font-medium" data-testid="mobile-user-name">
                    {displayName}
                  </span>
                  {user.email && (
                    <span className="text-sm text-muted-foreground">{user.email}</span>
                  )}
                </div>
              </div>
            </SheetHeader>

            <div className="grid grid-cols-4 gap-3 py-4">
              {moreMenuItems.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex flex-col items-center justify-center gap-2 p-3 rounded-xl transition-colors relative",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted"
                    )}
                    data-testid={`mobile-more-${item.href.slice(1)}`}
                  >
                    <div className="relative">
                      <item.icon className="w-6 h-6" />
                      {item.badge !== undefined && item.badge > 0 ? (
                        <Badge
                          variant="destructive"
                          className="absolute -top-2 -right-2 h-4 w-4 p-0 flex items-center justify-center text-[10px]"
                        >
                          {item.badge}
                        </Badge>
                      ) : null}
                    </div>
                    <span className="text-xs text-center">{item.label}</span>
                  </Link>
                );
              })}
            </div>

            <div className="border-t pt-4 pb-2">
              <button
                onClick={logout}
                className="flex items-center gap-3 p-3 rounded-xl text-muted-foreground hover:bg-muted transition-colors w-full text-left"
                data-testid="mobile-logout"
              >
                <LogOut className="w-5 h-5" />
                <span className="text-sm">退出登录</span>
              </button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
