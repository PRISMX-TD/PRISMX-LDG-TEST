import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, TransactionFilters } from "./storage";
import { setupAuth, isAuthenticated } from "./neonAuth";
import { signToken } from "./authToken";
import { sendPasswordResetEmail } from "./mailer";
import { 
  insertTransactionSchema, 
  supportedCurrencies,
  insertBudgetSchema,
  insertSavingsGoalSchema,
  insertRecurringTransactionSchema,
  insertBillReminderSchema,
  insertCategorySchema,
  insertLoanSchema,
} from "@shared/schema";
import { z } from "zod";
import { encrypt, decrypt, getBalancesWithValues, fetchMexcAccountInfo } from "./mexc";
import { validatePionexCredentials, getPionexBalancesWithValues } from "./pionex";
import { isDbUnavailableError } from "./errors";
import crypto from "crypto";
import { db } from "./db";
import {
  users as usersTable,
  pushSubscriptions,
  monthlyBalanceSnapshots,
  savingsGoals,
  wallets as walletsTable,
  categories as categoriesTable,
  transactions as transactionsTable,
  budgets as budgetsTable,
  recurringTransactions as recurringTransactionsTable,
  billReminders as billRemindersTable,
  subLedgers as subLedgersTable,
  loans as loansTable,
  exchangeCredentials as exchangeCredentialsTable,
  userDashboardPreferences,
  userAnalyticsPreferences,
  userMobileNavPreferences,
  userWalletPreferences,
} from "@shared/schema";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { getPublicKey as getPushPublicKey } from "./push";

const supportedCurrencyCodes = supportedCurrencies.map(c => c.code);

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const exchangeRateCache = new Map<string, { rate: number; timestamp: number }>();
  const CACHE_DURATION = 3600 * 1000; // 1 hour

  // Cache decrypted api-key previews to avoid running AES on every list request.
  const apiKeyPreviewCache = new Map<number, string>();

  const txCreateSchema = z.object({
    type: z.enum(["expense","income","transfer"]),
    amount: z.number().positive(),
    currency: z.string().min(1).optional(),
    exchangeRate: z.number().positive().optional(), // Allow any positive number
    toWalletAmount: z.number().positive().optional(),
    toExchangeRate: z.number().positive().optional(),
    walletId: z.number().int().positive(),
    toWalletId: z.number().int().positive().optional(),
    categoryId: z.number().int().positive().optional(),
    subLedgerId: z.number().int().positive().optional(),
    loanId: z.number().int().positive().optional(),
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
      console.error("Auth setup failed:", err);
      // Fallback removed to prevent auto-login as demo-user
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

  // Expose Neon Auth URL to frontend (Vite env vars may not be available at build time)
  app.get('/api/config', (_req, res) => {
    res.json({ neonAuthUrl: process.env.NEON_AUTH_URL || "" });
  });

  // ---- Password hashing helpers -------------------------------------------
  function hashPassword(password: string): string {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(password, salt, 64);
    return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
  }
  function verifyPassword(password: string, stored: string): boolean {
    const [method, saltHex, hashHex] = stored.split(":");
    if (method !== "scrypt" || !saltHex || !hashHex) return false;
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const actual = crypto.scryptSync(password, salt, expected.length);
    return crypto.timingSafeEqual(actual, expected);
  }

  // ---- Auth: register -----------------------------------------------------
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, password, name } = req.body || {};
      if (!email || !password || typeof email !== "string" || typeof password !== "string") {
        return res.status(400).json({ message: "邮箱和密码必填" });
      }
      if (password.length < 8) {
        return res.status(400).json({ message: "密码长度至少 8 位" });
      }
      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "该邮箱已注册" });
      }
      const user = await storage.upsertUser({
        email,
        passwordHash: hashPassword(password),
        firstName: name || email.split("@")[0],
      });
      await storage.initializeUserDefaults(user.id, "MYR");
      const token = signToken(user.id);
      res.status(201).json({ token, userId: user.id, user });
    } catch (err) {
      console.error("[register] error:", err);
      res.status(500).json({ message: "注册失败" });
    }
  });

  // ---- Auth: login --------------------------------------------------------
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password || typeof email !== "string" || typeof password !== "string") {
        return res.status(400).json({ message: "邮箱和密码必填" });
      }
      const user = await storage.getUserByEmail(email);
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "邮箱未注册或未设置密码，请先注册或重置密码" });
      }
      if (!verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ message: "密码错误" });
      }
      const token = signToken(user.id);
      res.json({ token, userId: user.id, user });
    } catch (err) {
      console.error("[login] error:", err);
      res.status(500).json({ message: "登录失败" });
    }
  });

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      let user = await storage.getUser(userId);
      if (!user) {
        // Auto-create user in our DB (Neon Auth already created the auth record)
        user = await storage.upsertUser({ id: userId });
      }
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      if (isDbUnavailableError(error)) {
        return res.status(503).json({ message: "Database unavailable" });
      }
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Forgot password - send reset email
  app.post('/api/account/forgot-password', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const user = await storage.getUserByEmail(email);
      // Always return success to not leak user existence
      if (!user) {
        return res.json({ message: "如该邮箱已注册，重置链接已发送，1 小时内有效。检查垃圾邮件文件夹或稍后再试。" });
      }

      // Delete any existing tokens for this user
      await storage.deletePasswordResetTokens(user.id);

      // Generate secure token
      const token = require("crypto").randomBytes(32).toString("hex");
      const tokenHash = require("crypto").createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await storage.createPasswordResetToken({
        userId: user.id,
        tokenHash,
        expiresAt,
      });

      // Build reset URL
      const origin = req.headers.origin || `https://${req.headers.host}`;
      const resetUrl = `${origin}/reset-password?token=${token}`;

      const sent = await sendPasswordResetEmail(email, resetUrl);
      if (!sent) {
        console.error(`[forgot-password] Failed to send email to ${email}`);
      }

      res.json({ message: "如该邮箱已注册，重置链接已发送，1 小时内有效。检查垃圾邮件文件夹或稍后再试。" });
    } catch (error) {
      console.error("[forgot-password] Error:", error);
      res.status(500).json({ message: "服务器错误，请稍后再试" });
    }
  });

  // Reset password
  app.post('/api/account/reset-password', async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        return res.status(400).json({ message: "Token and password are required" });
      }
      if (password.length < 8) {
        return res.status(400).json({ message: "密码长度至少 8 个字符" });
      }

      const tokenHash = require("crypto").createHash("sha256").update(token).digest("hex");
      const resetToken = await storage.getPasswordResetToken(tokenHash);

      if (!resetToken || new Date(resetToken.expiresAt) < new Date()) {
        return res.status(400).json({ message: "重置链接无效或已过期，请重新申请" });
      }

      // Hash the new password
      const bcrypt = require("bcryptjs");
      const passwordHash = await bcrypt.hash(password, 12);

      // Update password in our DB
      await storage.updateUserPassword(resetToken.userId, passwordHash);

      // Clean up the used token
      await storage.deletePasswordResetTokens(resetToken.userId);

      res.json({ message: "密码重置成功，请重新登录" });
    } catch (error) {
      console.error("[reset-password] Error:", error);
      res.status(500).json({ message: "服务器错误，请稍后再试" });
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

      // Check cache
      const cacheKey = `${fromCurrency}-${toCurrency}`;
      const cached = exchangeRateCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return res.json({ rate: cached.rate, from: fromCurrency, to: toCurrency });
      }

      // Use Frankfurter API (free, no API key required)
      // Note: Frankfurter does not support TWD. For TWD, we'll try to fallback to a different source or return a specific error
      let response;
      if (fromCurrency === 'TWD' || toCurrency === 'TWD') {
        // Fallback for TWD - using a different free API or hardcoded approximation if needed
        // For now, let's try a different free API that might support TWD like ExchangeRate-API (if available) or similar
        // Or simply fail gracefully if no free alternative is available.
        // As a temporary fix for TWD, we can use a different endpoint or service.
        // Let's try to use a different public API for TWD if possible, or handle it.
        // Currently Frankfurter doesn't support TWD. 
        // We will try to fetch from another source or return 503 with specific message.
        // Let's try to use https://api.exchangerate-api.com/v4/latest/USD as an alternative for TWD
        
        try {
             response = await fetch(`https://api.exchangerate-api.com/v4/latest/${fromCurrency}`);
             if (response.ok) {
                 const data = await response.json();
                 const rate = data.rates?.[toCurrency];
                 if (rate) {
                     exchangeRateCache.set(cacheKey, { rate, timestamp: Date.now() });
                     return res.json({ rate, from: fromCurrency, to: toCurrency });
                 }
             }
        } catch (e) {
            console.error("Alternative API failed for TWD:", e);
        }
        
        return res.status(503).json({ message: "暂不支持台币(TWD)自动汇率，请手动输入" });
      } else {
         response = await fetch(
            `https://api.frankfurter.app/latest?from=${fromCurrency}&to=${toCurrency}`
          );
      }

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

      // Update cache
      exchangeRateCache.set(cacheKey, { rate, timestamp: Date.now() });

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
          rateToDefault = rate.toFixed(7);
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
          await storage.incrementWalletBalance(target.id, userId, addAmount);
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

      if (existingCategory.isDefault) {
        return res.status(400).json({ message: "Cannot delete default category" });
      }

      const affectedTransactions = await storage.getTransactions(userId, { categoryId: id });
      const affectedBudgets = (await storage.getBudgets(userId)).filter(b => b.categoryId === id);

      const deleted = await storage.deleteCategory(id, userId);
      if (deleted) {
        res.status(200).json({
          deleted: true,
          affectedTransactions: affectedTransactions.length,
          deletedBudgets: affectedBudgets.length,
        });
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
        loanId: body.loanId || null,
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

        let destAmount = walletAmount;

        if (isToWalletCrossCurrency) {
          if (toWalletAmount === null || toWalletAmount <= 0) {
            return res.status(400).json({ message: "Cross-currency transfer requires destination amount" });
          }
          destAmount = toWalletAmount;
          transactionData.toWalletAmount = destAmount.toFixed(2);
          if (toExchangeRate && toExchangeRate > 0) {
            transactionData.toExchangeRate = toExchangeRate.toFixed(6);
          }
        } else {
          destAmount = walletAmount;
          transactionData.toWalletAmount = walletAmount.toFixed(2);
        }

        await storage.incrementWalletBalance(wallet.id, userId, -walletAmount);
        await storage.incrementWalletBalance(toWallet.id, userId, destAmount);
      } else if (transactionData.type === 'expense') {
        await storage.incrementWalletBalance(wallet.id, userId, -walletAmount);
      } else if (transactionData.type === 'income') {
        await storage.incrementWalletBalance(wallet.id, userId, walletAmount);
      }

      // Create the transaction
      const transaction = await storage.createTransaction(transactionData);

      // If transaction is linked to a loan, update loan paid amount
      if (transactionData.loanId) {
        await storage.recalculateLoanStatus(transactionData.loanId, userId);
      }

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
      
      if (oldWallet) {
        const oldAmount = parseFloat(existingTransaction.amount || "0");
        if (existingTransaction.type === 'expense') {
          await storage.incrementWalletBalance(oldWallet.id, userId, oldAmount);
        } else if (existingTransaction.type === 'income') {
          await storage.incrementWalletBalance(oldWallet.id, userId, -oldAmount);
        } else if (existingTransaction.type === 'transfer' && existingTransaction.toWalletId) {
          await storage.incrementWalletBalance(oldWallet.id, userId, oldAmount);
          const oldToWallet = await storage.getWallet(existingTransaction.toWalletId, userId);
          if (oldToWallet) {
            const toAmount = parseFloat(existingTransaction.toWalletAmount || existingTransaction.amount || "0");
            await storage.incrementWalletBalance(oldToWallet.id, userId, -toAmount);
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
        loanId: body.loanId || null,
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

        await storage.incrementWalletBalance(wallet.id, userId, -walletAmount);
        await storage.incrementWalletBalance(toWallet.id, userId, destAmount);
      } else if (transactionData.type === 'expense') {
        await storage.incrementWalletBalance(wallet.id, userId, -walletAmount);
      } else if (transactionData.type === 'income') {
        await storage.incrementWalletBalance(wallet.id, userId, walletAmount);
      }

      // Update the transaction
      const updatedTransaction = await storage.updateTransaction(transactionId, userId, transactionData);
      
      // If transaction is linked to a loan, recalculate status
      if (updatedTransaction?.loanId) {
        await storage.recalculateLoanStatus(updatedTransaction.loanId, userId);
      } else if (existingTransaction.loanId) {
        // If loanId was removed or changed, recalculate the old loan
        await storage.recalculateLoanStatus(existingTransaction.loanId, userId);
      }
      
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

      const wallet = await storage.getWallet(existingTransaction.walletId, userId);
      if (wallet) {
        const amount = parseFloat(existingTransaction.amount || "0");
        if (existingTransaction.type === 'expense') {
          await storage.incrementWalletBalance(wallet.id, userId, amount);
        } else if (existingTransaction.type === 'income') {
          await storage.incrementWalletBalance(wallet.id, userId, -amount);
        } else if (existingTransaction.type === 'transfer' && existingTransaction.toWalletId) {
          await storage.incrementWalletBalance(wallet.id, userId, amount);
          const toWallet = await storage.getWallet(existingTransaction.toWalletId, userId);
          if (toWallet) {
            const toAmount = parseFloat(existingTransaction.toWalletAmount || existingTransaction.amount || "0");
            await storage.incrementWalletBalance(toWallet.id, userId, -toAmount);
          }
        }
      }

      // Delete the transaction
      const deleted = await storage.deleteTransaction(transactionId, userId);
      if (!deleted) {
        return res.status(404).json({ message: "Transaction not found" });
      }
      
      // Update loan status if linked
      if (existingTransaction.loanId) {
        await storage.recalculateLoanStatus(existingTransaction.loanId, userId);
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

  // Loan routes
  app.get('/api/loans', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const loans = await storage.getLoans(userId);
      res.json(loans);
    } catch (error) {
      console.error("Error fetching loans:", error);
      res.status(500).json({ message: "Failed to fetch loans" });
    }
  });

  app.get('/api/loans/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      const loan = await storage.getLoan(id, userId);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }
      res.json(loan);
    } catch (error) {
      console.error("Error fetching loan:", error);
      res.status(500).json({ message: "Failed to fetch loan" });
    }
  });

  app.post('/api/loans', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const loanBody = { ...req.body, userId };
      // Convert dates before validation to ensure schema compliance
      if (loanBody.startDate) loanBody.startDate = new Date(loanBody.startDate);
      if (loanBody.dueDate) loanBody.dueDate = new Date(loanBody.dueDate);

      const parsed = insertLoanSchema.safeParse(loanBody);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid payload" });
      }
      
      const loan = await storage.createLoan(parsed.data);
      res.status(201).json(loan);
    } catch (error) {
      console.error("Error creating loan:", error);
      res.status(500).json({ message: "Failed to create loan" });
    }
  });

  app.patch('/api/loans/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      
      const existingLoan = await storage.getLoan(id, userId);
      if (!existingLoan) {
        return res.status(404).json({ message: "Loan not found" });
      }
      
      const updateData = { ...req.body };
      if (updateData.startDate) updateData.startDate = new Date(updateData.startDate);
      if (updateData.dueDate) updateData.dueDate = new Date(updateData.dueDate);
      
      // Handle Bad Debt Logic
      if (updateData.status === 'bad_debt' && existingLoan.status !== 'bad_debt') {
        const remaining = parseFloat(existingLoan.totalAmount) - parseFloat(existingLoan.paidAmount || '0');
        if (remaining > 0.01) {
          // Find original wallet
          const loanTxs = await storage.getTransactionsByLoanId(id, userId);
          const lendTx = loanTxs.find(t => t.type === 'expense') || loanTxs[0];
          
          if (lendTx && lendTx.walletId) {
            // Find or create Bad Debt category
            let badDebtCat = await storage.getCategoryByName(userId, "坏账", "expense");
            if (!badDebtCat) {
              badDebtCat = await storage.createCategory({
                userId,
                name: "坏账",
                type: "expense",
                icon: "file-warning", 
                color: "#EF4444",
                isDefault: false
              });
            }

            // Create expense transaction (Accounting only - does not reduce wallet balance)
            // We do this by calling storage.createTransaction directly and NOT updating wallet balance
            await storage.createTransaction({
              userId,
              type: 'expense',
              amount: remaining.toFixed(2),
              currency: existingLoan.currency,
              walletId: lendTx.walletId,
              categoryId: badDebtCat.id,
              description: `坏账核销: ${existingLoan.person} (账面支出，不扣减余额)`,
              tags: [`bad_debt_writeoff:loan_${id}`],
              date: new Date(),
            });
          }
        }
      } else if (existingLoan.status === 'bad_debt' && updateData.status && updateData.status !== 'bad_debt') {
        const marker = `bad_debt_writeoff:loan_${id}`;
        const candidates = await storage.getTransactions(userId, { limit: 100 });
        const txToDelete = candidates.find(t =>
          Array.isArray((t as any).tags) && (t as any).tags.includes(marker) && t.type === 'expense'
        );
        if (txToDelete) {
          await storage.deleteTransaction(txToDelete.id, userId);
        }
      }
      
      const updated = await storage.updateLoan(id, userId, updateData);
      res.json(updated);
    } catch (error) {
      console.error("Error updating loan:", error);
      res.status(500).json({ message: "Failed to update loan" });
    }
  });

  app.delete('/api/loans/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      
      const deleted = await storage.deleteLoan(id, userId);
      if (deleted) {
        res.status(204).send();
      } else {
        res.status(404).json({ message: "Loan not found" });
      }
    } catch (error) {
      console.error("Error deleting loan:", error);
      res.status(500).json({ message: "Failed to delete loan" });
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
      const { type, amount, walletId, categoryId, description, frequency, dayOfMonth, dayOfWeek } = req.body;
      // FIX (audit #4): accept either `nextExecutionDate` or `startDate` from the client
      // (the form has historically sent `startDate` and the API rejected it).
      const nextExecutionDate = req.body.nextExecutionDate || req.body.startDate;

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
      const { name, description, icon, color, budgetAmount, includeInMainAnalytics, startDate, endDate, currency } = req.body;
      
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
        currency: currency || "MYR",
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
      const { name, description, icon, color, budgetAmount, includeInMainAnalytics, isArchived, startDate, endDate, currency } = req.body;
      
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
      if (currency !== undefined) updateData.currency = currency;
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
          showFlexibleFunds: true,
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
      
      const sanitized = credentials.map(c => {
        let preview = apiKeyPreviewCache.get(c.id);
        if (preview === undefined && c.apiKey) {
          try {
            preview = `${decrypt(c.apiKey).substring(0, 8)}...`;
            apiKeyPreviewCache.set(c.id, preview);
          } catch {
            preview = '';
          }
        }
        return {
          id: c.id,
          exchange: c.exchange,
          label: c.label,
          manualBalance: c.manualBalance || '0',
          isActive: c.isActive,
          lastSyncAt: c.lastSyncAt,
          createdAt: c.createdAt,
          apiKeyPreview: preview || '',
        };
      });
      
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
        const updated = await storage.updateExchangeCredential(existing.id, userId, {
          apiKey: encrypt(apiKey),
          apiSecret: encrypt(apiSecret),
          label: label || existing.label,
          isActive: true,
          lastSyncAt: new Date(),
        });
        apiKeyPreviewCache.delete(existing.id);
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
        apiKeyPreviewCache.delete(id);
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
        // Skip loan transactions for insights
        if (t.loanId) continue;

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

      // Expense category breakdown — compute from the transactions we've already loaded
      // instead of re-running getTransactionStats which would do a duplicate full scan.
      const categoryTotalsForAi = new Map<number, { name: string; total: number; color: string }>();
      for (const t of transactions) {
        if (t.loanId) continue;
        if (t.type !== 'expense' || !t.categoryId || !t.category) continue;
        const rate = parseFloat(t.wallet?.exchangeRateToDefault || '1');
        const amount = parseFloat(t.amount) * (isNaN(rate) || rate <= 0 ? 1 : rate);
        const existing = categoryTotalsForAi.get(t.categoryId);
        if (existing) {
          existing.total += amount;
        } else {
          categoryTotalsForAi.set(t.categoryId, {
            name: t.category.name,
            total: amount,
            color: t.category.color || '#6B7280',
          });
        }
      }
      const topExpenseCategories = Array.from(categoryTotalsForAi.entries())
        .map(([categoryId, data]) => ({
          categoryId,
          categoryName: data.name,
          total: data.total,
          color: data.color,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

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

      // Heuristic recurring payments: same amount + same category on 3+ different months.
      const recurringCandidates: Record<string, { amount: number; countMonths: number; sample: any }> = {};
      const seenByMonthKey: Record<string, Set<string>> = {};
      for (const t of transactions) {
        if (t.type !== 'expense') continue;
        const amt = parseFloat(t.amount);
        if (amt <= 0) continue;
        const keyMonth = monthKey(new Date(t.date));
        const compositeKey = `${Math.round(amt * 100) / 100}|cat:${t.categoryId || 'none'}`;
        if (!seenByMonthKey[keyMonth]) seenByMonthKey[keyMonth] = new Set();
        if (!seenByMonthKey[keyMonth].has(compositeKey)) {
          seenByMonthKey[keyMonth].add(compositeKey);
          if (!recurringCandidates[compositeKey]) recurringCandidates[compositeKey] = { amount: amt, countMonths: 0, sample: t };
          recurringCandidates[compositeKey].countMonths += 1;
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
        console.error(`DeepSeek API error: ${resp.status} ${text}`);
        return res.json({ 
          metrics, 
          ai: null, 
          aiEnabled: false, 
          message: `DeepSeek 调用失败 (${resp.status}): 服务暂时不可用` 
        });
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
        return res.json({ metrics, ai: null, aiEnabled: false, message: 'AI请求超时，请稍后重试' });
      }
      return res.json({ metrics, ai: null, aiEnabled: false, message: 'AI 生成失败：' + String(error?.message || '未知错误') });
    }
  });

  // =================================================================
  // === Audit Round 2 — Account management, password reset, push,
  // === bill-reminder auto-payment, data export, budgets copy.
  // =================================================================

  // ---- Password change (must be logged in) -----------------------------
  app.post('/api/account/change-password', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { currentPassword, newPassword } = req.body || {};
      if (!currentPassword || !newPassword || typeof newPassword !== "string") {
        return res.status(400).json({ message: "currentPassword 与 newPassword 必填" });
      }
      if (newPassword.length < 8 || newPassword.length > 200) {
        return res.status(400).json({ message: "新密码必须为 8-200 位" });
      }
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
      if (!u || !u.passwordHash) {
        return res.status(400).json({ message: "当前账户不支持密码修改" });
      }
      if (!verifyPassword(currentPassword, u.passwordHash)) {
        return res.status(401).json({ message: "当前密码错误" });
      }
      await db.update(usersTable)
        .set({ passwordHash: hashPassword(newPassword), updatedAt: new Date() })
        .where(eq(usersTable.id, userId));
      res.json({ ok: true });
    } catch (err) {
      console.error("change-password error:", err);
      res.status(500).json({ message: "修改密码失败" });
    }
  });

  // ---- Delete account ---------------------------------------------------
  app.post('/api/account/delete', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { confirmPassword } = req.body || {};
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
      if (!u) return res.status(404).json({ message: "用户不存在" });
      if (u.passwordHash) {
        if (!confirmPassword || !verifyPassword(confirmPassword, u.passwordHash)) {
          return res.status(401).json({ message: "密码错误" });
        }
      }
      // schema has ON DELETE CASCADE for all child rows, so deleting the user
      // is enough to wipe everything.
      await db.delete(usersTable).where(eq(usersTable.id, userId));
      try { (req as any).session?.destroy?.(() => {}); } catch {}
      res.json({ ok: true });
    } catch (err) {
      console.error("delete-account error:", err);
      res.status(500).json({ message: "删除账户失败" });
    }
  });

  // ---- Export all data as a single JSON download -----------------------
  app.get('/api/account/export', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
      const ws = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId));
      const cats = await db.select().from(categoriesTable).where(eq(categoriesTable.userId, userId));
      const txs = await db.select().from(transactionsTable).where(eq(transactionsTable.userId, userId));
      const bg = await db.select().from(budgetsTable).where(eq(budgetsTable.userId, userId));
      const sg = await db.select().from(savingsGoals).where(eq(savingsGoals.userId, userId));
      const rt = await db.select().from(recurringTransactionsTable).where(eq(recurringTransactionsTable.userId, userId));
      const br = await db.select().from(billRemindersTable).where(eq(billRemindersTable.userId, userId));
      const sl = await db.select().from(subLedgersTable).where(eq(subLedgersTable.userId, userId));
      const ln = await db.select().from(loansTable).where(eq(loansTable.userId, userId));
      const ec = await db.select().from(exchangeCredentialsTable).where(eq(exchangeCredentialsTable.userId, userId));
      const payload = {
        exportedAt: new Date().toISOString(),
        // strip secrets
        user: user ? { ...user, passwordHash: undefined } : null,
        wallets: ws,
        categories: cats,
        transactions: txs,
        budgets: bg,
        savingsGoals: sg,
        recurringTransactions: rt,
        billReminders: br,
        subLedgers: sl,
        loans: ln,
        // mask exchange API keys (encrypted at rest anyway, but redact for export)
        exchangeCredentials: ec.map(c => ({ ...c, apiKey: "***REDACTED***", apiSecret: "***REDACTED***" })),
      };
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="prismx-export-${new Date().toISOString().split("T")[0]}.json"`);
      res.send(JSON.stringify(payload, null, 2));
    } catch (err) {
      console.error("export error:", err);
      res.status(500).json({ message: "导出失败" });
    }
  });

  // ---- Push subscription endpoints --------------------------------------
  app.get('/api/push/public-key', isAuthenticated, async (_req, res) => {
    res.json({ key: getPushPublicKey() });
  });

  app.post('/api/push/subscribe', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { endpoint, keys, userAgent } = req.body || {};
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ message: "subscription payload 不完整" });
      }
      await db.insert(pushSubscriptions).values({
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent || (req.headers["user-agent"] as string) || null,
      }).onConflictDoNothing();
      res.json({ ok: true });
    } catch (err) {
      console.error("push subscribe error:", err);
      res.status(500).json({ message: "订阅失败" });
    }
  });

  app.post('/api/push/unsubscribe', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { endpoint } = req.body || {};
      if (!endpoint) return res.status(400).json({ message: "endpoint 必填" });
      await db.delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
      res.json({ ok: true });
    } catch (err) {
      console.error("push unsubscribe error:", err);
      res.status(500).json({ message: "取消订阅失败" });
    }
  });

  // ---- Bill reminder: pay (creates a real transaction + rolls recurring) ----
  app.post('/api/bill-reminders/:id/pay', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      const reminder = await storage.getBillReminder(id, userId);
      if (!reminder) return res.status(404).json({ message: "Bill reminder not found" });
      if (reminder.isPaid && reminder.frequency === "once") {
        return res.status(400).json({ message: "账单已付" });
      }

      // Decide where the money comes out of: prefer the reminder's wallet, else the default wallet.
      let walletId = reminder.walletId;
      if (!walletId) {
        const userWallets = await storage.getWallets(userId);
        const def = userWallets.find(w => w.isDefault) || userWallets[0];
        walletId = def?.id ?? null;
      }
      if (!walletId) {
        return res.status(400).json({ message: "未找到可用钱包" });
      }
      const wallet = await storage.getWallet(walletId, userId);
      if (!wallet) return res.status(400).json({ message: "钱包无效" });

      const rawAmount = parseFloat(reminder.amount || "0");
      if (!(rawAmount > 0)) {
        return res.status(400).json({ message: "账单金额未设置" });
      }

      // Create the expense transaction and atomically debit the wallet.
      await storage.createTransaction({
        userId,
        type: "expense",
        amount: rawAmount.toFixed(2),
        currency: wallet.currency || "MYR",
        walletId,
        categoryId: reminder.categoryId,
        description: `账单支付：${reminder.name}`,
        tags: [`bill_reminder:${reminder.id}`],
        date: new Date(),
      });
      await storage.incrementWalletBalance(walletId, userId, -rawAmount);

      // For a recurring reminder, roll its dueDate forward instead of marking paid.
      // For a one-shot reminder ('once'), mark it paid as before.
      if (reminder.frequency && reminder.frequency !== "once") {
        const next = new Date(reminder.dueDate);
        if (reminder.frequency === "weekly") next.setDate(next.getDate() + 7);
        else if (reminder.frequency === "monthly") next.setMonth(next.getMonth() + 1);
        else if (reminder.frequency === "yearly") next.setFullYear(next.getFullYear() + 1);
        else next.setMonth(next.getMonth() + 1);
        await storage.updateBillReminder(id, userId, { dueDate: next, isPaid: false });
      } else {
        await storage.updateBillReminder(id, userId, { isPaid: true });
      }

      res.json({ ok: true });
    } catch (err) {
      console.error("bill-reminder pay error:", err);
      res.status(500).json({ message: "支付失败" });
    }
  });

  // ---- Budgets: copy previous month's budgets ---------------------------
  app.post('/api/budgets/copy-from-previous', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { year, month } = req.body || {};
      if (!year || !month) return res.status(400).json({ message: "year 和 month 必填" });
      const prevYear = month === 1 ? year - 1 : year;
      const prevMonth = month === 1 ? 12 : month - 1;
      const prev = await storage.getBudgets(userId, prevMonth, prevYear);
      const current = await storage.getBudgets(userId, month, year);
      const existingCats = new Set(current.map(b => b.categoryId));
      let created = 0;
      for (const b of prev) {
        if (existingCats.has(b.categoryId)) continue;
        await storage.createBudget({
          userId,
          categoryId: b.categoryId,
          amount: b.amount,
          year,
          month,
        } as any);
        created++;
      }
      res.json({ created });
    } catch (err) {
      console.error("budget copy error:", err);
      res.status(500).json({ message: "复制失败" });
    }
  });

  // ---- Default currency switch: optionally rescale all wallet rates ----
  app.patch('/api/user/currency-v2', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { currency, autoRescale } = req.body || {};
      if (!currency || typeof currency !== "string") {
        return res.status(400).json({ message: "currency 必填" });
      }
      if (!supportedCurrencyCodes.includes(currency as any)) {
        return res.status(400).json({ message: "不支持的币种" });
      }
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
      if (!u) return res.status(404).json({ message: "用户不存在" });
      const oldCurrency = u.defaultCurrency || "MYR";
      if (oldCurrency === currency) {
        return res.json({ ok: true, unchanged: true });
      }

      // Optional auto-rescale of every wallet's exchangeRateToDefault from old default to new default.
      // We need rate(new -> old) so that newRate * (1 / rate(new->old)) ... actually:
      //   walletAmount * oldExchangeRate = value in oldCurrency
      //   value in newCurrency = value in oldCurrency * rate(old -> new)
      //   newExchangeRate must satisfy: walletAmount * newExchangeRate = value in newCurrency
      //   => newExchangeRate = oldExchangeRate * rate(old -> new)
      if (autoRescale === true) {
        let rate = 1;
        try {
          const r = await fetch(`https://api.frankfurter.app/latest?from=${oldCurrency}&to=${currency}`);
          if (r.ok) {
            const data = await r.json();
            rate = data.rates?.[currency] || 1;
          }
        } catch {}
        const ws = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId));
        for (const w of ws) {
          const oldRate = parseFloat(w.exchangeRateToDefault || "1");
          const newRate = (oldRate * rate).toFixed(6);
          await db.update(walletsTable)
            .set({ exchangeRateToDefault: newRate })
            .where(and(eq(walletsTable.id, w.id), eq(walletsTable.userId, userId)));
        }
      }
      const user = await storage.updateUserCurrency(userId, currency);
      res.json({ ok: true, user });
    } catch (err) {
      console.error("currency-v2 error:", err);
      res.status(500).json({ message: "切换失败" });
    }
  });

  // ---- Batch transaction operations -------------------------------------
  // POST /api/transactions/batch-delete  { ids: number[] }
  // POST /api/transactions/batch-categorize  { ids: number[], categoryId: number | null }
  app.post('/api/transactions/batch-delete', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { ids } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "ids 必须是非空数组" });
      }
      let deleted = 0;
      for (const rawId of ids) {
        const id = parseInt(rawId);
        if (!Number.isFinite(id)) continue;
        const existing = await storage.getTransaction(id, userId);
        if (!existing) continue;
        // Reverse the wallet effect before removing the row, same as the single-delete path.
        const wallet = await storage.getWallet(existing.walletId, userId);
        if (wallet) {
          const amount = parseFloat(existing.amount || "0");
          if (existing.type === 'expense') {
            await storage.incrementWalletBalance(wallet.id, userId, amount);
          } else if (existing.type === 'income') {
            await storage.incrementWalletBalance(wallet.id, userId, -amount);
          } else if (existing.type === 'transfer' && existing.toWalletId) {
            await storage.incrementWalletBalance(wallet.id, userId, amount);
            const toWallet = await storage.getWallet(existing.toWalletId, userId);
            if (toWallet) {
              const toAmount = parseFloat(existing.toWalletAmount || existing.amount || "0");
              await storage.incrementWalletBalance(toWallet.id, userId, -toAmount);
            }
          }
        }
        const ok = await storage.deleteTransaction(id, userId);
        if (ok) deleted++;
        if (existing.loanId) {
          try { await storage.recalculateLoanStatus(existing.loanId, userId); } catch {}
        }
      }
      res.json({ deleted });
    } catch (err) {
      console.error("batch-delete error:", err);
      res.status(500).json({ message: "批量删除失败" });
    }
  });

  app.post('/api/transactions/batch-categorize', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { ids, categoryId } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "ids 必须是非空数组" });
      }
      const cid = categoryId === null || categoryId === undefined ? null : parseInt(categoryId);
      if (cid !== null && !Number.isFinite(cid)) {
        return res.status(400).json({ message: "categoryId 无效" });
      }
      let updated = 0;
      for (const rawId of ids) {
        const id = parseInt(rawId);
        if (!Number.isFinite(id)) continue;
        const existing = await storage.getTransaction(id, userId);
        if (!existing) continue;
        const updatedRow = await storage.updateTransaction(id, userId, { categoryId: cid });
        if (updatedRow) updated++;
      }
      res.json({ updated });
    } catch (err) {
      console.error("batch-categorize error:", err);
      res.status(500).json({ message: "批量分类失败" });
    }
  });

  // ---- Trend snapshots: read latest snapshot for the user ---------------
  app.get('/api/snapshots/latest', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const rows = await db.select().from(monthlyBalanceSnapshots)
        .where(eq(monthlyBalanceSnapshots.userId, userId))
        .orderBy(desc(monthlyBalanceSnapshots.year), desc(monthlyBalanceSnapshots.month))
        .limit(12);
      res.json({ snapshots: rows });
    } catch (err) {
      console.error("snapshots error:", err);
      res.status(500).json({ message: "查询失败" });
    }
  });

  return httpServer;
}
