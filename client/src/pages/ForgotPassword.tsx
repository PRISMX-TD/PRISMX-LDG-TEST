import { useState } from "react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { RoundIconButton } from "@/components/ds/RoundIconButton";
export default function ForgotPassword() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [resetUrl, setResetUrl] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { toast({ title: "请输入邮箱", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/account/forgot-password", { email: email.trim() });
      const data = await res.json();
      if (data.resetUrl) setResetUrl(data.resetUrl);
      setSent(true);
    }
    catch { setSent(true); }
    finally { setLoading(false); }
  }

  return (
    <div className="mesh-bg min-h-screen overflow-y-auto custom-scroll text-foreground">
      <div className="max-w-md mx-auto px-4 md:px-6 py-5 md:py-7 pb-10 space-y-5">
        <header className="flex items-center gap-3">
          <Link href="/auth"><RoundIconButton size="sm" aria-label="返回"><ArrowLeft className="w-4 h-4" /></RoundIconButton></Link>
          <h1 className="text-[22px] font-semibold tracking-tight m-0 flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" /> 找回密码</h1>
        </header>

        <section className="hero-card">
          <div className="relative">
            {sent ? (
              <div className="space-y-3 text-sm">
                <p>如该邮箱已注册，重置链接已发送，1 小时内有效。</p>
                <p className="text-foreground-muted text-[12px]">检查垃圾邮件文件夹或稍后再试。</p>
                {resetUrl && (
                  <div className="rounded-xl p-3 bg-amber-400/10 border border-amber-400/20">
                    <p className="text-[11px] text-amber-300 mb-1">开发模式 - 邮件未发送，点击下方链接重置：</p>
                    <a href={resetUrl} className="text-[12px] text-primary underline break-all">{resetUrl}</a>
                  </div>
                )}
                <Link href="/auth"><Button variant="outline" className="w-full">返回登录</Button></Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="space-y-2"><Label>注册时使用的邮箱</Label><Input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
                <Button type="submit" className="w-full bg-primary" disabled={loading}>{loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}发送重置链接</Button>
              </form>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
