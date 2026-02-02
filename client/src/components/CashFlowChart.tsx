import { useMemo, useEffect, useState, useRef } from "react";
import { format, subDays, isSameDay, subMonths, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { zhCN } from "date-fns/locale";
import { ArrowUpRight, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface CashFlowChartProps {
  transactions?: any[];
}

type TimeRange = "week" | "month";

export function CashFlowChart({ transactions = [] }: CashFlowChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [Recharts, setRecharts] = useState<any>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("week");

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

  // Generate data based on selected time range
  const data = useMemo(() => {
    const result = [];
    const today = new Date();
    let daysToProcess: Date[] = [];

    if (timeRange === "week") {
      // Last 7 days
      for (let i = 6; i >= 0; i--) {
        daysToProcess.push(subDays(today, i));
      }
    } else {
      // Current month days so far (or last 30 days? let's do last 30 days for better chart)
      for (let i = 29; i >= 0; i--) {
        daysToProcess.push(subDays(today, i));
      }
    }
    
    // Process each day
    daysToProcess.forEach(date => {
      // Find transactions for this day
      // Note: This simple filtering might be slow if transactions array is huge, 
      // but for Dashboard top 20/50 it's fine. 
      // Ideally we should receive pre-aggregated data or full list for chart.
      // Since Dashboard only receives top 20 transactions by default, this chart 
      // might be inaccurate if we don't fetch more. 
      // For now we assume 'transactions' prop contains enough history or we accept it shows only recent ones.
      // TODO: In a real app, this component should probably fetch its own aggregated data.
      
      const dayTransactions = transactions.filter(t => isSameDay(new Date(t.date), date));
      
      const income = dayTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);
        
      const expense = dayTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);

      result.push({
        name: format(date, 'MM/dd'),
        income: income,
        expense: expense,
      });
    });

    return result;
  }, [transactions, timeRange]);

  if (!Recharts || !isVisible) {
    return (
      <div ref={containerRef} className="flex-[2] glass-card p-6 min-h-[300px] flex items-center justify-center">
        <div className="animate-pulse text-gray-500">加载图表组件...</div>
      </div>
    );
  }

  const { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } = Recharts;

  return (
    <div ref={containerRef} className="flex-[2] glass-card p-4 md:p-6 flex flex-col w-full min-w-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 sm:gap-0">
        <div>
          <h3 className="text-white font-semibold flex items-center gap-2">
            <ArrowUpRight className="w-4 h-4 text-neon-purple" />
            资金流向分析
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            收入 vs 支出 ({timeRange === "week" ? "近7天" : "近30天"})
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button 
            onClick={() => setTimeRange("week")}
            className={cn(
              "flex-1 sm:flex-none px-3 py-1 rounded-lg text-xs transition-colors text-center",
              timeRange === "week" 
                ? "bg-white/10 text-white border border-white/10" 
                : "bg-transparent text-gray-500 hover:text-white"
            )}
          >
            周
          </button>
          <button 
            onClick={() => setTimeRange("month")}
            className={cn(
              "flex-1 sm:flex-none px-3 py-1 rounded-lg text-xs transition-colors text-center",
              timeRange === "month" 
                ? "bg-white/10 text-white border border-white/10" 
                : "bg-transparent text-gray-500 hover:text-white"
            )}
          >
            月
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-[250px] w-full -ml-2" style={{ minHeight: '250px' }}>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
            <XAxis 
              dataKey="name" 
              axisLine={false} 
              tickLine={false} 
              tick={{fill: '#6B7280', fontSize: 12}} 
              dy={10}
              interval={timeRange === 'month' ? 4 : 0}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{fill: '#6B7280', fontSize: 12}} 
              tickFormatter={(value: number) => `¥${value}`}
            />
            <Tooltip 
              contentStyle={{backgroundColor: '#121216', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px'}}
              itemStyle={{color: '#fff'}}
            />
            <Area 
              type="monotone" 
              dataKey="income" 
              stroke="#8B5CF6" 
              strokeWidth={3}
              fillOpacity={1} 
              fill="url(#colorIncome)" 
            />
            <Area 
              type="monotone" 
              dataKey="expense" 
              stroke="#3B82F6" 
              strokeWidth={3}
              fillOpacity={1} 
              fill="url(#colorExpense)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
