import { useRef, useState, startTransition } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sparkles } from "lucide-react";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PW = 8;
const ve = (v: string) => !v ? "请输入邮箱" : !EMAIL_RE.test(v) ? "邮箱格式不正确" : null;
const vp = (v: string) => !v ? "请输入密码" : v.length < MIN_PW ? `密码至少 ${MIN_PW} 位` : null;

export default function Auth() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const initialTab = (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "register") ? "register" : "login";
  const [tab, setTab] = useState<"login" | "register">(initialTab as any);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPasswordConfirm, setRegPasswordConfirm] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const [loading, setLoading] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const [regErr, setRegErr] = useState<string | null>(null);

  const loginPasswordRef = useRef<HTMLInputElement>(null);

  async function handleLogin(e?: React.FormEvent) {
    e?.preventDefault();
    setLoginErr(null);
    const er = ve(loginEmail); if (er) { setLoginErr(er); return; }
    if (!loginPassword) { setLoginErr("请输入密码"); return; }
    try {
      setLoading(true);
      await apiRequest("POST", "/api/login", { email: loginEmail, password: loginPassword });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      startTransition(() => setLocation("/dashboard"));
    } catch (e: any) {
      const msg = e?.message || "登录失败";
      setLoginErr(msg.includes("401") ? "邮箱或密码错误" : msg);
    } finally { setLoading(false); }
  }

  async function handleRegister(e?: React.FormEvent) {
    e?.preventDefault();
    setRegErr(null);
    const er = ve(regEmail); if (er) { setRegErr(er); return; }
    const pr = vp(regPassword); if (pr) { setRegErr(pr); return; }
    if (regPassword !== regPasswordConfirm) { setRegErr("两次输入的密码不一致"); return; }
    try {
      setLoading(true);
      await apiRequest("POST", "/api/register", { email: regEmail, password: regPassword, firstName, lastName });
      try {
        await apiRequest("POST", "/api/login", { email: regEmail, password: regPassword });
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        setSuccessOpen(true);
        setTimeout(() => { setSuccessOpen(false); startTransition(() => setLocation("/dashboard")); }, 1200);
      } catch {
        setSuccessOpen(true);
        setTimeout(() => { setSuccessOpen(false); setTab("login"); setLoginEmail(regEmail); loginPasswordRef.current?.focus(); }, 2000);
      }
    } catch (e: any) { setErrorMsg(e?.message || "注册失败"); setErrorOpen(true); }
    finally { setLoading(false); }
  }

  return (
    <div className="mesh-bg min-h-screen overflow-y-auto custom-scroll text-foreground">
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md space-y-6">

          <div className="flex items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-accent-pink flex items-center justify-center shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.6)]">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <span className="font-semibold text-2xl tracking-tight num-gradient">PRISMX</span>
          </div>

          <div className="hero-card">
            <div className="relative">
              <div className="flex gap-2 mb-5">
                <button onClick={() => setTab("login")} className={`flex-1 py-2 rounded-full text-[13px] font-medium transition-colors ${tab === "login" ? "bg-primary/20 text-foreground border border-primary/40" : "bg-white/5 text-foreground-muted border border-transparent"}`}>登录</button>
                <button onClick={() => setTab("register")} className={`flex-1 py-2 rounded-full text-[13px] font-medium transition-colors ${tab === "register" ? "bg-primary/20 text-foreground border border-primary/40" : "bg-white/5 text-foreground-muted border border-transparent"}`}>注册</button>
              </div>

              {tab === "login" ? (
                <form onSubmit={handleLogin} className="space-y-4" noValidate>
                  <div className="space-y-2"><Label>邮箱</Label><Input type="email" autoComplete="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} /></div>
                  <div className="space-y-2"><Label>密码</Label><Input type="password" autoComplete="current-password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} ref={loginPasswordRef} /></div>
                  {loginErr && <p className="text-sm text-expense" role="alert">{loginErr}</p>}
                  <Button type="submit" className="w-full bg-primary" disabled={loading}>{loading ? "登录中…" : "登录"}</Button>
                  <a href="/forgot-password" className="block text-xs text-foreground-muted text-center hover:text-primary">忘记密码？</a>
                </form>
              ) : (
                <form onSubmit={handleRegister} className="space-y-4" noValidate>
                  <div className="space-y-2"><Label>邮箱</Label><Input type="email" autoComplete="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} /></div>
                  <div className="space-y-2"><Label>密码（至少 {MIN_PW} 位）</Label><Input type="password" autoComplete="new-password" value={regPassword} onChange={e => setRegPassword(e.target.value)} /></div>
                  <div className="space-y-2"><Label>确认密码</Label><Input type="password" autoComplete="new-password" value={regPasswordConfirm} onChange={e => setRegPasswordConfirm(e.target.value)} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label>名（选填）</Label><Input value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
                    <div className="space-y-2"><Label>姓（选填）</Label><Input value={lastName} onChange={e => setLastName(e.target.value)} /></div>
                  </div>
                  {regErr && <p className="text-sm text-expense" role="alert">{regErr}</p>}
                  <Button type="submit" className="w-full bg-primary" disabled={loading}>{loading ? "处理中…" : "注册并登录"}</Button>
                </form>
              )}
            </div>
          </div>

          <Button variant="ghost" className="w-full" asChild><a href="/">返回首页</a></Button>

          <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
            <DialogContent className="sm:max-w-[420px]">
              <DialogHeader><DialogTitle>注册成功</DialogTitle><DialogDescription>正在自动登录…</DialogDescription></DialogHeader>
            </DialogContent>
          </Dialog>
          <Dialog open={errorOpen} onOpenChange={setErrorOpen}>
            <DialogContent className="sm:max-w-[420px]">
              <DialogHeader><DialogTitle>注册失败</DialogTitle><DialogDescription>{errorMsg.includes("409") || errorMsg.includes("already registered") ? "该邮箱已注册，请直接登录" : errorMsg}</DialogDescription></DialogHeader>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
