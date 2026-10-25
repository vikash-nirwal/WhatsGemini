import React, { useState } from "react";
import { FaBolt, FaChevronDown } from "react-icons/fa";
import { cn } from "src/utils/cn";

// Settings rows from the revamp canvas (#149), for the chat panel, Contact
// info and Settings (#151, #155): a title with a one-line hint on the left,
// the control on the right, rows divided by a hairline inside a rounded
// group. A group can fold, showing a one-line summary of what's on inside.

// The bolt marks a setting that makes background AI calls, so it costs
// money on your key even when you're not chatting. Reserved for that.
export const CostMarker = ({ label = "Makes background AI calls" }: { label?: string }) => (
  <span role="img" aria-label={label} title={label} data-slot="cost-marker" className="inline-grid h-[18px] w-[18px] flex-none place-items-center rounded-[5px] bg-warning/[0.16] text-warning">
    <FaBolt size={9} aria-hidden />
  </span>
);

export const SettingRow = ({
  title,
  hint,
  cost = false,
  children,
  htmlFor,
  className,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  cost?: boolean;
  children?: React.ReactNode;
  // The control's id, so the title labels it (switches, selects).
  htmlFor?: string;
  className?: string;
}) => (
  <div data-slot="setting-row" className={cn("flex min-h-14 items-center gap-4 py-3 [&+&]:border-t [&+&]:border-border", className)}>
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-[14.5px] font-medium leading-5 text-foreground">{title}{cost && <CostMarker />}</label>
      ) : (
        <span className="flex items-center gap-1.5 text-[14.5px] font-medium leading-5 text-foreground">{title}{cost && <CostMarker />}</span>
      )}
      {hint && <span className="text-[12.5px] leading-[17px] text-subtle">{hint}</span>}
    </div>
    {children && <div className="flex flex-shrink-0 items-center">{children}</div>}
  </div>
);

// A rounded group of rows. With `summary`, it folds: the header shows the
// title and the summary, and opens to the rows.
export const SettingGroup = ({
  title,
  summary,
  defaultOpen = false,
  children,
  className,
}: {
  title?: React.ReactNode;
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}) => {
  const foldable = summary !== undefined;
  const [open, setOpen] = useState(defaultOpen || !foldable);
  return (
    <section data-slot="setting-group" className={cn("rounded-card bg-raised px-4 ring-1 ring-inset ring-border", className)}>
      {title && (foldable ? (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-h-[60px] w-full items-center gap-3 py-3.5 text-left">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-semibold leading-5 text-foreground">{title}</span>
            {!open && summary && <span className="truncate text-[12.5px] leading-[17px] text-subtle">{summary}</span>}
          </span>
          <FaChevronDown size={12} aria-hidden className={cn("flex-none text-subtle transition-transform", open && "rotate-180")} />
        </button>
      ) : (
        <h3 className="pb-1 pt-3.5 text-[15px] font-semibold leading-5 text-foreground">{title}</h3>
      ))}
      {open && <div className={cn(title && foldable && "border-t border-border")}>{children}</div>}
    </section>
  );
};
