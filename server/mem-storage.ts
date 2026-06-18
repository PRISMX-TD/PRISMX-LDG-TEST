import { type User, type Wallet, type Category, type Transaction, type Budget, type SavingsGoal, type RecurringTransaction, type BillReminder, type ExchangeCredential, type SubLedger, type UserDashboardPreferences, type UserAnalyticsPreferences, type UserMobileNavPreferences, type UserWalletPreferences, type GroupActivity, type Loan } from "@shared/schema";
import { type IStorage, type TransactionFilters, type TransactionStats, type BudgetWithSpending } from "./storage";

export class MemStorage implements IStorage {
  private users = new Map<string, User>();
  private wallets = new Map<number, Wallet>();
  private categories = new Map<number, Category>();
  private transactions = new Map<number, Transaction>();
  private budgets = new Map<number, Budget>();
  private savingsGoals = new Map<number, SavingsGoal>();
  private recurringTransactions = new Map<number, RecurringTransaction>();
  private billReminders = new Map<number, BillReminder>();
  private exchangeCredentials = new Map<number, ExchangeCredential>();
  private subLedgers = new Map<number, SubLedger>();
  private dashPrefs = new Map<string, UserDashboardPreferences>();
  private analyticsPrefs = new Map<string, UserAnalyticsPreferences>();
  private mobileNavPrefs = new Map<string, UserMobileNavPreferences>();
  private walletPrefs = new Map<string, UserWalletPreferences>();
  private groupActivities = new Map<number, GroupActivity>();
  private loans = new Map<number, Loan>();
  private aiInsights = new Map<string, { payload: any; createdAt: Date }>();

  private ids = {
    wallet: 1, category: 1, transaction: 1, budget: 1, savingsGoal: 1,
    recurring: 1, billReminder: 1, exchange: 1, subLedger: 1, groupActivity: 1, loan: 1
  };

  async getUser(id: string) { return this.users.get(id); }
  async upsertUser(user: any) { 
    const u = { ...user, createdAt: new Date(), updatedAt: new Date(), defaultCurrency: user.defaultCurrency || "MYR" };
    this.users.set(user.id, u); 
    await this.initializeUserDefaults(user.id, u.defaultCurrency);
    return u; 
  }
  async updateUserCurrency(userId: string, currency: string) {
    const u = this.users.get(userId);
    if (u) { u.defaultCurrency = currency; this.users.set(userId, u); return u; }
    return undefined;
  }

  async getWallets(userId: string) { return Array.from(this.wallets.values()).filter(w => w.userId === userId); }
  async getWallet(id: number, userId: string) { return this.wallets.get(id); }
  async createWallet(w: any) { 
    const id = this.ids.wallet++;
    const nw = { ...w, id, balance: w.balance || "0", isDefault: !!w.isDefault };
    this.wallets.set(id, nw); return nw; 
  }
  async updateWallet(id: number, userId: string, data: any) {
    const w = this.wallets.get(id);
    if (w && w.userId === userId) { const nw = { ...w, ...data }; this.wallets.set(id, nw); return nw; }
    return undefined;
  }
  async deleteWallet(id: number, userId: string) {
    const w = this.wallets.get(id);
    if (w && w.userId === userId) { this.wallets.delete(id); return true; }
    return false;
  }
  async updateWalletBalance(id: number, userId: string, amount: string) {
    return this.updateWallet(id, userId, { balance: amount });
  }
  async setDefaultWallet(id: number, userId: string) {
    Array.from(this.wallets.values()).filter(w => w.userId === userId).forEach(w => w.isDefault = false);
    return this.updateWallet(id, userId, { isDefault: true });
  }

  async getCategories(userId: string) { return Array.from(this.categories.values()).filter(c => c.userId === userId); }
  async getCategory(id: number, userId: string) { return this.categories.get(id); }
  async getCategoryByName(userId: string, name: string, type: string) {
    return Array.from(this.categories.values()).find(c => c.userId === userId && c.name === name && c.type === type);
  }
  async createCategory(c: any) {
    const id = this.ids.category++;
    const nc = { ...c, id, isDefault: !!c.isDefault };
    this.categories.set(id, nc); return nc;
  }
  async updateCategory(id: number, userId: string, data: any) {
    const c = this.categories.get(id);
    if (c && c.userId === userId && !c.isDefault) { const nc = { ...c, ...data }; this.categories.set(id, nc); return nc; }
    return undefined;
  }
  async deleteCategory(id: number, userId: string) {
    const c = this.categories.get(id);
    if (c && c.userId === userId && !c.isDefault) { this.categories.delete(id); return true; }
    return false;
  }

  async getTransactions(userId: string, filters?: TransactionFilters) {
    let txs = Array.from(this.transactions.values()).filter(t => t.userId === userId);
    if (filters) {
      if (filters.startDate) txs = txs.filter(t => new Date(t.date) >= filters.startDate!);
      if (filters.endDate) txs = txs.filter(t => new Date(t.date) <= filters.endDate!);
      if (filters.categoryId) txs = txs.filter(t => t.categoryId === filters.categoryId);
      if (filters.walletId) txs = txs.filter(t => t.walletId === filters.walletId);
      if (filters.type) txs = txs.filter(t => t.type === filters.type);
      if (filters.search) {
        const s = filters.search.toLowerCase();
        txs = txs.filter(t => t.description?.toLowerCase().includes(s) || this.categories.get(t.categoryId || 0)?.name.toLowerCase().includes(s));
      }
    }
    return txs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(t => ({
      ...t,
      category: this.categories.get(t.categoryId || 0),
      wallet: this.wallets.get(t.walletId),
      subLedger: this.subLedgers.get(t.subLedgerId || 0),
      toWallet: this.wallets.get(t.toWalletId || 0)
    }));
  }
  async getTransaction(id: number, userId: string) { return this.transactions.get(id); }
  async createTransaction(t: any) {
    const id = this.ids.transaction++;
    const nt = { ...t, id };
    this.transactions.set(id, nt); return nt;
  }
  async updateTransaction(id: number, userId: string, data: any) {
    const t = this.transactions.get(id);
    if (t && t.userId === userId) { const nt = { ...t, ...data }; this.transactions.set(id, nt); return nt; }
    return undefined;
  }
  async deleteTransaction(id: number, userId: string) {
    const t = this.transactions.get(id);
    if (t && t.userId === userId) { this.transactions.delete(id); return true; }
    return false;
  }
  async deleteTransactionsByWallet(walletId: number, userId: string) {
    const txs = Array.from(this.transactions.values()).filter(t => t.userId === userId && (t.walletId === walletId || t.toWalletId === walletId));
    txs.forEach(t => this.transactions.delete(t.id));
    return true;
  }
  async getTransactionStats(userId: string, startDate: Date, endDate: Date) {
    const txs = await this.getTransactions(userId, { startDate, endDate });
    let totalIncome = 0, totalExpense = 0;
    const catMap = new Map();
    for (const t of txs) {
      if (t.loanId) continue;
      const w = this.wallets.get(t.walletId);
      const amt = parseFloat(t.amount) * parseFloat(w?.exchangeRateToDefault || "1");
      if (t.type === 'income') totalIncome += amt;
      else if (t.type === 'expense') {
        totalExpense += amt;
        if (t.categoryId) {
          const c = this.categories.get(t.categoryId);
          if (c) {
            const ext = catMap.get(c.id) || { name: c.name, total: 0, color: c.color };
            ext.total += amt;
            catMap.set(c.id, ext);
          }
        }
      }
    }
    return {
      totalIncome, totalExpense,
      categoryBreakdown: Array.from(catMap.entries()).map(([id, d]) => ({ categoryId: id, categoryName: d.name, total: d.total, color: d.color })).sort((a, b) => b.total - a.total)
    };
  }

  async getBudgets(userId: string, month?: number, year?: number) {
    let bs = Array.from(this.budgets.values()).filter(b => b.userId === userId);
    if (month !== undefined && year !== undefined) bs = bs.filter(b => b.month === month && b.year === year);
    return bs;
  }
  async getBudget(id: number, userId: string) { return this.budgets.get(id); }
  async createBudget(b: any) { const id = this.ids.budget++; const nb = { ...b, id }; this.budgets.set(id, nb); return nb; }
  async updateBudget(id: number, userId: string, data: any) {
    const b = this.budgets.get(id);
    if (b && b.userId === userId) { const nb = { ...b, ...data }; this.budgets.set(id, nb); return nb; }
    return undefined;
  }
  async deleteBudget(id: number, userId: string) {
    const b = this.budgets.get(id);
    if (b && b.userId === userId) { this.budgets.delete(id); return true; }
    return false;
  }
  async getBudgetSpending(userId: string, month: number, year: number) {
    const bs = await this.getBudgets(userId, month, year);
    const sd = new Date(year, month - 1, 1), ed = new Date(year, month, 0);
    return Promise.all(bs.map(async b => {
      const c = this.categories.get(b.categoryId);
      const txs = await this.getTransactions(userId, { startDate: sd, endDate: ed, categoryId: b.categoryId, type: 'expense' });
      const spent = txs.reduce((sum, t) => t.loanId ? sum : sum + parseFloat(t.amount), 0);
      return { ...b, spent, categoryName: c?.name || 'Unknown', categoryColor: c?.color || '#6B7280' } as BudgetWithSpending;
    }));
  }

  async getSavingsGoals(userId: string) { return Array.from(this.savingsGoals.values()).filter(s => s.userId === userId); }
  async getSavingsGoal(id: number, userId: string) { return this.savingsGoals.get(id); }
  async createSavingsGoal(s: any) { const id = this.ids.savingsGoal++; const ns = { ...s, id }; this.savingsGoals.set(id, ns); return ns; }
  async updateSavingsGoal(id: number, userId: string, data: any) {
    const s = this.savingsGoals.get(id);
    if (s && s.userId === userId) { const ns = { ...s, ...data }; this.savingsGoals.set(id, ns); return ns; }
    return undefined;
  }
  async deleteSavingsGoal(id: number, userId: string) {
    const s = this.savingsGoals.get(id);
    if (s && s.userId === userId) { this.savingsGoals.delete(id); return true; }
    return false;
  }

  async getRecurringTransactions(userId: string) { return Array.from(this.recurringTransactions.values()).filter(r => r.userId === userId); }
  async getRecurringTransaction(id: number, userId: string) { return this.recurringTransactions.get(id); }
  async createRecurringTransaction(r: any) { const id = this.ids.recurring++; const nr = { ...r, id }; this.recurringTransactions.set(id, nr); return nr; }
  async updateRecurringTransaction(id: number, userId: string, data: any) {
    const r = this.recurringTransactions.get(id);
    if (r && r.userId === userId) { const nr = { ...r, ...data }; this.recurringTransactions.set(id, nr); return nr; }
    return undefined;
  }
  async deleteRecurringTransaction(id: number, userId: string) {
    const r = this.recurringTransactions.get(id);
    if (r && r.userId === userId) { this.recurringTransactions.delete(id); return true; }
    return false;
  }

  async getBillReminders(userId: string) { return Array.from(this.billReminders.values()).filter(b => b.userId === userId).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()); }
  async getBillReminder(id: number, userId: string) { return this.billReminders.get(id); }
  async createBillReminder(b: any) { const id = this.ids.billReminder++; const nb = { ...b, id }; this.billReminders.set(id, nb); return nb; }
  async updateBillReminder(id: number, userId: string, data: any) {
    const b = this.billReminders.get(id);
    if (b && b.userId === userId) { const nb = { ...b, ...data }; this.billReminders.set(id, nb); return nb; }
    return undefined;
  }
  async deleteBillReminder(id: number, userId: string) {
    const b = this.billReminders.get(id);
    if (b && b.userId === userId) { this.billReminders.delete(id); return true; }
    return false;
  }

  async getExchangeCredentials(userId: string) { return Array.from(this.exchangeCredentials.values()).filter(e => e.userId === userId); }
  async getExchangeCredential(id: number, userId: string) { return this.exchangeCredentials.get(id); }
  async getExchangeCredentialByExchange(userId: string, exchange: string) { return Array.from(this.exchangeCredentials.values()).find(e => e.userId === userId && e.exchange === exchange); }
  async createExchangeCredential(e: any) { const id = this.ids.exchange++; const ne = { ...e, id }; this.exchangeCredentials.set(id, ne); return ne; }
  async updateExchangeCredential(id: number, userId: string, data: any) {
    const e = this.exchangeCredentials.get(id);
    if (e && e.userId === userId) { const ne = { ...e, ...data }; this.exchangeCredentials.set(id, ne); return ne; }
    return undefined;
  }
  async deleteExchangeCredential(id: number, userId: string) {
    const e = this.exchangeCredentials.get(id);
    if (e && e.userId === userId) { this.exchangeCredentials.delete(id); return true; }
    return false;
  }

  async getDashboardPreferences(userId: string) { return this.dashPrefs.get(userId); }
  async upsertDashboardPreferences(userId: string, data: any) {
    const p = this.dashPrefs.get(userId) || { userId } as any;
    const np = { ...p, ...data, updatedAt: new Date() };
    this.dashPrefs.set(userId, np); return np;
  }

  async getAnalyticsPreferences(userId: string) { return this.analyticsPrefs.get(userId); }
  async upsertAnalyticsPreferences(userId: string, data: any) {
    const p = this.analyticsPrefs.get(userId) || { userId } as any;
    const np = { ...p, ...data, updatedAt: new Date() };
    this.analyticsPrefs.set(userId, np); return np;
  }

  async getMobileNavPreferences(userId: string) { return this.mobileNavPrefs.get(userId); }
  async upsertMobileNavPreferences(userId: string, data: any) {
    const p = this.mobileNavPrefs.get(userId) || { userId } as any;
    const np = { ...p, ...data, updatedAt: new Date() };
    this.mobileNavPrefs.set(userId, np); return np;
  }

  async getWalletPreferences(userId: string) { return this.walletPrefs.get(userId); }
  async upsertWalletPreferences(userId: string, data: any) {
    const p = this.walletPrefs.get(userId) || { userId } as any;
    const np = { ...p, ...data, updatedAt: new Date() };
    this.walletPrefs.set(userId, np); return np;
  }

  async getSubLedgers(userId: string, includeArchived?: boolean) { 
    return Array.from(this.subLedgers.values()).filter(s => s.userId === userId && (includeArchived || !s.isArchived)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); 
  }
  async getSubLedger(id: number, userId: string) { return this.subLedgers.get(id); }
  async createSubLedger(s: any) { const id = this.ids.subLedger++; const ns = { ...s, id, createdAt: new Date(), currency: s.currency || "MYR" }; this.subLedgers.set(id, ns); return ns; }
  async updateSubLedger(id: number, userId: string, data: any) {
    const s = this.subLedgers.get(id);
    if (s && s.userId === userId) { const ns = { ...s, ...data }; this.subLedgers.set(id, ns); return ns; }
    return undefined;
  }
  async deleteSubLedger(id: number, userId: string) {
    const s = this.subLedgers.get(id);
    if (s && s.userId === userId) { this.subLedgers.delete(id); return true; }
    return false;
  }

  async getGroupActivities(userId: string) { return Array.from(this.groupActivities.values()).filter(g => g.userId === userId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); }
  async getGroupActivity(id: number, userId: string) { return this.groupActivities.get(id); }
  async createGroupActivity(g: any) { const id = this.ids.groupActivity++; const ng = { ...g, id, createdAt: new Date() }; this.groupActivities.set(id, ng); return ng; }
  async updateGroupActivity(id: number, userId: string, data: any) {
    const g = this.groupActivities.get(id);
    if (g && g.userId === userId) { const ng = { ...g, ...data }; this.groupActivities.set(id, ng); return ng; }
    return undefined;
  }
  async deleteGroupActivity(id: number, userId: string) {
    const g = this.groupActivities.get(id);
    if (g && g.userId === userId) { this.groupActivities.delete(id); return true; }
    return false;
  }

  async getLoans(userId: string) { return Array.from(this.loans.values()).filter(l => l.userId === userId).sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()); }
  async getLoan(id: number, userId: string) { return this.loans.get(id); }
  async createLoan(l: any) { const id = this.ids.loan++; const nl = { ...l, id }; this.loans.set(id, nl); return nl; }
  async updateLoan(id: number, userId: string, data: any) {
    const l = this.loans.get(id);
    if (l && l.userId === userId) { const nl = { ...l, ...data }; this.loans.set(id, nl); return nl; }
    return undefined;
  }
  async deleteLoan(id: number, userId: string) {
    const l = this.loans.get(id);
    if (l && l.userId === userId) { this.loans.delete(id); return true; }
    return false;
  }
  async recalculateLoanStatus(loanId: number, userId: string) {
    const l = this.loans.get(loanId);
    if (!l) return;
    const txs = Array.from(this.transactions.values()).filter(t => t.loanId === loanId && t.userId === userId);
    let totalPaid = 0;
    for (const t of txs) {
      let amt = parseFloat(t.amount);
      if (t.currency !== l.currency) {
        const rate = parseFloat(t.exchangeRate || "1");
        if (rate > 0) amt /= rate;
      }
      if (l.type === 'lend' && t.type === 'income') totalPaid += amt;
      else if (l.type === 'borrow' && t.type === 'expense') totalPaid += amt;
    }
    const isPaid = totalPaid >= parseFloat(l.totalAmount) - 0.01;
    this.updateLoan(loanId, userId, { paidAmount: totalPaid.toFixed(2), status: isPaid ? 'settled' : l.status === 'settled' ? 'active' : l.status });
  }
  async getTransactionsByLoanId(loanId: number, userId: string) {
    return Array.from(this.transactions.values()).filter(t => t.loanId === loanId && t.userId === userId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async getLatestAiInsights(userId: string) { return this.aiInsights.get(userId); }
  async saveAiInsights(userId: string, payload: any) { this.aiInsights.set(userId, { payload, createdAt: new Date() }); }

  async initializeUserDefaults(userId: string, defaultCurrency = "MYR") {
    const existingWallets = await this.getWallets(userId);
    if (existingWallets.length === 0) {
      [
        { name: "现金", type: "cash", icon: "cash", color: "#10B981", isDefault: true },
        { name: "银行卡", type: "bank_card", icon: "bank_card", color: "#3B82F6", isDefault: false },
        { name: "支付宝", type: "digital_wallet", icon: "digital_wallet", color: "#1677FF", isDefault: false },
        { name: "微信", type: "digital_wallet", icon: "digital_wallet", color: "#07C160", isDefault: false }
      ].forEach(w => this.createWallet({ userId, ...w, currency: defaultCurrency, balance: "0" }));
    }

    const existingCategories = await this.getCategories(userId);
    const existingKey = new Set(existingCategories.map((c) => `${c.type}:${c.name}`));
    
    [
      { name: "餐饮", icon: "food", color: "#EF4444" },
      { name: "购物", icon: "shopping", color: "#F59E0B" },
      { name: "交通", icon: "transport", color: "#3B82F6" },
      { name: "住房", icon: "housing", color: "#8B5CF6" },
      { name: "娱乐", icon: "entertainment", color: "#EC4899" },
      { name: "医疗", icon: "health", color: "#10B981" },
      { name: "教育", icon: "education", color: "#06B6D4" },
      { name: "礼物", icon: "gift", color: "#F97316" },
      { name: "其他", icon: "other", color: "#6B7280" }
    ].forEach(c => {
      if (!existingKey.has(`expense:${c.name}`)) this.createCategory({ userId, ...c, type: "expense", isDefault: true });
    });

    [
      { name: "工资", icon: "salary", color: "#10B981" },
      { name: "奖金", icon: "gift", color: "#22C55E" },
      { name: "投资", icon: "work", color: "#3B82F6" },
      { name: "其他", icon: "other", color: "#6B7280" }
    ].forEach(c => {
      if (!existingKey.has(`income:${c.name}`)) this.createCategory({ userId, ...c, type: "income", isDefault: true });
    });
  }
}
