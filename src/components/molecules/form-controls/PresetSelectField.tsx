import React, { useState, useEffect, useRef } from "react";
import { FieldLabel } from "./FieldLabel";
import { ModeToggleButton } from "./ModeToggleButton";
import { Select } from "./FormSelect";
import { TextInput } from "./TextField";

interface PresetSelectFieldProps {
  label: React.ReactNode;
  hint?: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  presets: string[];
  customPlaceholder?: string;
  id?: string;
  className?: string;
}

// Single-value select-or-text field: defaults to a dropdown of common presets,
// with a toggle to fall back to a plain text field for anything not listed.
// Opens in "custom" mode automatically when the current value isn't one of
// the presets, so an existing/custom value is never hidden behind the toggle.
export const PresetSelectField: React.FC<PresetSelectFieldProps> = ({
  label,
  hint,
  value,
  onChange,
  presets,
  customPlaceholder,
  id,
  className,
}) => {
  const [mode, setMode] = useState<"preset" | "custom">(
    value && !presets.includes(value) ? "custom" : "preset"
  );
  // The initial `value` at mount is often a placeholder ("") that gets
  // replaced once - by an async effect seeding form state from a loaded
  // character - after this component has already committed to "preset"
  // mode. Re-checks on every value change (until the user manually
  // toggles) so a non-preset value that arrives late still opens in
  // "custom" instead of silently rendering the select with nothing selected.
  const userToggledRef = useRef(false);
  useEffect(() => {
    if (userToggledRef.current) return;
    if (value && !presets.includes(value)) setMode("custom");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const toggleMode = () => {
    userToggledRef.current = true;
    setMode((m) => (m === "preset" ? "custom" : "preset"));
  };

  return (
    <div className={className}>
      <FieldLabel
        htmlFor={id}
        hint={hint}
        action={
          <ModeToggleButton
            label={mode === "preset" ? "Custom" : "Presets"}
            onClick={toggleMode}
          />
        }
      >
        {label}
      </FieldLabel>
      {mode === "preset" ? (
        <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {presets.map((preset) => (
            <option key={preset} value={preset}>
              {preset}
            </option>
          ))}
        </Select>
      ) : (
        <TextInput id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={customPlaceholder} />
      )}
    </div>
  );
};
