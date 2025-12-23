"use client"

import * as React from "react"
import { useMediaQuery } from "@/hooks/use-media-query"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer"
import { cn } from "@/lib/utils"

interface ResponsiveModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

interface ResponsiveModalContentProps {
  children: React.ReactNode
  className?: string
  "data-testid"?: string
}

interface ResponsiveModalHeaderProps {
  children: React.ReactNode
  className?: string
}

interface ResponsiveModalFooterProps {
  children: React.ReactNode
  className?: string
}

interface ResponsiveModalTitleProps {
  children: React.ReactNode
  className?: string
}

interface ResponsiveModalDescriptionProps {
  children: React.ReactNode
  className?: string
}

const ResponsiveModalContext = React.createContext<{ isDesktop: boolean }>({
  isDesktop: true,
})

export function ResponsiveModal({
  open,
  onOpenChange,
  children,
}: ResponsiveModalProps) {
  const isDesktop = useMediaQuery("(min-width: 640px)")

  if (isDesktop) {
    return (
      <ResponsiveModalContext.Provider value={{ isDesktop: true }}>
        <Dialog open={open} onOpenChange={onOpenChange}>
          {children}
        </Dialog>
      </ResponsiveModalContext.Provider>
    )
  }

  return (
    <ResponsiveModalContext.Provider value={{ isDesktop: false }}>
      <Drawer open={open} onOpenChange={onOpenChange}>
        {children}
      </Drawer>
    </ResponsiveModalContext.Provider>
  )
}

export function ResponsiveModalContent({
  children,
  className,
  "data-testid": dataTestId,
}: ResponsiveModalContentProps) {
  const { isDesktop } = React.useContext(ResponsiveModalContext)

  if (isDesktop) {
    return (
      <DialogContent
        className={cn("sm:max-w-md max-h-[90vh] overflow-y-auto", className)}
        data-testid={dataTestId}
        aria-describedby={undefined}
      >
        {children}
      </DialogContent>
    )
  }

  return (
    <DrawerContent className={cn("px-4 pb-8", className)} data-testid={dataTestId}>
      <div className="max-h-[85vh] overflow-y-auto px-1 py-4">
        {children}
      </div>
    </DrawerContent>
  )
}

export function ResponsiveModalHeader({
  children,
  className,
}: ResponsiveModalHeaderProps) {
  const { isDesktop } = React.useContext(ResponsiveModalContext)

  if (isDesktop) {
    return <DialogHeader className={className}>{children}</DialogHeader>
  }

  return <DrawerHeader className={cn("text-left px-0", className)}>{children}</DrawerHeader>
}

export function ResponsiveModalTitle({
  children,
  className,
}: ResponsiveModalTitleProps) {
  const { isDesktop } = React.useContext(ResponsiveModalContext)

  if (isDesktop) {
    return <DialogTitle className={className}>{children}</DialogTitle>
  }

  return <DrawerTitle className={className}>{children}</DrawerTitle>
}

export function ResponsiveModalDescription({
  children,
  className,
}: ResponsiveModalDescriptionProps) {
  const { isDesktop } = React.useContext(ResponsiveModalContext)

  if (isDesktop) {
    return <DialogDescription className={className}>{children}</DialogDescription>
  }

  return <DrawerDescription className={className}>{children}</DrawerDescription>
}

export function ResponsiveModalFooter({
  children,
  className,
}: ResponsiveModalFooterProps) {
  const { isDesktop } = React.useContext(ResponsiveModalContext)

  if (isDesktop) {
    return <DialogFooter className={className}>{children}</DialogFooter>
  }

  return (
    <DrawerFooter className={cn("px-0 pt-4", className)}>
      {children}
    </DrawerFooter>
  )
}
