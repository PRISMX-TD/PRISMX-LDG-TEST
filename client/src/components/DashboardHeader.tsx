import { Search, Bell, Plus, PanelLeftIcon, SlidersHorizontal } from "lucide-react";
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
    <header className="h-16 md:h-20 flex items-center justify-between px-4 md:px-8 py-3 md:py-4 shrink-0">
      {/* Left: Title & Breadcrumb */}
      <div className="flex items-center gap-4">
        {/* We use a simple button here that relies on the parent layout's context if available, 
            but for Dashboard which might be used outside SidebarProvider in some routes, 
            we avoid direct useSidebar hook usage inside this component to prevent crashes.
            The actual toggle functionality is handled by the SidebarTrigger in the App layout.
            Here we just show a visual indicator or nothing if sidebar isn't controllable here.
        */}
        <div className="md:hidden">
            {/* Mobile menu trigger placeholder - actual trigger is in layout */}
        </div>
        <div>
          <h1 className="text-white text-lg md:text-xl font-bold flex items-center gap-2">
            仪表盘
          </h1>
          <p className="text-[10px] md:text-xs text-gray-500 mt-0.5 md:mt-1 capitalize">
            {format(today, "yyyy年MM月dd日 · EEEE", { locale: zhCN })}
          </p>
        </div>
      </div>

      {/* Right: Search & Tools */}
      <div className="flex items-center gap-2 md:gap-4">
        {/* Search Box */}
        <div className="relative group hidden md:block">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-neon-purple to-blue-600 rounded-lg blur opacity-20 group-hover:opacity-40 transition duration-200"></div>
          <div className="relative flex items-center bg-[#131316] rounded-lg border border-white/10 px-3 py-2 w-48 lg:w-64">
            <Search className="w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="搜索资产、交易..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={handleSearch}
              className="bg-transparent border-none outline-none text-sm text-gray-300 ml-2 w-full placeholder-gray-600 focus:ring-0"
            />
            <span className="text-xs text-gray-600 border border-gray-700 rounded px-1.5 py-0.5 hidden lg:inline-block">
              Enter
            </span>
          </div>
        </div>

        {/* Buttons */}
        {onCustomize && (
          <Button
            variant="outline"
            size="icon"
            onClick={onCustomize}
            className="border-white/10 bg-[#131316] text-gray-400 hover:text-white hover:bg-white/5"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </Button>
        )}
        <Button 
          onClick={onAddTransaction}
          className="bg-neon-purple hover:bg-neon-dark text-white px-3 md:px-4 py-2 h-8 md:h-9 rounded-lg text-xs md:text-sm font-medium shadow-neon transition-all flex items-center gap-1.5 md:gap-2 border-none"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">记一笔</span>
        </Button>
      </div>
    </header>
  );
}
