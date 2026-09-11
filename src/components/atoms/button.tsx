import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "src/utils/cn"
import { useColorTheme } from "src/hooks/useColorTheme"

// Per-variant theme treatment (neumorphic's raised/accent shadow, aurora's
// gradient/raise fill) lives directly in these static classes rather than a
// JS colorTheme branch - each class is only ever defined under its own
// [data-theme="x"] selector in tokens.css, so it's a no-op everywhere else,
// cozy included. See src/styles/THEMING.md.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary-hover cta-surface",
        // The app's own "secondary" brand color (purple) - not shadcn's usual
        // neutral-gray meaning, see the `panel` variant below for that.
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary-hover surface-raised",
        // Neutral/muted action button (Import/Restore-style secondary actions) -
        // this app's most common "less prominent than primary" button, distinct
        // from the brand-colored `secondary` variant above. No shadcn stock
        // equivalent (stock's own `secondary` is already claimed above), so this
        // stays custom but follows stock's own opacity-fade hover convention.
        panel:
          "bg-muted text-foreground shadow-sm hover:bg-muted/80 surface-raised",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 surface-raised",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground surface-raised surface-elevated",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 px-4",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const BRACKETED_VARIANTS = new Set(["default", "secondary", "panel", "destructive", "outline"])

// Terminal renders text buttons as shell-style `[label]`s with no icon. An
// element whose type is a component (react-icons) counts as an icon; strings,
// numbers and host elements (<span>) count as the label. Icon-only buttons,
// and labels that already start with "[" (e.g. "[+] new_chat.sh"), pass
// through untouched.
function toTerminalLabel(children: React.ReactNode): React.ReactNode {
  const parts = React.Children.toArray(children)
  const label = parts
    .filter((child) => !(React.isValidElement(child) && typeof child.type !== "string"))
    .filter((child) => typeof child !== "string" || child.trim() !== "")
  if (label.length === 0) return children
  const first = label[0]
  const last = label[label.length - 1]
  if (typeof first === "string") label[0] = first.trimStart()
  if (typeof last === "string") label[label.length - 1] = (label[label.length - 1] as string).trimEnd()
  if (typeof label[0] === "string" && (label[0] as string).startsWith("[")) return label
  return <>[{label}]</>
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    const { is } = useColorTheme()
    const resolvedVariant = variant ?? "default"
    const resolvedSize = size ?? "default"
    const bracketed = is("terminal") && !asChild && resolvedSize !== "icon" && BRACKETED_VARIANTS.has(resolvedVariant)
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        data-slot="button"
        data-variant={resolvedVariant}
        data-size={resolvedSize}
        ref={ref}
        {...props}
      >
        {bracketed ? toTerminalLabel(children) : children}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
