import {
  users,
  wallets,
  categories,
  transactions,
  budgets,
  savingsGoals,
  recurringTransactions,
  billReminders,
  exchangeCredentials,
  subLedgers,
  userDashboardPreferences,
  userAnalyticsPreferences,
  userMobileNavPreferences,
  userWalletPreferences,
  type User,
  type UpsertUser,
  type Wallet,
  type InsertWallet,
  type Category,
  type InsertCategory,
  type Transaction,
  type InsertTransaction,
  type Budget,
  type InsertBudget,
  type SavingsGoal,
  type InsertSavingsGoal,
  type RecurringTransaction,
  type InsertRecurringTransaction,
  type BillReminder,
  type InsertBillReminder,
  type ExchangeCredential,
  type InsertExchangeCredential,
  type SubLedger,
  type InsertSubLedger,
  type UserDashboardPreferences,
  type InsertUserDashboardPreferences,
  type UserAnalyticsPreferences,
  type InsertUserAnalyticsPreferences,
  type UserMobileNavPreferences,
  type InsertUserMobileNavPreferences,
  type UserWalletPreferences,
  type InsertUserWalletPreferences,
  aiInsights,
  groupActivities,
  type GroupActivity,
  type InsertGroupActivity,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or } from "drizzle-orm";

// Default categories for new users
const defaultExpenseCategories = [
  { name: "餐饮", icon: "food", color: "#EF4444" },
  { name: "购物", icon: "shopping", color: "#F59E0B" },
  { name: "交通", icon: "transport", color: "#3B82F6" },
  { name: "住房", icon: "housing", color: "#8B5CF6" },
  { name: "娱乐", icon: "entertainment", color: "#EC4899" },
  { name: "医疗", icon: "health", color: "#10B981" },
  { name: "教育", icon: "education", color: "#06B6D4" },
  { name: "礼物", icon: "gift", color: "#F97316" },
  { name: "其他", icon: "other", color: "#6B7280" },
];

const defaultIncomeCategories = [
  { name: "工资", icon: "salary", color: "#10B981" },
  { name: "奖金", icon: "gift", color: "#22C55E" },
  { name: "投资", icon: "work", color: "#3B82F6" },
  { name: "其他", icon: "other", color: "#6B7280" },
];

const defaultWallets = [
  { name: "现金", type: "cash", icon: "cash", color: "#10B981", isDefault: true },
  { name: "银行卡", type: "bank_card", icon: "bank_card", color: "#3B82F6", isDefault: false },
  { name: "支付宝", type: "digital_wallet", icon: "digital_wallet", color: "#1677FF", isDefault: false },
  { name: "微信", type: "digital_wallet", icon: "digital_wallet", color: "#07C160", isDefault: false },
];

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserCurrency(userId: string, currency: string): Promise<User | undefined>;

  // Wallet operations
  getWallets(userId: string): Promise<Wallet[]>;
  getWallet(id: number, userId: string): Promise<Wallet | undefined>;
  createWallet(wallet: InsertWallet): Promise<Wallet>;
  updateWallet(id: number, userId: string, data: Partial<InsertWallet>): Promise<Wallet | undefined>;
  deleteWallet(id: number, userId: string): Promise<boolean>;
  updateWalletBalance(id: number, userId: string, amount: string): Promise<Wallet | undefined>;
  setDefaultWallet(id: number, userId: string): Promise<Wallet | undefined>;

  // Category operations
  getCategories(userId: string): Promise<Category[]>;
  getCategory(id: number, userId: string): Promise<Category | undefined>;
  getCategoryByName(userId: string, name: string, type: string): Promise<Category | undefined>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(id: number, userId: string, data: Partial<InsertCategory>): Promise<Category | undefined>;
  deleteCategory(id: number, userId: string): Promise<boolean>;

  // Transaction operations
  getTransactions(userId: string, filters?: TransactionFilters): Promise<any[]>;
  getTransaction(id: number, userId: string): Promise<Transaction | undefined>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  updateTransaction(id: number, userId: string, data: Partial<InsertTransaction>): Promise<Transaction | undefined>;
  deleteTransaction(id: number, userId: string): Promise<boolean>;
  deleteTransactionsByWallet(walletId: number, userId: string): Promise<boolean>;
  getTransactionStats(userId: string, startDate: Date, endDate: Date): Promise<TransactionStats>;

  // Budget operations
  getBudgets(userId: string, month?: number, year?: number): Promise<Budget[]>;
  getBudget(id: number, userId: string): Promise<Budget | undefined>;
  createBudget(budget: InsertBudget): Promise<Budget>;
  updateBudget(id: number, userId: string, data: Partial<InsertBudget>): Promise<Budget | undefined>;
  deleteBudget(id: number, userId: string): Promise<boolean>;
  getBudgetSpending(userId: string, month: number, year: number): Promise<BudgetWithSpending[]>;

  // Savings goal operations
  getSavingsGoals(userId: string): Promise<SavingsGoal[]>;
  getSavingsGoal(id: number, userId: string): Promise<SavingsGoal | undefined>;
  createSavingsGoal(goal: InsertSavingsGoal): Promise<SavingsGoal>;
  updateSavingsGoal(id: number, userId: string, data: Partial<InsertSavingsGoal>): Promise<SavingsGoal | undefined>;
  deleteSavingsGoal(id: number, userId: string): Promise<boolean>;

  // Recurring transaction operations
  getRecurringTransactions(userId: string): Promise<RecurringTransaction[]>;
  getRecurringTransaction(id: number, userId: string): Promise<RecurringTransaction | undefined>;
  createRecurringTransaction(recurring: InsertRecurringTransaction): Promise<RecurringTransaction>;
  updateRecurringTransaction(id: number, userId: string, data: Partial<InsertRecurringTransaction>): Promise<RecurringTransaction | undefined>;
  deleteRecurringTransaction(id: number, userId: string): Promise<boolean>;

  // Bill reminder operations
  getBillReminders(userId: string): Promise<BillReminder[]>;
  getBillReminder(id: number, userId: string): Promise<BillReminder | undefined>;
  createBillReminder(reminder: InsertBillReminder): Promise<BillReminder>;
  updateBillReminder(id: number, userId: string, data: Partial<InsertBillReminder>): Promise<BillReminder | undefined>;
  deleteBillReminder(id: number, userId: string): Promise<boolean>;

  // Exchange credentials operations
  getExchangeCredentials(userId: string): Promise<ExchangeCredential[]>;
  getExchangeCredential(id: number, userId: string): Promise<ExchangeCredential | undefined>;
  getExchangeCredentialByExchange(userId: string, exchange: string): Promise<ExchangeCredential | undefined>;
  createExchangeCredential(credential: InsertExchangeCredential): Promise<ExchangeCredential>;
  updateExchangeCredential(id: number, userId: string, data: Partial<InsertExchangeCredential>): Promise<ExchangeCredential | undefined>;
  deleteExchangeCredential(id: number, userId: string): Promise<boolean>;

  // Dashboard preferences operations
  getDashboardPreferences(userId: string): Promise<UserDashboardPreferences | undefined>;
  upsertDashboardPreferences(userId: string, data: Partial<InsertUserDashboardPreferences>): Promise<UserDashboardPreferences>;

  // Analytics preferences operations
  getAnalyticsPreferences(userId: string): Promise<UserAnalyticsPreferences | undefined>;
  upsertAnalyticsPreferences(userId: string, data: Partial<InsertUserAnalyticsPreferences>): Promise<UserAnalyticsPreferences>;

  // Mobile nav preferences operations
  getMobileNavPreferences(userId: string): Promise<UserMobileNavPreferences | undefined>;
  upsertMobileNavPreferences(userId: string, data: Partial<InsertUserMobileNavPreferences>): Promise<UserMobileNavPreferences>;

  // Wallet preferences operations
  getWalletPreferences(userId: string): Promise<UserWalletPreferences | undefined>;
  upsertWalletPreferences(userId: string, data: Partial<InsertUserWalletPreferences>): Promise<UserWalletPreferences>;

  // Sub-ledger operations
  getSubLedgers(userId: string, includeArchived?: boolean): Promise<SubLedger[]>;
  getSubLedger(id: number, userId: string): Promise<SubLedger | undefined>;
  createSubLedger(subLedger: InsertSubLedger): Promise<SubLedger>;
  updateSubLedger(id: number, userId: string, data: Partial<InsertSubLedger>): Promise<SubLedger | undefined>;
  deleteSubLedger(id: number, userId: string): Promise<boolean>;

  // Initialization
  initializeUserDefaults(userId: string, defaultCurrency?: string): Promise<void>;

  // Group activities operations
  getGroupActivities(userId: string): Promise<GroupActivity[]>;
  getGroupActivity(id: number, userId: string): Promise<GroupActivity | undefined>;
  createGroupActivity(activity: InsertGroupActivity): Promise<GroupActivity>;
  updateGroupActivity(id: number, userId: string, data: Partial<InsertGroupActivity>): Promise<GroupActivity | undefined>;
  deleteGroupActivity(id: number, userId: string): Promise<boolean>;
}

// Types for filters and stats
export interface TransactionFilters {
  startDate?: Date;
  endDate?: Date;
  categoryId?: number;
  walletId?: number;
  type?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface TransactionStats {
  totalIncome: number;
  totalExpense: number;
  categoryBreakdown: { categoryId: number; categoryName: string; total: number; color: string }[];
}

export interface BudgetWithSpending extends Budget {
  spent: number;
  categoryName: string;
  categoryColor: string;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    
    // Initialize defaults for new users
    await this.initializeUserDefaults(user.id, user.defaultCurrency);
    
    return user;
  }

  async updateUserCurrency(userId: string, currency: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ defaultCurrency: currency, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  // Wallet operations
  async getWallets(userId: string): Promise<Wallet[]> {
    return db.select().from(wallets).where(eq(wallets.userId, userId));
  }

  async getWallet(id: number, userId: string): Promise<Wallet | undefined> {
    const [wallet] = await db
      .select()
      .from(wallets)
      .where(and(eq(wallets.id, id), eq(wallets.userId, userId)));
    return wallet;
  }

  async createWallet(wallet: InsertWallet): Promise<Wallet> {
    const [newWallet] = await db.insert(wallets).values(wallet).returning();
    return newWallet;
  }

  async updateWalletBalance(
    id: number,
    userId: string,
    newBalance: string
  ): Promise<Wallet | undefined> {
    const [updated] = await db
      .update(wallets)
      .set({ balance: newBalance })
      .where(and(eq(wallets.id, id), eq(wallets.userId, userId)))
      .returning();
    return updated;
  }

  async updateWallet(
    id: number,
    userId: string,
    data: Partial<InsertWallet>
  ): Promise<Wallet | undefined> {
    const [updated] = await db
      .update(wallets)
      .set(data)
      .where(and(eq(wallets.id, id), eq(wallets.userId, userId)))
      .returning();
    return updated;
  }

  async deleteWallet(id: number, userId: string): Promise<boolean> {
    const result = await db
      .delete(wallets)
      .where(and(eq(wallets.id, id), eq(wallets.userId, userId)))
      .returning();
    return result.length > 0;
  }

  // AI insights cache operations
  async getLatestAiInsights(userId: string): Promise<{ payload: any; createdAt: Date } | undefined> {
    try {
      const [row] = await db
        .select()
        .from(aiInsights)
        .where(eq(aiInsights.userId, userId))
        .orderBy(desc(aiInsights.createdAt))
        .limit(1);
      if (!row) return undefined;
      return { payload: row.payload, createdAt: row.createdAt as Date };
    } catch (e) {
      return undefined;
    }
  }

  async saveAiInsights(userId: string, payload: any): Promise<void> {
    try {
      await db
        .insert(aiInsights)
        .values({ userId, payload })
        .onConflictDoUpdate({ target: aiInsights.userId, set: { payload, createdAt: new Date() } });
    } catch (e) {
      // ignore when table not exist; caller will still get AI response
    }
  }

  async setDefaultWallet(id: number, userId: string): Promise<Wallet | undefined> {
    await db
      .update(wallets)
      .set({ isDefault: false })
      .where(eq(wallets.userId, userId));
    
    const [updated] = await db
      .update(wallets)
      .set({ isDefault: true })
      .where(and(eq(wallets.id, id), eq(wallets.userId, userId)))
      .returning();
    return updated;
  }

  // Category operations
  async getCategories(userId: string): Promise<Category[]> {
    return db.select().from(categories).where(eq(categories.userId, userId));
  }

  async getCategory(id: number, userId: string): Promise<Category | undefined> {
    const [category] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.userId, userId)));
    return category;
  }

  async getCategoryByName(userId: string, name: string, type: string): Promise<Category | undefined> {
    const [category] = await db
      .select()
      .from(categories)
      .where(and(
        eq(categories.userId, userId),
        eq(categories.name, name),
        eq(categories.type, type)
      ));
    return category;
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    const [newCategory] = await db
      .insert(categories)
      .values(category)
      .returning();
    return newCategory;
  }

  // Category update and delete
  async updateCategory(id: number, userId: string, data: Partial<InsertCategory>): Promise<Category | undefined> {
    const [updated] = await db
      .update(categories)
      .set(data)
      .where(and(eq(categories.id, id), eq(categories.userId, userId), eq(categories.isDefault, false)))
      .returning();
    return updated;
  }

  async deleteCategory(id: number, userId: string): Promise<boolean> {
    const result = await db
      .delete(categories)
      .where(and(eq(categories.id, id), eq(categories.userId, userId), eq(categories.isDefault, false)))
      .returning();
    return result.length > 0;
  }

  // Transaction operations
  async getTransactions(userId: string, filters?: TransactionFilters): Promise<any[]> {
    let query = db
      .select({
        id: transactions.id,
        userId: transactions.userId,
        type: transactions.type,
        amount: transactions.amount,
        walletId: transactions.walletId,
        toWalletId: transactions.toWalletId,
        categoryId: transactions.categoryId,
        subLedgerId: transactions.subLedgerId,
        description: transactions.description,
        tags: transactions.tags,
        date: transactions.date,
        createdAt: transactions.createdAt,
        category: categories,
        wallet: wallets,
        subLedger: subLedgers,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(wallets, eq(transactions.walletId, wallets.id))
      .leftJoin(subLedgers, eq(transactions.subLedgerId, subLedgers.id))
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.date))
      .$dynamic();

    const result = await query;

    // Apply filters in memory for simplicity
    let filtered = result;
    if (filters) {
      if (filters.startDate) {
        filtered = filtered.filter(t => new Date(t.date) >= filters.startDate!);
      }
      if (filters.endDate) {
        filtered = filtered.filter(t => new Date(t.date) <= filters.endDate!);
      }
      if (filters.categoryId) {
        filtered = filtered.filter(t => t.categoryId === filters.categoryId);
      }
      if (filters.walletId) {
        filtered = filtered.filter(t => t.walletId === filters.walletId);
      }
      if (filters.type) {
        filtered = filtered.filter(t => t.type === filters.type);
      }
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filtered = filtered.filter(t => 
          t.description?.toLowerCase().includes(searchLower) ||
          t.category?.name.toLowerCase().includes(searchLower)
        );
      }
    }

    const start = filters?.offset ? Math.max(0, filters.offset) : 0;
    const end = filters?.limit ? start + Math.max(0, filters.limit) : undefined;
    const paged = end !== undefined ? filtered.slice(start, end) : filtered;

    const transactionsWithToWallet = await Promise.all(
      paged.map(async (t) => {
        let toWallet = null;
        if (t.toWalletId) {
          const [tw] = await db
            .select()
            .from(wallets)
            .where(eq(wallets.id, t.toWalletId));
          toWallet = tw || null;
        }
        return {
          id: t.id,
          userId: t.userId,
          type: t.type,
          amount: t.amount,
          walletId: t.walletId,
          toWalletId: t.toWalletId,
          categoryId: t.categoryId,
          subLedgerId: t.subLedgerId,
          description: t.description,
          tags: t.tags,
          date: t.date,
          createdAt: t.createdAt,
          category: t.category,
          wallet: t.wallet,
          subLedger: t.subLedger,
          toWallet,
        };
      })
    );

    return transactionsWithToWallet;
  }

  async getTransaction(id: number, userId: string): Promise<Transaction | undefined> {
    const [transaction] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
    return transaction;
  }

  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const [newTransaction] = await db
      .insert(transactions)
      .values(transaction)
      .returning();
    return newTransaction;
  }

  async updateTransaction(id: number, userId: string, data: Partial<InsertTransaction>): Promise<Transaction | undefined> {
    const [updated] = await db
      .update(transactions)
      .set(data)
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
      .returning();
    return updated;
  }

  async deleteTransaction(id: number, userId: string): Promise<boolean> {
    const result = await db
      .delete(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async deleteTransactionsByWallet(walletId: number, userId: string): Promise<boolean> {
    // Delete all transactions where this wallet is the source OR destination
    await db
      .delete(transactions)
      .where(and(
        eq(transactions.userId, userId),
        or(
          eq(transactions.walletId, walletId),
          eq(transactions.toWalletId, walletId)
        )
      ));
    return true;
  }

  async getTransactionStats(userId: string, startDate: Date, endDate: Date): Promise<TransactionStats> {
    const allTransactions = await this.getTransactions(userId, { startDate, endDate });
    
    let totalIncome = 0;
    let totalExpense = 0;
    const categoryTotals: Map<number, { name: string; total: number; color: string }> = new Map();

    for (const t of allTransactions) {
      const amount = parseFloat(t.amount);
      if (t.type === 'income') {
        totalIncome += amount;
      } else if (t.type === 'expense') {
        totalExpense += amount;
        if (t.categoryId && t.category) {
          const existing = categoryTotals.get(t.categoryId);
          if (existing) {
            existing.total += amount;
          } else {
            categoryTotals.set(t.categoryId, {
              name: t.category.name,
              total: amount,
              color: t.category.color || '#6B7280',
            });
          }
        }
      }
    }

    return {
      totalIncome,
      totalExpense,
      categoryBreakdown: Array.from(categoryTotals.entries()).map(([categoryId, data]) => ({
        categoryId,
        categoryName: data.name,
        total: data.total,
        color: data.color,
      })).sort((a, b) => b.total - a.total),
    };
  }

  // Budget operations
  async getBudgets(userId: string, month?: number, year?: number): Promise<Budget[]> {
    if (month !== undefined && year !== undefined) {
      return db.select().from(budgets)
        .where(and(eq(budgets.userId, userId), eq(budgets.month, month), eq(budgets.year, year)));
    }
    return db.select().from(budgets).where(eq(budgets.userId, userId));
  }

  async getBudget(id: number, userId: string): Promise<Budget | undefined> {
    const [budget] = await db.select().from(budgets)
      .where(and(eq(budgets.id, id), eq(budgets.userId, userId)));
    return budget;
  }

  async createBudget(budget: InsertBudget): Promise<Budget> {
    const [newBudget] = await db.insert(budgets).values(budget).returning();
    return newBudget;
  }

  async updateBudget(id: number, userId: string, data: Partial<InsertBudget>): Promise<Budget | undefined> {
    const [updated] = await db.update(budgets).set(data)
      .where(and(eq(budgets.id, id), eq(budgets.userId, userId))).returning();
    return updated;
  }

  async deleteBudget(id: number, userId: string): Promise<boolean> {
    const result = await db.delete(budgets)
      .where(and(eq(budgets.id, id), eq(budgets.userId, userId))).returning();
    return result.length > 0;
  }

  async getBudgetSpending(userId: string, month: number, year: number): Promise<BudgetWithSpending[]> {
    const monthBudgets = await this.getBudgets(userId, month, year);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    const result: BudgetWithSpending[] = [];
    
    for (const budget of monthBudgets) {
      const category = await this.getCategory(budget.categoryId, userId);
      const transactions = await this.getTransactions(userId, {
        startDate,
        endDate,
        categoryId: budget.categoryId,
        type: 'expense',
      });
      
      const spent = transactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);
      
      result.push({
        ...budget,
        spent,
        categoryName: category?.name || 'Unknown',
        categoryColor: category?.color || '#6B7280',
      });
    }
    
    return result;
  }

  // Savings goal operations
  async getSavingsGoals(userId: string): Promise<SavingsGoal[]> {
    return db.select().from(savingsGoals).where(eq(savingsGoals.userId, userId));
  }

  async getSavingsGoal(id: number, userId: string): Promise<SavingsGoal | undefined> {
    const [goal] = await db.select().from(savingsGoals)
      .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)));
    return goal;
  }

  async createSavingsGoal(goal: InsertSavingsGoal): Promise<SavingsGoal> {
    const [newGoal] = await db.insert(savingsGoals).values(goal).returning();
    return newGoal;
  }

  async updateSavingsGoal(id: number, userId: string, data: Partial<InsertSavingsGoal>): Promise<SavingsGoal | undefined> {
    const [updated] = await db.update(savingsGoals).set(data)
      .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId))).returning();
    return updated;
  }

  async deleteSavingsGoal(id: number, userId: string): Promise<boolean> {
    const result = await db.delete(savingsGoals)
      .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId))).returning();
    return result.length > 0;
  }

  // Recurring transaction operations
  async getRecurringTransactions(userId: string): Promise<RecurringTransaction[]> {
    return db.select().from(recurringTransactions).where(eq(recurringTransactions.userId, userId));
  }

  async getRecurringTransaction(id: number, userId: string): Promise<RecurringTransaction | undefined> {
    const [recurring] = await db.select().from(recurringTransactions)
      .where(and(eq(recurringTransactions.id, id), eq(recurringTransactions.userId, userId)));
    return recurring;
  }

  async createRecurringTransaction(recurring: InsertRecurringTransaction): Promise<RecurringTransaction> {
    const [newRecurring] = await db.insert(recurringTransactions).values(recurring).returning();
    return newRecurring;
  }

  async updateRecurringTransaction(id: number, userId: string, data: Partial<InsertRecurringTransaction>): Promise<RecurringTransaction | undefined> {
    const [updated] = await db.update(recurringTransactions).set(data)
      .where(and(eq(recurringTransactions.id, id), eq(recurringTransactions.userId, userId))).returning();
    return updated;
  }

  async deleteRecurringTransaction(id: number, userId: string): Promise<boolean> {
    const result = await db.delete(recurringTransactions)
      .where(and(eq(recurringTransactions.id, id), eq(recurringTransactions.userId, userId))).returning();
    return result.length > 0;
  }

  // Bill reminder operations
  async getBillReminders(userId: string): Promise<BillReminder[]> {
    return db.select().from(billReminders).where(eq(billReminders.userId, userId)).orderBy(billReminders.dueDate);
  }

  async getBillReminder(id: number, userId: string): Promise<BillReminder | undefined> {
    const [reminder] = await db.select().from(billReminders)
      .where(and(eq(billReminders.id, id), eq(billReminders.userId, userId)));
    return reminder;
  }

  async createBillReminder(reminder: InsertBillReminder): Promise<BillReminder> {
    const [newReminder] = await db.insert(billReminders).values(reminder).returning();
    return newReminder;
  }

  async updateBillReminder(id: number, userId: string, data: Partial<InsertBillReminder>): Promise<BillReminder | undefined> {
    const [updated] = await db.update(billReminders).set(data)
      .where(and(eq(billReminders.id, id), eq(billReminders.userId, userId))).returning();
    return updated;
  }

  async deleteBillReminder(id: number, userId: string): Promise<boolean> {
    const result = await db.delete(billReminders)
      .where(and(eq(billReminders.id, id), eq(billReminders.userId, userId))).returning();
    return result.length > 0;
  }

  // Exchange credentials operations
  async getExchangeCredentials(userId: string): Promise<ExchangeCredential[]> {
    return db.select().from(exchangeCredentials).where(eq(exchangeCredentials.userId, userId));
  }

  async getExchangeCredential(id: number, userId: string): Promise<ExchangeCredential | undefined> {
    const [credential] = await db.select().from(exchangeCredentials)
      .where(and(eq(exchangeCredentials.id, id), eq(exchangeCredentials.userId, userId)));
    return credential;
  }

  async getExchangeCredentialByExchange(userId: string, exchange: string): Promise<ExchangeCredential | undefined> {
    const [credential] = await db.select().from(exchangeCredentials)
      .where(and(eq(exchangeCredentials.userId, userId), eq(exchangeCredentials.exchange, exchange)));
    return credential;
  }

  async createExchangeCredential(credential: InsertExchangeCredential): Promise<ExchangeCredential> {
    const [newCredential] = await db.insert(exchangeCredentials).values(credential).returning();
    return newCredential;
  }

  async updateExchangeCredential(id: number, userId: string, data: Partial<InsertExchangeCredential>): Promise<ExchangeCredential | undefined> {
    const [updated] = await db.update(exchangeCredentials)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(exchangeCredentials.id, id), eq(exchangeCredentials.userId, userId)))
      .returning();
    return updated;
  }

  async deleteExchangeCredential(id: number, userId: string): Promise<boolean> {
    const result = await db.delete(exchangeCredentials)
      .where(and(eq(exchangeCredentials.id, id), eq(exchangeCredentials.userId, userId))).returning();
    return result.length > 0;
  }

  // Dashboard preferences operations
  async getDashboardPreferences(userId: string): Promise<UserDashboardPreferences | undefined> {
    const [prefs] = await db.select().from(userDashboardPreferences)
      .where(eq(userDashboardPreferences.userId, userId));
    return prefs;
  }

  async upsertDashboardPreferences(userId: string, data: Partial<InsertUserDashboardPreferences>): Promise<UserDashboardPreferences> {
    const existing = await this.getDashboardPreferences(userId);
    
    if (existing) {
      const [updated] = await db.update(userDashboardPreferences)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(userDashboardPreferences.userId, userId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(userDashboardPreferences)
        .values({ userId, ...data })
        .returning();
      return created;
    }
  }

  // Analytics preferences operations
  async getAnalyticsPreferences(userId: string): Promise<UserAnalyticsPreferences | undefined> {
    const [prefs] = await db.select().from(userAnalyticsPreferences)
      .where(eq(userAnalyticsPreferences.userId, userId));
    return prefs;
  }

  async upsertAnalyticsPreferences(userId: string, data: Partial<InsertUserAnalyticsPreferences>): Promise<UserAnalyticsPreferences> {
    const existing = await this.getAnalyticsPreferences(userId);
    
    if (existing) {
      const [updated] = await db.update(userAnalyticsPreferences)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(userAnalyticsPreferences.userId, userId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(userAnalyticsPreferences)
        .values({ userId, ...data })
        .returning();
      return created;
    }
  }

  // Mobile nav preferences operations
  async getMobileNavPreferences(userId: string): Promise<UserMobileNavPreferences | undefined> {
    const [prefs] = await db.select().from(userMobileNavPreferences)
      .where(eq(userMobileNavPreferences.userId, userId));
    return prefs;
  }

  async upsertMobileNavPreferences(userId: string, data: Partial<InsertUserMobileNavPreferences>): Promise<UserMobileNavPreferences> {
    const existing = await this.getMobileNavPreferences(userId);
    
    if (existing) {
      const [updated] = await db.update(userMobileNavPreferences)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(userMobileNavPreferences.userId, userId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(userMobileNavPreferences)
        .values({ userId, ...data })
        .returning();
      return created;
    }
  }

  // Wallet preferences operations
  async getWalletPreferences(userId: string): Promise<UserWalletPreferences | undefined> {
    const [prefs] = await db.select().from(userWalletPreferences)
      .where(eq(userWalletPreferences.userId, userId));
    return prefs;
  }

  async upsertWalletPreferences(userId: string, data: Partial<InsertUserWalletPreferences>): Promise<UserWalletPreferences> {
    const existing = await this.getWalletPreferences(userId);
    
    if (existing) {
      const [updated] = await db.update(userWalletPreferences)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(userWalletPreferences.userId, userId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(userWalletPreferences)
        .values({ userId, ...data })
        .returning();
      return created;
    }
  }

  // Sub-ledger operations
  async getSubLedgers(userId: string, includeArchived: boolean = false): Promise<SubLedger[]> {
    if (includeArchived) {
      return db.select().from(subLedgers).where(eq(subLedgers.userId, userId)).orderBy(desc(subLedgers.createdAt));
    }
    return db.select().from(subLedgers)
      .where(and(eq(subLedgers.userId, userId), eq(subLedgers.isArchived, false)))
      .orderBy(desc(subLedgers.createdAt));
  }

  async getSubLedger(id: number, userId: string): Promise<SubLedger | undefined> {
    const [subLedger] = await db.select().from(subLedgers)
      .where(and(eq(subLedgers.id, id), eq(subLedgers.userId, userId)));
    return subLedger;
  }

  async createSubLedger(subLedger: InsertSubLedger): Promise<SubLedger> {
    const [newSubLedger] = await db.insert(subLedgers).values(subLedger).returning();
    return newSubLedger;
  }

  async updateSubLedger(id: number, userId: string, data: Partial<InsertSubLedger>): Promise<SubLedger | undefined> {
    const [updated] = await db.update(subLedgers)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(subLedgers.id, id), eq(subLedgers.userId, userId)))
      .returning();
    return updated;
  }

  async deleteSubLedger(id: number, userId: string): Promise<boolean> {
    const result = await db.delete(subLedgers)
      .where(and(eq(subLedgers.id, id), eq(subLedgers.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async getGroupActivities(userId: string): Promise<GroupActivity[]> {
    try {
      return db.select().from(groupActivities).where(eq(groupActivities.userId, userId)).orderBy(desc(groupActivities.createdAt));
    } catch {
      return [];
    }
  }

  async getGroupActivity(id: number, userId: string): Promise<GroupActivity | undefined> {
    try {
      const [activity] = await db.select().from(groupActivities)
        .where(and(eq(groupActivities.id, id), eq(groupActivities.userId, userId)));
      return activity;
    } catch {
      return undefined;
    }
  }

  async createGroupActivity(activity: InsertGroupActivity): Promise<GroupActivity> {
    const [created] = await db.insert(groupActivities).values(activity).returning();
    return created;
  }

  async updateGroupActivity(id: number, userId: string, data: Partial<InsertGroupActivity>): Promise<GroupActivity | undefined> {
    const [updated] = await db.update(groupActivities)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(groupActivities.id, id), eq(groupActivities.userId, userId)))
      .returning();
    return updated;
  }

  async deleteGroupActivity(id: number, userId: string): Promise<boolean> {
    const result = await db.delete(groupActivities)
      .where(and(eq(groupActivities.id, id), eq(groupActivities.userId, userId)))
      .returning();
    return result.length > 0;
  }

  // Initialize default data for new users with idempotent inserts
  async initializeUserDefaults(userId: string, defaultCurrency: string = "MYR"): Promise<void> {
    // Ensure default wallets exist
    const existingWallets = await this.getWallets(userId);
    if (existingWallets.length === 0) {
      const walletInserts = defaultWallets.map((wallet) => ({
        userId,
        name: wallet.name,
        type: wallet.type,
        currency: defaultCurrency,
        icon: wallet.icon,
        color: wallet.color,
        isDefault: wallet.isDefault,
        balance: "0",
      }));
      await db.insert(wallets).values(walletInserts);
    }

    // Ensure default categories exist (insert missing ones only)
    const existingCategories = await this.getCategories(userId);
    const existingKey = new Set(
      existingCategories.map((c) => `${c.type}:${c.name}`)
    );

    const missingExpense = defaultExpenseCategories
      .filter((c) => !existingKey.has(`expense:${c.name}`))
      .map((category) => ({
        userId,
        name: category.name,
        type: "expense" as const,
        icon: category.icon,
        color: category.color,
        isDefault: true,
      }));

    if (missingExpense.length > 0) {
      await db.insert(categories).values(missingExpense);
    }

    const missingIncome = defaultIncomeCategories
      .filter((c) => !existingKey.has(`income:${c.name}`))
      .map((category) => ({
        userId,
        name: category.name,
        type: "income" as const,
        icon: category.icon,
        color: category.color,
        isDefault: true,
      }));

    if (missingIncome.length > 0) {
      await db.insert(categories).values(missingIncome);
    }
  }
}

export const storage = new DatabaseStorage();
