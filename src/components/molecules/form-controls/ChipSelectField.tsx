import React, { useState } from "react";
import { cn } from "src/utils/cn";
import { useColorTheme } from "src/hooks/useColorTheme";
import { FieldLabel } from "./FieldLabel";
import { ModeToggleButton } from "./ModeToggleButton";
import { TagInput } from "./TagInput";

interface ChipSelectFieldProps {
  label: React.ReactNode;
  hint?: React.ReactNode;
  value: string[];
  onChange: (value: string[]) => void;
  presets: string[];
  placeholder?: string;
  className?: string;
}

// Multi-value field combining preset toggle-chips with the existing free-form
// TagInput. Presets and typed values coexist in the same list - toggling a
// chip just adds/removes it from `value`, same as typing one and pressing
// Enter would. The "show suggestions" toggle only hides the preset row itself.
export const ChipSelectField: React.FC<ChipSelectFieldProps> = ({
  label,
  hint,
  value,
  onChange,
  presets,
  placeholder,
  className,
}) => {
  const [showPresets, setShowPresets] = useState(true);
  const { is } = useColorTheme();
  const neumorphic = is("neumorphic");
  const terminal = is("terminal");

  const toggle = (preset: string) => {
    if (value.includes(preset)) onChange(value.filter((v) => v !== preset));
    else onChange([...value, preset]);
  };

  return (
    <div className={className}>
      <FieldLabel
        hint={hint}
        action={
          <ModeToggleButton
            label={showPresets ? "Hide suggestions" : "Show suggestions"}
            onClick={() => setShowPresets((s) => !s)}
          />
        }
      >
        {label}
      </FieldLabel>
      {showPresets && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {presets.map((preset) => {
            const active = value.includes(preset);
            return (
              <button
                key={preset}
                type="button"
                onClick={() => toggle(preset)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                  terminal
                    ? cn(
                        "border text-[10px] font-bold",
                        active
                          ? "bg-primary text-primary-foreground border-border-bright"
                          : "bg-transparent text-foreground border-border hover:border-border-bright"
                      )
                    : neumorphic
                    ? active
                      ? "bg-primary text-primary-foreground cta-surface"
                      : "bg-transparent text-muted-foreground surface-raised hover:text-foreground"
                    : active
                      ? "border bg-primary text-primary-foreground border-primary"
                      : "border bg-transparent text-muted-foreground border-input hover:bg-secondary"
                )}
              >
                {preset}
              </button>
            );
          })}
        </div>
      )}
      <TagInput value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  );
};
