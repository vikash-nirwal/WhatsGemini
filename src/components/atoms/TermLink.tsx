import * as React from "react"

import { cn } from "src/utils/cn"

interface TermLinkProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: React.ReactNode
  active?: boolean
  danger?: boolean
}

// The terminal theme's stand-in for an icon button: a bracketed text action
// like `[settings]` or `[x]`. forwardRef so it can sit under a Radix
// `asChild` trigger (Tooltip, DropdownMenu, DialogClose).
export const TermLink = React.forwardRef<HTMLButtonElement, TermLinkProps>(
  ({ label, active, danger, className, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      data-slot="term-link"
      className={cn(
        "inline-flex items-center font-bold text-[11px] leading-none whitespace-nowrap lowercase transition-colors hover:underline underline-offset-2 disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed",
        danger ? "text-destructive" : active ? "text-foreground" : "text-ring",
        className
      )}
      {...props}
    >
      [{label}]
    </button>
  )
)
TermLink.displayName = "TermLink"
