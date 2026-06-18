import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useLogout } from "@/hooks/useLogout";
import {
  LayoutDashboard, Receipt, Wallet, Calendar, Compass, Users, ArrowUpDown,
  MoreHorizontal, Settings, LogOut, Tags,
} from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose,
} from "@/components/ui/sheet";
import type { User, BillReminder } from "@shared/schema";

/* r7 — Mobile nav recut from scratch. Floating capsule that sits ABOVE the
   page instead of being a flat bar glued to the bottom. Active item gets a
   gradient pill, others fade. No avatar in main row — that's in the sheet. */

interface MobileNavBarProps { user: User; }

// Master id → nav item map; matches keys used in MobileNavSettingsModal
const ALL_NAV_ITEMS: Record<string, { href: string; icon: any; label: string }> = {
  dashboard:     { href: "/dashboard",                  icon: LayoutDashboard, label: "总览" },
  transactions:  { href: "/transactions",               icon: Receipt,         label: "交易" },
  wallets:       { href: "/wallets",                    icon: Wallet,          label: "钱包" },
  planning:      { href: "/planning",                   icon: Calendar,        label: "计划" },
  insights:      { href: "/insights",                   icon: Compass,         label: "洞察" },
  people:        { href: "/people",                     icon: Users,           label: "人情账" },
  exchange:      { href: "/exchange",                   icon: ArrowUpDown,     label: "交易所" },
  categories:    { href: "/categories",                 icon: Tags,            label: "分类" },
  analytics:     { href: "/insights?tab=analytics",     icon: Compass,         label: "分析" },
  reports:       { href: "/insights?tab=reports",       icon: Receipt,         label: "报表" },
  "sub-ledgers": { href: "/insights?tab=subledgers",    icon: Receipt,         label: "子账本" },
  budgets:       { href: "/planning?tab=budgets",       icon: Calendar,        label: "预算" },
  savings:       { href: "/planning?tab=savings",       icon: Calendar,        label: "储蓄" },
  recurring:     { href: "/planning?tab=recurring",     icon: Calendar,        label: "定期" },
  reminders:     { href: "/planning?tab=reminders",     icon: Calendar,        label: "提醒" },
  loans:         { href: "/people?tab=loans",           icon: Users,           label: "借贷" },
  split:         { href: "/people?tab=split",           icon: Users,           label: "分摊" },
  settings:      { href: "/settings",                   icon: Settings,        label: "设置" },
};
const DEFAULT_PRIMARY = ["dashboard", "transactions", "wallets", "planning"];
// 「分析」(analytics) 与「洞察」(insights) 指向同一个 Insights hub（analytics 是默认标签），
// 二者重复。统一只用 analytics 作为该 hub 的入口，避免导航里出现两个一样的目的地。
const DEFAULT_SECONDARY = ["analytics", "people", "exchange", "categories", "settings"];
// 同一 hub 的别名 → 规范化后的唯一 key（去重用）。
const NAV_ALIAS: Record<string, string> = { insights: "analytics" };

export function MobileNavBar({ user }: MobileNavBarProps) {
  const [location] = useLocation();
  const { logout } = useLogout();

  const { data: reminders = [] } = useQuery<BillReminder[]>({ queryKey: ["/api/bill-reminders"] });
  const { data: navPrefs } = useQuery<{ navOrder: string[] | null }>({ queryKey: ["/api/mobile-nav-preferences"] });
  const upcoming = reminders.filter(r => {
    if (r.isPaid) return false;
    const days = Math.ceil((new Date(r.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days <= 7 && days >= 0;
  }).length;

  const displayName =
    user.firstName && user.lastName ? `${user.firstName} ${user.lastName}`
    : user.firstName || user.email?.split("@")[0] || "用户";
  const initials =
    user.firstName && user.lastName ? `${user.firstName[0]}${user.lastName[0]}`
    : displayName.slice(0, 2).toUpperCase();

  // Compute primary + secondary navigation from saved preferences (navOrder).
  //
  // NOTE: MobileNavSettingsModal saves navOrder as ONLY the bottom-bar items
  // (max 4) and treats everything else as "更多". So we must NOT assume the
  // leftover destinations live in navOrder.slice(4) — that list is usually
  // empty, which previously left 更多 showing only 设置. Instead we always
  // backfill 更多 with every curated destination that isn't already pinned to
  // the bottom bar, so nothing becomes unreachable on mobile.
  const CURATED = DEFAULT_PRIMARY.concat(DEFAULT_SECONDARY);
  const rawOrdered = navPrefs?.navOrder && navPrefs.navOrder.length > 0
    ? navPrefs.navOrder.filter(k => ALL_NAV_ITEMS[k])
    : CURATED;
  // Collapse hub aliases (e.g. insights → analytics) and drop duplicates so the
  // same destination can never appear twice (洞察 vs 分析).
  const orderedKeys = rawOrdered
    .map(k => NAV_ALIAS[k] ?? k)
    .filter((k, i, arr) => arr.indexOf(k) === i);
  const primaryKeys = orderedKeys.slice(0, 4);
  // Start with any explicit extra items the user ordered beyond the first 4,
  // then add every curated destination not already shown anywhere.
  const extraFromOrder = orderedKeys.slice(4).filter(k => !primaryKeys.includes(k));
  const secondaryKeys = [...extraFromOrder];
  for (const k of CURATED) {
    if (!primaryKeys.includes(k) && !secondaryKeys.includes(k)) secondaryKeys.push(k);
  }
  // Always keep Settings reachable via the 更多 sheet.
  if (!primaryKeys.includes("settings") && !secondaryKeys.includes("settings")) {
    secondaryKeys.push("settings");
  }
  const PRIMARY = primaryKeys.map(k => ({ ...ALL_NAV_ITEMS[k], _key: k }));
  const SECONDARY = secondaryKeys.map(k => ({ ...ALL_NAV_ITEMS[k], _key: k }));

  const matchesHub = (href: string) => {
    if (location === href || location.startsWith(href + "/") || location.startsWith(href + "?")) return true;
    // Hub-alias entries carry a ?tab= query (e.g. 分析 → /insights?tab=analytics).
    // Highlight them whenever we're anywhere under the same hub path.
    const base = href.split("?")[0];
    if (base !== "/" && location.split("?")[0] === base) return true;
    if (href === "/planning" && ["/budgets", "/savings", "/recurring", "/reminders"].some(x => location.startsWith(x))) return true;
    if (href === "/insights" && ["/analytics", "/reports", "/sub-ledgers"].some(x => location.startsWith(x))) return true;
    if (href === "/people"   && ["/loans", "/split"].some(x => location.startsWith(x))) return true;
    return false;
  };
  const isMoreActive = SECONDARY.some(i => matchesHub(i.href));

  return (
    <>
      {/* Pad so content can scroll past the floating capsule */}
      <div aria-hidden className="md:hidden h-20" />

      <nav className="fixed bottom-3 left-3 right-3 z-50 md:hidden safe-area-bottom">
        <div className="mx-auto max-w-md flex items-center gap-1 p-1.5 rounded-3xl"
             style={{
               background: "rgba(20,12,32,0.85)",
               border: "1px solid rgba(255,255,255,0.08)",
               backdropFilter: "blur(24px)",
               boxShadow: "0 16px 40px -12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)",
             }}>
          {PRIMARY.map(item => {
            const active = matchesHub(item.href);
            const showBadge = item.href === "/planning" && upcoming > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center flex-1 py-2 rounded-2xl relative transition-all ${
                  active
                    ? "bg-gradient-to-br from-[#a78bfa] to-[#7c3aed] text-white shadow-[0_4px_12px_-2px_rgba(124,58,237,0.5)]"
                    : "text-foreground/55"
                }`}
              >
                <div className="relative">
                  <item.icon className="w-[20px] h-[20px]" strokeWidth={active ? 2.4 : 2} />
                  {showBadge && (
                    <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center bg-[#fbbf24] text-[#1f1300]">
                      {upcoming}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-semibold leading-none mt-1">{item.label}</span>
              </Link>
            );
          })}

          <Sheet>
            <SheetTrigger asChild>
              <button
                className={`flex flex-col items-center justify-center flex-1 py-2 rounded-2xl transition-all ${
                  isMoreActive
                    ? "bg-gradient-to-br from-[#a78bfa] to-[#7c3aed] text-white shadow-[0_4px_12px_-2px_rgba(124,58,237,0.5)]"
                    : "text-foreground/55"
                }`}
              >
                <MoreHorizontal className="w-[20px] h-[20px]" strokeWidth={isMoreActive ? 2.4 : 2} />
                <span className="text-[10px] font-semibold leading-none mt-1">更多</span>
              </button>
            </SheetTrigger>

            <SheetContent
              side="bottom"
              className="h-auto max-h-[80vh] rounded-t-[28px] safe-area-bottom border-t-0"
              style={{
                background: "linear-gradient(180deg, rgba(28,18,42,0.98) 0%, rgba(14,8,22,0.98) 100%)",
                backdropFilter: "blur(20px)",
              }}
            >
              <SheetHeader className="pb-4 mb-3 border-b border-white/[0.06]">
                <SheetTitle className="sr-only">更多选项</SheetTitle>
                <div className="flex items-center gap-3 pt-2">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#a78bfa] via-[#8b5cf6] to-[#7c3aed] flex items-center justify-center text-white font-bold text-[15px] shadow-[0_8px_20px_-6px_rgba(124,58,237,0.6)]">
                      {user.profileImageUrl ? (
                        <img src={user.profileImageUrl} alt={displayName} className="w-full h-full object-cover rounded-2xl" />
                      ) : initials}
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0a0612]" />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="text-[14px] font-semibold m-0 truncate">{displayName}</p>
                    {user.email && <p className="text-[11px] text-foreground/55 m-0 truncate">{user.email}</p>}
                  </div>
                </div>
              </SheetHeader>

              <div className="grid grid-cols-3 gap-2.5 pb-4">
                {SECONDARY.map(item => {
                  const active = matchesHub(item.href);
                  return (
                    <SheetClose asChild key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl border transition-all ${
                          active
                            ? "bg-gradient-to-br from-[#a78bfa]/20 to-[#7c3aed]/20 border-[#a78bfa]/30 text-foreground"
                            : "bg-white/[0.04] border-white/[0.08] text-foreground/65 hover:bg-white/[0.08] hover:text-foreground"
                        }`}
                      >
                        <item.icon className="w-5 h-5" />
                        <span className="text-[12px] font-medium">{item.label}</span>
                      </Link>
                    </SheetClose>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-white/[0.06]">
                <SheetClose asChild>
                  <button
                    onClick={logout}
                    className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-2xl text-[13px] font-medium bg-rose-500/10 border border-rose-500/20 text-rose-300 hover:bg-rose-500/15 transition-colors"
                  >
                    <LogOut className="w-[16px] h-[16px]" />
                    退出登录
                  </button>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </>
  );
}
