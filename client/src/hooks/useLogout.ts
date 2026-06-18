import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { signOut as neonSignOut } from "@/lib/neonAuth";

export function useLogout() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const logout = async () => {
    try {
      // Sign out from Neon Auth
      await neonSignOut();

      // Clear local storage
      localStorage.removeItem("devUserId");
      localStorage.removeItem("PRISMX_USER_ID");
      localStorage.removeItem("x-user-id");

      // Clear React Query cache
      queryClient.clear();

      // Redirect to auth page
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
