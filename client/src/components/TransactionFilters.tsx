import { useState, memo } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Search, X, Filter, Download } from "lucide-react";
import type { Category, Wallet } from "@shared/schema";

export interface TransactionFilterValues {
  startDate?: Date;
  endDate?: Date;
  categoryId?: number;
  walletId?: number;
  type?: string;
  search?: string;
}

interface TransactionFiltersProps {
  categories: Category[];
  wallets: Wallet[];
  filters: TransactionFilterValues;
  onFiltersChange: (filters: TransactionFilterValues) => void;
  onExport?: () => void;
}

function TransactionFiltersComponent({
  categories,
  wallets,
  filters,
  onFiltersChange,
  onExport,
}: TransactionFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const updateFilter = (key: keyof TransactionFilterValues, value: any) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFiltersChange({});
  };

  const hasActiveFilters = Object.values(filters).some((v) => v !== undefined && v !== "");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜索交易..."
            value={filters.search || ""}
            onChange={(e) => updateFilter("search", e.target.value || undefined)}
            className="pl-9 bg-muted/30 border-border/50"
            data-testid="input-search-transactions"
          />
        </div>

        <Button
          variant={isExpanded ? "secondary" : "outline"}
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          data-testid="button-toggle-filters"
        >
          <Filter className="w-4 h-4 mr-1" />
          筛选
          {hasActiveFilters && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
              {Object.values(filters).filter((v) => v !== undefined && v !== "").length}
            </span>
          )}
        </Button>

        {onExport && (
          <Button variant="outline" size="sm" onClick={onExport} data-testid="button-export-csv">
            <Download className="w-4 h-4 mr-1" />
            导出
          </Button>
        )}

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
            <X className="w-4 h-4 mr-1" />
            清除
          </Button>
        )}
      </div>

      {isExpanded && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 p-4 rounded-xl bg-muted/10 border border-border/30">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">开始日期</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal h-9"
                  data-testid="button-start-date"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.startDate ? format(filters.startDate, "yyyy-MM-dd") : "选择日期"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={filters.startDate}
                  onSelect={(date) => updateFilter("startDate", date)}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">结束日期</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal h-9"
                  data-testid="button-end-date"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.endDate ? format(filters.endDate, "yyyy-MM-dd") : "选择日期"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={filters.endDate}
                  onSelect={(date) => updateFilter("endDate", date)}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">交易类型</Label>
            <Select
              value={filters.type || "all"}
              onValueChange={(v) => updateFilter("type", v === "all" ? undefined : v)}
            >
              <SelectTrigger data-testid="select-transaction-type" className="h-9">
                <SelectValue placeholder="全部类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="expense">支出</SelectItem>
                <SelectItem value="income">收入</SelectItem>
                <SelectItem value="transfer">转账</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">分类</Label>
            <Select
              value={filters.categoryId?.toString() || "all"}
              onValueChange={(v) => updateFilter("categoryId", v === "all" ? undefined : parseInt(v))}
            >
              <SelectTrigger data-testid="select-filter-category" className="h-9">
                <SelectValue placeholder="全部分类" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部分类</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id.toString()}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">钱包</Label>
            <Select
              value={filters.walletId?.toString() || "all"}
              onValueChange={(v) => updateFilter("walletId", v === "all" ? undefined : parseInt(v))}
            >
              <SelectTrigger data-testid="select-filter-wallet" className="h-9">
                <SelectValue placeholder="全部钱包" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部钱包</SelectItem>
                {wallets.map((wallet) => (
                  <SelectItem key={wallet.id} value={wallet.id.toString()}>
                    {wallet.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}

export const TransactionFilters = memo(TransactionFiltersComponent);
