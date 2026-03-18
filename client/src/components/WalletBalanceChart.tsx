import { useMemo } from "react";
import { getCurrencyInfo } from "@shared/schema";
import { LazyRecharts } from "@/components/LazyRecharts";

interface WalletBalanceChartProps {
  data: { date: string; balance: number }[];
  currency: string;
}

export function WalletBalanceChart({ data, currency }: WalletBalanceChartProps) {
  const currencyInfo = getCurrencyInfo(currency);

  const yDomain = useMemo(() => {
    if (data.length === 0) return [0, 100];
    const values = data.map(d => d.balance);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = (max - min) * 0.1 || 100;
    return [Math.floor(min - padding), Math.ceil(max + padding)];
  }, [data]);

  const formatYAxis = (value: number) => {
    if (Math.abs(value) >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    if (Math.abs(value) >= 1000) {
      return `${(value / 1000).toFixed(0)}K`;
    }
    return value.toString();
  };

  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
        暂无数据
      </div>
    );
  }

  return (
    <LazyRecharts className="h-48 w-full">
      {(R) => (
        <R.ResponsiveContainer width="100%" height="100%">
          <R.AreaChart
            data={data}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <R.XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              dy={10}
              interval="preserveStartEnd"
            />
            <R.YAxis
              domain={yDomain}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              tickFormatter={formatYAxis}
              width={50}
            />
            <R.Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
              }}
              labelStyle={{
                color: "hsl(var(--foreground))",
                marginBottom: "4px",
              }}
              formatter={(value: number) => [
                `${currencyInfo.symbol}${value.toLocaleString("zh-CN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`,
                "余额",
              ]}
            />
            <R.Area
              type="monotone"
              dataKey="balance"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#balanceGradient)"
            />
          </R.AreaChart>
        </R.ResponsiveContainer>
      )}
    </LazyRecharts>
  );
}
