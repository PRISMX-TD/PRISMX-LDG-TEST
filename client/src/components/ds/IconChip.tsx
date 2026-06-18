import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Soft rounded-square icon container — D aesthetic for transaction rows etc. */
export function IconChip({
  children,
  className,
  warm = false,
  size = "md",
}: {
  children: ReactNode;
  className?: string;
  warm?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const dims = size === "sm" ? "w-8 h-8 rounded-lg" : size === "lg" ? "w-12 h-12 rounded-xl" : "w-10 h-10 rounded-xl";
  return (
    <div className={cn("icon-chip", warm && "warm", dims, className)}>
      {children}
    </div>
  );
}
