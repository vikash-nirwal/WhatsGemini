import { useContext } from "react"
import { Toaster as Sonner } from "sonner"
import { ThemeContext } from "src/contexts/ThemeContext"

type ToasterProps = React.ComponentProps<typeof Sonner>

// This app has its own ThemeContext (toggles a .dark class on <html>, see
// src/contexts/ThemeContext.tsx) rather than next-themes, which is what the
// shadcn CLI wires up by default - swapped so sonner actually tracks the
// app's real theme instead of always falling back to "system".
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useContext(ThemeContext)

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success: "group-[.toaster]:!bg-secondary group-[.toaster]:!text-foreground group-[.toaster]:!border-success/40",
          error: "group-[.toaster]:!bg-secondary group-[.toaster]:!text-foreground group-[.toaster]:!border-destructive/40",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
