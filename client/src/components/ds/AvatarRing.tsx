import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AvatarRingProps {
  src?: string | null;
  fallback?: ReactNode;
  online?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** Round avatar with gradient ring + optional online dot — top-left signature. */
export function AvatarRing({ src, fallback, online, size = "md", className }: AvatarRingProps) {
  const dim =
    size === "sm" ? "w-9 h-9"
    : size === "lg" ? "w-12 h-12"
    : "w-10 h-10";
  return (
    <div className={cn("avatar-ring", dim, className)}>
      <div className="inner">
        {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : <span className="text-[14px]">{fallback}</span>}
      </div>
      {online && <span className="status-dot" />}
    </div>
  );
}
