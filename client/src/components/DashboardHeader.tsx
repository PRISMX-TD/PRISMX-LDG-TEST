import { Search, Bell, Plus, PanelLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useState } from "react";
import { useLocation } from "wouter";

interface DashboardHeaderProps {
  onAddTransaction: () => void;
}

export function DashboardHeader({ onAddTransaction }: DashboardHeaderProps) {
  const today = new Date();
  const [searchValue, setSearchValue] = useState("");
  const [, setLocation] = useLocation();

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchValue.trim()) {
      setLocation(`/transactions?search=${encodeURIComponent(searchValue.trim())}`);
    }
  };
  
  return (
    <header className="h-20 flex items-center justify-between px-8 py-4 z-20 shrink-0">
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
          <h1 className="text-white text-xl font-bold flex items-center gap-2">
            仪表盘
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-neon-purple/20 text-neon-glow border border-neon-purple/20">
              LIVE
            </span>
          </h1>
          <p className="text-xs text-gray-500 mt-1 capitalize">
            {format(today, "yyyy年MM月dd日 · EEEE", { locale: zhCN })}
          </p>
        </div>
      </div>

      {/* Right: Search & Tools */}
      <div className="flex items-center gap-4">
        {/* Search Box */}
        <div className="relative group hidden md:block">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-neon-purple to-blue-600 rounded-lg blur opacity-20 group-hover:opacity-40 transition duration-200"></div>
          <div className="relative flex items-center bg-[#131316] rounded-lg border border-white/10 px-3 py-2 w-64">
            <Search className="w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="搜索资产、交易..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={handleSearch}
              className="bg-transparent border-none outline-none text-sm text-gray-300 ml-2 w-full placeholder-gray-600 focus:ring-0"
            />
            <span className="text-xs text-gray-600 border border-gray-700 rounded px-1.5 py-0.5">
              Enter
            </span>
          </div>
        </div>

        {/* Buttons */}
        <button className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 hover:border-neon-purple/30 transition-all relative">
          <div className="absolute top-2 right-2.5 w-1.5 h-1.5 bg-red-500 rounded-full"></div>
          <Bell className="w-4 h-4" />
        </button>
        
        <Button 
          onClick={onAddTransaction}
          className="bg-neon-purple hover:bg-neon-dark text-white px-4 py-2 rounded-lg text-sm font-medium shadow-neon transition-all flex items-center gap-2 border-none"
        >
          <Plus className="w-4 h-4" />
          记一笔
        </Button>
      </div>
    </header>
  );
}
