import { useState } from "react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPassword() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { toast({ title: "请输入邮箱", variant: "destructive" }); return; }
    setLoading(true);
    try {
      await apiRequest("POST", "/api/account/forgot-password", { email: email.trim() });
      setSent(true);
    } catch (e: any) {
      // Even on error, show success to not leak info
      setSent(true);
    } finally { setLoading(false); }
  }

  return (
    <div className="mesh-bg min-h-screen overflow-y-auto custom-scroll text-foreground">
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="hero-card p-8">
            <h2 className="text-xl font-semibold mb-2">忘记密码</h2>
            <p className="text-foreground-muted text-sm mb-6">输入你的注册邮箱，我们将发送重置链接。</p>

            {sent ? (
              <div className="space-y-3 text-sm">
                <p>如该邮箱已注册，重置链接已发送（1 小时内有效）。</p>
                <p className="text-foreground-muted text-[12px]">检查垃圾邮件文件夹或稍后再试。</p>
                <Link href="/auth"><Button variant="outline" className="w-full">返回登录</Button></Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="space-y-2"><Label>邮箱</Label><Input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
                <Button type="submit" className="w-full bg-primary" disabled={loading}>{loading ? "发送中…" : "发送重置链接"}</Button>
                <Link href="/auth"><Button variant="outline" className="w-full" type="button">返回登录</Button></Link>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
