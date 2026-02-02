import { sql } from 'drizzle-orm';
import {
  index,
  uniqueIndex,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  integer,
  decimal,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  passwordHash: varchar("password_hash"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  defaultCurrency: varchar("default_currency", { length: 10 }).notNull().default("MYR"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Wallets table - supports different payment methods
export const wallets = pgTable("wallets", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // cash, bank_card, digital_wallet, credit_card
  currency: varchar("currency", { length: 10 }).notNull().default("MYR"),
  balance: decimal("balance", { precision: 15, scale: 2 }).notNull().default("0"),
  exchangeRateToDefault: decimal("exchange_rate_to_default", { precision: 15, scale: 6 }).default("1"), // rate to convert to user's default currency
  icon: varchar("icon", { length: 50 }), // icon name for display
  color: varchar("color", { length: 20 }), // hex color for card display
  isDefault: boolean("is_default").default(false),
  isFlexible: boolean("is_flexible").default(true), // true = flexible funds (可灵活调用), false = long-term/emergency savings
  createdAt: timestamp("created_at").defaultNow(),
});

// Categories table - for transaction categorization
export const categories = pgTable("categories", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  type: varchar("type", { length: 20 }).notNull(), // expense, income
  icon: varchar("icon", { length: 50 }),
  color: varchar("color", { length: 20 }),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Transactions table - supports expense, income, and transfer
export const transactions = pgTable("transactions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 20 }).notNull(), // expense, income, transfer
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(), // amount in wallet currency
  currency: varchar("currency", { length: 10 }).notNull().default("MYR"), // transaction input currency
  originalAmount: decimal("original_amount", { precision: 15, scale: 2 }), // amount in original currency
  exchangeRate: decimal("exchange_rate", { precision: 15, scale: 6 }).default("1"), // rate to convert to wallet currency
  walletId: integer("wallet_id").notNull().references(() => wallets.id, { onDelete: "cascade" }),
  toWalletId: integer("to_wallet_id").references(() => wallets.id, { onDelete: "cascade" }), // for transfers
  toWalletAmount: decimal("to_wallet_amount", { precision: 15, scale: 2 }), // amount received in destination wallet (for transfers with different currencies)
  toExchangeRate: decimal("to_exchange_rate", { precision: 15, scale: 6 }), // exchange rate for destination wallet
  categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
  subLedgerId: integer("sub_ledger_id").references(() => subLedgers.id, { onDelete: "set null" }), // optional sub-ledger association
  loanId: integer("loan_id").references(() => loans.id, { onDelete: "set null" }), // optional loan association
  description: text("description"),
  tags: text("tags").array(), // tags for transaction
  date: timestamp("date").notNull().defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_transactions_user_date").on(table.userId, table.date),
  index("IDX_transactions_wallet").on(table.walletId),
  index("IDX_transactions_category").on(table.categoryId),
  index("IDX_transactions_loan").on(table.loanId)
]);

// Loans table - for tracking debts (lending and borrowing)
export const loans = pgTable("loans", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 20 }).notNull(), // lend (I lent to someone), borrow (I borrowed from someone)
  person: varchar("person", { length: 100 }).notNull(), // The person involved
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).notNull().default("MYR"),
  paidAmount: decimal("paid_amount", { precision: 15, scale: 2 }).default("0"),
  status: varchar("status", { length: 20 }).default("active"), // active, settled, bad_debt
  startDate: timestamp("start_date").defaultNow(),
  dueDate: timestamp("due_date"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_loans_user").on(table.userId)
]);

// Budgets table - monthly budget per category
export const budgets = pgTable("budgets", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  categoryId: integer("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  month: integer("month").notNull(), // 1-12
  year: integer("year").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Savings goals table
export const savingsGoals = pgTable("savings_goals", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  targetAmount: decimal("target_amount", { precision: 15, scale: 2 }).notNull(),
  currentAmount: decimal("current_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  currency: varchar("currency", { length: 10 }).notNull().default("MYR"),
  targetDate: timestamp("target_date"),
  icon: varchar("icon", { length: 50 }),
  color: varchar("color", { length: 20 }),
  isCompleted: boolean("is_completed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Recurring transactions table
export const recurringTransactions = pgTable("recurring_transactions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 20 }).notNull(), // expense, income
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  walletId: integer("wallet_id").notNull().references(() => wallets.id, { onDelete: "cascade" }),
  categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
  description: text("description"),
  frequency: varchar("frequency", { length: 20 }).notNull(), // daily, weekly, monthly, yearly
  dayOfMonth: integer("day_of_month"), // 1-31 for monthly
  dayOfWeek: integer("day_of_week"), // 0-6 for weekly (0=Sunday)
  nextExecutionDate: timestamp("next_execution_date").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Bill reminders table
export const billReminders = pgTable("bill_reminders", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }),
  dueDate: timestamp("due_date").notNull(),
  frequency: varchar("frequency", { length: 20 }).notNull(), // once, weekly, monthly, yearly
  categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
  walletId: integer("wallet_id").references(() => wallets.id, { onDelete: "set null" }),
  isPaid: boolean("is_paid").default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Sub-ledgers table - for separate tracking of specific spending (e.g., travel, projects)
export const subLedgers = pgTable("sub_ledgers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 50 }),
  color: varchar("color", { length: 20 }),
  budgetAmount: decimal("budget_amount", { precision: 15, scale: 2 }), // optional budget for this sub-ledger
  includeInMainAnalytics: boolean("include_in_main_analytics").default(true), // whether to include in main ledger analytics
  isArchived: boolean("is_archived").default(false),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User dashboard preferences table
export const userDashboardPreferences = pgTable("user_dashboard_preferences", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  showTotalAssets: boolean("show_total_assets").default(true),
  showMonthlyIncome: boolean("show_monthly_income").default(true),
  showMonthlyExpense: boolean("show_monthly_expense").default(true),
  showWallets: boolean("show_wallets").default(true),
  showBudgets: boolean("show_budgets").default(true),
  showSavingsGoals: boolean("show_savings_goals").default(true),
  showRecentTransactions: boolean("show_recent_transactions").default(true),
  showFlexibleFunds: boolean("show_flexible_funds").default(true),
  cardOrder: text("card_order").array(), // array of card keys in user's preferred order
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User analytics preferences table
export const userAnalyticsPreferences = pgTable("user_analytics_preferences", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  showYearlyStats: boolean("show_yearly_stats").default(true),
  showMonthlyTrend: boolean("show_monthly_trend").default(true),
  showExpenseDistribution: boolean("show_expense_distribution").default(true),
  showIncomeDistribution: boolean("show_income_distribution").default(true),
  showBudgetProgress: boolean("show_budget_progress").default(true),
  showSavingsProgress: boolean("show_savings_progress").default(true),
  showWalletDistribution: boolean("show_wallet_distribution").default(true),
  showCashflowTrend: boolean("show_cashflow_trend").default(true),
  showTopCategories: boolean("show_top_categories").default(true),
  showMonthlyComparison: boolean("show_monthly_comparison").default(true),
  showFullAmount: boolean("show_full_amount").default(false),
  cardOrder: text("card_order").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User mobile nav preferences table
export const userMobileNavPreferences = pgTable("user_mobile_nav_preferences", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  navOrder: text("nav_order").array(), // array of nav item keys in user's preferred order
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User wallet preferences table - for wallet ordering within dashboard
export const userWalletPreferences = pgTable("user_wallet_preferences", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  walletOrder: jsonb("wallet_order"), // { [type: string]: number[] } - wallet IDs ordered within each type
  typeOrder: text("type_order").array(), // array of wallet types in user's preferred order
  groupByType: boolean("group_by_type").default(true), // whether to group wallets by type
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Exchange credentials table - for crypto exchange API integration
export const exchangeCredentials = pgTable("exchange_credentials", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  exchange: varchar("exchange", { length: 50 }).notNull(), // mexc, binance, etc.
  apiKey: text("api_key").notNull(), // encrypted
  apiSecret: text("api_secret").notNull(), // encrypted
  label: varchar("label", { length: 100 }), // user-friendly name
  manualBalance: decimal("manual_balance", { precision: 15, scale: 2 }).default("0"), // manual balance for accounts API can't access (理财、跟单等)
  isActive: boolean("is_active").default(true),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  wallets: many(wallets),
  categories: many(categories),
  transactions: many(transactions),
  budgets: many(budgets),
  savingsGoals: many(savingsGoals),
  recurringTransactions: many(recurringTransactions),
  billReminders: many(billReminders),
  exchangeCredentials: many(exchangeCredentials),
  subLedgers: many(subLedgers),
  dashboardPreferences: one(userDashboardPreferences),
}));

export const subLedgersRelations = relations(subLedgers, ({ one, many }) => ({
  user: one(users, { fields: [subLedgers.userId], references: [users.id] }),
  transactions: many(transactions),
}));

export const loansRelations = relations(loans, ({ one, many }) => ({
  user: one(users, { fields: [loans.userId], references: [users.id] }),
  transactions: many(transactions),
}));

export const userDashboardPreferencesRelations = relations(userDashboardPreferences, ({ one }) => ({
  user: one(users, { fields: [userDashboardPreferences.userId], references: [users.id] }),
}));

export const userAnalyticsPreferencesRelations = relations(userAnalyticsPreferences, ({ one }) => ({
  user: one(users, { fields: [userAnalyticsPreferences.userId], references: [users.id] }),
}));

export const userMobileNavPreferencesRelations = relations(userMobileNavPreferences, ({ one }) => ({
  user: one(users, { fields: [userMobileNavPreferences.userId], references: [users.id] }),
}));

export const userWalletPreferencesRelations = relations(userWalletPreferences, ({ one }) => ({
  user: one(users, { fields: [userWalletPreferences.userId], references: [users.id] }),
}));

export const walletsRelations = relations(wallets, ({ one, many }) => ({
  user: one(users, { fields: [wallets.userId], references: [users.id] }),
  transactions: many(transactions),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, { fields: [categories.userId], references: [users.id] }),
  transactions: many(transactions),
  budgets: many(budgets),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, { fields: [transactions.userId], references: [users.id] }),
  wallet: one(wallets, { fields: [transactions.walletId], references: [wallets.id] }),
  toWallet: one(wallets, { fields: [transactions.toWalletId], references: [wallets.id] }),
  category: one(categories, { fields: [transactions.categoryId], references: [categories.id] }),
  subLedger: one(subLedgers, { fields: [transactions.subLedgerId], references: [subLedgers.id] }),
  loan: one(loans, { fields: [transactions.loanId], references: [loans.id] }),
}));

export const budgetsRelations = relations(budgets, ({ one }) => ({
  user: one(users, { fields: [budgets.userId], references: [users.id] }),
  category: one(categories, { fields: [budgets.categoryId], references: [categories.id] }),
}));

export const savingsGoalsRelations = relations(savingsGoals, ({ one }) => ({
  user: one(users, { fields: [savingsGoals.userId], references: [users.id] }),
}));

export const recurringTransactionsRelations = relations(recurringTransactions, ({ one }) => ({
  user: one(users, { fields: [recurringTransactions.userId], references: [users.id] }),
  wallet: one(wallets, { fields: [recurringTransactions.walletId], references: [wallets.id] }),
  category: one(categories, { fields: [recurringTransactions.categoryId], references: [categories.id] }),
}));

export const billRemindersRelations = relations(billReminders, ({ one }) => ({
  user: one(users, { fields: [billReminders.userId], references: [users.id] }),
  category: one(categories, { fields: [billReminders.categoryId], references: [categories.id] }),
  wallet: one(wallets, { fields: [billReminders.walletId], references: [wallets.id] }),
}));

export const exchangeCredentialsRelations = relations(exchangeCredentials, ({ one }) => ({
  user: one(users, { fields: [exchangeCredentials.userId], references: [users.id] }),
}));

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export type InsertWallet = typeof wallets.$inferInsert;
export type Wallet = typeof wallets.$inferSelect;

export type InsertCategory = typeof categories.$inferInsert;
export type Category = typeof categories.$inferSelect;

export type InsertTransaction = typeof transactions.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;

export type InsertBudget = typeof budgets.$inferInsert;
export type Budget = typeof budgets.$inferSelect;

export type InsertSavingsGoal = typeof savingsGoals.$inferInsert;
export type SavingsGoal = typeof savingsGoals.$inferSelect;

export type InsertRecurringTransaction = typeof recurringTransactions.$inferInsert;
export type RecurringTransaction = typeof recurringTransactions.$inferSelect;

export type InsertBillReminder = typeof billReminders.$inferInsert;
export type BillReminder = typeof billReminders.$inferSelect;

export type InsertExchangeCredential = typeof exchangeCredentials.$inferInsert;
export type ExchangeCredential = typeof exchangeCredentials.$inferSelect;

export type InsertUserDashboardPreferences = typeof userDashboardPreferences.$inferInsert;
export type UserDashboardPreferences = typeof userDashboardPreferences.$inferSelect;

export type InsertUserAnalyticsPreferences = typeof userAnalyticsPreferences.$inferInsert;
export type UserAnalyticsPreferences = typeof userAnalyticsPreferences.$inferSelect;

export type InsertUserMobileNavPreferences = typeof userMobileNavPreferences.$inferInsert;
export type UserMobileNavPreferences = typeof userMobileNavPreferences.$inferSelect;

export type InsertUserWalletPreferences = typeof userWalletPreferences.$inferInsert;
export type UserWalletPreferences = typeof userWalletPreferences.$inferSelect;

export type InsertSubLedger = typeof subLedgers.$inferInsert;
export type SubLedger = typeof subLedgers.$inferSelect;

export type InsertLoan = typeof loans.$inferInsert;
export type Loan = typeof loans.$inferSelect;

// Zod schemas for validation
export const insertWalletSchema = (createInsertSchema(wallets) as any).omit({
  id: true,
  createdAt: true,
});

export const insertCategorySchema = (createInsertSchema(categories) as any).omit({
  id: true,
  createdAt: true,
});

export const insertTransactionSchema = (createInsertSchema(transactions) as any).omit({
  id: true,
  createdAt: true,
});

export const insertBudgetSchema = (createInsertSchema(budgets) as any).omit({
  id: true,
  createdAt: true,
});

export const insertSavingsGoalSchema = (createInsertSchema(savingsGoals) as any).omit({
  id: true,
  createdAt: true,
});

export const insertRecurringTransactionSchema = (createInsertSchema(recurringTransactions) as any).omit({
  id: true,
  createdAt: true,
});

export const insertBillReminderSchema = (createInsertSchema(billReminders) as any).omit({
  id: true,
  createdAt: true,
});

export const insertExchangeCredentialSchema = (createInsertSchema(exchangeCredentials) as any).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserDashboardPreferencesSchema = (createInsertSchema(userDashboardPreferences) as any).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserAnalyticsPreferencesSchema = (createInsertSchema(userAnalyticsPreferences) as any).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserMobileNavPreferencesSchema = (createInsertSchema(userMobileNavPreferences) as any).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserWalletPreferencesSchema = (createInsertSchema(userWalletPreferences) as any).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSubLedgerSchema = (createInsertSchema(subLedgers) as any).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLoanSchema = (createInsertSchema(loans) as any).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Transaction types enum
export const transactionTypes = ['expense', 'income', 'transfer'] as const;
export type TransactionType = typeof transactionTypes[number];

// Wallet types enum
export const walletTypes = ['cash', 'bank_card', 'digital_wallet', 'credit_card', 'investment'] as const;
export type WalletType = typeof walletTypes[number];

// Wallet type labels for display
export const walletTypeLabels: Record<string, string> = {
  cash: '现金',
  bank_card: '银行卡',
  digital_wallet: '数字钱包',
  credit_card: '信用卡',
  investment: '投资账户',
};

// Category types enum  
export const categoryTypes = ['expense', 'income'] as const;
export type CategoryType = typeof categoryTypes[number];

// Supported currencies
export const supportedCurrencies = [
  { code: 'MYR', name: '马来西亚林吉特', symbol: 'RM' },
  { code: 'CNY', name: '人民币', symbol: '¥' },
  { code: 'USD', name: '美元', symbol: '$' },
  { code: 'SGD', name: '新加坡元', symbol: 'S$' },
  { code: 'EUR', name: '欧元', symbol: '€' },
  { code: 'GBP', name: '英镑', symbol: '£' },
  { code: 'JPY', name: '日元', symbol: '¥' },
  { code: 'HKD', name: '港币', symbol: 'HK$' },
  { code: 'TWD', name: '新台币', symbol: 'NT$' },
  { code: 'THB', name: '泰铢', symbol: '฿' },
] as const;

export type CurrencyCode = typeof supportedCurrencies[number]['code'];

// Helper to get currency info
export function getCurrencyInfo(code: string) {
  return supportedCurrencies.find(c => c.code === code) || supportedCurrencies[0];
}

// AI insights cache table - store last AI output per user with timestamp
export const aiInsights = pgTable(
  "ai_insights",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [uniqueIndex("uniq_ai_insights_user").on(t.userId)]
);

export type AiInsight = typeof aiInsights.$inferSelect;

export const groupActivities = pgTable("group_activities", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 120 }).notNull(),
  currency: varchar("currency", { length: 10 }).notNull().default("MYR"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type GroupActivity = typeof groupActivities.$inferSelect;
export type InsertGroupActivity = typeof groupActivities.$inferInsert;

export const insertGroupActivitySchema = (createInsertSchema(groupActivities) as any).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
