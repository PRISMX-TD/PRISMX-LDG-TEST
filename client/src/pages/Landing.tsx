import { Button } from "@/components/ui/button";
import {
  Sparkles, Wallet, TrendingUp, ArrowRightLeft, Shield, BarChart3, Smartphone,
  ArrowRight, Plus, MousePointerClick,
} from "lucide-react";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

/* r7 — Landing page rewritten from scratch. Real Web3 wallet landing:
   hero with floating gradient orbs, marquee feature grid with hover lift,
   social-proof strip, CTA banner with starfield. */

export default function Landing() {
  const { isAuthenticated } = useAuth();

  // Allow body-level scrolling on this page (overrides global overflow:hidden)
  useEffect(() => {
    document.body.style.overflow = "auto";
    return () => {
      document.body.style.overflow = "hidden";
    };
  }, []);

  const features = [
    { icon: Wallet,        title: "多钱包管理",   desc: "现金、银行卡、数字钱包，一个仪表盘看尽全部。", grad: "from-violet-400 to-purple-600" },
    { icon: TrendingUp,    title: "智能记账",     desc: "自动分类、记账连续奖励，让习惯自然养成。",     grad: "from-amber-400 to-orange-500" },
    { icon: ArrowRightLeft,title: "便捷转账",     desc: "一键跨币种、跨钱包，余额实时同步。",          grad: "from-pink-400 to-rose-500" },
    { icon: Shield,        title: "数据安全",     desc: "用户数据隔离 + 加密存储，财务信息只属于你。",  grad: "from-cyan-400 to-blue-500" },
    { icon: BarChart3,     title: "深度洞察",     desc: "支出趋势、月度对比、自定义报表一键生成。",     grad: "from-emerald-400 to-teal-500" },
    { icon: Smartphone,    title: "响应式设计",   desc: "手机、平板、电脑，随时随地查看资产。",        grad: "from-indigo-400 to-violet-500" },
  ];

  const stats = [
    { v: "14", k: "核心模块" },
    { v: "8", k: "支持币种" },
    { v: "∞", k: "笔交易" },
    { v: "0", k: "隐私泄露" },
  ];

  return (
    <div className="min-h-screen overflow-y-auto custom-scroll text-foreground relative">
      {/* deep gradient background */}
      <div aria-hidden className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute inset-0 bg-[#0a0612]" />
        <div className="absolute top-0 left-1/4 w-[640px] h-[640px] rounded-full opacity-40 blur-3xl"
             style={{ background: "radial-gradient(circle, rgba(167,139,250,0.4) 0%, transparent 70%)" }} />
        <div className="absolute top-1/3 right-1/4 w-[520px] h-[520px] rounded-full opacity-30 blur-3xl"
             style={{ background: "radial-gradient(circle, rgba(245,158,11,0.3) 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 left-1/3 w-[480px] h-[480px] rounded-full opacity-25 blur-3xl"
             style={{ background: "radial-gradient(circle, rgba(236,72,153,0.3) 0%, transparent 70%)" }} />
      </div>

      {/* HEADER */}
      <header className="sticky top-0 z-50"
              style={{ background: "rgba(10,6,18,0.7)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#a78bfa] via-[#8b5cf6] to-[#7c3aed] flex items-center justify-center shadow-[0_6px_16px_-6px_rgba(124,58,237,0.7)]">
              <Sparkles className="w-[18px] h-[18px] text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-[15px] leading-none tracking-tight">PRISMX</span>
              <span className="text-[9px] tracking-[0.22em] uppercase text-foreground/45 mt-0.5">Ledger</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <Button asChild data-testid="button-dashboard"><a href="/dashboard">进入仪表盘 <ArrowRight className="w-4 h-4" /></a></Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm"><a href="/auth">登录</a></Button>
                <Button asChild size="sm" data-testid="button-register"><a href="/auth?tab=register">免费注册</a></Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="relative">
        {/* ============ HERO ============ */}
        <section className="pt-20 md:pt-32 pb-16 md:pb-24 px-4 sm:px-6">
          <div className="max-w-5xl mx-auto text-center">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.10] text-[12px] mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)] animate-pulse" />
              <span className="text-foreground/75">现已支持 8 种主流货币</span>
            </div>

            <h1 className="text-[34px] sm:text-[48px] md:text-[78px] font-bold tracking-tight leading-[1.05] mb-6">
              <span className="block"
                    style={{
                      background: "linear-gradient(135deg, #ffffff 0%, #e0e7ff 40%, #c7d2fe 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}>
                你的钱
              </span>
              <span className="block"
                    style={{
                      background: "linear-gradient(135deg, #a78bfa 0%, #f0abfc 40%, #fbbf24 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}>
                值得更聪明的家
              </span>
            </h1>

            <p className="text-[14px] md:text-[18px] text-foreground/65 max-w-2xl mx-auto mb-10 leading-relaxed px-2 sm:px-0">
              PRISMX Ledger 把多钱包、智能记账、深度分析、人情往来全部装进一个像 Web3 钱包一样优雅的界面。
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {isAuthenticated ? (
                <Button size="xl" asChild data-testid="button-get-started"><a href="/dashboard">进入仪表盘 <ArrowRight className="w-5 h-5" /></a></Button>
              ) : (
                <Button size="xl" asChild data-testid="button-get-started"><a href="/auth?tab=register">免费开始 <ArrowRight className="w-5 h-5" /></a></Button>
              )}
              <Button size="xl" variant="outline" asChild><a href="#features">了解功能</a></Button>
            </div>

            {/* stats strip */}
            <div className="mt-14 md:mt-20 grid grid-cols-4 gap-3 md:gap-6 max-w-3xl mx-auto">
              {stats.map((s, i) => (
                <div key={i} className="text-center">
                  <p className="text-[28px] md:text-[40px] font-bold m-0"
                     style={{
                       background: "linear-gradient(135deg, #a78bfa 0%, #fbbf24 100%)",
                       WebkitBackgroundClip: "text",
                       WebkitTextFillColor: "transparent",
                     }}>{s.v}</p>
                  <p className="text-[10.5px] md:text-[12px] tracking-[0.18em] uppercase text-foreground/45 m-0">{s.k}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ FEATURES ============ */}
        <section id="features" className="py-16 md:py-24 px-4 sm:px-6">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-[11px] tracking-[0.22em] uppercase text-[#a78bfa] mb-2">Features</p>
              <h2 className="text-[32px] md:text-[44px] font-bold tracking-tight m-0">为日常财务量身打造</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {features.map((f, i) => (
                <div key={i}
                     className="group relative overflow-hidden rounded-3xl p-6 transition-all duration-300 hover:-translate-y-1"
                     style={{
                       background: "rgba(255,255,255,0.025)",
                       border: "1px solid rgba(255,255,255,0.06)",
                     }}>
                  <div aria-hidden className={`absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-0 group-hover:opacity-50 blur-3xl transition-opacity bg-gradient-to-br ${f.grad}`} />
                  <div className="relative">
                    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${f.grad} flex items-center justify-center mb-4 shadow-[0_8px_24px_-8px_rgba(167,139,250,0.5)]`}>
                      <f.icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="font-bold text-[17px] m-0 mb-2">{f.title}</h3>
                    <p className="text-[13.5px] text-foreground/60 m-0 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ HOW IT WORKS (3 steps) ============ */}
        <section className="py-16 md:py-24 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-[11px] tracking-[0.22em] uppercase text-[#34d399] mb-2">How it works</p>
              <h2 className="text-[32px] md:text-[44px] font-bold tracking-tight m-0">3 步开始用</h2>
              <p className="text-[14px] text-foreground/55 m-0 mt-3 max-w-xl mx-auto">从注册到第一笔记账,不超过 90 秒。不需要绑定银行卡,不需要导入历史数据。</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
              {[
                { num: "01", icon: MousePointerClick, title: "免费注册", desc: "30 秒邮箱+密码,不需要信用卡也不需要邀请码", accent: "#a78bfa" },
                { num: "02", icon: Wallet,            title: "添加钱包", desc: "现金、银行卡、数字钱包都可以,支持 8 种货币自动换算", accent: "#fbbf24" },
                { num: "03", icon: Plus,              title: "记一笔",   desc: "顶部 + 按钮一键打开,3 秒搞定一条交易,自动入账户余额", accent: "#34d399" },
              ].map((s, i) => (
                <div key={i} className="relative rounded-3xl p-6 md:p-7 bg-white/[0.025] border border-white/[0.06]">
                  <div aria-hidden className="absolute -top-12 -right-10 w-32 h-32 rounded-full opacity-25 blur-3xl pointer-events-none"
                       style={{ background: `radial-gradient(circle, ${s.accent}, transparent 70%)` }} />
                  <div className="relative">
                    <div className="flex items-center justify-between mb-5">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                           style={{ background: `${s.accent}22`, border: `1px solid ${s.accent}44`, color: s.accent }}>
                        <s.icon className="w-6 h-6" />
                      </div>
                      <span className="text-[28px] font-bold tabular-nums text-foreground/15">{s.num}</span>
                    </div>
                    <h3 className="text-[17px] font-bold m-0 mb-2">{s.title}</h3>
                    <p className="text-[13px] text-foreground/60 m-0 leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ CTA ============ */}
        <section className="py-20 md:py-32 px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            <div className="relative overflow-hidden rounded-[32px] p-8 md:p-16 text-center"
                 style={{
                   background: "linear-gradient(135deg, rgba(124,58,237,0.3) 0%, rgba(217,70,239,0.2) 50%, rgba(245,158,11,0.2) 100%), rgba(20,12,32,0.8)",
                   border: "1px solid rgba(255,255,255,0.08)",
                   backdropFilter: "blur(16px)",
                 }}>
              <div aria-hidden className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-40 blur-3xl"
                   style={{ background: "radial-gradient(circle, rgba(167,139,250,0.6) 0%, transparent 70%)" }} />
              <div aria-hidden className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full opacity-30 blur-3xl"
                   style={{ background: "radial-gradient(circle, rgba(245,158,11,0.5) 0%, transparent 70%)" }} />

              <div className="relative">
                <h2 className="text-[32px] md:text-[48px] font-bold tracking-tight mb-4 m-0">
                  现在就开始,
                  <br />
                  <span style={{
                    background: "linear-gradient(135deg, #fbbf24 0%, #f0abfc 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}>掌控你的财务旅程</span>
                </h2>
                <p className="text-[14px] md:text-[16px] text-foreground/70 max-w-xl mx-auto m-0 mb-8">
                  无需信用卡, 不收取任何费用。注册仅需 30 秒。
                </p>
                {isAuthenticated ? (
                  <Button size="xl" asChild><a href="/dashboard">进入仪表盘 <ArrowRight className="w-5 h-5" /></a></Button>
                ) : (
                  <Button size="xl" asChild><a href="/auth?tab=register">免费创建账号 <ArrowRight className="w-5 h-5" /></a></Button>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-8 px-4 sm:px-6 border-t border-white/[0.05]">
        <div className="max-w-7xl mx-auto text-center text-[12px] text-foreground/45">
          © {new Date().getFullYear()} PRISMX Ledger · 保留所有权利
        </div>
      </footer>
    </div>
  );
}


