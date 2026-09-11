import React from 'react';
import { cn } from '../../utils/cn';
import { useColorTheme } from '../../hooks/useColorTheme';

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
// describe for tabs.tsx: a borderless track, each option surface-raised when
// idle and cta-surface when active. Aurora's own canvas markup (the Chat
// font size / Safety threshold rows) uses yet another structure: a thin
// bordered track (no fill, no gaps) of flush segments on var(--raise),
// divided by hairlines, with the active segment filled by the brand
// gradient instead of a flat color - a genuine DOM-shape difference (not
// just a class swap), so this whole component stays a JS branch rather than
// static classes - see src/styles/THEMING.md.
export const SegmentedControl: React.FC<SegmentedControlProps> = ({ value, onChange, options, disabled, className }) => {
  const { is } = useColorTheme();
  const neumorphic = is("neumorphic");
  const aurora = is("aurora");
  const terminal = is("terminal");
  return (
    <div
      className={cn(
        "inline-flex flex-wrap gap-0.5 p-[3px] rounded-lg bg-background border border-input",
        neumorphic && "bg-transparent border-0 gap-2 p-0",
        aurora && "gap-0 p-0 rounded-sm border-input bg-transparent overflow-hidden",
        terminal && "gap-1.5 p-0 border-0 bg-transparent",
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
                cn("rounded-[14px]", active ? "bg-primary text-primary-foreground cta-surface" : "surface-raised text-muted-foreground hover:text-foreground"),
              !neumorphic && !aurora && !terminal &&
                (active ? "bg-secondary text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"),
              terminal &&
                cn(
                  "border text-[11px] font-bold",
                  active
                    ? "bg-primary text-primary-foreground border-border-bright"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-border-bright"
                ),
              aurora &&
                cn(
                  "rounded-none",
                  i > 0 && "border-l border-input",
                  active ? "cta-surface text-primary-foreground" : "surface-elevated text-muted-foreground hover:text-foreground"
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
