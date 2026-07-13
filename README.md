# PRISMX Ledger — 项目交接文档

> 这份文档面向"接手这个项目的人（或 AI）"。读完它，你应该能理解整个系统的架构、数据流、关键约定、部署方式和已知坑，然后直接上手开发。
>
> **最后更新**：2026-07（对应 git `master`/`main` 最新提交）。若代码与本文不符，以代码为准，并顺手更新本文。

---

## 1. 这是什么

**PRISMX Ledger** 是一个**个人财务管理 Web 应用（PWA）**，中文界面，暗色主题。核心能力：

- 多钱包记账（现金/银行卡/数字钱包/信用卡/投资），支持**多币种**
- 交易（支出/收入/转账，含跨币种转账）、分类、子账本、预算、储蓄目标、定期交易、账单提醒、借贷（人情往来）、分账（AA）
- 数据分析（收支趋势、构成饼图、账户分布）、财务报表（CSV 导出）
- **AI 财务体检**（DeepSeek，给出储蓄率/应急金/月均支出等指标 + AI 文字建议）
- 加密交易所集成（MEXC / 派网 Pionex，只读余额）
- Web Push 通知、密码重置邮件

**单用户视角、严格用户数据隔离**（每张表都有 `userId`，所有查询都带 userId 过滤）。

---

## 2. 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite + Tailwind + shadcn/ui + wouter(路由) + TanStack Query + Recharts + framer-motion |
| 后端 | Express + TypeScript（用 `tsx` 跑，生产用 esbuild 打成单文件 `dist/index.cjs`） |
| 数据库 | PostgreSQL（Neon / Railway）+ Drizzle ORM + drizzle-kit（schema push，无迁移文件） |
| 认证 | 自研 HMAC 签名 token，存 **httpOnly cookie**（不是 Replit Auth，旧文档已过时） |
| 部署 | Docker → Railway（也保留了 Replit 配置 `.replit`） |
| AI | DeepSeek Chat API |

---

## 3. 快速开始（本地）

```bash
npm install                 # 装依赖（postinstall 会跑一次 build，可忽略其产物）
# 开发模式（Vite + Express 一体，热更新）：
npm run dev                 # 默认 5000 端口（PORT 可覆盖）
```

**环境变量**：本地最省事的做法是**不设 `DATABASE_URL`** —— 这时会自动用**内存存储**（`MemStorage`，见 §5），数据不落库、重启即丢，但注册/登录/记账等主流程都能跑，适合快速调试 UI。要连真库就设 `DATABASE_URL`（见 §11）。

```bash
npm run check               # tsc 类型检查（注意：仓库有历史遗留的类型错误，见 §12）
npm run build               # 生产构建：vite 打客户端 + esbuild 打服务端 → dist/
npm run db:push             # 把 shared/schema.ts 同步到数据库（drizzle-kit push）
npm start                   # 跑生产构建（需要 dist/，NODE_ENV=production）
```

> ⚠️ 类型检查（`tsc`）**目前不是干净的**——仓库里有一批历史遗留的类型错误（见 §12）。实际运行靠 `tsx`/esbuild（不做完整类型检查）。所以判断"改动有没有引入新错误"时，要跟基线数量对比，别指望 0 错误。

---

## 4. 目录结构

```
PRISMX-LDG-main/
├── README.md                 # 本文档（项目权威说明）
├── Dockerfile                # 生产镜像；CMD 先跑迁移脚本再启动
├── drizzle.config.ts         # drizzle-kit 配置
├── package.json / package-lock.json
├── tsconfig.json / vite.config.ts / tailwind.config.ts / postcss.config.js / components.json
├── .replit                   # 旧的 Replit 运行配置（现主力在 Railway，保留备用）
│
├── shared/
│   └── schema.ts             # ★ 唯一的数据模型来源（Drizzle 表 + Zod + 类型 + 货币/枚举常量）
│
├── server/
│   ├── index.ts              # 服务入口：中间件(安全头/CSRF/限流/日志)、启动、优雅退出
│   ├── routes.ts             # ★ 全部 API 路由（很大，~3000 行）
│   ├── storage.ts            # ★ IStorage 接口 + DatabaseStorage(Drizzle 实现)
│   ├── mem-storage.ts        # MemStorage(内存实现，无 DATABASE_URL 时用)
│   ├── db.ts                 # 数据库连接池（node-postgres 或 neon-serverless）
│   ├── authToken.ts          # HMAC token 签发/校验 + AUTH_SECRET 解析
│   ├── neonAuth.ts           # isAuthenticated 中间件（从 cookie 读 token）
│   ├── mailer.ts             # 邮件（Brevo API 优先，SMTP 兜底）
│   ├── mexc.ts / pionex.ts   # 交易所 API + AES-GCM 加解密(mexc.ts 内)
│   ├── push.ts               # Web Push(VAPID)
│   ├── pg-lock.ts            # Postgres 咨询锁工具(调度器/迁移选主)
│   ├── recurring-scheduler.ts  # 定期交易自动生成(每小时 tick)
│   ├── reminders-scheduler.ts  # 账单提醒推送 + 月度资产快照(每 30 分 tick)
│   ├── errors.ts / static.ts / vite.ts
│
├── script/
│   ├── build.ts              # 生产构建脚本(vite build + esbuild)
│   └── db-push-with-lock.cjs # ★ 容器启动时的 schema push(带咨询锁+超时+孤儿序列自愈)
│
├── client/
│   ├── index.html
│   └── src/
│       ├── main.tsx / App.tsx        # 入口 + 路由(wouter，页面懒加载)
│       ├── index.css
│       ├── pages/                    # 每个路由一个页面
│       ├── components/               # 业务组件
│       │   ├── ds/                   # 设计系统小组件(BrandCircle/Sparkline/PillButton…)
│       │   └── ui/                   # shadcn/ui 组件库(基础 UI，勿大改)
│       ├── hooks/                    # useAuth / useUndoableDelete / usePrivacyMode …
│       └── lib/                      # queryClient / neonAuth(前端auth) / utils / themes …
│
├── docs/                     # 设计文档 + HTML 原型(参考用，非运行代码)
└── .trae/documents/          # 早期中文优化方案文档(历史资料，可能已过时)
```

**动手前必读的三个文件**：`shared/schema.ts`（数据模型）、`server/routes.ts`（后端逻辑）、`server/storage.ts`（数据访问层）。

---

## 5. 架构要点

### 存储抽象（重要）
`server/storage.ts` 定义了 `IStorage` 接口，有两个实现：
- **`DatabaseStorage`**（Drizzle + Postgres）—— 生产用。
- **`MemStorage`**（`server/mem-storage.ts`，纯内存 Map）—— 当 `DATABASE_URL` 缺失或含 `dummy` 时自动启用（`export const isMock = ...`）。

所有路由都通过 `storage.xxx()` 访问数据，**不直接写 SQL**（少数聚合/账户导出例外，直接用 `db`）。改数据访问逻辑时**两个实现都要改**，否则 mock 模式会行为不一致。

### 认证（httpOnly cookie，不是 Replit Auth）
- 登录/注册成功 → 服务端签发 HMAC token（`authToken.ts`），写入 **httpOnly cookie `prismx_session`**（`sameSite=lax`，生产 `secure`）。响应体**不含 token**（防止落日志）。
- 每个受保护请求：`isAuthenticated`（`neonAuth.ts`）从 cookie 读 token，验签，把 `req.user.claims.sub = userId`。也兼容 `Authorization: Bearer`。
- **CSRF**：双提交 cookie。服务端首个响应下发非 httpOnly 的 `XSRF-TOKEN` cookie；前端所有写请求（POST/PUT/PATCH/DELETE）必须带 `x-csrf-token` 头（值=该 cookie）。`server/index.ts` 里校验。
- 登出：`POST /api/auth/logout` 清 cookie。
- `AUTH_SECRET`：token 的 HMAC 密钥。**生产强烈建议设为固定环境变量**；没设时会尝试从数据库 `app_secrets` 表读/建一个持久密钥；再不行退化为进程内临时密钥（会导致重启/多实例掉登录，但不会 crash）。见 `server/authToken.ts`。

### 前端数据流
- TanStack Query 统一管数据，queryKey 第一段是 API 路径（如 `["/api/wallets"]`），`getQueryFn` 自动拼 URL、带 `credentials:"include"`。
- 所有请求都带 cookie；写请求带 CSRF 头（`lib/queryClient.ts` 的 `apiRequest`）。
- 路由用 wouter；页面用 `React.lazy` 懒加载（见 `App.tsx`）。
- 有些页面是"外壳+懒加载子页"：`Insights`=分析/报表/子账本，`Planning`=预算/储蓄/定期/提醒，`People`=借贷/分账。

---

## 6. 数据模型（`shared/schema.ts`）

主要表（都含 `userId`，删用户级联删除）：

| 表 | 说明 / 关键字段 |
|---|---|
| `users` | id, email, passwordHash(scrypt), firstName, **defaultCurrency**(默认 MYR) |
| `wallets` | name, type, currency, **balance**, **exchangeRateToDefault**(→默认币汇率), isDefault, **isFlexible**(见 §7), **isArchived/archivedAt**(软删除) |
| `categories` | name, type(expense/income), icon, color, isDefault |
| `transactions` | type(expense/income/transfer), **amount**(钱包币种), currency(输入币种), originalAmount, exchangeRate, walletId, **toWalletId/toWalletAmount/toExchangeRate**(转账), categoryId, subLedgerId, loanId, tags[], date |
| `loans` | type(lend/borrow), person, totalAmount, currency, paidAmount, status(active/settled/bad_debt) |
| `budgets` | categoryId, amount(默认币种), month, year |
| `savings_goals` | name, targetAmount, currentAmount, currency, isCompleted, linkedWalletId |
| `recurring_transactions` | type, amount, walletId, categoryId, frequency, nextExecutionDate, isActive（**注意：无 currency 字段**，金额按钱包币种） |
| `bill_reminders` | name, amount, dueDate, frequency, isPaid（**无 currency 字段**，视为默认币种） |
| `sub_ledgers` | name, budgetAmount, includeInMainAnalytics, isArchived, currency |
| `exchange_credentials` | exchange, apiKey/apiSecret(**AES-GCM 加密存储**), manualBalance, isActive |
| `user_*_preferences` | dashboard / analytics / mobile_nav / wallet 四张偏好表 |
| `ai_insights` | 每用户一行，缓存最近一次 AI 输出(payload jsonb) |
| `app_secrets` | 服务端密钥持久化(目前存自愈的 AUTH_SECRET) |
| `password_reset_tokens` | 密码重置(存 token 的 sha256) |
| `push_subscriptions` | Web Push 订阅端点 |
| `monthly_balance_snapshots` | 每月资产快照（**目前前端未使用，见 §12**） |
| `group_activities` | 分账(AA)数据(payload jsonb) |

改 schema 后需 `npm run db:push`（或部署时容器自动 push）。**新增列请用可空/带默认值**，因为迁移是"加列"式并发跑的。

---

## 7. 核心业务约定（★ 改钱之前必看）

### 货币换算（最容易踩坑）
- **每笔交易的 `amount` 存的是"钱包币种"的金额**；`exchangeRateToDefault` 是"钱包币种→用户默认币种"的汇率。
- **任何跨钱包/跨币种的汇总，累加前必须换算到默认币种**：`amount * wallet.exchangeRateToDefault`。
- **优先用交易上 join 的 `t.wallet`** 取汇率，而不是 `wallets.find(id)` —— 因为**归档钱包不在 `/api/wallets` 列表里**，用 find 会查不到、导致不换算（历史上多处踩过这个坑）。汇率要对 `0/NaN/负` 做兜底（`isNaN(r)||r<=0 ? 1 : r`）。
- 服务端已换算的聚合：`getTransactionStats`、`getBudgetSpending`、AI insights、月度快照。前端各页自己换算的：Dashboard、Analytics、Reports、SubLedgers、Wallets、Loans 等——都遵循上面的规则。
- **单笔交易展示**用钱包自己的货币符号（如显示 `$4.37` 并标 `USD`），不要用默认符号；**汇总/总额**用默认币种符号。

### 资金操作的原子性
交易的增/删/改、转账、账单支付、定期交易生成，都必须**在一个数据库事务里同时完成"改余额 + 增删改交易记录"**，用 `storage.createTransactionWithEffects / updateTransactionWithEffects / deleteTransactionWithEffects`（`storage.ts`）。路由负责算好 `deltas: {walletId, delta}[]` 传进去。**不要**再分开调 `createTransaction` + `incrementWalletBalance`（会有中途失败导致账不平的风险）。

### `isFlexible`（可灵活调用资金）与应急金
- 钱包的 `isFlexible` 开关：**打开(true)=日常可花的活钱**（计入仪表盘"可灵活调用"）；**关闭(false)=长期/应急储蓄**。默认 `true`。
- **应急金 = 累加 `isFlexible===false` 的钱包余额（换算默认币）**；"应急金月数" = 应急金 ÷ 月均支出。（AI insights 里算，`routes.ts`）
- 注意：单个开关把"长期储蓄"和"应急储蓄"混在一起了——想更细分需要加字段。

### 删钱包 = 软删除（归档）
- 默认 `DELETE /api/wallets/:id` → **归档**（`isArchived=true`，交易保留）。带 `?deleteTransactions=true` 才硬删（级联删交易）。
- 归档钱包：不在 `/api/wallets` 活跃列表、不计入总资产，但详情/历史可查、可 `PATCH {isArchived:false}` 恢复。

### 其他约定
- **转账**：源钱包减 `amount`，目标钱包加 `toWalletAmount`（跨币种时两者不同）。转账在收支统计里被排除。
- **贷款还款**：还款交易的 `currency` 存的是**钱包币种**、`exchangeRate` 存"钱包↔贷款币种"汇率；`recalculateLoanStatus` 用 `amount/exchangeRate` 还原贷款币种金额。（这段逻辑绕但正确，别乱改）
- **定期交易**：无币种字段，金额按**所选钱包币种**记账；展示时用钱包货币符号。
- **loan/坏账交易**：用 `tags` 标记（如 `bad_debt_writeoff:loan_<id>`），坏账核销交易不扣钱包余额（纯账面）。

---

## 8. API 路由（`server/routes.ts`，全部需登录，除注册/登录/忘记密码/config）

- **认证**：`POST /api/auth/register|login|logout`、`GET /api/auth/user`、`POST /api/account/forgot-password|reset-password|change-password|delete`、`GET /api/account/export`、`GET /api/config`
- **钱包**：`GET/POST /api/wallets`、`GET/PATCH/DELETE /api/wallets/:id`、`POST /api/wallets/:id/archive`、`POST /api/wallets/balance-correction`
- **分类**：`GET/POST /api/categories`、`PATCH/DELETE /api/categories/:id`
- **交易**：`GET/POST /api/transactions`、`PATCH/DELETE /api/transactions/:id`、`GET /api/transactions/stats`、`GET /api/transactions/export`(CSV)、`POST /api/transactions/batch-delete|batch-categorize`
- **预算**：`GET/POST /api/budgets`、`GET /api/budgets/spending`、`PATCH/DELETE /api/budgets/:id`、`POST /api/budgets/copy-from-previous`
- **储蓄/定期/提醒/子账本/借贷/分账**：各自 `GET/POST/PATCH/DELETE`（`savings-goals`/`recurring-transactions`/`bill-reminders`/`sub-ledgers`/`loans`/`groups`）；`POST /api/bill-reminders/:id/pay`
- **交易所**：`GET/POST/DELETE /api/exchange-credentials`、`PATCH .../manual-balance`、`GET /api/mexc/balances`、`GET /api/pionex/balances`
- **AI**：`GET /api/ai/insights?rangeMonths=`（1 小时/账户 缓存）
- **偏好**：`GET/PATCH /api/dashboard-preferences | analytics-preferences | mobile-nav-preferences | wallet-preferences`
- **推送/汇率/快照**：`GET /api/push/public-key`、`POST /api/push/subscribe|unsubscribe`、`GET /api/exchange-rate`(第三方汇率)、`GET /api/snapshots/latest`
- **杂项**：`PATCH /api/user/currency | currency-v2`、`GET /health`

---

## 9. 后台任务（调度器）
- `recurring-scheduler.ts`：每小时把到期的定期交易物化成真实交易（原子写入 + 每期即时持久化 nextExecutionDate 防重复）。
- `reminders-scheduler.ts`：每 30 分钟推送将到期账单；每月 1 号写资产快照。
- **两者都用 Postgres 咨询锁（`pg-lock.ts`，key 911001/911002）选主**，保证多实例/多服务下同一时刻只有一个执行，不重复扣款/重复推送。
- 可用 `DISABLE_RECURRING_SCHEDULER` / `DISABLE_REMINDERS_SCHEDULER` 关闭。

---

## 10. 部署（Railway + Docker）

- 生产镜像见 `Dockerfile`；启动命令：
  ```
  CMD node script/db-push-with-lock.cjs; node dist/index.cjs
  ```
- **`script/db-push-with-lock.cjs`（★重要）**：容器启动时先跑 schema push，做了三重保护：
  1. **Postgres 咨询锁选主**（key 911003）：多个服务/实例共享一个库时，只有一个真正 push，其他**有上限地等待**（最多 45s）后照常启动。
  2. **孤儿序列自愈**：清理"没挂在任何列上的 `*_id_seq`"（历史上被中断的 push 会留下这种垃圾，导致后续 push 报 `relation already exists`）。
  3. **超时**：push 90s、连接/查询 15-20s 超时。**push 失败也不阻断启动**（用 `;` 不是 `&&`，脚本恒退出 0）——迁移失败只会让依赖新列的功能暂时 500，而不是整站 502。
- **重要事实**：当前 **"正式版(PRISMX-LDG)"和"测试版(PRISMX-LDG-TEST)"两个 Railway 服务共用同一个数据库**。所以它们**共享同一份数据**（在测试版改数据会影响正式版）。上面的咨询锁就是为这种多服务共库场景设计的。如果想要真正隔离的测试环境，应给测试服务单开一个库。

---

## 11. 环境变量

| 变量 | 必需 | 说明 |
|---|---|---|
| `DATABASE_URL` | 生产必需 | Postgres 连接串；缺失/含 dummy → 走内存 mock 模式 |
| `AUTH_SECRET` | **强烈建议** | token HMAC 密钥，固定高熵值(`openssl rand -hex 32`)。不设会退化(见 §5) |
| `PUBLIC_APP_URL` | 生产必需 | 站点基础 URL，用于生成密码重置链接（**不设会退回用请求头，有投毒风险**） |
| `ENCRYPTION_KEY` | 建议 | 交易所 API 凭证的加密密钥(≥16位)；不设退回用 `SESSION_SECRET` |
| `DEEPSEEK_API_KEY` | 可选 | 不设则 AI 只返回确定性指标、没有 AI 文字建议 |
| `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` | 可选 | Web Push |
| `BREVO_API_KEY` 或 `SMTP_*` | 可选 | 发邮件(密码重置) |
| `DB_TRANSPORT` | 可选 | `tcp`(默认，node-postgres) 或 `ws`(neon-serverless) |
| `DB_SSL_INSECURE` | 可选 | `true` 时关掉数据库 TLS 证书校验(默认校验) |
| `DISABLE_AUTH` | **仅本地** | `true` 免登录调试(用 `x-user-id` 头指定用户)。**生产强制忽略** |
| `PORT` | 可选 | 默认 5000 |

---

## 12. 已知问题 / 坑 / 待办（务必读）

1. **`tsc` 类型检查有历史遗留错误**（~30 个，如 `range` 常量导致的死比较、若干 `implicitly any`）。运行不受影响（用 esbuild）。改代码时对比基线数量判断是否引入新错误，别追求 0。
2. **两个 Railway 服务共用一个数据库**（见 §10）——测试/正式数据不隔离。多次连续部署可能触发迁移竞争（已用咨询锁+超时缓解，不再会 502，但部署时最好错开）。
3. **月度资产快照(`monthly_balance_snapshots`)前端未使用**：服务端每月在存，但 Dashboard 的资产走势是"从当前总资产往回减交易"推算的（`yearlyAssets`/`totalSparkline`）。这个回推**无法反映"直接改余额的校正"**（因为那没有对应交易）；跨币种转账已计入。想要完全精确的历史，应改成用快照。
4. **加密资产不并入总资产**：MEXC/派网余额只在"交易所"页以美元(USDT)显示，**不换算成默认币、也不进仪表盘总资产**。没有一个把钱包+加密合起来的统一净值。（这是刻意保留的现状，若要合并需新逻辑）
5. **`schedule` 相关 / drizzle-kit push 作为迁移**：用的是 `push`(适合开发)而非生成迁移文件。只增列是安全的；如果将来有破坏性变更(改列名/删列)，push 可能丢数据，届时应改成正式迁移。
6. **限流是进程内内存**(`server/index.ts` 的 `rateMap`)：多实例下不共享；已设 `trust proxy=1` 让它按真实 IP。要强限流需外部存储(Redis)。
7. **savings_goals / 借贷 的跨币种**：savings_goals 只存 currency 无汇率，汇总时按"有该币种的钱包汇率"换算(见 Savings 页)；找不到对应钱包则按 1。
8. **CSP**：生产已去掉 `unsafe-eval`（保留 `wasm-unsafe-eval` 给 tesseract OCR）。若加了需要 eval 的新库，注意 CSP(`server/index.ts`)。

---

## 13. 验证 / 测试方式

**本仓库没有单元测试**。验证靠"起服务 + 手动/curl 走流程"：

```bash
# 起 mock 模式服务(无需数据库)：
PORT=5099 DISABLE_REMINDERS_SCHEDULER=true DISABLE_RECURRING_SCHEDULER=true npx tsx server/index.ts
# 然后 curl 走：GET /api/config 拿 XSRF-TOKEN → POST /api/auth/register(带 x-csrf-token) →
# 用返回的 cookie 打各接口。参考 §5 的认证流程。
```

改动后的标准自检：`npm run check`（对比基线错误数）+ `npm run build`（确认能打包）+ 起服务实测受影响的接口。改了金额/换算逻辑的，务必构造多币种数据端到端验证（比如 USD 钱包、汇率 4.7，看总额是否 ×4.7）。

---

## 14. 代码地图（想改某功能，去哪找）

| 想做的事 | 去哪 |
|---|---|
| 加/改数据表 | `shared/schema.ts` → 然后 `db:push` |
| 加/改 API | `server/routes.ts`（对应资源那一段） |
| 改数据访问逻辑 | `server/storage.ts` **和** `server/mem-storage.ts`（两个都要改） |
| 改认证/token/CSRF | `server/authToken.ts` / `server/neonAuth.ts` / `server/index.ts`(CSRF 中间件) / `client/src/lib/neonAuth.ts` |
| 改货币换算 | 搜 `exchangeRateToDefault`；服务端 `getTransactionStats`/`getBudgetSpending`/AI insights，前端各页 |
| 改 AI 体检 | 服务端 `routes.ts` 的 `/api/ai/insights`(提示词+指标)，前端 `pages/Analytics.tsx` 的 `AiInsightsSection` |
| 改仪表盘计算 | `client/src/pages/Dashboard.tsx`(totalAssets/fxRate/yearlyAssets/dailyFlow…) |
| 改部署/迁移 | `Dockerfile` / `script/db-push-with-lock.cjs` |
| 改调度器 | `server/recurring-scheduler.ts` / `server/reminders-scheduler.ts` / `server/pg-lock.ts` |

---

_接手愉快。有疑问先读 `shared/schema.ts` 和 `server/routes.ts`，八成答案都在里面。_
