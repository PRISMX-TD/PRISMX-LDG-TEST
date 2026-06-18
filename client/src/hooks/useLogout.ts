import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { signOut } from "@/lib/neonAuth";

export function useLogout() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const logout = async () => {
    try {
      await signOut();
      queryClient.clear();
      window.location.href = "/auth";
    } catch (error) {
      toast({
        title: "退出登录失败",
        description: "请重试",
        variant: "destructive",
      });
    }
  };

  return { logout };
}
