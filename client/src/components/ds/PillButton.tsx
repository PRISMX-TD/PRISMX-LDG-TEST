import { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost";
  leftIcon?: ReactNode;
  children: ReactNode;
}

/** Big purple-gradient pill button — Web3 wallet signature primary CTA. */
export function PillButton({
  variant = "primary", leftIcon, children, className, ...props
}: PillButtonProps) {
  return (
    <button
      className={cn(
        "btn-pill",
        variant === "primary" ? "btn-pill-primary" : "btn-pill-ghost",
        className
      )}
      {...props}
    >
      {leftIcon}
      <span>{children}</span>
    </button>
  );
}
