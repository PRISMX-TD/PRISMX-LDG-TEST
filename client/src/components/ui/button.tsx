import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/**
 * Complete rewrite — warm web3 button system. Every variant now has
 * its own dramatic surface treatment (gradient pill, glass ghost,
 * outlined chip, danger glow). NOT a CSS override — actual variant
 * classes baked in.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none " +
  "transition-all duration-150 active:scale-[0.97] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-0 " +
  "disabled:pointer-events-none disabled:opacity-40 " +
  "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primary: fat purple gradient pill with drop-shadow glow (Phantom / Plutus style)
        default:
          "rounded-full text-white border-0 font-semibold " +
          "bg-gradient-to-br from-[#a78bfa] via-[#8b5cf6] to-[#7c3aed] " +
          "shadow-[0_8px_24px_-8px_rgba(124,58,237,0.6)] " +
          "hover:shadow-[0_12px_32px_-8px_rgba(124,58,237,0.8)] hover:-translate-y-[1px] " +
          "active:shadow-[0_4px_16px_-4px_rgba(124,58,237,0.5)]",
        // Destructive: warm red gradient
        destructive:
          "rounded-full text-white border-0 font-semibold " +
          "bg-gradient-to-br from-[#f87171] via-[#ef4444] to-[#dc2626] " +
          "shadow-[0_8px_24px_-8px_rgba(220,38,38,0.5)] " +
          "hover:shadow-[0_12px_32px_-8px_rgba(220,38,38,0.7)] hover:-translate-y-[1px]",
        // Outline: glass-style ghost pill
        outline:
          "rounded-full text-foreground " +
          "bg-white/[0.04] border border-white/[0.12] backdrop-blur-sm " +
          "hover:bg-white/[0.08] hover:border-white/[0.22]",
        // Secondary: surface tier
        secondary:
          "rounded-full text-foreground " +
          "bg-white/[0.06] border border-white/[0.10] " +
          "hover:bg-white/[0.10]",
        // Ghost: invisible until hover
        ghost:
          "rounded-xl text-foreground/80 border border-transparent " +
          "hover:bg-white/[0.06] hover:text-foreground",
        // Link: just text
        link:
          "text-primary underline-offset-4 hover:underline rounded-md",
      },
      size: {
        default: "h-11 px-6 text-[14px]",
        sm: "h-9 px-4 text-[12.5px]",
        lg: "h-12 px-7 text-[15px]",
        xl: "h-14 px-8 text-[16px]",
        icon: "h-10 w-10 rounded-full",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
