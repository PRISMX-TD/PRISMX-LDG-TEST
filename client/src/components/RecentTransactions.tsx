import { List, Filter, Download, Coffee, Smartphone, Briefcase, ShoppingBag, Home, Zap } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { Transaction } from "@shared/schema";
import { Link } from "wouter";

interface RecentTransactionsProps {
  transactions: any[]; // Using any[] for now as it includes joined fields
  onTransactionClick?: (transaction: any) => void;
}

const getCategoryIcon = (iconName: string) => {
  switch (iconName) {
    case 'food': return Coffee;
    case 'shopping': return ShoppingBag;
    case 'housing': return Home;
    case 'transport': return Zap;
    case 'salary': return Briefcase;
    case 'work': return Briefcase;
    default: return Smartphone; // Default fallback
  }
};

const getCategoryColor = (color: string) => {
  // Simple mapping to Tailwind colors or use the hex directly
  // For this design, we want to use the hex color in an inline style or class
  return color || "#6B7280";
};

export function RecentTransactions({ transactions, onTransactionClick }: RecentTransactionsProps) {
  const VISIBLE_COUNT = 50;
  const visible = transactions.slice(0, VISIBLE_COUNT);

  return (
    <div className="glass-card mb-6">
      <div className="p-6 border-b border-white/5 flex justify-between items-center">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <List className="w-4 h-4 text-neon-glow" />
          最近交易
        </h3>
        <div className="flex gap-2">
          <button className="p-1.5 hover:bg-white/10 rounded-md text-gray-400 hover:text-white transition-colors">
            <Filter className="w-4 h-4" />
          </button>
          <button className="p-1.5 hover:bg-white/10 rounded-md text-gray-400 hover:text-white transition-colors">
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-white/5 text-gray-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-6 py-3 font-medium">交易名称</th>
              <th className="px-6 py-3 font-medium">类别</th>
              <th className="px-6 py-3 font-medium">账户</th>
              <th className="px-6 py-3 font-medium">日期</th>
              <th className="px-6 py-3 font-medium text-right">金额</th>
            </tr>
          </thead>
          <tbody className="text-sm divide-y divide-white/5">
            {visible.map((t) => {
              const Icon = getCategoryIcon(t.category?.icon || 'other');
              const isExpense = t.type === 'expense';
              const isIncome = t.type === 'income';
              const amountClass = isExpense 
                ? "text-white group-hover:text-neon-glow" 
                : isIncome 
                  ? "text-success group-hover:text-green-300"
                  : "text-blue-400";
              
              const sign = isExpense ? '-' : isIncome ? '+' : '';
              
              return (
                <tr 
                  key={t.id} 
                  className="hover:bg-white/[0.02] active:bg-white/[0.04] transition-colors group cursor-pointer"
                  onClick={() => {
                    console.log("Row clicked", t);
                    if (onTransactionClick) onTransactionClick(t);
                  }}
                >
                  <td className="px-6 py-4 flex items-center">
                    <div className="w-9 h-9 rounded-lg bg-[#000] border border-white/10 flex items-center justify-center mr-3 text-white">
                      <Icon className="w-4 h-4" style={{ color: t.category?.color }} />
                    </div>
                    <span className="text-gray-200 font-medium">{t.description || t.category?.name || "未命名交易"}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span 
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                      style={{ 
                        backgroundColor: `${t.category?.color}20`, 
                        color: t.category?.color || '#9CA3AF' 
                      }}
                    >
                      {t.category?.name || "未分类"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-400">{t.wallet?.name}</td>
                  <td className="px-6 py-4 text-gray-500">
                    {format(new Date(t.date), "MM月dd日 HH:mm", { locale: zhCN })}
                  </td>
                  <td className={`px-6 py-4 text-right font-medium transition-colors font-mono ${amountClass}`}>
                    {sign} {t.wallet?.currency} {parseFloat(t.amount).toFixed(2)}
                  </td>
                </tr>
              );
            })}
            
            {transactions.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  暂无交易记录
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {transactions.length > VISIBLE_COUNT && (
        <div className="px-6 py-4 border-t border-white/5 flex justify-end">
          <Link href="/transactions">
            <a className="text-sm text-neon-purple hover:text-neon-glow transition-colors">查看全部交易</a>
          </Link>
        </div>
      )}
    </div>
  );
}
