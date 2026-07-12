import { useState } from "react";
import { useLocation, Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, KeyRound } from "lucide-react";
import { RoundIconButton } from "@/components/ds/RoundIconButton";
export default function ChangePassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) { toast({ title: "新密码至少 8 位", variant: "destructive" }); return; }
    if (newPassword !== confirmPassword) { toast({ title: "两次输入不一致", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const r = await apiRequest("POST", "/api/account/change-password", { currentPassword, newPassword });
      if (r.ok) { toast({ title: "密码已更新" }); setLocation("/settings"); }
    } catch (e: any) {
      toast({ title: "修改失败", description: e.message?.includes("401") ? "当前密码错误" : e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }

  return (
    <div className="mesh-bg min-h-screen overflow-y-auto custom-scroll text-foreground">
      <div className="max-w-md mx-auto px-4 md:px-6 py-5 md:py-7 pb-20 md:pb-10 space-y-5">
        <header className="flex items-center gap-3">
          <Link href="/settings"><RoundIconButton size="sm" aria-label="返回"><ArrowLeft className="w-4 h-4" /></RoundIconButton></Link>
          <h1 className="text-[22px] font-semibold tracking-tight m-0 flex items-center gap-2"><KeyRound className="w-5 h-5 text-primary" /> 修改密码</h1>
        </header>

        <section className="hero-card">
          <form onSubmit={handleSubmit} className="space-y-4 relative">
            <div className="space-y-2"><Label>当前密码</Label><Input type="password" autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} /></div>
            <div className="space-y-2"><Label>新密码（至少 8 位）</Label><Input type="password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></div>
            <div className="space-y-2"><Label>确认新密码</Label><Input type="password" autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></div>
            <Button type="submit" className="w-full bg-primary mt-2" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}保存新密码
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
