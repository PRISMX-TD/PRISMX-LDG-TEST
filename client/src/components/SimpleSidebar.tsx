import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLogout } from "@/hooks/useLogout";
import { useState } from "react";
import {
  LayoutDashboard,
  Receipt,
  Wallet,
  Tags,
  TrendingUp,
  PiggyBank,
  CalendarClock,
  Bell,
  BarChart3,
  FileText,
  Settings,
  LogOut,
  Target,
  ArrowUpDown,
  BookOpen,
  Users,
  HandCoins,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { User, BillReminder } from "@shared/schema";

interface SimpleSidebarProps {
  user: User;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function SimpleSidebar({ user, onCollapsedChange }: SimpleSidebarProps) {
  const [location] = useLocation();
  const { logout } = useLogout();
  const [collapsed, setCollapsed] = useState(false);

  const displayName =
    user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.firstName || user.email?.split("@")[0] || "用户";

  const initials =
    user.firstName && user.lastName
      ? `${user.firstName[0]}${user.lastName[0]}`
      : displayName.slice(0, 2).toUpperCase();

  const { data: reminders = [] } = useQuery<BillReminder[]>({
    queryKey: ["/api/bill-reminders"],
  });

  const upcomingReminders = reminders.filter((r) => {
    if (r.isPaid) return false;
    const dueDate = new Date(r.dueDate);
    const now = new Date();
    const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 7 && diffDays >= 0;
  });

  const mainNavItems = [
    { href: "/dashboard", icon: LayoutDashboard, label: "仪表盘" },
    { href: "/transactions", icon: Receipt, label: "交易记录" },
    { href: "/wallets", icon: Wallet, label: "钱包管理" },
    { href: "/exchange", icon: ArrowUpDown, label: "交易所" },
    { href: "/loans", icon: HandCoins, label: "借贷管理" },
    { href: "/categories", icon: Tags, label: "分类管理" },
    { href: "/split", icon: Users, label: "费用分摊" },
  ];

  const financeNavItems = [
    { href: "/budgets", icon: TrendingUp, label: "预算管理" },
    { href: "/savings", icon: PiggyBank, label: "储蓄目标" },
    { href: "/recurring", icon: CalendarClock, label: "定期交易" },
    { href: "/reminders", icon: Bell, label: "账单提醒", badge: upcomingReminders.length },
  ];

  const analyticsNavItems = [
    { href: "/analytics", icon: BarChart3, label: "数据分析" },
    { href: "/reports", icon: FileText, label: "财务报表" },
    { href: "/sub-ledgers", icon: BookOpen, label: "子账本" },
  ];

  const NavItem = ({ item }: { item: any }) => {
    const isActive = location === item.href;
    return (
      <Link href={item.href} className="block w-full">
        <div
          className={cn(
            "flex items-center px-3.5 py-2.5 rounded-xl text-sm transition-all duration-200 cursor-pointer relative group border",
            collapsed ? "justify-center" : "gap-3",
            isActive 
              ? "bg-primary/18 text-white font-medium border-primary/35 shadow-[0_0_0_1px_rgba(167,139,250,0.2)]" 
              : "text-muted-foreground border-transparent hover:text-white hover:bg-primary/8 hover:border-primary/20"
          )}
        >
          {isActive && (
            <div className="absolute left-0.5 top-1/2 -translate-y-1/2 w-1 h-6 bg-neon-purple rounded-r-full shadow-[0_0_14px_rgba(167,139,250,0.9)]"></div>
          )}
          <item.icon className={cn("w-4 h-4", isActive ? "text-neon-glow" : "text-muted-foreground group-hover:text-white")} />
          {!collapsed && <span>{item.label}</span>}
          {!collapsed && item.badge !== undefined && item.badge > 0 && (
            <Badge variant="destructive" className="ml-auto text-[10px] px-1.5 h-4 min-w-4 flex items-center justify-center">
              {item.badge}
            </Badge>
          )}
        </div>
      </Link>
    );
  };

  return (
    <div className={cn("fixed inset-y-0 left-0 glass-panel z-[200] flex flex-col border-r border-primary/15 pointer-events-auto transition-all duration-300", collapsed ? "w-20" : "w-72")}>
      <div className={cn("h-20 flex items-center border-b border-primary/15 shrink-0", collapsed ? "px-2.5 justify-between" : "px-6 justify-between")}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center border border-primary/35 shadow-[0_0_24px_rgba(139,92,246,0.4)]">
            <Target className="w-5 h-5 text-neon-glow" />
          </div>
          <div className={cn("flex flex-col", collapsed && "hidden")}>
            <span className="font-semibold text-lg tracking-tight text-white">PRISMX</span>
            <span className="text-[10px] text-muted-foreground tracking-[0.24em] uppercase">LEDGER</span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground/40 hover:text-white hover:bg-transparent shrink-0"
          onClick={() => {
            const next = !collapsed;
            setCollapsed(next);
            onCollapsedChange?.(next);
          }}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </div>

      <div className={cn("flex-1 overflow-y-auto py-5 custom-scroll", collapsed ? "px-2 space-y-4" : "px-3.5 space-y-6")}>
        <div>
          {!collapsed && <h3 className="px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.2em] mb-2.5">核心功能</h3>}
          <div className="space-y-1">
            {mainNavItems.map((item) => (
              <NavItem key={item.href} item={item} />
            ))}
          </div>
        </div>

        <div>
          {!collapsed && <h3 className="px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.2em] mb-2.5">财务规划</h3>}
          <div className="space-y-1">
            {financeNavItems.map((item) => (
              <NavItem key={item.href} item={item} />
            ))}
          </div>
        </div>

        <div>
          {!collapsed && <h3 className="px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.2em] mb-2.5">洞察与报表</h3>}
          <div className="space-y-1">
            {analyticsNavItems.map((item) => (
              <NavItem key={item.href} item={item} />
            ))}
          </div>
        </div>
      </div>

      <div className={cn("p-4 border-t border-primary/15 shrink-0 bg-black/50", collapsed && "p-2")}>
        <div className={cn("flex items-center mb-4", collapsed ? "justify-center" : "gap-3")}>
          <Avatar className="h-9 w-9 border border-primary/30">
            <AvatarImage src={user.profileImageUrl || undefined} alt={displayName} className="object-cover" />
            <AvatarFallback className="bg-primary/12 text-xs text-neon-glow">{initials}</AvatarFallback>
          </Avatar>
          <div className={cn("flex flex-col min-w-0 flex-1", collapsed && "hidden")}>
            <span className="text-sm font-medium text-white truncate">{displayName}</span>
            {user.email && (
              <span className="text-xs text-muted-foreground truncate">{user.email}</span>
            )}
          </div>
        </div>
        
        <div className="space-y-1">
          <Link href="/settings" className="block w-full">
            <div className={cn("flex items-center px-3.5 py-2.5 rounded-xl text-sm transition-all duration-200 cursor-pointer border text-muted-foreground border-transparent hover:text-white hover:bg-primary/8 hover:border-primary/20", collapsed ? "justify-center" : "gap-3")}>
              <Settings className="w-4 h-4" />
              {!collapsed && <span>设置</span>}
            </div>
          </Link>
          <button 
            onClick={logout}
            className="block w-full text-left"
          >
            <div className={cn("flex items-center px-3.5 py-2.5 rounded-xl text-sm transition-all duration-200 cursor-pointer border text-muted-foreground border-transparent hover:text-red-300 hover:bg-red-500/10 hover:border-red-500/30", collapsed ? "justify-center" : "gap-3")}>
              <LogOut className="w-4 h-4" />
              {!collapsed && <span>退出登录</span>}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
