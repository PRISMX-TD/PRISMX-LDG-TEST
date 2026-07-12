import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useLogout } from "@/hooks/useLogout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Settings as SettingsIcon, Globe, User, Shield, Loader2, Smartphone,
  ChevronRight, ArrowLeft, EyeOff, Download, Trash2, Palette, LogOut, KeyRound,
} from "lucide-react";
import { supportedCurrencies } from "@shared/schema";
import { MobileNavSettingsModal } from "@/components/MobileNavSettingsModal";
import { usePrivacyMode } from "@/hooks/usePrivacyMode";
import { ThemePicker } from "@/components/ds/ThemePicker";
import { RoundIconButton } from "@/components/ds/RoundIconButton";
import { PillButton } from "@/components/ds/PillButton";

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { logout } = useLogout();
  const { isPrivacyMode, togglePrivacyMode } = usePrivacyMode();

  const [pendingCurrency, setPendingCurrency] = useState<string | null>(null);
  const [autoRescale, setAutoRescale] = useState(true);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePw, setDeletePw] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const displayName = user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}`
    : user?.firstName || user?.email?.split("@")[0] || "用户";
  const initials = user?.firstName && user?.lastName ? `${user.firstName[0]}${user.lastName[0]}`
    : displayName.slice(0, 2).toUpperCase();
  const currentCurrency = user?.defaultCurrency || "MYR";

  const currencyMut = useMutation({
    mutationFn: async (payload: { currency: string; autoRescale: boolean }) => {
      const res = await apiRequest("PATCH", "/api/user/currency-v2", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      toast({ title: "默认币种已更改" });
      setPendingCurrency(null);
    },
    onError: () => { toast({ title: "更新失败", variant: "destructive" }); setPendingCurrency(null); },
  });

  async function handleDeleteAccount() {
    setIsDeleting(true);
    try {
      const res = await apiRequest("POST", "/api/account/delete", { confirmPassword: deletePw });
      if (res.ok) { toast({ title: "账户已删除" }); window.location.href = "/"; }
    } catch (e: any) {
      toast({ title: "删除失败", description: e.message || "请检查密码", variant: "destructive" });
    } finally { setIsDeleting(false); }
  }

  if (!user) return null;

  return (
    <div className="text-foreground">
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-5 md:py-7 pb-20 md:pb-10 space-y-5">

        {/* HEADER */}
        <header className="flex items-center gap-3">
          <Link href="/dashboard">
            <RoundIconButton size="sm" aria-label="返回"><ArrowLeft className="w-4 h-4" /></RoundIconButton>
          </Link>
          <h1 className="text-[22px] md:text-[28px] font-semibold tracking-tight m-0 flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-primary" /> 设置
          </h1>
        </header>

        {/* ACCOUNT CARD */}
        <section className="hero-card">
          <div className="relative flex items-center gap-4">
            <Avatar className="h-16 w-16 border border-primary/30">
              <AvatarImage src={user.profileImageUrl || undefined} alt={displayName} className="object-cover" />
              <AvatarFallback className="text-lg bg-primary/20 text-primary font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-[18px] font-semibold m-0 truncate">{displayName}</p>
              {user.email && <p className="text-[12px] text-foreground/70 m-0 truncate">{user.email}</p>}
              <p className="text-[11px] text-foreground/60 m-0 mt-1">默认币种 · {currentCurrency}</p>
            </div>
          </div>
        </section>

        {/* CURRENCY */}
        <section className="asset-card !p-5">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-[18px] h-[18px] text-primary" />
            <h3 className="text-[15px] font-semibold m-0">默认币种</h3>
          </div>
          <p className="text-[12px] text-foreground-muted mb-4">影响总资产和汇总数据的展示币种。</p>
          <RadioGroup value={currentCurrency} onValueChange={v => v !== currentCurrency && setPendingCurrency(v)} className="grid gap-2 sm:grid-cols-2">
            {supportedCurrencies.map(c => (
              <label key={c.code} htmlFor={`cur-${c.code}`} className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${currentCurrency === c.code ? "bg-primary/10 border-primary/40" : "bg-surface-2 border-border hover:bg-surface-3"}`}>
                <RadioGroupItem value={c.code} id={`cur-${c.code}`} disabled={currencyMut.isPending} className="border-primary text-primary" />
                <span className="w-10 font-mono text-foreground-muted">{c.symbol}</span>
                <span className="text-[13px]">{c.name}</span>
                <span className="text-[11px] text-foreground-muted ml-auto">{c.code}</span>
              </label>
            ))}
          </RadioGroup>
          {currencyMut.isPending && <p className="flex items-center gap-2 mt-3 text-[12px] text-foreground-muted"><Loader2 className="w-3.5 h-3.5 animate-spin" /> 正在更新…</p>}
        </section>

        {/* THEME */}
        <section className="asset-card !p-5">
          <div className="flex items-center gap-2 mb-1">
            <Palette className="w-[18px] h-[18px] text-primary" />
            <h3 className="text-[15px] font-semibold m-0">外观主题</h3>
          </div>
          <p className="text-[12px] text-foreground-muted mb-4">选择视觉风格。设置实时保存到本机。</p>
          <ThemePicker />
        </section>

        {/* PRIVACY */}
        <section className="asset-card !p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <EyeOff className="w-[18px] h-[18px] text-primary" />
                <h3 className="text-[15px] font-semibold m-0">隐私模式</h3>
              </div>
              <p className="text-[12px] text-foreground-muted m-0">开启后金额显示为 ***，避免他人窥视。</p>
            </div>
            <PillButton
              variant={isPrivacyMode ? "primary" : "ghost"}
              onClick={togglePrivacyMode}
              className="h-9 px-5 text-[12px]"
            >
              {isPrivacyMode ? "关闭" : "开启"}
            </PillButton>
          </div>
        </section>

        {/* EXPORT */}
        <section className="asset-card !p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Download className="w-[18px] h-[18px] text-primary" />
                <h3 className="text-[15px] font-semibold m-0">数据导出</h3>
              </div>
              <p className="text-[12px] text-foreground-muted m-0">下载全部账户数据为 JSON。</p>
            </div>
            <PillButton
              variant="ghost"
              onClick={() => { window.location.href = "/api/account/export"; }}
              className="h-9 px-5 text-[12px] shrink-0"
            >
              下载
            </PillButton>
          </div>
        </section>

        {/* MOBILE NAV (mobile only) */}
        <section className="asset-card !p-5 md:hidden">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Smartphone className="w-[18px] h-[18px] text-primary" />
                <h3 className="text-[15px] font-semibold m-0">底部导航</h3>
              </div>
              <p className="text-[12px] text-foreground-muted m-0">自定义底部 4 个 tab。</p>
            </div>
            <RoundIconButton size="sm" onClick={() => setIsMobileNavOpen(true)} aria-label="配置">
              <ChevronRight className="w-4 h-4" />
            </RoundIconButton>
          </div>
        </section>

        {/* SECURITY */}
        <section className="asset-card !p-5">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-[18px] h-[18px] text-primary" />
            <h3 className="text-[15px] font-semibold m-0">账户安全</h3>
          </div>
          <div className="grid gap-2">
            <Link href="/change-password">
              <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-2 hover:bg-surface-3 transition-colors text-left">
                <KeyRound className="w-[18px] h-[18px] text-foreground-muted" />
                <span className="text-[13.5px] font-medium">修改密码</span>
                <ChevronRight className="w-4 h-4 text-foreground-muted ml-auto" />
              </button>
            </Link>
            <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-2 hover:bg-expense/10 hover:text-expense transition-colors text-left">
              <LogOut className="w-[18px] h-[18px] text-foreground-muted" />
              <span className="text-[13.5px] font-medium">退出登录</span>
            </button>
          </div>
        </section>

        {/* DELETE ACCOUNT */}
        <section className="asset-card !p-5 border-expense/25 bg-expense/5">
          <div className="flex items-center gap-2 mb-1">
            <Trash2 className="w-[18px] h-[18px] text-expense" />
            <h3 className="text-[15px] font-semibold m-0 text-expense">删除账户</h3>
          </div>
          <p className="text-[12px] text-foreground-muted mb-4">永久删除账户和所有关联数据，不可恢复。</p>
          <button onClick={() => setDeleteOpen(true)} className="w-full px-4 py-2.5 rounded-full bg-expense/15 text-expense border border-expense/30 hover:bg-expense/25 transition-colors text-[12.5px] font-semibold">
            删除我的账户
          </button>
        </section>

        {/* CURRENCY CONFIRM */}
        <Dialog open={!!pendingCurrency} onOpenChange={(o) => !o && setPendingCurrency(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>切换默认币种到 {pendingCurrency}?</DialogTitle></DialogHeader>
            <div className="space-y-3 text-[13px] text-foreground-muted">
              <p>所有钱包的"对默认币种汇率"原本是基于旧默认币种的换算关系。</p>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={autoRescale} onChange={e => setAutoRescale(e.target.checked)} className="mt-1 accent-primary" />
                <span>按 Frankfurter 实时汇率自动重算所有钱包的换算汇率（推荐）</span>
              </label>
            </div>
            <div className="flex gap-2 pt-3">
              <Button variant="ghost" className="flex-1" onClick={() => setPendingCurrency(null)}>取消</Button>
              <Button className="flex-1 bg-primary" disabled={currencyMut.isPending || !pendingCurrency}
                onClick={() => pendingCurrency && currencyMut.mutate({ currency: pendingCurrency, autoRescale })}>
                {currencyMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}确认切换
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* DELETE ACCOUNT MODAL */}
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>确认删除账户</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-[13px] text-foreground-muted">这将永久删除所有钱包、交易、预算、债务等数据，无法撤销。请输入密码确认。</p>
              <Input type="password" placeholder="当前密码" value={deletePw} onChange={e => setDeletePw(e.target.value)} />
            </div>
            <div className="flex gap-2 pt-3">
              <Button variant="ghost" className="flex-1" onClick={() => setDeleteOpen(false)}>取消</Button>
              <Button className="flex-1 bg-expense" disabled={isDeleting || !deletePw} onClick={handleDeleteAccount}>
                {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}确认永久删除
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <MobileNavSettingsModal open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen} />
      </div>
    </div>
  );
}
