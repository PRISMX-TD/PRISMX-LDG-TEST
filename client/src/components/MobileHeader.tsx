import { useLocation } from "wouter";
import { Sparkles } from "lucide-react";
import type { User } from "@shared/schema";

/* r7 — Mobile header rewritten from scratch.
   Float-on-top header that shows page title with chip background,
   gradient avatar matches the warm web3 theme. */

interface MobileHeaderProps { user: User; }

const PAGE_TITLES: Record<string, string> = {
  "/": "总览",
  "/dashboard": "总览",
  "/transactions": "交易",
  "/wallets": "钱包",
  "/exchange": "交易所",
  "/categories": "分类",
  "/budgets": "预算",
  "/savings": "储蓄",
  "/recurring": "定期",
  "/reminders": "提醒",
  "/analytics": "分析",
  "/reports": "报表",
  "/settings": "设置",
  "/planning": "计划",
  "/insights": "洞察",
  "/people": "人情账",
  "/loans": "借贷",
  "/split": "分摊",
  "/sub-ledgers": "子账本",
};

export function MobileHeader({ user }: MobileHeaderProps) {
  const [location] = useLocation();
  const pageTitle = PAGE_TITLES[location] || "PRISMX";
  const isHome = location === "/" || location === "/dashboard";

  const displayName =
    user.firstName && user.lastName ? `${user.firstName} ${user.lastName}`
    : user.firstName || user.email?.split("@")[0] || "用户";
  const initials =
    user.firstName && user.lastName ? `${user.firstName[0]}${user.lastName[0]}`
    : displayName.slice(0, 2).toUpperCase();

  return (
    <header
      className="sticky top-0 z-40 safe-area-top"
      style={{
        background: "rgba(10,6,18,0.65)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <div className="flex h-14 items-center justify-between px-4">
        {isHome ? (
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#a78bfa] via-[#8b5cf6] to-[#7c3aed] flex items-center justify-center shadow-[0_6px_16px_-6px_rgba(124,58,237,0.7)]">
              <Sparkles className="w-[18px] h-[18px] text-white" />
            </div>
            <span className="font-bold text-[16px] tracking-tight">PRISMX</span>
          </div>
        ) : (
          <h1 className="font-bold text-[17px] tracking-tight m-0">{pageTitle}</h1>
        )}

        <div className="relative">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#a78bfa] via-[#8b5cf6] to-[#7c3aed] flex items-center justify-center text-white text-[12px] font-bold shadow-[0_6px_16px_-6px_rgba(124,58,237,0.5)]">
            {user.profileImageUrl ? (
              <img src={user.profileImageUrl} alt={displayName} className="w-full h-full object-cover rounded-xl" />
            ) : initials}
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#0a0612]" />
        </div>
      </div>
    </header>
  );
}
