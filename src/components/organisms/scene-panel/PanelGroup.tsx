import React, { useState } from "react";
import { FaChevronRight } from "react-icons/fa";

const LS_GROUPS = "scene_panel_groups";

const readCollapsed = (): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(LS_GROUPS) || "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
};

// A titled group of settings in the Scene panel, folded with a tap. Every
// group starts open; which ones you've folded is remembered on this device.
const PanelGroup: React.FC<{ id: string; title: string; hint?: string; children: React.ReactNode }> = ({ id, title, hint, children }) => {
  const [open, setOpen] = useState(() => !readCollapsed()[id]);
  const toggle = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    const next = e.currentTarget.open;
    setOpen(next);
    try {
      localStorage.setItem(LS_GROUPS, JSON.stringify({ ...readCollapsed(), [id]: !next }));
    } catch {
      // Only a convenience.
    }
  };
  return (
    // #151: the canvas's setting group - a rounded card whose title folds it.
    <details open={open} onToggle={toggle} className="group/panel rounded-card bg-raised px-4 ring-1 ring-inset ring-border" data-slot="panel-group" data-group={id}>
      <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-3 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 flex-col">
          <span data-slot="section-title" className="text-[15px] font-semibold leading-5 text-foreground">{title}</span>
          {hint && <span className="truncate text-[12.5px] text-subtle">{hint}</span>}
        </span>
        <FaChevronRight aria-hidden size={11} className="flex-none text-subtle transition-transform group-open/panel:rotate-90" />
      </summary>
      <div className="flex flex-col gap-[18px] border-t border-border pb-4 pt-3.5">{children}</div>
    </details>
  );
};

export default PanelGroup;
