import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { resetPassword } from "@/lib/neonAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles } from "lucide-react";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const t = new URLSearchParams(window.location.search).get("token");
      if (t) setToken(t);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) { toast({ title: "缺少重置 token", variant: "destructive" }); return; }
    if (newPassword.length < 8) { toast({ title: "至少 8 位", variant: "destructive" }); return; }
    if (newPassword !== confirmPassword) { toast({ title: "两次输入不一致", variant: "destructive" }); return; }
    setLoading(true);
    try {
      await resetPassword(token, newPassword);
      setSuccess(true);
      setTimeout(() => setLocation("/auth"), 1500);
    } catch (e: any) {
      toast({ title: "重置失败", description: e.message || "请重试", variant: "destructive" });
    } finally { setLoading(false); }
  }

  return (
    <div className="mesh-bg min-h-screen overflow-y-auto custom-scroll text-foreground">
      <div className="max-w-md mx-auto px-4 md:px-6 py-5 md:py-7 pb-10">
        <header className="flex items-center gap-3 mb-5">
          <h1 className="text-[22px] font-semibold tracking-tight m-0 flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" /> 重置密码</h1>
        </header>
        <section className="hero-card">
          <div className="relative">
            {success ? <p className="text-sm">密码已重置，正在跳转…</p> : (
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="space-y-2"><Label>新密码（至少 8 位）</Label><Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></div>
                <div className="space-y-2"><Label>确认新密码</Label><Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></div>
                <Button type="submit" className="w-full bg-primary" disabled={loading || !token}>{loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}设置新密码</Button>
              </form>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
