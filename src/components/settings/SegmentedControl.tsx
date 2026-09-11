import React, { useContext } from 'react';
import { cn } from '../../utils/cn';
import { ThemeContext } from '../../contexts/ThemeContext';

interface SegmentedOption {
  value: string;
  label: React.ReactNode;
}

interface SegmentedControlProps {
  value: string;
  onChange: (value: string) => void;
  options: SegmentedOption[];
  disabled?: boolean;
  className?: string;
}

// A pill-group toggle replacing a <select> for short enumerated choices
// (font size, aspect ratio, safety threshold, reference-image mode) - the
// redesign's own annotation on the Safety screen calls this out explicitly:
// "One segmented control per category instead of four dropdowns." This is
// this app's stand-in for the canvas's Tabs primitive, so under the
// neumorphic theme it gets the same treatment the canvas's handoff notes
// describe for tabs.tsx: a borderless track, each option shadow-raised when
// idle and shadow-accent when active. Aurora's own canvas markup (the Chat
// font size / Safety threshold rows) uses yet another structure: a thin
// bordered track (no fill, no gaps) of flush segments on var(--raise),
// divided by hairlines, with the active segment filled by the brand
// gradient instead of a flat color - see the aurora branch below.
export const SegmentedControl: React.FC<SegmentedControlProps> = ({ value, onChange, options, disabled, className }) => {
  const { colorTheme } = useContext(ThemeContext);
  const neumorphic = colorTheme === "neumorphic";
  const aurora = colorTheme === "aurora";
  return (
    <div
      className={cn(
        "inline-flex flex-wrap gap-0.5 p-[3px] rounded-lg bg-background border border-input",
        neumorphic && "bg-transparent border-0 gap-2 p-0",
        aurora && "gap-0 p-0 rounded-sm border-input bg-transparent overflow-hidden",
        disabled && "opacity-50 pointer-events-none",
        className
      )}
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "h-8 px-3.5 rounded-md text-[13px] font-medium whitespace-nowrap transition-colors",
              neumorphic &&
                cn("rounded-[14px]", active ? "bg-primary text-primary-foreground shadow-accent" : "shadow-raised text-muted-foreground hover:text-foreground"),
              !neumorphic && !aurora &&
                (active ? "bg-secondary text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"),
              aurora &&
                cn(
                  "rounded-none",
                  i > 0 && "border-l border-input",
                  active ? "aurora-gradient-btn text-primary-foreground" : "aurora-raised text-muted-foreground hover:text-foreground"
                )
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
