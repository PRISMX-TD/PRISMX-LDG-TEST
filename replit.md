# PRISMX Ledger - 个人财务管理应用

## 项目概述
PRISMX Ledger 是一个安全可靠的个人财务跟踪Web应用，支持多用户数据隔离、多钱包管理和完整的交易记录系统。

## 技术栈
- **前端**: React + TypeScript + Tailwind CSS + Shadcn UI
- **后端**: Express.js + TypeScript
- **数据库**: PostgreSQL (Neon)
- **认证**: Replit Auth (OpenID Connect)
- **状态管理**: TanStack Query
- **图表**: Recharts
- **PWA**: 手动实现 (manifest.json + Service Worker + 快捷方式)

## 项目结构
```
├── client/                 # 前端代码
│   ├── src/
│   │   ├── components/     # React组件
│   │   │   ├── ui/         # Shadcn UI组件
│   │   │   ├── AppSidebar.tsx      # 主侧边栏导航
│   │   │   ├── WalletCard.tsx
│   │   │   ├── WalletModal.tsx
│   │   │   ├── TransactionItem.tsx
│   │   │   ├── TransactionModal.tsx
│   │   │   ├── TransactionFilters.tsx
│   │   │   ├── CategoryModal.tsx
│   │   │   ├── TotalAssetsCard.tsx
│   │   │   ├── ExpenseChart.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   ├── BalanceCorrectionModal.tsx  # 余额校正弹窗
│   │   │   ├── WalletBalanceChart.tsx      # 钱包余额趋势图表
│   │   │   ├── DashboardSettingsModal.tsx  # 仪表盘设置弹窗（支持拖拽排序）
│   │   │   ├── MobileNavSettingsModal.tsx  # 移动端导航设置弹窗
│   │   │   ├── MobileNavBar.tsx            # 移动端底部导航栏
│   │   │   ├── PWAUpdatePrompt.tsx         # PWA更新提示组件
│   │   │   └── ThemeProvider.tsx
│   │   ├── hooks/          # React Hooks
│   │   │   ├── useAuth.ts
│   │   │   └── use-toast.ts
│   │   ├── lib/            # 工具函数
│   │   │   ├── queryClient.ts
│   │   │   ├── authUtils.ts
│   │   │   └── utils.ts
│   │   └── pages/          # 页面组件
│   │       ├── Landing.tsx       # 登录页
│   │       ├── Dashboard.tsx     # 仪表盘
│   │       ├── Transactions.tsx  # 交易记录
│   │       ├── Categories.tsx    # 分类管理
│   │       ├── Wallets.tsx       # 钱包管理
│   │       ├── WalletDetail.tsx  # 钱包详情页
│   │       ├── Budgets.tsx       # 预算管理
│   │       ├── Savings.tsx       # 储蓄目标
│   │       ├── Recurring.tsx     # 定期交易
│   │       ├── Reminders.tsx     # 账单提醒
│   │       ├── Analytics.tsx     # 数据分析
│   │       ├── Reports.tsx       # 财务报表
│   │       ├── Settings.tsx      # 设置
│   │       └── not-found.tsx
│   └── index.html
├── server/                 # 后端代码
│   ├── db.ts               # 数据库连接
│   ├── replitAuth.ts       # 认证中间件
│   ├── storage.ts          # 数据存储接口
│   ├── routes.ts           # API路由
│   └── index.ts            # 服务器入口
└── shared/                 # 共享代码
    └── schema.ts           # 数据模型定义
```

## 核心功能
1. **用户认证**: 使用Replit Auth支持邮箱/密码和OAuth登录
2. **多钱包管理**: 支持现金、银行卡、数字钱包等多种支付方式
   - 可灵活调用资金标记: 区分流动资金和长期储蓄/应急资金
   - 按类型分组显示: 仪表盘中钱包按类型分组，支持拖拽排序
   - **钱包详情页**: 点击钱包进入详情页 (/wallets/:id)
     - 当前余额展示和编辑入口
     - 余额趋势图表 (支持每日/每月视图切换)
     - 最近交易列表
     - 余额校正功能: 支持差额补记收支、直接调整余额、更改当前余额、设置初始余额
   - **增强删除功能**: 删除钱包时可选择保留或删除关联交易
3. **交易管理**: 支持支出、收入、转账三种交易类型
4. **多币种支持**: 默认MYR (马来西亚林吉特)，支持跨币种交易和自定义汇率
5. **预算管理**: 按分类设置月度预算，跟踪支出进度
6. **储蓄目标**: 设置储蓄目标，跟踪积累进度
7. **定期交易**: 管理周期性收入和支出
8. **账单提醒**: 设置账单到期提醒，支持循环账单
9. **数据分析**: 可视化图表展示收支趋势和分类占比，支持按子账本筛选
10. **财务报表**: 月度/年度财务报表，支持CSV导出
11. **仪表盘**: 显示总资产摘要和最近交易历史
    - 可自定义卡片显示: 通过设置按钮控制各卡片的可见性和顺序
    - 支持拖拽排序: 使用HTML5原生拖放API重新排列卡片
    - 可灵活调用资金卡片: 单独显示流动资金总额
    - 钱包排序设置: 在设置弹窗中可自定义钱包类型顺序和类型内钱包顺序
12. **数据隔离**: 严格的用户数据隔离确保安全
13. **交易所集成**: 连接MEXC和派网(Pionex)加密货币交易所API，实时显示账户余额
14. **子账本管理**: 创建多个子账本用于特定用途追踪（如旅行、项目等）
    - 交易可关联子账本
    - 可设置是否将子账本纳入主账本分析
    - 分析页面支持按子账本筛选数据
    - 子账本预算: 可为子账本设置预算金额，显示支出进度条和超支警告

交易所集成详情:
- MEXC: 支持现货和合约账户余额查询
- Pionex: 支持交易账户余额查询
- 手动余额录入: 支持录入API无法获取的账户余额（理财、机器人等）
- 总资产汇总: 自动计算所有交易所的总资产估值

## 导航结构 (侧边栏)
- 仪表盘 (/)
- 交易记录 (/transactions)
- 钱包管理 (/wallets)
- 交易所 (/exchange)
- 子账本 (/sub-ledgers)
- 分类管理 (/categories)
- 预算管理 (/budgets)
- 储蓄目标 (/savings)
- 定期交易 (/recurring)
- 账单提醒 (/reminders)
- 数据分析 (/analytics)
- 财务报表 (/reports)
- 设置 (/settings)

## 数据模型
- **users**: 用户信息表 (id, email, firstName, lastName, profileImageUrl, defaultCurrency)
- **sessions**: 会话存储表
- **wallets**: 钱包表 (id, userId, name, type, currency, balance, exchangeRateToDefault, icon, color, isDefault, isFlexible)
- **categories**: 分类表 (id, userId, name, type, icon, color, isDefault)
- **transactions**: 交易表 (id, userId, type, amount, currency, originalAmount, exchangeRate, walletId, toWalletId, toWalletAmount, toExchangeRate, categoryId, subLedgerId, description, date)
- **sub_ledgers**: 子账本表 (id, userId, name, description, color, icon, budgetAmount, includeInMainAnalytics, isArchived, startDate, endDate, createdAt, updatedAt)
- **budgets**: 预算表 (id, userId, categoryId, amount, month, year)
- **savings_goals**: 储蓄目标表 (id, userId, name, targetAmount, currentAmount, currency, isCompleted)
- **recurring_transactions**: 定期交易表 (id, userId, type, amount, currency, walletId, categoryId, frequency, startDate, description, isActive)
- **bill_reminders**: 账单提醒表 (id, userId, name, amount, dueDate, frequency, categoryId, walletId, isPaid, notes)
- **exchange_credentials**: 交易所API凭证表 (id, userId, exchange, apiKey, apiSecret, label, isActive, lastSyncAt)
- **dashboard_preferences**: 仪表盘偏好设置表 (id, userId, showTotalAssets, showMonthlyIncome, showMonthlyExpense, showWallets, showBudgets, showSavingsGoals, showRecentTransactions, showFlexibleFunds, cardOrder)
- **user_analytics_preferences**: 数据分析偏好设置表 (id, userId, cardOrder)
- **user_mobile_nav_preferences**: 移动端导航偏好设置表 (id, userId, mainNavItems)
- **user_wallet_preferences**: 钱包排序偏好设置表 (id, userId, walletOrder, typeOrder, groupByType)

## API路由
### 用户
- `GET /api/auth/user` - 获取当前用户信息
- `PATCH /api/user/currency` - 更新用户默认币种

### 钱包
- `GET /api/wallets` - 获取用户钱包列表
- `GET /api/wallets/:id` - 获取单个钱包详情
- `POST /api/wallets` - 创建新钱包
- `PATCH /api/wallets/:id` - 更新钱包
- `DELETE /api/wallets/:id` - 删除钱包
- `PATCH /api/wallets/:id/default` - 设为默认钱包

### 分类
- `GET /api/categories` - 获取用户分类列表
- `POST /api/categories` - 创建分类
- `PATCH /api/categories/:id` - 更新分类
- `DELETE /api/categories/:id` - 删除分类

### 交易
- `GET /api/transactions` - 获取用户交易记录
- `POST /api/transactions` - 创建新交易
- `PATCH /api/transactions/:id` - 更新交易 (自动处理钱包余额调整)
- `DELETE /api/transactions/:id` - 删除交易 (自动恢复钱包余额)
- `GET /api/transactions/export` - 导出CSV

### 预算
- `GET /api/budgets` - 获取预算列表
- `GET /api/budgets/spending` - 获取预算支出情况
- `POST /api/budgets` - 创建预算
- `PATCH /api/budgets/:id` - 更新预算
- `DELETE /api/budgets/:id` - 删除预算

### 储蓄目标
- `GET /api/savings-goals` - 获取储蓄目标列表
- `POST /api/savings-goals` - 创建储蓄目标
- `PATCH /api/savings-goals/:id` - 更新储蓄目标
- `DELETE /api/savings-goals/:id` - 删除储蓄目标

### 定期交易
- `GET /api/recurring-transactions` - 获取定期交易列表
- `POST /api/recurring-transactions` - 创建定期交易
- `PATCH /api/recurring-transactions/:id` - 更新定期交易
- `DELETE /api/recurring-transactions/:id` - 删除定期交易

### 账单提醒
- `GET /api/bill-reminders` - 获取账单提醒列表
- `POST /api/bill-reminders` - 创建账单提醒
- `PATCH /api/bill-reminders/:id` - 更新账单提醒
- `DELETE /api/bill-reminders/:id` - 删除账单提醒

### 子账本
- `GET /api/sub-ledgers` - 获取子账本列表
- `POST /api/sub-ledgers` - 创建子账本
- `PATCH /api/sub-ledgers/:id` - 更新子账本
- `DELETE /api/sub-ledgers/:id` - 删除子账本

### 交易所集成
- `GET /api/exchange-credentials` - 获取用户交易所API凭证列表
- `POST /api/exchange-credentials` - 添加新的交易所API凭证 (验证后加密存储)
- `PATCH /api/exchange-credentials/:id/manual-balance` - 更新手动录入的余额
- `DELETE /api/exchange-credentials/:id` - 删除交易所API凭证
- `GET /api/mexc/balances` - 获取MEXC交易所账户余额
- `GET /api/pionex/balances` - 获取派网交易所账户余额

### 仪表盘偏好
- `GET /api/dashboard-preferences` - 获取用户仪表盘偏好设置
- `PATCH /api/dashboard-preferences` - 更新仪表盘偏好设置

### 移动端导航偏好
- `GET /api/mobile-nav-preferences` - 获取移动端底部导航偏好设置
- `PATCH /api/mobile-nav-preferences` - 更新移动端底部导航偏好设置

### 钱包排序偏好
- `GET /api/wallet-preferences` - 获取钱包排序偏好设置
- `PATCH /api/wallet-preferences` - 更新钱包排序偏好设置

## 支持的货币
- MYR (马来西亚林吉特) - RM
- CNY (人民币) - ¥
- USD (美元) - $
- SGD (新加坡元) - S$
- EUR (欧元) - €
- GBP (英镑) - £
- JPY (日元) - ¥
- HKD (港币) - HK$
- TWD (新台币) - NT$
- THB (泰铢) - ฿

## 新用户初始化
新用户登录时自动创建:
- 4个默认钱包: 现金、银行卡、支付宝、微信
- 9个支出分类: 餐饮、购物、交通、住房、娱乐、医疗、教育、礼物、其他
- 4个收入分类: 工资、奖金、投资、其他

## 设计规范
- 主题色: Primary #8B5CF6 (紫色)
- 收入色: #10B981 (成功绿)
- 支出色: #EF4444 (警告红)
- 转账色: #8B5CF6 (紫色)
- 背景色: hsl(240 10% 3.9%) (深黑色)
- 卡片色: hsl(240 6% 8%) (深灰色)
- 边框色: 紫色调 (hsl 263 25% 22%)
- 字体: Inter
- **仅深色主题** (无主题切换功能)
- 使用Shadcn侧边栏组件实现可折叠导航
- 紫色渐变光效 (aurora-bg) 增加视觉层次感
- 毛玻璃卡片效果 (glass-card) 使用 backdrop-blur
- 紫色辉光阴影 (purple-glow) 提升视觉层次

## 开发命令
- `npm run dev` - 启动开发服务器
- `npm run db:push` - 推送数据库模式
