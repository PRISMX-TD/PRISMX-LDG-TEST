import { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface RoundIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

/** Round outlined icon button — used alongside the primary pill for secondary actions. */
export function RoundIconButton({ size = "md", className, children, ...props }: RoundIconButtonProps) {
  const dim =
    size === "sm" ? "w-9 h-9"
    : size === "lg" ? "w-12 h-12"
    : "w-11 h-11";
  return (
    <button className={cn("btn-round", dim, className)} {...props}>
      {children}
    </button>
  );
}
