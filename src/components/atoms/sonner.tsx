import { useContext, useEffect, useState } from "react"
import { Toaster as Sonner } from "sonner"
import { ThemeContext } from "src/contexts/ThemeContext"

type ToasterProps = React.ComponentProps<typeof Sonner>

// This app has its own ThemeContext (toggles a .dark class on <html>, see
// src/contexts/ThemeContext.tsx) rather than next-themes, which is what the
// shadcn CLI wires up by default - swapped so sonner actually tracks the
// app's real theme instead of always falling back to "system".
// Toasts sit at the top (top-center on phones): at the bottom they landed
// on the floating composer's Send button.
const PHONE_QUERY = "(max-width: 639px)"
const useIsPhone = () => {
  const [isPhone, setIsPhone] = useState(() => typeof window !== "undefined" && window.matchMedia?.(PHONE_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(PHONE_QUERY)
    if (!mq) return
    const update = () => setIsPhone(mq.matches)
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])
  return isPhone
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useContext(ThemeContext)
  const isPhone = useIsPhone()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          // #149: the canvas's toast, inverted (text colour on the page
          // colour) so it stands apart from every surface; success and error
          // keep a coloured edge.
          toast:
            "group toast group-[.toaster]:rounded-xl group-[.toaster]:border-0 group-[.toaster]:bg-foreground group-[.toaster]:text-background group-[.toaster]:shadow-popover group-[.toaster]:font-medium",
          description: "group-[.toast]:text-background/80",
          actionButton:
            "group-[.toast]:bg-background/15 group-[.toast]:text-background group-[.toast]:font-semibold",
          cancelButton:
            "group-[.toast]:bg-transparent group-[.toast]:text-background/80",
          success: "group-[.toaster]:!bg-foreground group-[.toaster]:!text-background group-[.toaster]:!border-l-4 group-[.toaster]:!border-success",
          error: "group-[.toaster]:!bg-foreground group-[.toaster]:!text-background group-[.toaster]:!border-l-4 group-[.toaster]:!border-destructive",
        },
      }}
      {...props}
      position={isPhone ? "top-center" : props.position}
      // Below the 64 px header on phones, so a toast never covers its back
      // button (#150).
      mobileOffset={{ top: 72 }}
    />
  )
}

export { Toaster }
