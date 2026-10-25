import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "src/utils/cn"
import { useColorTheme } from "src/hooks/useColorTheme"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => {
  const { is } = useColorTheme()
  const neumorphic = is("neumorphic")
  return (
    <SwitchPrimitives.Root
      className={cn(
        // #149: the canvas's 40 x 24 switch, its track in border-strong when off.
        "peer inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border-[3px] border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-border-strong",
        // Kept JS-conditional (not a bare static class like elsewhere) because
        // it needs the data-[state=unchecked]: variant prefix - surface-sunken
        // itself is unconditional, and being defined outside any @layer it
        // would otherwise win over data-[state=checked]:bg-primary too.
        neumorphic && "data-[state=unchecked]:surface-sunken",
        className
      )}
      {...props}
      ref={ref}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          "pointer-events-none block h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.3)] ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0",
          "surface-raised-sm"
        )}
      />
    </SwitchPrimitives.Root>
  )
})
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
