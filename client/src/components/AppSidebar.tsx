import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import type { User, BillReminder } from "@shared/schema";

interface AppSidebarProps {
  user: User;
}

export function AppSidebar({ user }: AppSidebarProps) {
  const [location] = useLocation();

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
    { href: "/", icon: LayoutDashboard, label: "仪表盘" },
    { href: "/transactions", icon: Receipt, label: "交易记录" },
    { href: "/wallets", icon: Wallet, label: "钱包管理" },
    { href: "/exchange", icon: ArrowUpDown, label: "交易所" },
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

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Target className="w-6 h-6 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-lg">PRISMX</span>
            <span className="text-xs text-muted-foreground">Ledger</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>主要功能</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.href}
                    tooltip={item.label}
                  >
                    <Link href={item.href} data-testid={`nav-${item.href.slice(1) || "home"}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>财务规划</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {financeNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.href}
                    tooltip={item.label}
                  >
                    <Link href={item.href} data-testid={`nav-${item.href.slice(1)}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.label}</span>
                      {item.badge !== undefined && item.badge > 0 ? (
                        <Badge variant="destructive" className="ml-auto text-xs">
                          {item.badge}
                        </Badge>
                      ) : null}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>数据分析</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {analyticsNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.href}
                    tooltip={item.label}
                  >
                    <Link href={item.href} data-testid={`nav-${item.href.slice(1)}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="h-9 w-9">
            <AvatarImage
              src={user.profileImageUrl || undefined}
              alt={displayName}
              className="object-cover"
            />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-medium truncate" data-testid="sidebar-user-name">
              {displayName}
            </span>
            {user.email && (
              <span className="text-xs text-muted-foreground truncate">{user.email}</span>
            )}
          </div>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="设置">
              <Link href="/settings" data-testid="nav-settings">
                <Settings className="w-4 h-4" />
                <span>设置</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="退出登录">
              <a href="/api/logout" data-testid="nav-logout">
                <LogOut className="w-4 h-4" />
                <span>退出登录</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
