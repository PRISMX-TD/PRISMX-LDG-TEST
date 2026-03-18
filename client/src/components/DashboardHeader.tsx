import { Search, Plus, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useState } from "react";
import { useLocation } from "wouter";

interface DashboardHeaderProps {
  onAddTransaction: () => void;
  onCustomize?: () => void;
}

export function DashboardHeader({ onAddTransaction, onCustomize }: DashboardHeaderProps) {
  const today = new Date();
  const [searchValue, setSearchValue] = useState("");
  const [, setLocation] = useLocation();

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchValue.trim()) {
      setLocation(`/transactions?search=${encodeURIComponent(searchValue.trim())}`);
    }
  };
  
  return (
    <header className="shrink-0 px-4 md:px-8 pt-2 md:pt-5 pb-2 md:pb-4 border-b border-primary/15 bg-black/55 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="hidden md:block text-[10px] md:text-xs text-muted-foreground tracking-[0.18em] uppercase">Overview</p>
          <div className="flex flex-col md:block">
            <h1 className="text-white text-xl md:text-[32px] font-semibold tracking-tight mt-1">资金仪表盘</h1>
            <p className="text-[10px] md:text-xs text-muted-foreground md:mt-1 capitalize">
              {format(today, "yyyy年MM月dd日 · EEEE", { locale: zhCN })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Desktop Search */}
          <div className="relative group hidden md:block">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-neon-purple/30 to-violet-300/20 rounded-lg blur opacity-20 group-hover:opacity-30 transition duration-200"></div>
            <div className="relative flex items-center bg-[#0c0a14] rounded-lg border border-primary/25 px-2.5 py-2 w-56">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="搜索交易、钱包..."
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={handleSearch}
                className="bg-transparent border-none outline-none text-xs text-gray-200 ml-1.5 w-full placeholder:text-muted-foreground focus:ring-0"
              />
            </div>
          </div>
          
          {/* Mobile Search Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/transactions")}
            className="md:hidden h-8 w-8 text-muted-foreground hover:text-white"
          >
            <Search className="w-4 h-4" />
          </Button>

          {onCustomize && (
            <Button
              variant="outline"
              size="icon"
              onClick={onCustomize}
              className="h-8 w-8 md:h-10 md:w-10 border-primary/25 bg-[#0f0a1a] text-muted-foreground hover:text-white hover:bg-primary/10"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </Button>
          )}
          <Button 
            onClick={onAddTransaction}
            className="h-8 md:h-10 bg-neon-purple hover:bg-violet-500 text-white px-3 md:px-3.5 rounded-lg md:rounded-xl text-xs md:text-sm font-medium transition-all flex items-center gap-1.5 md:gap-2 border border-neon-glow/30 shadow-[0_10px_30px_-16px_rgba(139,92,246,0.9)]"
          >
            <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="hidden sm:inline">记一笔</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
