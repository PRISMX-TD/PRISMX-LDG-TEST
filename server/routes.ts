import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, TransactionFilters } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { 
  insertTransactionSchema, 
  supportedCurrencies,
  insertBudgetSchema,
  insertSavingsGoalSchema,
  insertRecurringTransactionSchema,
  insertBillReminderSchema,
  insertCategorySchema,
} from "@shared/schema";
import { z } from "zod";
import { encrypt, decrypt, getBalancesWithValues, fetchMexcAccountInfo } from "./mexc";
import { validatePionexCredentials, getPionexBalancesWithValues } from "./pionex";

const supportedCurrencyCodes = supportedCurrencies.map(c => c.code);

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const txCreateSchema = z.object({
    type: z.enum(["expense","income","transfer"]),
    amount: z.number().positive(),
    currency: z.string().min(1).optional(),
    exchangeRate: z.number().positive().optional(),
    toWalletAmount: z.number().positive().optional(),
    toExchangeRate: z.number().positive().optional(),
    walletId: z.number().int().positive(),
    toWalletId: z.number().int().positive().optional(),
    categoryId: z.number().int().positive().optional(),
    subLedgerId: z.number().int().positive().optional(),
    description: z.string().nullable().optional(),
    date: z.string().min(1),
  }).strict();
  const txUpdateSchema = txCreateSchema;
  // Auth middleware with fallback or explicit disable
  if (process.env.DISABLE_AUTH === 'true') {
    app.use((req: any, _res, next) => {
      req.user = { claims: { sub: req.header("x-user-id") || "demo-user" } };
      req.isAuthenticated = () => true;
      next();
    });
  } else {
    try {
      await setupAuth(app);
    } catch (err) {
      console.error("Auth setup failed, enabling open access fallback:", err);
      const isProd = process.env.NODE_ENV === 'production';
      const readonlyFallback = process.env.READONLY_FALLBACK === 'true';
      app.use((req: any, res, next) => {
        req.user = { claims: { sub: req.header("x-user-id") || "demo-user" } };
        req.isAuthenticated = () => true;
        if (
          readonlyFallback &&
          isProd &&
          req.path.startsWith('/api/') &&
          ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
          (req.user?.claims?.sub === 'demo-user')
        ) {
          return res.status(403).json({ message: 'Read-only mode' });
        }
        next();
      });
    }
  }

  // Ensure user record exists for any authenticated request (including fallback mode)
  app.use(async (req: any, _res, next) => {
    try {
      if (req.path.startsWith('/api/') && req.user?.claims?.sub) {
        const userId = req.user.claims.sub;
        const user = await storage.getUser(userId);
        if (!user) {
          await storage.upsertUser({ id: userId });
          await storage.initializeUserDefaults(userId, 'MYR');
        }
      }
    } catch (e) {
      // ignore
    }
    next();
  });

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      let user = await storage.getUser(userId);
      if (!user && process.env.DISABLE_AUTH === 'true') {
        user = await storage.upsertUser({ id: userId });
      }
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Update user's default currency
  app.patch('/api/user/currency', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { currency } = req.body;
      
      if (!currency || typeof currency !== 'string') {
        return res.status(400).json({ message: "Currency is required" });
      }
      
      // Validate against supported currencies
      if (!supportedCurrencyCodes.includes(currency as any)) {
        return res.status(400).json({ message: "Unsupported currency" });
      }
      
      const user = await storage.updateUserCurrency(userId, currency);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      console.error("Error updating user currency:", error);
      res.status(500).json({ message: "Failed to update currency" });
    }
  });

  // Exchange rate API
  app.get('/api/exchange-rate', isAuthenticated, async (req: any, res) => {
    try {
      const { from, to } = req.query;
      
      if (!from || !to || typeof from !== 'string' || typeof to !== 'string') {
        return res.status(400).json({ message: "Both 'from' and 'to' currency codes are required" });
      }

      const fromCurrency = from.toUpperCase();
      const toCurrency = to.toUpperCase();

      if (!supportedCurrencyCodes.includes(fromCurrency as any) || !supportedCurrencyCodes.includes(toCurrency as any)) {
        return res.status(400).json({ message: "Unsupported currency code" });
      }

      if (fromCurrency === toCurrency) {
        return res.json({ rate: 1, from: fromCurrency, to: toCurrency });
      }

      // Use Frankfurter API (free, no API key required)
      const response = await fetch(
        `https://api.frankfurter.app/latest?from=${fromCurrency}&to=${toCurrency}`
      );

      if (!response.ok) {
        // Fallback: try with a different API or return error
        console.error("Frankfurter API error:", response.status);
        return res.status(503).json({ message: "无法获取汇率，请手动输入" });
      }

      const data = await response.json();
      const rate = data.rates?.[toCurrency];

      if (!rate) {
        return res.status(503).json({ message: "无法获取该币种汇率，请手动输入" });
      }

      res.json({ rate, from: fromCurrency, to: toCurrency });
    } catch (error) {
      console.error("Error fetching exchange rate:", error);
      res.status(503).json({ message: "无法获取汇率，请手动输入" });
    }
  });

  // Wallet routes
  app.get('/api/wallets', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const wallets = await storage.getWallets(userId);
      res.json(wallets);
    } catch (error) {
      console.error("Error fetching wallets:", error);
      res.status(500).json({ message: "Failed to fetch wallets" });
    }
  });

  app.get('/api/wallets/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      const wallet = await storage.getWallet(id, userId);
      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }
      res.json(wallet);
    } catch (error) {
      console.error("Error fetching wallet:", error);
      res.status(500).json({ message: "Failed to fetch wallet" });
    }
  });

  // Create new wallet
  app.post('/api/wallets', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { name, type, currency, color, icon, exchangeRateToDefault, isFlexible } = req.body;
      
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ message: "Name is required" });
      }
      
      const walletCurrency = currency || "MYR";
      if (!supportedCurrencyCodes.includes(walletCurrency)) {
        return res.status(400).json({ message: "Unsupported currency" });
      }
      
      // Validate exchange rate if provided
      let rateToDefault = "1";
      if (exchangeRateToDefault !== undefined) {
        const rate = parseFloat(exchangeRateToDefault);
        if (!isNaN(rate) && rate > 0) {
          rateToDefault = rate.toFixed(6);
        }
      }
      
      const wallet = await storage.createWallet({
        userId,
        name: name.trim(),
        type: type || "cash",
        currency: walletCurrency,
        color: color || "#3B82F6",
        icon: icon || "wallet",
        balance: "0",
        isDefault: false,
        exchangeRateToDefault: rateToDefault,
        isFlexible: isFlexible !== false,
      });
      res.status(201).json(wallet);
    } catch (error) {
      console.error("Error creating wallet:", error);
      res.status(500).json({ message: "Failed to create wallet" });
    }
  });

  // Update wallet
  app.patch('/api/wallets/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      const { name, type, currency, color, icon, isDefault, exchangeRateToDefault, isFlexible } = req.body;
      
      const existingWallet = await storage.getWallet(id, userId);
      if (!existingWallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }
      
      // Handle setting as default wallet
      if (isDefault === true) {
        const wallet = await storage.setDefaultWallet(id, userId);
        return res.json(wallet);
      }
      
      const updateData: any = {};
      
      // Validate and trim name if provided
      if (name !== undefined) {
        const trimmedName = typeof name === 'string' ? name.trim() : '';
        if (trimmedName.length === 0) {
          return res.status(400).json({ message: "Wallet name cannot be empty" });
        }
        updateData.name = trimmedName;
      }
      
      // Validate type if provided
      if (type !== undefined) {
        const validTypes = ['cash', 'bank_card', 'digital_wallet', 'credit_card', 'investment', 'savings', 'other'];
        if (!validTypes.includes(type)) {
          return res.status(400).json({ message: "Invalid wallet type" });
        }
        updateData.type = type;
      }
      
      // Validate currency if provided
      if (currency !== undefined) {
        if (!supportedCurrencyCodes.includes(currency)) {
          return res.status(400).json({ message: "Unsupported currency" });
        }
        updateData.currency = currency;
      }
      
      // Validate color if provided (hex format)
      if (color !== undefined) {
        if (typeof color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
          return res.status(400).json({ message: "Invalid color format" });
        }
        updateData.color = color;
      }
      
      if (icon !== undefined) updateData.icon = icon;
      
      // Handle isFlexible flag
      if (isFlexible !== undefined) {
        updateData.isFlexible = isFlexible === true;
      }
      
      // Validate and handle exchange rate if provided
      if (exchangeRateToDefault !== undefined) {
        const rate = parseFloat(exchangeRateToDefault);
        if (isNaN(rate) || rate <= 0) {
          return res.status(400).json({ message: "Exchange rate must be a positive number" });
        }
        updateData.exchangeRateToDefault = rate.toFixed(6);
      }
      
      // Ensure at least one field is being updated
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }
      
      const wallet = await storage.updateWallet(id, userId, updateData);
      res.json(wallet);
    } catch (error) {
      console.error("Error updating wallet:", error);
      res.status(500).json({ message: "Failed to update wallet" });
    }
  });

  // Archive wallet with optional balance handling
  app.post('/api/wallets/:id/archive', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      const { action, targetWalletId, rate } = req.body || {};
      const wallet = await storage.getWallet(id, userId);
      if (!wallet) return res.status(404).json({ message: "Wallet not found" });

      const balance = parseFloat(wallet.balance || "0");
      if (isNaN(balance)) return res.status(400).json({ message: "Invalid wallet balance" });

      if (balance !== 0) {
        if (action === 'transfer') {
          if (!targetWalletId) return res.status(400).json({ message: "targetWalletId required for transfer" });
          const target = await storage.getWallet(parseInt(targetWalletId), userId);
          if (!target) return res.status(404).json({ message: "Target wallet not found" });
          let addAmount = balance;
          if ((wallet.currency || 'MYR') !== (target.currency || 'MYR')) {
            const r = typeof rate === 'number' ? rate : parseFloat(rate);
            if (isNaN(r) || r <= 0) return res.status(400).json({ message: "Valid exchange rate required for cross-currency transfer" });
            addAmount = parseFloat((balance * r).toFixed(2));
          }
          const targetNew = parseFloat(target.balance || '0') + addAmount;
          await storage.updateWalletBalance(target.id, userId, targetNew.toFixed(2));
        } else if (action === 'destroy') {
          // no-op: simply zero out, optionally could create an adjustment transaction
        } else {
          return res.status(400).json({ message: "Invalid action" });
        }
        await storage.updateWalletBalance(wallet.id, userId, '0.00');
      }

      const newName = wallet.name.endsWith(' (归档)') ? wallet.name : `${wallet.name} (归档)`;
      const archived = await storage.updateWallet(id, userId, { isFlexible: false as any, name: newName });
      res.json({ ...archived, isArchived: true });
    } catch (error) {
      console.error("Error archiving wallet:", error);
      res.status(500).json({ message: "Failed to archive wallet" });
    }
  });

  // Delete wallet
  app.delete('/api/wallets/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      
      const existingWallet = await storage.getWallet(id, userId);
      if (!existingWallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }
      
      // Check if this is the last wallet
      const wallets = await storage.getWallets(userId);
      if (wallets.length <= 1) {
        return res.status(400).json({ message: "Cannot delete the last wallet" });
      }
      
      // If deleting default wallet, set another as default
      if (existingWallet.isDefault) {
        const otherWallet = wallets.find(w => w.id !== id);
        if (otherWallet) {
          await storage.setDefaultWallet(otherWallet.id, userId);
        }
      }
      
      // Check if deleteTransactions flag is set
      const deleteTransactions = req.query.deleteTransactions === 'true';
      
      if (deleteTransactions) {
        // Delete all transactions associated with this wallet
        await storage.deleteTransactionsByWallet(id, userId);
      }
      
      const deleted = await storage.deleteWallet(id, userId);
      if (deleted) {
        res.status(204).send();
      } else {
        res.status(500).json({ message: "Failed to delete wallet" });
      }
    } catch (error) {
      console.error("Error deleting wallet:", error);
      res.status(500).json({ message: "Failed to delete wallet" });
    }
  });

  // Balance correction schema
  const balanceCorrectionSchema = z.object({
    method: z.enum(['adjust_income_expense', 'adjust_transfer', 'change_current_balance', 'set_initial_balance']),
    targetBalance: z.union([z.string(), z.number()]).transform(val => String(val)),
    walletId: z.number().int().positive(),
  });

  // Balance correction
  app.post('/api/wallets/balance-correction', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Validate request body with Zod
      const parseResult = balanceCorrectionSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: parseResult.error.flatten().fieldErrors 
        });
      }
      
      const { method, targetBalance, walletId } = parseResult.data;
      
      const wallet = await storage.getWallet(walletId, userId);
      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }
      
      const currentBalance = parseFloat(wallet.balance || "0");
      const target = parseFloat(targetBalance);
      
      if (isNaN(target)) {
        return res.status(400).json({ message: "Invalid target balance" });
      }
      
      const difference = target - currentBalance;
      
      // If no change needed, just return current wallet
      if (difference === 0) {
        return res.json(wallet);
      }
      
      if (method === "adjust_income_expense") {
        // Create an adjustment transaction and update balance
        // This counts as real income/expense in analytics
        const adjustmentCategory = await storage.getCategoryByName(
          userId, 
          "其他",
          difference > 0 ? "income" : "expense"
        );
        
        // Create the transaction record
        await storage.createTransaction({
          userId,
          type: difference > 0 ? "income" : "expense",
          amount: Math.abs(difference).toFixed(2),
          currency: wallet.currency || "MYR",
          walletId: wallet.id,
          categoryId: adjustmentCategory?.id || null,
          description: "余额校正",
          date: new Date(),
        });
        
        // Update wallet balance to target
        await storage.updateWalletBalance(wallet.id, userId, target.toFixed(2));
        
      } else {
        // For adjust_transfer, change_current_balance, and set_initial_balance:
        // Just update the balance directly without creating any transactions
        // This doesn't affect income/expense analytics
        await storage.updateWalletBalance(wallet.id, userId, target.toFixed(2));
      }
      
      const updatedWallet = await storage.getWallet(wallet.id, userId);
      res.json(updatedWallet);
    } catch (error) {
      console.error("Error correcting balance:", error);
      res.status(500).json({ message: "Failed to correct balance" });
    }
  });

  // Category routes
  app.get('/api/categories', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const categories = await storage.getCategories(userId);
      res.json(categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  app.post('/api/categories', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { name, type, icon, color } = req.body;
      
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ message: "Category name is required" });
      }
      
      if (!type || !['expense', 'income'].includes(type)) {
        return res.status(400).json({ message: "Invalid category type" });
      }
      
      const category = await storage.createCategory({
        userId,
        name: name.trim(),
        type,
        icon: icon || "other",
        color: color || "#6B7280",
        isDefault: false,
      });
      res.status(201).json(category);
    } catch (error) {
      console.error("Error creating category:", error);
      res.status(500).json({ message: "Failed to create category" });
    }
  });

  app.patch('/api/categories/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      const { name, icon, color } = req.body;
      
      const existingCategory = await storage.getCategory(id, userId);
      if (!existingCategory) {
        return res.status(404).json({ message: "Category not found" });
      }
      if (existingCategory.isDefault) {
        return res.status(400).json({ message: "Cannot update default category" });
      }
      
      const updateData: any = {};
      if (name !== undefined) {
        const trimmedName = typeof name === 'string' ? name.trim() : '';
        if (trimmedName.length === 0) {
          return res.status(400).json({ message: "Category name cannot be empty" });
        }
        updateData.name = trimmedName;
      }
      if (icon !== undefined) updateData.icon = icon;
      if (color !== undefined) updateData.color = color;
      
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }
      
      const category = await storage.updateCategory(id, userId, updateData);
      res.json(category);
    } catch (error) {
      console.error("Error updating category:", error);
      res.status(500).json({ message: "Failed to update category" });
    }
  });

  app.delete('/api/categories/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      
      const existingCategory = await storage.getCategory(id, userId);
      if (!existingCategory) {
        return res.status(404).json({ message: "Category not found" });
      }
      
      // Don't allow deleting default categories
      if (existingCategory.isDefault) {
        return res.status(400).json({ message: "Cannot delete default category" });
      }
      
      const deleted = await storage.deleteCategory(id, userId);
      if (deleted) {
        res.status(204).send();
      } else {
        res.status(500).json({ message: "Failed to delete category" });
      }
    } catch (error) {
      console.error("Error deleting category:", error);
      res.status(500).json({ message: "Failed to delete category" });
    }
  });

  // Transaction routes
  app.get('/api/transactions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Build filters from query params
      const filters: TransactionFilters = {};
      if (req.query.startDate) {
        filters.startDate = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        filters.endDate = new Date(req.query.endDate);
      }
      if (req.query.categoryId) {
        filters.categoryId = parseInt(req.query.categoryId);
      }
      if (req.query.walletId) {
        filters.walletId = parseInt(req.query.walletId);
      }
      if (req.query.type) {
        filters.type = req.query.type;
      }
      if (req.query.search) {
        filters.search = req.query.search;
      }
      if (req.query.limit) {
        const l = parseInt(req.query.limit);
        if (!isNaN(l) && l > 0) filters.limit = l;
      }
      if (req.query.offset) {
        const o = parseInt(req.query.offset);
        if (!isNaN(o) && o >= 0) filters.offset = o;
      }
      
      const transactions = await storage.getTransactions(userId, Object.keys(filters).length > 0 ? filters : undefined);
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // Transaction stats
  app.get('/api/transactions/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }
      
      const stats = await storage.getTransactionStats(
        userId,
        new Date(startDate as string),
        new Date(endDate as string)
      );
      res.json(stats);
    } catch (error) {
      console.error("Error fetching transaction stats:", error);
      res.status(500).json({ message: "Failed to fetch transaction stats" });
    }
  });
  
  // Export transactions as CSV
  app.get('/api/transactions/export', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Build filters from query params
      const filters: TransactionFilters = {};
      if (req.query.startDate) {
        filters.startDate = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        filters.endDate = new Date(req.query.endDate);
      }
      
      const transactions = await storage.getTransactions(userId, Object.keys(filters).length > 0 ? filters : undefined);
      
      // Build CSV content
      const headers = ['日期', '类型', '金额', '币种', '分类', '钱包', '描述', '标签'];
      const rows = transactions.map(t => [
        new Date(t.date).toLocaleDateString('zh-CN'),
        t.type === 'expense' ? '支出' : t.type === 'income' ? '收入' : '转账',
        t.amount,
        t.wallet?.currency || 'MYR',
        t.category?.name || '',
        t.wallet?.name || '',
        t.description || '',
        (t.tags || []).join(', ')
      ]);
      
      const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="transactions_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send('\ufeff' + csv); // BOM for Excel compatibility
    } catch (error) {
      console.error("Error exporting transactions:", error);
      res.status(500).json({ message: "Failed to export transactions" });
    }
  });

  app.post('/api/transactions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const parsed = txCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid payload" });
      }
      const body = parsed.data as any;
      
      const inputCurrency = body.currency || null;
      const inputAmount = body.amount;
      const exchangeRate = body.exchangeRate ?? null;
      const toWalletAmount = body.toWalletAmount ?? null;
      const toExchangeRate = body.toExchangeRate ?? null;

      // Validate amount
      if (isNaN(inputAmount) || inputAmount <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }

      // Validate transaction type
      if (!['expense', 'income', 'transfer'].includes(body.type)) {
        return res.status(400).json({ message: "Invalid transaction type" });
      }

      // Verify wallet ownership
      const wallet = await storage.getWallet(body.walletId, userId);
      if (!wallet) {
        return res.status(400).json({ message: "Invalid wallet" });
      }

      const walletCurrency = wallet.currency || "MYR";
      const transactionCurrency = inputCurrency || walletCurrency;
      const isCrosssCurrency = transactionCurrency !== walletCurrency;

      // Validate exchange rate when currencies differ
      if (isCrosssCurrency) {
        if (!exchangeRate || exchangeRate <= 0) {
          return res.status(400).json({ message: "Exchange rate is required for cross-currency transactions" });
        }
      }

      // Calculate wallet amount
      // Exchange rate meaning: 1 transaction currency = X wallet currency
      // So: walletAmount = inputAmount * exchangeRate
      const effectiveExchangeRate = exchangeRate || 1;
      const walletAmount = isCrosssCurrency 
        ? inputAmount * effectiveExchangeRate
        : inputAmount;

      // Build transaction data
      // Always store currency (default to wallet currency)
      const transactionData: any = {
        userId,
        type: body.type,
        amount: walletAmount.toFixed(2),
        currency: isCrosssCurrency ? transactionCurrency : walletCurrency,
        walletId: body.walletId,
        toWalletId: body.toWalletId || null,
        categoryId: body.categoryId || null,
        subLedgerId: body.subLedgerId || null,
        description: body.description || null,
        date: new Date(body.date),
      };

      // Only store originalAmount and exchangeRate when there's actual conversion
      if (isCrosssCurrency) {
        transactionData.originalAmount = inputAmount.toFixed(2);
        transactionData.exchangeRate = effectiveExchangeRate.toFixed(6);
      }

      // For transfers, verify toWallet ownership
      if (transactionData.type === 'transfer') {
        if (!transactionData.toWalletId) {
          return res.status(400).json({ message: "Transfer requires destination wallet" });
        }
        if (transactionData.toWalletId === transactionData.walletId) {
          return res.status(400).json({ message: "Cannot transfer to same wallet" });
        }
        const toWallet = await storage.getWallet(transactionData.toWalletId, userId);
        if (!toWallet) {
          return res.status(400).json({ message: "Invalid destination wallet" });
        }

        const toWalletCurrency = toWallet.currency || "MYR";
        const isToWalletCrossCurrency = walletCurrency !== toWalletCurrency;

        // Update source wallet (decrease by wallet amount)
        const sourceBalance = parseFloat(wallet.balance || "0") - walletAmount;
        await storage.updateWalletBalance(wallet.id, userId, sourceBalance.toString());

        // Calculate destination amount
        let destAmount = walletAmount;
        
        if (isToWalletCrossCurrency) {
          // Cross-currency transfer requires toWalletAmount
          if (toWalletAmount === null || toWalletAmount <= 0) {
            return res.status(400).json({ message: "Cross-currency transfer requires destination amount" });
          }
          destAmount = toWalletAmount;
          transactionData.toWalletAmount = destAmount.toFixed(2);
          if (toExchangeRate && toExchangeRate > 0) {
            transactionData.toExchangeRate = toExchangeRate.toFixed(6);
          }
        } else {
          // Same currency - ignore any toWalletAmount, use same amount
          destAmount = walletAmount;
          transactionData.toWalletAmount = walletAmount.toFixed(2);
        }

        // Update destination wallet (increase)
        const destBalance = parseFloat(toWallet.balance || "0") + destAmount;
        await storage.updateWalletBalance(toWallet.id, userId, destBalance.toString());
      } else if (transactionData.type === 'expense') {
        // Decrease wallet balance for expense
        const currentBalance = parseFloat(wallet.balance || "0");
        const newBalance = currentBalance - walletAmount;
        await storage.updateWalletBalance(wallet.id, userId, newBalance.toString());
      } else if (transactionData.type === 'income') {
        // Increase wallet balance for income
        const currentBalance = parseFloat(wallet.balance || "0");
        const newBalance = currentBalance + walletAmount;
        await storage.updateWalletBalance(wallet.id, userId, newBalance.toString());
      }

      // Create the transaction
      const transaction = await storage.createTransaction(transactionData);
      res.status(201).json(transaction);
    } catch (error) {
      console.error("Error creating transaction:", error);
      res.status(500).json({ message: "Failed to create transaction" });
    }
  });

  // Update transaction
  app.patch('/api/transactions/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const transactionId = parseInt(req.params.id);
      const parsed = txUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid payload" });
      }
      const body = parsed.data as any;
      
      // Get the existing transaction
      const existingTransaction = await storage.getTransaction(transactionId, userId);
      if (!existingTransaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      // Get currency-related fields from request
      const inputCurrency = body.currency || null;
      const inputAmount = body.amount;
      const exchangeRate = body.exchangeRate ?? null;
      const toWalletAmount = body.toWalletAmount ?? null;

      // Validate amount
      if (isNaN(inputAmount) || inputAmount <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }

      // Validate transaction type
      if (!['expense', 'income', 'transfer'].includes(body.type)) {
        return res.status(400).json({ message: "Invalid transaction type" });
      }

      // Verify new wallet ownership
      const newWallet = await storage.getWallet(body.walletId, userId);
      if (!newWallet) {
        return res.status(400).json({ message: "Invalid wallet" });
      }

      // Get old wallet for balance reversal
      const oldWallet = await storage.getWallet(existingTransaction.walletId, userId);
      
      // Reverse the old transaction effect on wallet balances
      if (oldWallet) {
        const oldAmount = parseFloat(existingTransaction.amount || "0");
        const currentBalance = parseFloat(oldWallet.balance || "0");
        
        if (existingTransaction.type === 'expense') {
          // Refund the expense
          await storage.updateWalletBalance(oldWallet.id, userId, (currentBalance + oldAmount).toString());
        } else if (existingTransaction.type === 'income') {
          // Remove the income
          await storage.updateWalletBalance(oldWallet.id, userId, (currentBalance - oldAmount).toString());
        } else if (existingTransaction.type === 'transfer' && existingTransaction.toWalletId) {
          // Reverse transfer: add back to source, remove from destination
          await storage.updateWalletBalance(oldWallet.id, userId, (currentBalance + oldAmount).toString());
          
          const oldToWallet = await storage.getWallet(existingTransaction.toWalletId, userId);
          if (oldToWallet) {
            const toAmount = parseFloat(existingTransaction.toWalletAmount || existingTransaction.amount || "0");
            const toCurrentBalance = parseFloat(oldToWallet.balance || "0");
            await storage.updateWalletBalance(oldToWallet.id, userId, (toCurrentBalance - toAmount).toString());
          }
        }
      }

      // Re-fetch wallets after reversal to get updated balances
      const wallet = await storage.getWallet(req.body.walletId, userId);
      if (!wallet) {
        return res.status(400).json({ message: "Invalid wallet" });
      }

      const walletCurrency = wallet.currency || "MYR";
      const transactionCurrency = inputCurrency || walletCurrency;
      const isCrossCurrency = transactionCurrency !== walletCurrency;

      // Validate exchange rate when currencies differ
      if (isCrossCurrency) {
        if (!exchangeRate || exchangeRate <= 0) {
          return res.status(400).json({ message: "Exchange rate is required for cross-currency transactions" });
        }
      }

      // Calculate wallet amount
      const effectiveExchangeRate = exchangeRate || 1;
      const walletAmount = isCrossCurrency 
        ? inputAmount * effectiveExchangeRate
        : inputAmount;

      // Build transaction update data
      const transactionData: any = {
        type: body.type,
        amount: walletAmount.toFixed(2),
        currency: isCrossCurrency ? transactionCurrency : walletCurrency,
        walletId: body.walletId,
        toWalletId: body.toWalletId || null,
        categoryId: body.categoryId || null,
        subLedgerId: body.subLedgerId || null,
        description: body.description || null,
        date: new Date(body.date),
      };

      // Only store originalAmount and exchangeRate when there's actual conversion
      if (isCrossCurrency) {
        transactionData.originalAmount = inputAmount.toFixed(2);
        transactionData.exchangeRate = effectiveExchangeRate.toFixed(6);
      } else {
        transactionData.originalAmount = null;
        transactionData.exchangeRate = "1";
      }

      // Apply new transaction effect on wallet balances
      if (transactionData.type === 'transfer') {
        if (!transactionData.toWalletId) {
          return res.status(400).json({ message: "Transfer requires destination wallet" });
        }
        if (transactionData.toWalletId === transactionData.walletId) {
          return res.status(400).json({ message: "Cannot transfer to same wallet" });
        }
        
        const toWallet = await storage.getWallet(transactionData.toWalletId, userId);
        if (!toWallet) {
          return res.status(400).json({ message: "Invalid destination wallet" });
        }

        const toWalletCurrency = toWallet.currency || "MYR";
        const isToWalletCrossCurrency = walletCurrency !== toWalletCurrency;

        // Update source wallet (decrease)
        const sourceBalance = parseFloat(wallet.balance || "0") - walletAmount;
        await storage.updateWalletBalance(wallet.id, userId, sourceBalance.toString());

        // Calculate destination amount
        let destAmount = walletAmount;
        
        if (isToWalletCrossCurrency) {
          if (toWalletAmount === null || toWalletAmount <= 0) {
            return res.status(400).json({ message: "Cross-currency transfer requires destination amount" });
          }
          destAmount = toWalletAmount;
          transactionData.toWalletAmount = destAmount.toFixed(2);
        } else {
          destAmount = walletAmount;
          transactionData.toWalletAmount = walletAmount.toFixed(2);
        }

        // Update destination wallet (increase)
        const destBalance = parseFloat(toWallet.balance || "0") + destAmount;
        await storage.updateWalletBalance(toWallet.id, userId, destBalance.toString());
      } else if (transactionData.type === 'expense') {
        const currentBalance = parseFloat(wallet.balance || "0");
        const newBalance = currentBalance - walletAmount;
        await storage.updateWalletBalance(wallet.id, userId, newBalance.toString());
      } else if (transactionData.type === 'income') {
        const currentBalance = parseFloat(wallet.balance || "0");
        const newBalance = currentBalance + walletAmount;
        await storage.updateWalletBalance(wallet.id, userId, newBalance.toString());
      }

      // Update the transaction
      const updatedTransaction = await storage.updateTransaction(transactionId, userId, transactionData);
      res.json(updatedTransaction);
    } catch (error) {
      console.error("Error updating transaction:", error);
      res.status(500).json({ message: "Failed to update transaction" });
    }
  });

  // Delete transaction
  app.delete('/api/transactions/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const transactionId = parseInt(req.params.id);
      
      // Get the existing transaction
      const existingTransaction = await storage.getTransaction(transactionId, userId);
      if (!existingTransaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }

      // Reverse the transaction effect on wallet balances
      const wallet = await storage.getWallet(existingTransaction.walletId, userId);
      if (wallet) {
        const amount = parseFloat(existingTransaction.amount || "0");
        const currentBalance = parseFloat(wallet.balance || "0");
        
        if (existingTransaction.type === 'expense') {
          // Refund the expense
          await storage.updateWalletBalance(wallet.id, userId, (currentBalance + amount).toString());
        } else if (existingTransaction.type === 'income') {
          // Remove the income
          await storage.updateWalletBalance(wallet.id, userId, (currentBalance - amount).toString());
        } else if (existingTransaction.type === 'transfer' && existingTransaction.toWalletId) {
          // Reverse transfer: add back to source, remove from destination
          await storage.updateWalletBalance(wallet.id, userId, (currentBalance + amount).toString());
          
          const toWallet = await storage.getWallet(existingTransaction.toWalletId, userId);
          if (toWallet) {
            const toAmount = parseFloat(existingTransaction.toWalletAmount || existingTransaction.amount || "0");
            const toCurrentBalance = parseFloat(toWallet.balance || "0");
            await storage.updateWalletBalance(toWallet.id, userId, (toCurrentBalance - toAmount).toString());
          }
        }
      }

      // Delete the transaction
      const deleted = await storage.deleteTransaction(transactionId, userId);
      if (!deleted) {
        return res.status(404).json({ message: "Transaction not found" });
      }
      
      res.json({ message: "Transaction deleted successfully" });
    } catch (error) {
      console.error("Error deleting transaction:", error);
      res.status(500).json({ message: "Failed to delete transaction" });
    }
  });

  // Budget routes
  app.get('/api/budgets', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { month, year } = req.query;
      
      const budgets = month && year 
        ? await storage.getBudgets(userId, parseInt(month as string), parseInt(year as string))
        : await storage.getBudgets(userId);
      res.json(budgets);
    } catch (error) {
      console.error("Error fetching budgets:", error);
      res.status(500).json({ message: "Failed to fetch budgets" });
    }
  });

  app.get('/api/budgets/spending', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { month, year } = req.query;
      
      if (!month || !year) {
        return res.status(400).json({ message: "Month and year are required" });
      }
      
      const budgets = await storage.getBudgetSpending(userId, parseInt(month as string), parseInt(year as string));
      res.json(budgets);
    } catch (error) {
      console.error("Error fetching budget spending:", error);
      res.status(500).json({ message: "Failed to fetch budget spending" });
    }
  });

  app.post('/api/budgets', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const budgetSchema = z.object({
        categoryId: z.number().int().positive(),
        amount: z.number().positive(),
        month: z.number().int().min(1).max(12),
        year: z.number().int().min(1970).max(3000),
      }).strict();
      const parsed = budgetSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid payload" });
      }
      const { categoryId, amount, month, year } = parsed.data as any;
      
      if (!categoryId || !amount || !month || !year) {
        return res.status(400).json({ message: "Category, amount, month, and year are required" });
      }
      
      const category = await storage.getCategory(categoryId, userId);
      if (!category) {
        return res.status(400).json({ message: "Invalid category" });
      }
      
      const budget = await storage.createBudget({ userId, categoryId, amount: amount.toString(), month, year });
      res.status(201).json(budget);
    } catch (error) {
      console.error("Error creating budget:", error);
      res.status(500).json({ message: "Failed to create budget" });
    }
  });

  app.patch('/api/budgets/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      const { amount } = req.body;
      
      const existingBudget = await storage.getBudget(id, userId);
      if (!existingBudget) {
        return res.status(404).json({ message: "Budget not found" });
      }
      
      const budget = await storage.updateBudget(id, userId, { amount: amount.toString() });
      res.json(budget);
    } catch (error) {
      console.error("Error updating budget:", error);
      res.status(500).json({ message: "Failed to update budget" });
    }
  });

  app.delete('/api/budgets/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      
      const deleted = await storage.deleteBudget(id, userId);
      if (deleted) {
        res.status(204).send();
      } else {
        res.status(404).json({ message: "Budget not found" });
      }
    } catch (error) {
      console.error("Error deleting budget:", error);
      res.status(500).json({ message: "Failed to delete budget" });
    }
  });

  // Group activities routes
  app.get('/api/groups', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const groups = await storage.getGroupActivities(userId);
      res.json(groups);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch groups' });
    }
  });

  app.get('/api/groups/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      const group = await storage.getGroupActivity(id, userId);
      if (!group) {
        return res.status(404).json({ message: 'Group not found' });
      }
      res.json(group);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch group' });
    }
  });

  app.post('/api/groups', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { title, currency, payload } = req.body;
      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return res.status(400).json({ message: 'Title is required' });
      }
      const data = {
        userId,
        title: title.trim(),
        currency: typeof currency === 'string' && currency.length > 0 ? currency : 'MYR',
        payload: payload || null,
      };
      const created = await storage.createGroupActivity(data);
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: 'Failed to create group' });
    }
  });

  app.patch('/api/groups/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      const existing = await storage.getGroupActivity(id, userId);
      if (!existing) {
        return res.status(404).json({ message: 'Group not found' });
      }
      const updateData: any = {};
      if (req.body.title !== undefined) {
        const t = typeof req.body.title === 'string' ? req.body.title.trim() : '';
        if (t.length === 0) {
          return res.status(400).json({ message: 'Title cannot be empty' });
        }
        updateData.title = t;
      }
      if (req.body.currency !== undefined) {
        updateData.currency = req.body.currency;
      }
      if (req.body.payload !== undefined) {
        updateData.payload = req.body.payload;
      }
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: 'No valid fields to update' });
      }
      const updated = await storage.updateGroupActivity(id, userId, updateData);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: 'Failed to update group' });
    }
  });

  app.delete('/api/groups/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      const existing = await storage.getGroupActivity(id, userId);
      if (!existing) {
        return res.status(404).json({ message: 'Group not found' });
      }
      const deleted = await storage.deleteGroupActivity(id, userId);
      if (deleted) {
        res.status(204).send();
      } else {
        res.status(500).json({ message: 'Failed to delete group' });
      }
    } catch (error) {
      res.status(500).json({ message: 'Failed to delete group' });
    }
  });

  // Savings goal routes
  app.get('/api/savings-goals', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const goals = await storage.getSavingsGoals(userId);
      res.json(goals);
    } catch (error) {
      console.error("Error fetching savings goals:", error);
      res.status(500).json({ message: "Failed to fetch savings goals" });
    }
  });

  app.post('/api/savings-goals', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { name, targetAmount, currency, targetDate, icon, color } = req.body;
      
      if (!name || !targetAmount) {
        return res.status(400).json({ message: "Name and target amount are required" });
      }
      
      const goal = await storage.createSavingsGoal({
        userId,
        name: name.trim(),
        targetAmount: targetAmount.toString(),
        currentAmount: "0",
        currency: currency || "MYR",
        targetDate: targetDate ? new Date(targetDate) : null,
        icon: icon || "piggy-bank",
        color: color || "#10B981",
        isCompleted: false,
      });
      res.status(201).json(goal);
    } catch (error) {
      console.error("Error creating savings goal:", error);
      res.status(500).json({ message: "Failed to create savings goal" });
    }
  });

  app.patch('/api/savings-goals/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      const { name, targetAmount, currentAmount, targetDate, icon, color, isCompleted } = req.body;
      
      const existingGoal = await storage.getSavingsGoal(id, userId);
      if (!existingGoal) {
        return res.status(404).json({ message: "Savings goal not found" });
      }
      
      const updateData: any = {};
      if (name !== undefined) updateData.name = name.trim();
      if (targetAmount !== undefined) updateData.targetAmount = targetAmount.toString();
      if (currentAmount !== undefined) updateData.currentAmount = currentAmount.toString();
      if (targetDate !== undefined) updateData.targetDate = targetDate ? new Date(targetDate) : null;
      if (icon !== undefined) updateData.icon = icon;
      if (color !== undefined) updateData.color = color;
      if (isCompleted !== undefined) updateData.isCompleted = isCompleted;
      
      const goal = await storage.updateSavingsGoal(id, userId, updateData);
      res.json(goal);
    } catch (error) {
      console.error("Error updating savings goal:", error);
      res.status(500).json({ message: "Failed to update savings goal" });
    }
  });

  app.delete('/api/savings-goals/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      
      const deleted = await storage.deleteSavingsGoal(id, userId);
      if (deleted) {
        res.status(204).send();
      } else {
        res.status(404).json({ message: "Savings goal not found" });
      }
    } catch (error) {
      console.error("Error deleting savings goal:", error);
      res.status(500).json({ message: "Failed to delete savings goal" });
    }
  });

  // Recurring transaction routes
  app.get('/api/recurring-transactions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const recurring = await storage.getRecurringTransactions(userId);
      res.json(recurring);
    } catch (error) {
      console.error("Error fetching recurring transactions:", error);
      res.status(500).json({ message: "Failed to fetch recurring transactions" });
    }
  });

  app.post('/api/recurring-transactions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { type, amount, walletId, categoryId, description, frequency, dayOfMonth, dayOfWeek, nextExecutionDate } = req.body;
      
      if (!type || !amount || !walletId || !frequency || !nextExecutionDate) {
        return res.status(400).json({ message: "Type, amount, wallet, frequency, and next execution date are required" });
      }
      
      const wallet = await storage.getWallet(walletId, userId);
      if (!wallet) {
        return res.status(400).json({ message: "Invalid wallet" });
      }
      
      const recurring = await storage.createRecurringTransaction({
        userId,
        type,
        amount: amount.toString(),
        walletId,
        categoryId: categoryId || null,
        description: description || null,
        frequency,
        dayOfMonth: dayOfMonth || null,
        dayOfWeek: dayOfWeek || null,
        nextExecutionDate: new Date(nextExecutionDate),
        isActive: true,
      });
      res.status(201).json(recurring);
    } catch (error) {
      console.error("Error creating recurring transaction:", error);
      res.status(500).json({ message: "Failed to create recurring transaction" });
    }
  });

  app.patch('/api/recurring-transactions/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      const { amount, categoryId, description, frequency, dayOfMonth, dayOfWeek, nextExecutionDate, isActive } = req.body;
      
      const existing = await storage.getRecurringTransaction(id, userId);
      if (!existing) {
        return res.status(404).json({ message: "Recurring transaction not found" });
      }
      
      const updateData: any = {};
      if (amount !== undefined) updateData.amount = amount.toString();
      if (categoryId !== undefined) updateData.categoryId = categoryId;
      if (description !== undefined) updateData.description = description;
      if (frequency !== undefined) updateData.frequency = frequency;
      if (dayOfMonth !== undefined) updateData.dayOfMonth = dayOfMonth;
      if (dayOfWeek !== undefined) updateData.dayOfWeek = dayOfWeek;
      if (nextExecutionDate !== undefined) updateData.nextExecutionDate = new Date(nextExecutionDate);
      if (isActive !== undefined) updateData.isActive = isActive;
      
      const recurring = await storage.updateRecurringTransaction(id, userId, updateData);
      res.json(recurring);
    } catch (error) {
      console.error("Error updating recurring transaction:", error);
      res.status(500).json({ message: "Failed to update recurring transaction" });
    }
  });

  app.delete('/api/recurring-transactions/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      
      const deleted = await storage.deleteRecurringTransaction(id, userId);
      if (deleted) {
        res.status(204).send();
      } else {
        res.status(404).json({ message: "Recurring transaction not found" });
      }
    } catch (error) {
      console.error("Error deleting recurring transaction:", error);
      res.status(500).json({ message: "Failed to delete recurring transaction" });
    }
  });

  // Bill reminder routes
  app.get('/api/bill-reminders', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const reminders = await storage.getBillReminders(userId);
      res.json(reminders);
    } catch (error) {
      console.error("Error fetching bill reminders:", error);
      res.status(500).json({ message: "Failed to fetch bill reminders" });
    }
  });

  app.post('/api/bill-reminders', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { name, amount, dueDate, frequency, categoryId, walletId, notes } = req.body;
      
      if (!name || !dueDate || !frequency) {
        return res.status(400).json({ message: "Name, due date, and frequency are required" });
      }
      
      const reminder = await storage.createBillReminder({
        userId,
        name: name.trim(),
        amount: amount ? amount.toString() : null,
        dueDate: new Date(dueDate),
        frequency,
        categoryId: categoryId || null,
        walletId: walletId || null,
        isPaid: false,
        notes: notes || null,
      });
      res.status(201).json(reminder);
    } catch (error) {
      console.error("Error creating bill reminder:", error);
      res.status(500).json({ message: "Failed to create bill reminder" });
    }
  });

  app.patch('/api/bill-reminders/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      const { name, amount, dueDate, frequency, categoryId, walletId, isPaid, notes } = req.body;
      
      const existing = await storage.getBillReminder(id, userId);
      if (!existing) {
        return res.status(404).json({ message: "Bill reminder not found" });
      }
      
      const updateData: any = {};
      if (name !== undefined) updateData.name = name.trim();
      if (amount !== undefined) updateData.amount = amount ? amount.toString() : null;
      if (dueDate !== undefined) updateData.dueDate = new Date(dueDate);
      if (frequency !== undefined) updateData.frequency = frequency;
      if (categoryId !== undefined) updateData.categoryId = categoryId;
      if (walletId !== undefined) updateData.walletId = walletId;
      if (isPaid !== undefined) updateData.isPaid = isPaid;
      if (notes !== undefined) updateData.notes = notes;
      
      const reminder = await storage.updateBillReminder(id, userId, updateData);
      res.json(reminder);
    } catch (error) {
      console.error("Error updating bill reminder:", error);
      res.status(500).json({ message: "Failed to update bill reminder" });
    }
  });

  app.delete('/api/bill-reminders/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      
      const deleted = await storage.deleteBillReminder(id, userId);
      if (deleted) {
        res.status(204).send();
      } else {
        res.status(404).json({ message: "Bill reminder not found" });
      }
    } catch (error) {
      console.error("Error deleting bill reminder:", error);
      res.status(500).json({ message: "Failed to delete bill reminder" });
    }
  });

  // Sub-ledger routes
  app.get('/api/sub-ledgers', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const includeArchived = req.query.includeArchived === 'true';
      const subLedgers = await storage.getSubLedgers(userId, includeArchived);
      res.json(subLedgers);
    } catch (error) {
      console.error("Error fetching sub-ledgers:", error);
      res.status(500).json({ message: "Failed to fetch sub-ledgers" });
    }
  });

  app.get('/api/sub-ledgers/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      const subLedger = await storage.getSubLedger(id, userId);
      if (!subLedger) {
        return res.status(404).json({ message: "Sub-ledger not found" });
      }
      res.json(subLedger);
    } catch (error) {
      console.error("Error fetching sub-ledger:", error);
      res.status(500).json({ message: "Failed to fetch sub-ledger" });
    }
  });

  app.post('/api/sub-ledgers', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { name, description, icon, color, budgetAmount, includeInMainAnalytics, startDate, endDate } = req.body;
      
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ message: "Name is required" });
      }
      
      const subLedger = await storage.createSubLedger({
        userId,
        name: name.trim(),
        description: description?.trim() || null,
        icon: icon || null,
        color: color || '#8B5CF6',
        budgetAmount: budgetAmount || null,
        includeInMainAnalytics: includeInMainAnalytics ?? true,
        isArchived: false,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      });
      res.status(201).json(subLedger);
    } catch (error) {
      console.error("Error creating sub-ledger:", error);
      res.status(500).json({ message: "Failed to create sub-ledger" });
    }
  });

  app.patch('/api/sub-ledgers/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      const { name, description, icon, color, budgetAmount, includeInMainAnalytics, isArchived, startDate, endDate } = req.body;
      
      const existing = await storage.getSubLedger(id, userId);
      if (!existing) {
        return res.status(404).json({ message: "Sub-ledger not found" });
      }
      
      const updateData: any = {};
      if (name !== undefined) updateData.name = name.trim();
      if (description !== undefined) updateData.description = description?.trim() || null;
      if (icon !== undefined) updateData.icon = icon;
      if (color !== undefined) updateData.color = color;
      if (budgetAmount !== undefined) updateData.budgetAmount = budgetAmount || null;
      if (includeInMainAnalytics !== undefined) updateData.includeInMainAnalytics = includeInMainAnalytics;
      if (isArchived !== undefined) updateData.isArchived = isArchived;
      if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
      if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
      
      const subLedger = await storage.updateSubLedger(id, userId, updateData);
      res.json(subLedger);
    } catch (error) {
      console.error("Error updating sub-ledger:", error);
      res.status(500).json({ message: "Failed to update sub-ledger" });
    }
  });

  app.delete('/api/sub-ledgers/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      
      const deleted = await storage.deleteSubLedger(id, userId);
      if (deleted) {
        res.status(204).send();
      } else {
        res.status(404).json({ message: "Sub-ledger not found" });
      }
    } catch (error) {
      console.error("Error deleting sub-ledger:", error);
      res.status(500).json({ message: "Failed to delete sub-ledger" });
    }
  });

  // Dashboard preferences routes
  app.get('/api/dashboard-preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const preferences = await storage.getDashboardPreferences(userId);
      
      // Return defaults if no preferences exist
      if (!preferences) {
        return res.json({
          showTotalAssets: true,
          showMonthlyIncome: true,
          showMonthlyExpense: true,
          showWallets: true,
          showBudgets: true,
          showSavingsGoals: true,
          showRecentTransactions: true,
          showFlexibleFunds: false,
          cardOrder: null,
        });
      }
      
      res.json(preferences);
    } catch (error) {
      console.error("Error fetching dashboard preferences:", error);
      res.status(500).json({ message: "Failed to fetch dashboard preferences" });
    }
  });

  app.patch('/api/dashboard-preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const {
        showTotalAssets,
        showMonthlyIncome,
        showMonthlyExpense,
        showWallets,
        showBudgets,
        showSavingsGoals,
        showRecentTransactions,
        showFlexibleFunds,
        cardOrder,
      } = req.body;
      
      const updateData: any = {};
      if (showTotalAssets !== undefined) updateData.showTotalAssets = showTotalAssets;
      if (showMonthlyIncome !== undefined) updateData.showMonthlyIncome = showMonthlyIncome;
      if (showMonthlyExpense !== undefined) updateData.showMonthlyExpense = showMonthlyExpense;
      if (showWallets !== undefined) updateData.showWallets = showWallets;
      if (showBudgets !== undefined) updateData.showBudgets = showBudgets;
      if (showSavingsGoals !== undefined) updateData.showSavingsGoals = showSavingsGoals;
      if (showRecentTransactions !== undefined) updateData.showRecentTransactions = showRecentTransactions;
      if (showFlexibleFunds !== undefined) updateData.showFlexibleFunds = showFlexibleFunds;
      if (cardOrder !== undefined) updateData.cardOrder = cardOrder;
      
      const preferences = await storage.upsertDashboardPreferences(userId, updateData);
      res.json(preferences);
    } catch (error) {
      console.error("Error updating dashboard preferences:", error);
      res.status(500).json({ message: "Failed to update dashboard preferences" });
    }
  });

  // Analytics preferences routes
  app.get('/api/analytics-preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const preferences = await storage.getAnalyticsPreferences(userId);
      
      if (!preferences) {
        return res.json({
          showYearlyStats: true,
          showMonthlyTrend: true,
          showExpenseDistribution: true,
          showIncomeDistribution: true,
          showBudgetProgress: true,
          showSavingsProgress: true,
          showWalletDistribution: true,
          showCashflowTrend: true,
          showTopCategories: true,
          showMonthlyComparison: true,
          showFullAmount: false,
          cardOrder: null,
        });
      }
      
      res.json(preferences);
    } catch (error) {
      console.error("Error fetching analytics preferences:", error);
      res.status(500).json({ message: "Failed to fetch analytics preferences" });
    }
  });

  app.patch('/api/analytics-preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const {
        showYearlyStats,
        showMonthlyTrend,
        showExpenseDistribution,
        showIncomeDistribution,
        showBudgetProgress,
        showSavingsProgress,
        showWalletDistribution,
        showCashflowTrend,
        showTopCategories,
        showMonthlyComparison,
        showFullAmount,
        cardOrder,
      } = req.body;
      
      const updateData: any = {};
      if (showYearlyStats !== undefined) updateData.showYearlyStats = showYearlyStats;
      if (showMonthlyTrend !== undefined) updateData.showMonthlyTrend = showMonthlyTrend;
      if (showExpenseDistribution !== undefined) updateData.showExpenseDistribution = showExpenseDistribution;
      if (showIncomeDistribution !== undefined) updateData.showIncomeDistribution = showIncomeDistribution;
      if (showBudgetProgress !== undefined) updateData.showBudgetProgress = showBudgetProgress;
      if (showSavingsProgress !== undefined) updateData.showSavingsProgress = showSavingsProgress;
      if (showWalletDistribution !== undefined) updateData.showWalletDistribution = showWalletDistribution;
      if (showCashflowTrend !== undefined) updateData.showCashflowTrend = showCashflowTrend;
      if (showTopCategories !== undefined) updateData.showTopCategories = showTopCategories;
      if (showMonthlyComparison !== undefined) updateData.showMonthlyComparison = showMonthlyComparison;
      if (showFullAmount !== undefined) updateData.showFullAmount = showFullAmount;
      if (cardOrder !== undefined) updateData.cardOrder = cardOrder;
      
      const preferences = await storage.upsertAnalyticsPreferences(userId, updateData);
      res.json(preferences);
    } catch (error) {
      console.error("Error updating analytics preferences:", error);
      res.status(500).json({ message: "Failed to update analytics preferences" });
    }
  });

  // Mobile nav preferences routes
  app.get('/api/mobile-nav-preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const preferences = await storage.getMobileNavPreferences(userId);
      
      if (!preferences) {
        return res.json({
          navOrder: null,
        });
      }
      
      res.json(preferences);
    } catch (error) {
      console.error("Error fetching mobile nav preferences:", error);
      res.status(500).json({ message: "Failed to fetch mobile nav preferences" });
    }
  });

  app.patch('/api/mobile-nav-preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { navOrder } = req.body;
      
      const updateData: any = {};
      if (navOrder !== undefined) updateData.navOrder = navOrder;
      
      const preferences = await storage.upsertMobileNavPreferences(userId, updateData);
      res.json(preferences);
    } catch (error) {
      console.error("Error updating mobile nav preferences:", error);
      res.status(500).json({ message: "Failed to update mobile nav preferences" });
    }
  });

  // Wallet preferences routes
  app.get('/api/wallet-preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const preferences = await storage.getWalletPreferences(userId);
      
      if (!preferences) {
        return res.json({
          walletOrder: null,
          typeOrder: null,
          groupByType: true,
        });
      }
      
      res.json(preferences);
    } catch (error) {
      console.error("Error fetching wallet preferences:", error);
      res.status(500).json({ message: "Failed to fetch wallet preferences" });
    }
  });

  app.patch('/api/wallet-preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { walletOrder, typeOrder, groupByType } = req.body;
      
      console.log("PATCH /api/wallet-preferences - userId:", userId);
      console.log("PATCH /api/wallet-preferences - body:", JSON.stringify(req.body));
      
      const updateData: any = {};
      
      if (walletOrder !== undefined) {
        const normalizedWalletOrder: Record<string, number[]> = {};
        for (const [type, ids] of Object.entries(walletOrder)) {
          if (Array.isArray(ids)) {
            const numIds = (ids as (number | string)[]).map(Number).filter(n => !isNaN(n));
            normalizedWalletOrder[type] = Array.from(new Set(numIds));
          }
        }
        updateData.walletOrder = normalizedWalletOrder;
      }
      
      if (typeOrder !== undefined && Array.isArray(typeOrder)) {
        const validTypes = typeOrder.filter((t: string) => typeof t === 'string');
        updateData.typeOrder = Array.from(new Set(validTypes));
      }
      
      if (groupByType !== undefined) updateData.groupByType = groupByType;
      
      console.log("PATCH /api/wallet-preferences - updateData:", JSON.stringify(updateData));
      
      const preferences = await storage.upsertWalletPreferences(userId, updateData);
      console.log("PATCH /api/wallet-preferences - success:", JSON.stringify(preferences));
      res.json(preferences);
    } catch (error) {
      console.error("Error updating wallet preferences:", error);
      res.status(500).json({ message: "Failed to update wallet preferences" });
    }
  });

  // Exchange credentials routes (MEXC API integration)
  app.get('/api/exchange-credentials', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const credentials = await storage.getExchangeCredentials(userId);
      
      // Return credentials without exposing full API keys
      const sanitized = credentials.map(c => ({
        id: c.id,
        exchange: c.exchange,
        label: c.label,
        manualBalance: c.manualBalance || '0',
        isActive: c.isActive,
        lastSyncAt: c.lastSyncAt,
        createdAt: c.createdAt,
        apiKeyPreview: c.apiKey ? `${decrypt(c.apiKey).substring(0, 8)}...` : '',
      }));
      
      res.json(sanitized);
    } catch (error) {
      console.error("Error fetching exchange credentials:", error);
      res.status(500).json({ message: "Failed to fetch exchange credentials" });
    }
  });

  app.post('/api/exchange-credentials', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { exchange, apiKey, apiSecret, label } = req.body;
      
      if (!exchange || !apiKey || !apiSecret) {
        return res.status(400).json({ message: "Exchange, API Key, and API Secret are required" });
      }

      if (exchange !== 'mexc' && exchange !== 'pionex') {
        return res.status(400).json({ message: "Currently only MEXC and Pionex exchanges are supported" });
      }

      // Test the API credentials before saving
      try {
        if (exchange === 'mexc') {
          await fetchMexcAccountInfo(apiKey, apiSecret);
        } else if (exchange === 'pionex') {
          const isValid = await validatePionexCredentials(apiKey, apiSecret);
          if (!isValid) {
            throw new Error('派网API凭证验证失败');
          }
        }
      } catch (testError: any) {
        return res.status(400).json({ 
          message: `API验证失败: ${testError.message}. 请检查您的API Key和Secret是否正确。` 
        });
      }

      // Check if credentials for this exchange already exist
      const existing = await storage.getExchangeCredentialByExchange(userId, exchange);
      if (existing) {
        // Update existing credentials
        const updated = await storage.updateExchangeCredential(existing.id, userId, {
          apiKey: encrypt(apiKey),
          apiSecret: encrypt(apiSecret),
          label: label || existing.label,
          isActive: true,
          lastSyncAt: new Date(),
        });
        return res.json({
          id: updated?.id,
          exchange: updated?.exchange,
          label: updated?.label,
          isActive: updated?.isActive,
          message: "API凭证已更新",
        });
      }

      // Create new credentials
      const defaultLabel = exchange === 'pionex' ? '派网账户' : 'MEXC账户';
      const credential = await storage.createExchangeCredential({
        userId,
        exchange,
        apiKey: encrypt(apiKey),
        apiSecret: encrypt(apiSecret),
        label: label || defaultLabel,
        isActive: true,
        lastSyncAt: new Date(),
      });

      res.status(201).json({
        id: credential.id,
        exchange: credential.exchange,
        label: credential.label,
        isActive: credential.isActive,
        message: "API凭证已保存",
      });
    } catch (error) {
      console.error("Error saving exchange credentials:", error);
      res.status(500).json({ message: "Failed to save exchange credentials" });
    }
  });

  app.delete('/api/exchange-credentials/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      
      const deleted = await storage.deleteExchangeCredential(id, userId);
      if (deleted) {
        res.status(204).send();
      } else {
        res.status(404).json({ message: "Exchange credentials not found" });
      }
    } catch (error) {
      console.error("Error deleting exchange credentials:", error);
      res.status(500).json({ message: "Failed to delete exchange credentials" });
    }
  });

  // Update manual balance for exchange credentials
  app.patch('/api/exchange-credentials/:id/manual-balance', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      const { manualBalance } = req.body;
      
      if (manualBalance === undefined || isNaN(parseFloat(manualBalance))) {
        return res.status(400).json({ message: "有效的余额金额是必需的" });
      }
      
      const updated = await storage.updateExchangeCredential(id, userId, {
        manualBalance: manualBalance.toString(),
      });
      
      if (updated) {
        res.json({ 
          id: updated.id,
          manualBalance: updated.manualBalance,
          message: "其他账户余额已更新" 
        });
      } else {
        res.status(404).json({ message: "凭证未找到" });
      }
    } catch (error) {
      console.error("Error updating manual balance:", error);
      res.status(500).json({ message: "更新余额失败" });
    }
  });

  // Pionex account balance endpoint
  app.get('/api/pionex/balances', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const credential = await storage.getExchangeCredentialByExchange(userId, 'pionex');
      if (!credential) {
        return res.status(404).json({ message: "请先配置派网API凭证" });
      }

      if (!credential.isActive) {
        return res.status(400).json({ message: "派网API凭证已禁用" });
      }

      const apiKey = decrypt(credential.apiKey);
      const apiSecret = decrypt(credential.apiSecret);

      const balances = await getPionexBalancesWithValues(apiKey, apiSecret);

      // Update last sync time
      await storage.updateExchangeCredential(credential.id, userId, {
        lastSyncAt: new Date(),
      });

      // Calculate total value in USDT (from API)
      const apiTotalValue = balances.reduce((sum, b) => {
        return sum + parseFloat(b.usdtValue || '0');
      }, 0);

      // Add manual balance for accounts API can't access (bots, earn)
      const manualBalance = parseFloat(credential.manualBalance || '0');
      const totalUsdtValue = apiTotalValue + manualBalance;

      res.json({
        balances,
        apiTotalValue: apiTotalValue.toFixed(2),
        manualBalance: manualBalance.toFixed(2),
        totalUsdtValue: totalUsdtValue.toFixed(2),
        lastSyncAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Error fetching Pionex balances:", error);
      res.status(500).json({ message: error.message || "Failed to fetch Pionex balances" });
    }
  });

  // MEXC account balance endpoint
  app.get('/api/mexc/balances', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const credential = await storage.getExchangeCredentialByExchange(userId, 'mexc');
      if (!credential) {
        return res.status(404).json({ message: "请先配置MEXC API凭证" });
      }

      if (!credential.isActive) {
        return res.status(400).json({ message: "MEXC API凭证已禁用" });
      }

      const apiKey = decrypt(credential.apiKey);
      const apiSecret = decrypt(credential.apiSecret);

      const balances = await getBalancesWithValues(apiKey, apiSecret);

      // Update last sync time
      await storage.updateExchangeCredential(credential.id, userId, {
        lastSyncAt: new Date(),
      });

      // Calculate total value in USDT (from API)
      const apiTotalValue = balances.reduce((sum, b) => {
        return sum + parseFloat(b.usdtValue || '0');
      }, 0);

      // Add manual balance for accounts API can't access
      const manualBalance = parseFloat(credential.manualBalance || '0');
      const totalUsdtValue = apiTotalValue + manualBalance;

      res.json({
        balances,
        apiTotalValue: apiTotalValue.toFixed(2),
        manualBalance: manualBalance.toFixed(2),
        totalUsdtValue: totalUsdtValue.toFixed(2),
        lastSyncAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Error fetching MEXC balances:", error);
      res.status(500).json({ message: error.message || "Failed to fetch MEXC balances" });
    }
  });

  app.get('/api/ai/insights', isAuthenticated, async (req: any, res) => {
    let metrics: any = null;
    try {
      const userId = req.user.claims.sub;
      const rangeMonths = req.query.rangeMonths ? Math.max(1, Math.min(24, parseInt(req.query.rangeMonths))) : 6;

      const endDate = new Date();
      const startDate = new Date(endDate);
      startDate.setMonth(startDate.getMonth() - rangeMonths + 1);
      startDate.setDate(1);

      const transactions = await storage.getTransactions(userId, { startDate, endDate });
      const walletsList = await storage.getWallets(userId);
      const now = new Date();
      const budgetsSpending = await storage.getBudgetSpending(userId, now.getMonth() + 1, now.getFullYear());

      // Monthly aggregates
      const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthly: Record<string, { income: number; expense: number }> = {};
      let totalIncome = 0;
      let totalExpense = 0;
      for (const t of transactions) {
        const amt = parseFloat(t.amount);
        const key = monthKey(new Date(t.date));
        if (!monthly[key]) monthly[key] = { income: 0, expense: 0 };
        if (t.type === 'income') {
          monthly[key].income += amt;
          totalIncome += amt;
        } else if (t.type === 'expense') {
          monthly[key].expense += amt;
          totalExpense += amt;
        }
      }
      const distinctMonths = Object.keys(monthly).length || 1;
      const avgMonthlyExpense = totalExpense / distinctMonths;
      const savingsRate = totalIncome > 0 ? (totalIncome - totalExpense) / totalIncome : 0;

      // Expense category breakdown
      const stats = await storage.getTransactionStats(userId, startDate, endDate);
      const topExpenseCategories = stats.categoryBreakdown.slice(0, 5);

      // Emergency fund months: sum of flexible wallets converted to default currency / avg monthly expense
      let flexibleTotal = 0;
      for (const w of walletsList) {
        const bal = parseFloat(w.balance || '0');
        const rate = parseFloat(w.exchangeRateToDefault || '1');
        if (w.isFlexible) {
          flexibleTotal += bal * (isNaN(rate) ? 1 : rate);
        }
      }
      const emergencyFundMonths = avgMonthlyExpense > 0 ? flexibleTotal / avgMonthlyExpense : null;

      // Budget deviations for current month
      const budgetDeviations = budgetsSpending.map((b) => ({
        categoryId: b.categoryId,
        categoryName: (b as any).categoryName,
        budget: parseFloat(b.amount as any),
        spent: (b as any).spent,
        deviation: (b as any).spent - parseFloat(b.amount as any),
        color: (b as any).categoryColor,
      })).sort((a, b) => b.deviation - a.deviation).slice(0, 5);

      // Heuristic recurring payments: same amount on 3+ different months within range
      const recurringCandidates: Record<string, { amount: number; countMonths: number; sample: any }> = {};
      const seenByMonthAmount: Record<string, Set<string>> = {};
      for (const t of transactions) {
        if (t.type !== 'expense') continue;
        const amt = parseFloat(t.amount);
        if (amt <= 0) continue;
        const keyMonth = monthKey(new Date(t.date));
        const amtKey = `${Math.round(amt * 100) / 100}`;
        if (!seenByMonthAmount[keyMonth]) seenByMonthAmount[keyMonth] = new Set();
        if (!seenByMonthAmount[keyMonth].has(amtKey)) {
          seenByMonthAmount[keyMonth].add(amtKey);
          if (!recurringCandidates[amtKey]) recurringCandidates[amtKey] = { amount: amt, countMonths: 0, sample: t };
          recurringCandidates[amtKey].countMonths += 1;
        }
      }
      const topRecurring = Object.values(recurringCandidates)
        .filter(r => r.countMonths >= 3)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5)
        .map(r => ({
          amount: r.amount,
          months: r.countMonths,
          categoryName: r.sample?.category?.name || '未知分类',
          walletName: r.sample?.wallet?.name || '未知钱包',
          sampleDate: r.sample ? new Date(r.sample.date).toISOString() : null,
        }));

      metrics = {
        rangeMonths,
        totalIncome: parseFloat(totalIncome.toFixed(2)),
        totalExpense: parseFloat(totalExpense.toFixed(2)),
        avgMonthlyExpense: parseFloat(avgMonthlyExpense.toFixed(2)),
        savingsRate: parseFloat(savingsRate.toFixed(4)),
        emergencyFundMonths: emergencyFundMonths === null ? null : parseFloat(emergencyFundMonths.toFixed(2)),
        monthly,
        topExpenseCategories,
        budgetDeviations,
        topRecurringPayments: topRecurring,
      };

      // Rate limit & cache: 1 hour per account
      const cooldownMs = 60 * 60 * 1000;
      const latest = await storage.getLatestAiInsights(userId);
      if (latest) {
        const lastTs = new Date(latest.createdAt).getTime();
        const elapsed = Date.now() - lastTs;
        const remaining = cooldownMs - elapsed;
        if (remaining > 0) {
          return res.json({
            metrics,
            ai: latest.payload,
            aiEnabled: true,
            fromCache: true,
            cachedAt: new Date(lastTs).toISOString(),
            nextAllowedAt: new Date(lastTs + cooldownMs).toISOString(),
            cooldownRemainingMs: remaining,
          });
        }
      }

      const apiKey = process.env.DEEPSEEK_API_KEY;
      if (!apiKey) {
        return res.json({ metrics, ai: null, aiEnabled: false, message: '未配置 DEEPSEEK_API_KEY，仅返回确定性体检指标' });
      }

      const systemPrompt = [
        '你是一个客观中立的个人财务分析助手。',
        '请基于提供的聚合指标进行分析，不要编造未提供的数据。',
        '不要推荐具体股票/基金产品，建议需可执行、量化、并给出依据。',
        '输出 JSON，结构为 {summary, insights: [{title, explanation, relatedMetrics}], actions: [{title, impact, effort, steps}], disclaimer}。',
      ].join('\n');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: JSON.stringify(metrics) },
          ],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        const text = await resp.text();
        return res.status(502).json({ metrics, ai: null, aiEnabled: true, message: `DeepSeek 调用失败: ${resp.status} ${text}` });
      }

      const data = await resp.json();
      const content = data?.choices?.[0]?.message?.content || '';
      let aiJson: any = null;
      try {
        aiJson = JSON.parse(content);
      } catch {
        aiJson = { summary: content };
      }

      // Save cache
      try { await storage.saveAiInsights(userId, aiJson); } catch {}
      res.json({ metrics, ai: aiJson, aiEnabled: true, fromCache: false, cachedAt: new Date().toISOString(), nextAllowedAt: new Date(Date.now() + cooldownMs).toISOString(), cooldownRemainingMs: cooldownMs });
    } catch (error: any) {
      console.error('Error generating AI insights:', error);
      const aborted = (error && (error.name === 'AbortError' || /aborted|timeout/i.test(String(error.message || ''))));
      if (aborted) {
        return res.status(504).json({ metrics, ai: null, aiEnabled: true, message: 'DeepSeek 请求超时' });
      }
      return res.json({ metrics, ai: null, aiEnabled: false, message: 'AI 生成失败：' + String(error?.message || '未知错误') });
    }
  });

  return httpServer;
}
