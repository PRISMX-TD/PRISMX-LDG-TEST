import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function useLogout() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const logout = async () => {
    try {
      // 清除本地存储的用户信息
      localStorage.removeItem('PRISMX_USER_ID');
      localStorage.removeItem('x-user-id');
      
      // 调用后端退出登录API
      await apiRequest("POST", "/api/logout");
      
      // 清除React Query缓存
      queryClient.clear();
      
      // 跳转到登录页面
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