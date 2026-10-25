import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"

import { cn } from "src/utils/cn"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-overlay/[var(--scrim-opacity,0.6)] backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  // "default" matches shadcn's own stock size (max-w-lg). "lg"/"full" are this
  // app's own additions for the bigger dialogs it needs (edit-message modal,
  // fullscreen image viewers) - every call site supplies its own DialogClose,
  // so there's no built-in close button here (avoids a duplicate with the one
  // each header already renders).
  // "sheet" (#149): the canvas's bottom sheet for phones - full width,
  // pinned to the bottom, 24 px top corners and a grabber.
  size?: "default" | "lg" | "full" | "sheet"
}

const sizeClasses: Record<NonNullable<DialogContentProps["size"]>, string> = {
  default: "max-w-lg max-h-[85vh] flex flex-col overflow-hidden",
  lg: "max-w-2xl max-h-[85vh] flex flex-col overflow-hidden",
  full: "max-w-[95vw] max-h-[95vh] w-full h-full flex flex-col items-center justify-center border-none bg-transparent shadow-none p-0",
  sheet: "top-auto bottom-0 translate-y-0 max-w-lg max-h-[85dvh] flex flex-col gap-0 overflow-hidden rounded-t-sheet rounded-b-none sm:rounded-t-sheet sm:rounded-b-none border-0 p-2 pt-0 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-sheet data-[state=open]:slide-in-from-top-[100%] data-[state=closed]:slide-out-to-top-[100%]",
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, size = "default", ...props }, ref) => {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          // #149: dialogs sit on the canvas's overlay surface (popover).
          "fixed left-[50%] top-[50%] z-50 grid w-full translate-x-[-50%] translate-y-[-50%] gap-4 bg-popover p-6 shadow-sheet duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
          size !== "full" && size !== "sheet" && "surface-panel",
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {size === "sheet" && <div aria-hidden className="mx-auto mb-1 mt-2 h-1 w-9 flex-none rounded-full bg-border-strong" />}
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    data-slot="dialog-title"
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
