import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLogout } from "@/hooks/useLogout";
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
} from "lucide-react";
import type { User, BillReminder } from "@shared/schema";

interface SimpleSidebarProps {
  user: User;
}

export function SimpleSidebar({ user }: SimpleSidebarProps) {
  const [location] = useLocation();
  const { logout } = useLogout();

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
            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 cursor-pointer relative group",
            isActive 
              ? "bg-sidebar-accent text-white font-medium" 
              : "text-gray-400 hover:text-white hover:bg-white/5"
          )}
        >
          {isActive && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-neon-purple rounded-r-full shadow-[0_0_10px_rgba(139,92,246,0.5)]"></div>
          )}
          <item.icon className={cn("w-4 h-4", isActive ? "text-neon-purple" : "text-gray-500 group-hover:text-gray-300")} />
          <span>{item.label}</span>
          {item.badge !== undefined && item.badge > 0 && (
            <Badge variant="destructive" className="ml-auto text-[10px] px-1.5 h-4 min-w-4 flex items-center justify-center">
              {item.badge}
            </Badge>
          )}
        </div>
      </Link>
    );
  };

  return (
    <div className="fixed inset-y-0 left-0 w-64 glass-panel z-[200] flex flex-col border-r border-white/5 pointer-events-auto">
      {/* Header */}
      <div className="h-16 flex items-center px-6 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-neon-purple/20 flex items-center justify-center border border-neon-purple/30">
            <Target className="w-5 h-5 text-neon-purple" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-base tracking-tight text-white">PRISMX</span>
            <span className="text-[10px] text-gray-500 tracking-widest uppercase">Ledger</span>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6 custom-scroll">
        <div>
          <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">主要功能</h3>
          <div className="space-y-1">
            {mainNavItems.map((item) => (
              <NavItem key={item.href} item={item} />
            ))}
          </div>
        </div>

        <div>
          <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">财务规划</h3>
          <div className="space-y-1">
            {financeNavItems.map((item) => (
              <NavItem key={item.href} item={item} />
            ))}
          </div>
        </div>

        <div>
          <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">数据分析</h3>
          <div className="space-y-1">
            {analyticsNavItems.map((item) => (
              <NavItem key={item.href} item={item} />
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-white/5 shrink-0 bg-black/20">
        <div className="flex items-center gap-3 mb-4">
          <Avatar className="h-9 w-9 border border-white/10">
            <AvatarImage src={user.profileImageUrl || undefined} alt={displayName} className="object-cover" />
            <AvatarFallback className="bg-white/5 text-xs text-gray-400">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-medium text-white truncate">{displayName}</span>
            {user.email && (
              <span className="text-xs text-gray-500 truncate">{user.email}</span>
            )}
          </div>
        </div>
        
        <div className="space-y-1">
          <Link href="/settings" className="block w-full">
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer">
              <Settings className="w-4 h-4" />
              <span>设置</span>
            </div>
          </Link>
          <button 
            onClick={logout}
            className="block w-full text-left"
          >
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer">
              <LogOut className="w-4 h-4" />
              <span>退出登录</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}