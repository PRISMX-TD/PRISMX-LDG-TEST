import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Target, Mail } from "lucide-react";
import {
  Wallet,
  TrendingUp,
  ArrowRightLeft,
  Shield,
  BarChart3,
  Smartphone,
} from "lucide-react";
import { SiGoogle, SiGithub, SiApple } from "react-icons/si";
import { RiTwitterXFill } from "react-icons/ri";

export default function Landing() {
  const features = [
    {
      icon: Wallet,
      title: "多钱包管理",
      description: "支持现金、银行卡、数字钱包等多种支付方式，轻松管理所有资产",
    },
    {
      icon: TrendingUp,
      title: "收支追踪",
      description: "清晰记录每一笔收入和支出，自动分类统计，了解资金流向",
    },
    {
      icon: ArrowRightLeft,
      title: "便捷转账",
      description: "一键在不同钱包间转移资金，余额自动同步更新",
    },
    {
      icon: Shield,
      title: "数据安全",
      description: "严格的用户数据隔离机制，确保您的财务信息安全私密",
    },
    {
      icon: BarChart3,
      title: "资产总览",
      description: "仪表盘实时展示总资产和各钱包余额，财务状况一目了然",
    },
    {
      icon: Smartphone,
      title: "响应式设计",
      description: "完美适配手机、平板和电脑，随时随地管理您的财务",
    },
  ];

  return (
    <div className="min-h-screen bg-background aurora-bg">
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-primary/10">
        <div className="container mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/25">
              <Target className="w-6 h-6 text-primary-foreground" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg tracking-tight">PRISMX</span>
              <span className="text-xs text-muted-foreground -mt-1">Ledger</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button asChild className="bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25" data-testid="button-login">
              <a href="/auth">登录</a>
            </Button>
            <Button asChild variant="outline" className="border-primary/30 hover:bg-primary/10 hover:border-primary/50" data-testid="button-register">
              <a href="/auth?tab=register">注册</a>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="pt-32 pb-20 px-4 sm:px-6">
          <div className="container mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-6">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              安全可靠的财务管理平台
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              <span className="gradient-text">智能记账</span>
              <span className="text-foreground">，掌控财务</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
              PRISMX Ledger 是一款安全、高效的个人财务管理工具。
              多钱包管理、智能分类、实时追踪，让您的财务管理更加轻松。
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild className="text-base bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 shadow-xl shadow-primary/30 border-0" data-testid="button-get-started">
                <a href="/auth">免费开始使用</a>
              </Button>
              <Button size="lg" variant="outline" className="text-base border-primary/30 hover:bg-primary/10 hover:border-primary/50" data-testid="button-learn-more">
                <a href="#features">了解更多</a>
              </Button>
            </div>
            {/* 移除第三方登录展示 */}
          </div>
        </section>

        <section className="py-16 px-4 sm:px-6" id="features">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">强大功能</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                专为个人财务管理设计的全方位解决方案
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature, index) => (
                <Card
                  key={index}
                  className="stats-card hover:purple-glow-sm transition-all duration-300 group"
                  data-testid={`card-feature-${index}`}
                >
                  <CardContent className="p-6">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-4 group-hover:from-primary/30 group-hover:to-primary/10 transition-all duration-300">
                      <feature.icon className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                    <p className="text-muted-foreground text-sm">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 px-4 sm:px-6">
          <div className="container mx-auto max-w-4xl text-center">
            <div className="p-8 sm:p-12 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20">
              <h2 className="text-3xl font-bold mb-4">开始您的财务管理之旅</h2>
              <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
                加入 PRISMX Ledger，轻松追踪您的收入支出，掌握资金流向，实现财务自由
              </p>
              <Button size="lg" asChild className="bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 shadow-xl shadow-primary/30" data-testid="button-cta">
                <a href="/auth">立即开始</a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-8 px-4 sm:px-6 border-t border-primary/10">
        <div className="container mx-auto max-w-6xl text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} PRISMX Ledger. 保留所有权利。</p>
        </div>
      </footer>
    </div>
  );
}
