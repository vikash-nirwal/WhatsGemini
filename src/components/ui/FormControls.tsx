import React, { useState } from "react";
import { FaTimes } from "react-icons/fa";
import { cn } from "../../utils/cn";
import { Input } from "./input";
import { Textarea } from "./textarea";
import { Label } from "./label";
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

interface FieldLabelProps {
  children: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
  htmlFor?: string;
}

export const FieldLabel: React.FC<FieldLabelProps> = ({ children, hint, className, htmlFor }) => (
  <div className={cn("mb-1.5", className)}>
    <Label htmlFor={htmlFor}>{children}</Label>
    {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
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

  const commitDraft = () => {
    const tag = draft.trim();
    setDraft("");
    if (!tag) return;
    if (value.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    onChange([...value, tag]);
  };

  const removeTag = (index: number) => onChange(value.filter((_, i) => i !== index));

  return (
    <div className={cn("flex flex-wrap items-center gap-2 p-2 rounded-md border border-input bg-transparent min-h-[42px]", className)}>
      {value.map((tag, i) => (
        <span key={tag} className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-medium">
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
