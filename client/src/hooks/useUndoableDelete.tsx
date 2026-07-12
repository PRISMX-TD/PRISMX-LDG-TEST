import { useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ToastAction } from "@/components/ui/toast";

/**
 * Generic "soft delete" with a 30-second undo window.
 *
 * Triggers a DELETE on `deleteUrl`. Shows a 30-second toast with an Undo button.
 * If the user clicks Undo, POSTs `restorePayload` to `restoreUrl` to recreate the
 * row. The new row gets a new id — anything that referenced the deleted id stays
 * gone, but for list-style UX (what users actually see) this is enough.
 */
export function useUndoableDelete() {
  const { toast } = useToast();

  return useCallback(async (opts: {
    deleteUrl: string;
    restoreUrl: string;
    restorePayload: any;
    invalidateKeys?: any[][];
    label?: string;
    onSuccess?: () => void;
  }) => {
    try {
      await apiRequest("DELETE", opts.deleteUrl);
      for (const key of opts.invalidateKeys || []) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      opts.onSuccess?.();
    } catch (err: any) {
      toast({ title: "删除失败", description: err.message || "请稍后重试", variant: "destructive" });
      return;
    }

    const restore = async () => {
      try {
        await apiRequest("POST", opts.restoreUrl, opts.restorePayload);
        for (const key of opts.invalidateKeys || []) {
          queryClient.invalidateQueries({ queryKey: key });
        }
        toast({ title: "已撤销" });
      } catch (e: any) {
        toast({ title: "撤销失败", description: e.message, variant: "destructive" });
      }
    };

    toast({
      title: opts.label || "已删除",
      description: "30 秒内可撤销",
      duration: 30_000,
      action: (
        <ToastAction altText="撤销" onClick={() => { void restore(); }}>
          撤销
        </ToastAction>
      ),
    });
  }, [toast]);
}
