import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      // Warm web3 pill tabs container
      "inline-flex items-center justify-start gap-1 rounded-full p-1",
      "bg-white/[0.04] border border-white/[0.08]",
      "text-foreground/65",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      // Each tab is a real pill — active gets the gradient treatment
      "inline-flex items-center justify-center whitespace-nowrap",
      "px-4 py-1.5 h-8 rounded-full text-[13px] font-medium",
      "transition-all duration-150",
      "hover:text-foreground",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
      "disabled:pointer-events-none disabled:opacity-50",
      "data-[state=active]:bg-gradient-to-br data-[state=active]:from-[#a78bfa] data-[state=active]:to-[#7c3aed]",
      "data-[state=active]:text-white data-[state=active]:shadow-[0_4px_12px_-4px_rgba(124,58,237,0.5)]",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4 focus-visible:outline-none",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
