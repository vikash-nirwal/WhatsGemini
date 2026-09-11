import React from "react";
import {
  Select as ShadcnSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/molecules/select";

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
