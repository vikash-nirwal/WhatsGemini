import React from 'react';
import { cn } from '../../utils/cn';
import { useColorTheme } from '../../hooks/useColorTheme';

interface ProviderPickerProps {
  providers: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}

// Provider selection as a wrapped row of pill buttons instead of a <select> -
// matches the "Provider" row on every settings screen in the redesign
// (Text generation, Image generation). Aurora's own canvas markup uses a
// squarer chip (border-radius:var(--r-sm), not a full pill) filled with
// var(--raise) when idle and the brand gradient + white text when active -
// a genuine DOM-shape difference (not just a class swap), so it stays a JS
// branch rather than a static class - see src/styles/THEMING.md.
export const ProviderPicker: React.FC<ProviderPickerProps> = ({ providers, value, onChange }) => {
  const { is } = useColorTheme();
  const aurora = is("aurora");
  return (
    <div className="flex flex-wrap gap-1.5">
      {providers.map((p) => {
        const active = p.id === value;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            className={cn(
              "h-[34px] px-3.5 text-[13px] font-medium whitespace-nowrap border transition-colors",
              aurora ? "rounded-sm" : "rounded-full",
              aurora
                ? active
                  ? "cta-surface text-primary-foreground"
                  : "surface-elevated border-input text-foreground hover:text-foreground"
                : active
                  ? "bg-primary/[0.14] text-primary border-primary/40"
                  : "bg-background text-muted-foreground border-input hover:text-foreground"
            )}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
};
