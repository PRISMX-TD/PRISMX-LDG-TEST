import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          // Warm web3 input — soft glass surface, rounded, large tap target
          "flex h-11 w-full rounded-xl px-4 py-2 text-[14px] text-foreground",
          "bg-white/[0.04] border border-white/[0.10]",
          "placeholder:text-foreground/40",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "transition-colors duration-150",
          "hover:bg-white/[0.06] hover:border-white/[0.18]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/40 focus-visible:bg-white/[0.06]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
