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
    <details open={open} onToggle={toggle} className="group/panel" data-slot="panel-group" data-group={id}>
      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <FaChevronRight aria-hidden size={9} className="text-subtle transition-transform group-open/panel:rotate-90" />
        <span data-slot="section-title" className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold">{title}</span>
        {hint && <span className="truncate text-[11px] text-subtle/80">{hint}</span>}
      </summary>
      <div className="mt-3 flex flex-col gap-[18px] pl-[17px]">{children}</div>
    </details>
  );
};

export default PanelGroup;
