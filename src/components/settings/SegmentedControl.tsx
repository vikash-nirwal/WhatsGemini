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
// idle and shadow-accent when active.
export const SegmentedControl: React.FC<SegmentedControlProps> = ({ value, onChange, options, disabled, className }) => {
  const { colorTheme } = useContext(ThemeContext);
  const neumorphic = colorTheme === "neumorphic";
  return (
    <div
      className={cn(
        "inline-flex flex-wrap gap-0.5 p-[3px] rounded-lg bg-background border border-input",
        neumorphic && "bg-transparent border-0 gap-2 p-0",
        disabled && "opacity-50 pointer-events-none",
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "h-8 px-3.5 rounded-md text-[13px] font-medium whitespace-nowrap transition-colors",
              neumorphic
                ? cn("rounded-[14px]", active ? "bg-primary text-primary-foreground shadow-accent" : "shadow-raised text-muted-foreground hover:text-foreground")
                : (active ? "bg-secondary text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
