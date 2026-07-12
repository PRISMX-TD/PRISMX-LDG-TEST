import { useMemo, useEffect, useRef, useState } from "react";
import { getCurrencyInfo } from "@shared/schema";
import { PieChartIcon } from "lucide-react";

interface CategoryBreakdown {
  categoryId: number;
  categoryName: string;
  total: number;
  color: string;
}

interface ExpenseChartProps {
  data: CategoryBreakdown[];
  currency?: string;
  isLoading?: boolean;
}

export function ExpenseChart({ data, currency = "MYR", isLoading }: ExpenseChartProps) {
  const currencyInfo = getCurrencyInfo(currency);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [Recharts, setRecharts] = useState<any>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setIsVisible(true);
      }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || Recharts) return;
    import("recharts").then((mod) => setRecharts(mod));
  }, [isVisible, Recharts]);

  const chartData = useMemo(() => {
    return data.map((item) => ({
      name: item.categoryName,
      value: item.total,
      color: item.color,
    }));
  }, [data]);

  const total = useMemo(() => data.reduce((sum, item) => sum + item.total, 0), [data]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      const percentage = ((item.value / total) * 100).toFixed(1);
      return (
        <div className="bg-background border rounded-lg p-3 shadow-lg">
          <p className="font-medium">{item.name}</p>
          <p className="text-sm text-muted-foreground">
            {currencyInfo.symbol}{item.value.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-muted-foreground">{percentage}%</p>
        </div>
      );
    }
    return null;
  };

  const renderLegend = (props: any) => {
    const { payload } = props;
    return (
      <ul className="flex flex-wrap gap-2 justify-center mt-4">
        {payload.map((entry: any, index: number) => (
          <li key={`legend-${index}`} className="flex items-center gap-1 text-xs">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{entry.value}</span>
          </li>
        ))}
      </ul>
    );
  };

  if (isLoading) {
    return (
      <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
        <div className="flex items-center gap-2 mb-3">
          <PieChartIcon className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">支出分类</span>
        </div>
        <div className="h-[200px] flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground text-sm">加载中...</div>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
        <div className="flex items-center gap-2 mb-3">
          <PieChartIcon className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">支出分类</span>
        </div>
        <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
          暂无数据
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-primary/5 border border-primary/20" ref={containerRef}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <PieChartIcon className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">支出分类</span>
        </div>
        <span className="text-xs text-muted-foreground">
          总计: {currencyInfo.symbol}{total.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
        </span>
      </div>
      <div className="h-[220px]" data-testid="chart-expense-pie">
        {Recharts && isVisible ? (
          <Recharts.ResponsiveContainer width="100%" height="100%">
            <Recharts.PieChart>
              <Recharts.Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={70}
                paddingAngle={2}
              >
                {chartData.map((entry, index) => (
                  <Recharts.Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Recharts.Pie>
              <Recharts.Tooltip content={<CustomTooltip />} />
              <Recharts.Legend content={renderLegend} />
            </Recharts.PieChart>
          </Recharts.ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">加载中...</div>
        )}
      </div>
    </div>
  );
}
