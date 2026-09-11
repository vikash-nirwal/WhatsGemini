import React, { useState, useEffect, useRef, useContext } from "react";
import { FaTimes } from "react-icons/fa";
import { cn } from "../../utils/cn";
import { ThemeContext } from "../../contexts/ThemeContext";
import { Input } from "./input";
import { Textarea } from "./textarea";
import { Label } from "./label";
import { Tooltip, TooltipTrigger, TooltipContent } from "./tooltip";
import { Slider as ShadcnSlider } from "./slider";
import {
  Select as ShadcnSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

export const TextInput = Input;

export const TextArea = Textarea;

// Radix's Select (unlike a native <select>) reserves an empty string value for
// "no selection" and throws if a SelectItem uses one - a few call sites here
// have a real, meaningful "" option (e.g. "Browser default" voice, "Default
// (From SD WebUI)" model). This sentinel round-trips "" through Radix without
// touching any call site's value/onChange contract.
const EMPTY_VALUE = "__empty__";
const toSentinel = (v: unknown) => (v === "" || v === undefined || v === null ? EMPTY_VALUE : String(v));
const fromSentinel = (v: string) => (v === EMPTY_VALUE ? "" : v);

// Drop-in replacement for a native <select> that renders shadcn's Select
// underneath, keeping the exact same call-site API (value/onChange with
// e.target.value, children as plain <option> elements) so none of this app's
// ~10 call sites need to change - only this file does.
export const Select = React.forwardRef<HTMLButtonElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, value, defaultValue, onChange, disabled, id, "aria-label": ariaLabel }, ref) => {
    const options = React.Children.toArray(children).filter(
      (child): child is React.ReactElement<React.OptionHTMLAttributes<HTMLOptionElement>> =>
        React.isValidElement(child)
    );

    const handleValueChange = (v: string) => {
      onChange?.({ target: { value: fromSentinel(v) } } as unknown as React.ChangeEvent<HTMLSelectElement>);
    };

    return (
      <ShadcnSelect
        value={value !== undefined ? toSentinel(value) : undefined}
        defaultValue={defaultValue !== undefined ? toSentinel(defaultValue) : undefined}
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <SelectTrigger ref={ref} className={className} id={id} aria-label={ariaLabel}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt, i) => {
            const optValue = toSentinel(opt.props.value);
            return (
              <SelectItem key={opt.key ?? `${optValue}-${i}`} value={optValue} disabled={opt.props.disabled}>
                {opt.props.children}
              </SelectItem>
            );
          })}
        </SelectContent>
      </ShadcnSelect>
    );
  }
);
Select.displayName = "Select";

// A small "i" dot that reveals `hint` on hover/focus instead of it sitting
// on the page as a permanent caption line - the same move the approved
// density-pass mockup used for every field hint. Shared so any label-style
// hint (FieldLabel below, or an ad-hoc section heading elsewhere) renders
// identically.
export const InfoTooltip: React.FC<{ hint: React.ReactNode }> = ({ hint }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span
        tabIndex={0}
        role="button"
        aria-label="More info"
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-subtle text-subtle text-[9px] leading-none flex-shrink-0 cursor-help hover:border-primary hover:text-primary transition-colors"
      >
        i
      </span>
    </TooltipTrigger>
    <TooltipContent className="max-w-[240px] whitespace-normal">{hint}</TooltipContent>
  </Tooltip>
);

interface FieldLabelProps {
  children: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
  htmlFor?: string;
  action?: React.ReactNode; // e.g. a mode-toggle button, rendered at the end of the label row
}

export const FieldLabel: React.FC<FieldLabelProps> = ({ children, hint, className, htmlFor, action }) => (
  <div className={cn("mb-1.5 flex items-center justify-between gap-2", className)}>
    <div className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor}>{children}</Label>
      {hint && <InfoTooltip hint={hint} />}
    </div>
    {action}
  </div>
);

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  className?: string;
}

// Adapts this app's single-number Slider API onto Radix's array-valued Slider
// (which supports multi-thumb ranges we don't need here).
export const Slider: React.FC<SliderProps> = ({ value, min, max, step, onChange, className }) => (
  <ShadcnSlider
    value={[value]}
    min={min}
    max={max}
    step={step}
    onValueChange={([v]) => onChange(v)}
    className={className}
  />
);

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
}

// Freeform chip input: type a tag and press Enter or "," to commit it,
// Backspace on the empty draft removes the last chip. Dedupes case-insensitively.
export const TagInput: React.FC<TagInputProps> = ({ value, onChange, placeholder, className }) => {
  const [draft, setDraft] = useState("");
  const { colorTheme } = useContext(ThemeContext);
  const neumorphic = colorTheme === "neumorphic";
  const aurora = colorTheme === "aurora";

  const commitDraft = () => {
    const tag = draft.trim();
    setDraft("");
    if (!tag) return;
    if (value.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    onChange([...value, tag]);
  };

  const removeTag = (index: number) => onChange(value.filter((_, i) => i !== index));

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 p-2 rounded-md bg-transparent min-h-[42px]",
        neumorphic ? "shadow-inset" : "border border-input",
        aurora && "aurora-sunken",
        className
      )}
    >
      {value.map((tag, i) => (
        <span
          key={tag}
          className={cn(
            "inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-medium",
            neumorphic && "shadow-raised-sm"
          )}
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(i)}
            className="rounded-full p-0.5 hover:bg-destructive/15 hover:text-destructive"
            aria-label={`Remove tag ${tag}`}
          >
            <FaTimes size={9} />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commitDraft();
          } else if (e.key === "Backspace" && !draft && value.length > 0) {
            removeTag(value.length - 1);
          }
        }}
        onBlur={commitDraft}
        placeholder={value.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[100px] bg-transparent outline-none text-sm placeholder-subtle"
      />
    </div>
  );
};

const ModeToggleButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="text-xs font-medium text-primary hover:underline shrink-0"
  >
    {label}
  </button>
);

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
  const { colorTheme } = useContext(ThemeContext);
  const neumorphic = colorTheme === "neumorphic";

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
                  neumorphic
                    ? active
                      ? "bg-primary text-primary-foreground shadow-accent"
                      : "bg-transparent text-muted-foreground shadow-raised hover:text-foreground"
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
