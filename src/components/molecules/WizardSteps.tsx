import React, { useLayoutEffect, useRef, useState } from "react";
import { cn } from "../../utils/cn";

interface WizardStepsProps {
  steps: string[];
  current: number;
  // The full row of step buttons, shown whenever it fits on one line.
  children: React.ReactNode;
  className?: string;
}

// A wizard's step indicator. The full row of labelled steps (passed as
// children) is shown while it fits; when it doesn't - phones, or a tablet
// with the sidebar docked - it's swapped for a compact "Step 2 of 6 ·
// Personality" line with a progress bar. Sideways scrolling isn't an option:
// it cut later steps off at the edge with no sign there were more.
//
// Decided by measuring rather than a breakpoint, because the space the row
// gets depends on the sidebar and the labels' length differs per wizard.
export const WizardSteps = ({ steps, current, children, className }: WizardStepsProps) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  // How wide the full row needed to be when it last overflowed, so the
  // compact view knows when there's room to switch back.
  const neededWidth = useRef(0);
  const [compact, setCompact] = useState(false);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const row = rowRef.current;
      if (row) {
        if (row.scrollWidth > row.clientWidth + 1) {
          neededWidth.current = row.scrollWidth;
          setCompact(true);
        }
      } else if (wrap.clientWidth >= neededWidth.current) {
        setCompact(false);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    // Web fonts arriving late change the row's width without resizing the wrapper.
    document.fonts?.ready.then(measure);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [compact]);

  const total = steps.length;

  return (
    <div ref={wrapRef} className={cn("mb-6 min-w-0", className)}>
      {compact ? (
        <div className="flex flex-col gap-2" data-testid="wizard-steps-compact">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 truncate font-semibold text-foreground">
              Step {current + 1} of {total} · {steps[current]}
            </span>
            {current < total - 1 && <span className="min-w-0 truncate text-subtle">Next: {steps[current + 1]}</span>}
          </div>
          <div
            role="progressbar"
            aria-label="Wizard progress"
            aria-valuemin={1}
            aria-valuemax={total}
            aria-valuenow={current + 1}
            aria-valuetext={`Step ${current + 1} of ${total}: ${steps[current]}`}
            className="h-1.5 rounded-full bg-muted overflow-hidden"
          >
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${((current + 1) / total) * 100}%` }} />
          </div>
        </div>
      ) : (
        // overflow-hidden so the row's scrollWidth reports how much it overflows;
        // the padding keeps focus rings from being clipped.
        <div ref={rowRef} className="flex items-center gap-1 overflow-hidden p-0.5 pb-1">
          {children}
        </div>
      )}
    </div>
  );
};

export default WizardSteps;
