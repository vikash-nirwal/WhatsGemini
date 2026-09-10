import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "src/utils/cn"
import { ThemeContext } from "src/contexts/ThemeContext"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary-hover",
        // The app's own "secondary" brand color (purple) - not shadcn's usual
        // neutral-gray meaning, see the `panel` variant below for that.
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary-hover",
        // Neutral/muted action button (Import/Restore-style secondary actions) -
        // this app's most common "less prominent than primary" button, distinct
        // from the brand-colored `secondary` variant above. No shadcn stock
        // equivalent (stock's own `secondary` is already claimed above), so this
        // stays custom but follows stock's own opacity-fade hover convention.
        panel:
          "bg-muted text-foreground shadow-sm hover:bg-muted/80",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
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

// Variants that get a raised/accent shadow under the neumorphic theme -
// ghost/link stay flat by design in every theme, so they're left out.
const NEUMORPHIC_SHADOW: Partial<Record<NonNullable<ButtonProps["variant"]>, string>> = {
  default: "shadow-accent",
  secondary: "shadow-raised",
  panel: "shadow-raised",
  outline: "shadow-raised",
  destructive: "shadow-raised",
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    const { colorTheme } = React.useContext(ThemeContext)
    const neumorphicShadow = colorTheme === "neumorphic" ? NEUMORPHIC_SHADOW[variant || "default"] : undefined
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }), neumorphicShadow)}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
