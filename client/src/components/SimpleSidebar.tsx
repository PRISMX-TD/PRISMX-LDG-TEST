import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useLogout } from "@/hooks/useLogout";
import { useState } from "react";
import {
  LayoutDashboard, Receipt, Wallet, Compass, Calendar, Users, Settings,
  LogOut, Sparkles, ArrowUpDown, ChevronLeft, ChevronRight,
} from "lucide-react";
import type { User, BillReminder } from "@shared/schema";

/* r7 — Sidebar rewritten from scratch.
   No shadcn sidebar primitive, no AvatarRing carry-over.
   Hand-built warm web3 chrome: floating logo capsule, gradient active rail,
   custom badge styling. */

interface SimpleSidebarProps {
  user: User;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function SimpleSidebar({ user, onCollapsedChange }: SimpleSidebarProps) {
  const [location] = useLocation();
  const { logout } = useLogout();
  const [collapsed, setCollapsed] = useState(false);

  const displayName =
    user.firstName && user.lastName ? `${user.firstName} ${user.lastName}`
    : user.firstName || user.email?.split("@")[0] || "用户";
  const initials =
    user.firstName && user.lastName ? `${user.firstName[0]}${user.lastName[0]}`
    : displayName.slice(0, 2).toUpperCase();

  const { data: reminders = [] } = useQuery<BillReminder[]>({ queryKey: ["/api/bill-reminders"] });
  const upcoming = reminders.filter(r => {
    if (r.isPaid) return false;
    const days = Math.ceil((new Date(r.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days <= 7 && days >= 0;
  }).length;

  const navItems = [
    { href: "/dashboard",    icon: LayoutDashboard, label: "总览" },
    { href: "/transactions", icon: Receipt,         label: "交易" },
    { href: "/wallets",      icon: Wallet,          label: "钱包" },
    { href: "/planning",     icon: Calendar,        label: "计划", badge: upcoming },
    { href: "/insights",     icon: Compass,         label: "洞察" },
    { href: "/people",       icon: Users,           label: "人情账" },
    { href: "/exchange",     icon: ArrowUpDown,     label: "交易所" },
  ];

  const matchesHub = (href: string) => {
    if (location === href || location.startsWith(href + "/") || location.startsWith(href + "?")) return true;
    if (href === "/planning"  && ["/budgets", "/savings", "/recurring", "/reminders"].some(x => location.startsWith(x))) return true;
    if (href === "/insights"  && ["/analytics", "/reports", "/sub-ledgers"].some(x => location.startsWith(x))) return true;
    if (href === "/people"    && ["/loans", "/split"].some(x => location.startsWith(x))) return true;
    return false;
  };

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    onCollapsedChange?.(next);
  };

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-[200] flex flex-col transition-all duration-300 ${collapsed ? "w-20" : "w-64"}`}
      style={{
        background: "rgba(10, 6, 18, 0.35)",
        borderRight: "1px solid rgba(255,255,255,0.05)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      {/* decorative orb top */}
      <div aria-hidden className="absolute -top-20 -left-10 w-44 h-44 rounded-full opacity-40 blur-3xl pointer-events-none"
           style={{ background: "radial-gradient(circle, rgba(167,139,250,0.4) 0%, transparent 70%)" }} />

      {/* HEADER — brand mark + collapse */}
      <div className={`h-[68px] flex items-center shrink-0 relative ${collapsed ? "px-3 justify-center" : "px-4 justify-between"}`}>
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-[0_8px_20px_-6px_rgba(124,58,237,0.6)]"
               style={{ background: "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 50%, #7c3aed 100%)" }}>
            <Sparkles className="w-5 h-5" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-bold text-[15px] tracking-tight leading-none">PRISMX</span>
              <span className="text-[10px] text-foreground/45 tracking-[0.2em] uppercase mt-0.5">Ledger</span>
            </div>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={toggle}
            aria-label="折叠"
            className="w-7 h-7 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-foreground/55 hover:bg-white/[0.10] hover:text-foreground transition-all"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          onClick={toggle}
          aria-label="展开"
          className="absolute top-[34px] -right-3 z-10 w-6 h-6 rounded-full bg-[#1a1424] border border-white/[0.12] flex items-center justify-center text-foreground/65 hover:text-foreground transition-all shadow-[0_4px_12px_-4px_rgba(0,0,0,0.6)]"
        >
          <ChevronRight className="w-3 h-3" />
        </button>
      )}

      {/* NAV */}
      <div className={`flex-1 overflow-y-auto custom-scroll relative ${collapsed ? "px-2 py-3" : "px-3 py-3"}`}>
        {!collapsed && (
          <p className="px-3 mb-2 text-[10px] tracking-[0.22em] uppercase text-foreground/35 m-0">Menu</p>
        )}
        <div className="space-y-0.5">
          {navItems.map((item) => {
            const active = matchesHub(item.href);
            return (
              <Link key={item.href} href={item.href} className="block">
                <div className={`group relative flex items-center transition-all cursor-pointer ${
                  collapsed ? "justify-center h-11 rounded-xl" : "gap-3 px-3 h-11 rounded-xl"
                } ${
                  active
                    ? "bg-gradient-to-r from-[#a78bfa]/20 via-[#8b5cf6]/15 to-transparent text-foreground"
                    : "text-foreground/55 hover:bg-white/[0.04] hover:text-foreground"
                }`}>
                  {active && (
                    <span aria-hidden className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-gradient-to-b from-[#a78bfa] to-[#7c3aed] shadow-[0_0_10px_rgba(124,58,237,0.6)]" />
                  )}
                  <item.icon className="w-[18px] h-[18px] shrink-0" strokeWidth={active ? 2.4 : 2} />
                  {!collapsed && <span className="text-[13.5px] font-medium">{item.label}</span>}
                  {!collapsed && item.badge !== undefined && item.badge > 0 && (
                    <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center text-[10px] font-bold bg-[#fbbf24] text-[#1f1300]">
                      {item.badge}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* FOOTER — settings + profile + logout */}
      <div className={`shrink-0 border-t border-white/[0.05] ${collapsed ? "p-2" : "p-3"}`}>
        <Link href="/settings" className="block mb-2">
          <div className={`flex items-center transition-all cursor-pointer ${
            collapsed ? "justify-center h-10 rounded-xl" : "gap-3 px-3 h-10 rounded-xl"
          } ${
            location.startsWith("/settings")
              ? "bg-white/[0.06] text-foreground"
              : "text-foreground/55 hover:bg-white/[0.04] hover:text-foreground"
          }`}>
            <Settings className="w-[17px] h-[17px]" />
            {!collapsed && <span className="text-[13px] font-medium">设置</span>}
          </div>
        </Link>

        <div className={`flex items-center pt-3 border-t border-white/[0.05] ${collapsed ? "justify-center" : "gap-2.5"}`}>
          <div className="relative shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#a78bfa] via-[#8b5cf6] to-[#7c3aed] flex items-center justify-center text-white text-[12px] font-bold shadow-[0_6px_16px_-6px_rgba(124,58,237,0.6)]">
              {user.profileImageUrl ? (
                <img src={user.profileImageUrl} alt={displayName} className="w-full h-full object-cover rounded-xl" />
              ) : initials}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#0a0612]" />
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-semibold m-0 truncate">{displayName}</p>
                {user.email && <p className="text-[10.5px] text-foreground/45 m-0 truncate">{user.email}</p>}
              </div>
              <button
                onClick={logout}
                aria-label="退出登录"
                className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-foreground/55 hover:bg-rose-500/15 hover:border-rose-500/30 hover:text-rose-300 transition-all"
              >
                <LogOut className="w-[14px] h-[14px]" />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
