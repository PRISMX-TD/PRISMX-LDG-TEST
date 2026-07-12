## 目标与量化指标
- LCP ≤ 1.5s、INP ≤ 200ms、TTI ≤ 2s、CLS ≈ 0
- 首屏渲染 ≤ 1.5s（移动 4G）、回访首屏 ≤ 1.0s
- 资源体积与请求数：首屏 JS ≤ 200KB、总请求数 ≤ 25、关键路径往返 ≤ 3

## 优先实施（第1批）
- 字体与静态资源
  - 精简 Google Fonts：保留 1–2 字体族、2–3 权重，拆分为多条短链接，统一 `display=swap` 与 `preconnect`
  - 关键字体自托管并 `preload`，减少第三方链路与阻塞
  - 图片与图标：转 AVIF/WebP，SVG 压缩，首屏图片采用 `srcset/sizes + loading=lazy`
- 打包与代码分包（Vite）
  - 路由与重组件（图表/模态/设置）按需加载，手动 `manualChunks` 保持长期缓存稳定
  - 压缩：JS/CSS 用 esbuild/LightningCSS；开启 Brotli 预压缩；移除未用样式
  - 依赖体检：替换重量库为 ESM 可树摇版本，避免 barrel 文件导致无谓打包
- 网络与缓存
  - 静态产物设置 `Cache-Control: max-age=31536000, immutable`（带哈希），API 开启 gzip/br
  - React Query：合理 `staleTime/gcTime`，分页/游标，首屏 `prefetchQuery`
- PWA/Service Worker
  - HTML 不缓存（已保持），静态资源 `cache-first`；API `network-only/stale-while-revalidate`（仅 GET）

## 渲染与交互优化（第2批）
- 虚拟化列表：交易与报表使用窗口化渲染减少 DOM
- 避免重渲染：稳定 props、`memo/useCallback/useMemo`、合并状态更新
- 优先级与空闲：非关键计算使用 `requestIdleCallback`，输入使用去抖/节流
- 动画性能：仅用 `transform/opacity`，移动端降低动画复杂度与时长

## 服务器与数据库（第3批）
- 服务器
  - 开启 HTTP/2、Keep-Alive、合理超时；静态资源走 CDN，就近访问
  - ETag/Last-Modified 减少返回体；日志仅保留必要元数据
- 数据库
  - 高频过滤字段建立索引；分页走索引；避免 N+1
  - 汇总/月度统计增量更新，热点数据内存/Redis 缓存

## 监测与验证
- 指标采集：Web Vitals（RUM）、Lighthouse、DevTools Performance
- 构建分析：Bundle Analyzer、`vite --profile` 与 `--debug plugin-transform`
- 性能预算：为页面设置体积/请求数阈值，CI 中自动校验

## 迭代与回滚策略
- 灰度发布：逐步启用字体自托管与分包，监测 CWV 波动
- 兼容保障：保留功能等效与回退路径，严格不破坏现有业务

## 交付产出
- 优化变更与配置清单
- 指标对比报告（前/后）、可视化包分析
- 回滚脚本与操作说明

## 需要确认
- 字体保留的最少族与权重清单
- 是否接入 CDN（若已有，将采用 Rules/Edge 缓存策略）
- 是否允许引入 Redis 作为热点缓存（可选）
- 是否接受自托管字体与图片无损压缩（不影响视觉）