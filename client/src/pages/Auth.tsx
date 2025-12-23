import { useRef, useState, startTransition } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export default function Auth() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleLogin() {
    try {
      setLoading(true);
      await apiRequest("POST", "/api/login", { email, password });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      startTransition(() => setLocation("/"));
    } catch (e: any) {
      toast({ title: "登录失败", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    try {
      setLoading(true);
      await apiRequest("POST", "/api/register", { email, password, firstName, lastName });
      setSuccessOpen(true);
      setTimeout(() => {
        setSuccessOpen(false);
        setTab("login");
        loginPasswordRef.current?.focus();
      }, 2000);
    } catch (e: any) {
      setErrorMessage(e?.message || "注册失败");
      setErrorOpen(true);
    } finally {
      setLoading(false);
    }
  }

  const defaultTab = (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'register') ? 'register' : 'login';
  const [tab, setTab] = useState(defaultTab);
  const loginPasswordRef = useRef<HTMLInputElement>(null);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-2xl font-semibold text-center">登录或注册</h1>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="login" className="flex-1">登录</TabsTrigger>
            <TabsTrigger value="register" className="flex-1">注册</TabsTrigger>
          </TabsList>

          <TabsContent value="login" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="login-email">邮箱</Label>
              <Input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password">密码</Label>
              <Input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} ref={loginPasswordRef} />
            </div>
            <Button className="w-full" disabled={loading} onClick={handleLogin}>登录</Button>
          </TabsContent>

          <TabsContent value="register" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="reg-email">邮箱</Label>
              <Input id="reg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-password">密码</Label>
              <Input id="reg-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="reg-first">名</Label>
                <Input id="reg-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-last">姓</Label>
                <Input id="reg-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <Button className="w-full" disabled={loading} onClick={handleRegister}>注册并登录</Button>
          </TabsContent>
        </Tabs>
        <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>注册成功</DialogTitle>
              <DialogDescription>
                2 秒后将自动切换到“登录”选项卡，请使用刚注册的邮箱和密码登录
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
        <Dialog open={errorOpen} onOpenChange={setErrorOpen}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>注册失败</DialogTitle>
              <DialogDescription>
                {errorMessage.includes('409') || errorMessage.includes('already registered')
                  ? '该邮箱已注册，请直接登录'
                  : errorMessage}
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
        <Button variant="ghost" className="w-full" asChild>
          <a href="/">返回首页</a>
        </Button>
      </div>
    </div>
  );
}
