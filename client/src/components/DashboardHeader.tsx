import { Search, Plus, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { EmotionalGreeting } from "@/components/ds/EmotionalGreeting";

interface DashboardHeaderProps {
  onAddTransaction: () => void;
  onCustomize?: () => void;
  footnote?: string | null;
}

/**
 * Soft dashboard header — D base + E emotional greeting.
 * Removed the heavy glassy border + neon glow ring on the + button.
 */
export function DashboardHeader({ onAddTransaction, onCustomize, footnote }: DashboardHeaderProps) {
  const today = new Date();
  const [searchValue, setSearchValue] = useState("");
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const displayName =
    user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}`
    : user?.firstName || user?.email?.split("@")[0] || "你";

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchValue.trim()) {
      setLocation(`/transactions?search=${encodeURIComponent(searchValue.trim())}`);
    }
  };

  return (
    <header className="shrink-0 px-4 md:px-8 pt-4 md:pt-6 pb-3 md:pb-4 border-b border-border">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <EmotionalGreeting name={displayName} footnote={footnote} />
          <p className="text-[11px] text-foreground-faint mt-1.5 capitalize">
            {format(today, "yyyy年MM月dd日 · EEEE", { locale: zhCN })}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="relative hidden md:block">
            <div className="flex items-center bg-surface-1 rounded-lg border border-border px-3 py-2 w-56 focus-within:border-primary/40 transition-colors">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="搜索交易、钱包..."
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={handleSearch}
                className="bg-transparent border-none outline-none text-xs text-foreground ml-2 w-full placeholder:text-muted-foreground focus:ring-0"
              />
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/transactions")}
            className="md:hidden h-9 w-9 text-muted-foreground hover:text-foreground"
            aria-label="搜索"
          >
            <Search className="w-4 h-4" />
          </Button>

          {onCustomize && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onCustomize}
              className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-surface-2"
              aria-label="自定义"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </Button>
          )}
          <Button
            onClick={onAddTransaction}
            className="h-9 bg-primary hover:bg-primary/90 text-primary-foreground px-4 rounded-lg text-sm font-medium flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">记一笔</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
