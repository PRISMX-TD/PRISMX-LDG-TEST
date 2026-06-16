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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 8;

function validateEmail(email: string): string | null {
  if (!email) return "请输入邮箱";
  if (!EMAIL_RE.test(email)) return "邮箱格式不正确";
  return null;
}

function validatePassword(password: string): string | null {
  if (!password) return "请输入密码";
  if (password.length < MIN_PASSWORD_LEN) return `密码至少 ${MIN_PASSWORD_LEN} 位`;
  return null;
}

export default function Auth() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Separate state per tab so switching tabs doesn't leak the login email/password
  // into the registration form (and vice versa).
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
  const [errorMessage, setErrorMessage] = useState("");

  // Field-level error tracking for inline feedback.
  const [loginError, setLoginError] = useState<string | null>(null);
  const [regError, setRegError] = useState<string | null>(null);

  async function handleLogin(e?: React.FormEvent) {
    e?.preventDefault();
    setLoginError(null);
    const emailErr = validateEmail(loginEmail);
    if (emailErr) { setLoginError(emailErr); return; }
    if (!loginPassword) { setLoginError("请输入密码"); return; }

    try {
      setLoading(true);
      await apiRequest("POST", "/api/login", { email: loginEmail, password: loginPassword });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      startTransition(() => setLocation("/dashboard"));
    } catch (e: any) {
      const msg = e?.message || "登录失败";
      setLoginError(msg.includes("401") ? "邮箱或密码错误" : msg);
      toast({ title: "登录失败", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e?: React.FormEvent) {
    e?.preventDefault();
    setRegError(null);
    const emailErr = validateEmail(regEmail);
    if (emailErr) { setRegError(emailErr); return; }
    const pwErr = validatePassword(regPassword);
    if (pwErr) { setRegError(pwErr); return; }
    if (regPassword !== regPasswordConfirm) { setRegError("两次输入的密码不一致"); return; }

    try {
      setLoading(true);
      await apiRequest("POST", "/api/register", { email: regEmail, password: regPassword, firstName, lastName });
      // FIX: previously the user was bounced back to the login tab and had to type credentials again.
      // Now we automatically log them in with the credentials they just used.
      try {
        await apiRequest("POST", "/api/login", { email: regEmail, password: regPassword });
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        setSuccessOpen(true);
        // Brief acknowledgement, then go straight to the dashboard.
        setTimeout(() => {
          setSuccessOpen(false);
          startTransition(() => setLocation("/dashboard"));
        }, 1200);
      } catch (loginErr: any) {
        // If auto-login fails for some reason, fall back to the previous behavior.
        setSuccessOpen(true);
        setTimeout(() => {
          setSuccessOpen(false);
          setTab("login");
          setLoginEmail(regEmail);
          loginPasswordRef.current?.focus();
        }, 2000);
      }
    } catch (e: any) {
      setErrorMessage(e?.message || "注册失败");
      setErrorOpen(true);
    } finally {
      setLoading(false);
    }
  }

  const initialTab = (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'register') ? 'register' : 'login';
  const [tab, setTab] = useState(initialTab);
  const loginPasswordRef = useRef<HTMLInputElement>(null);

  return (
    <div className="h-screen overflow-y-auto custom-scroll">
      <div className="min-h-full flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md space-y-6">
        <h1 className="text-2xl font-semibold text-center">登录或注册</h1>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="login" className="flex-1">登录</TabsTrigger>
            <TabsTrigger value="register" className="flex-1">注册</TabsTrigger>
          </TabsList>

          <TabsContent value="login" className="space-y-4 pt-4">
            {/* FIX: wrap in <form> so Enter submits the form on either field. */}
            <form onSubmit={handleLogin} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="login-email">邮箱</Label>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={loginEmail}
    