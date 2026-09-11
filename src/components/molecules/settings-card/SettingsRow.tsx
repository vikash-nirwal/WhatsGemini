import React from 'react';
import { cn } from 'src/utils/cn';

interface SettingsRowProps {
  label: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  align?: "center" | "start";
  className?: string;
}

// One field row: a fixed-width label+hint column on the left, the actual
// control on the right - the grid-template-columns:220px 1fr pattern used
// throughout the redesign's settings screens.
export const SettingsRow: React.FC<SettingsRowProps> = ({ label, hint, children, align = "center", className }) => (
  <div
    className={cn(
      "px-5 py-4 grid grid-cols-1 sm:grid-cols-[220px_minmax(0,1fr)] gap-2.5 sm:gap-5",
      align === "start" ? "sm:items-start" : "sm:items-center",
      className
    )}
  >
    <div>
      <div className="text-sm font-medium text-foreground">{label}</div>
      {hint && <div className="text-xs text-subtle mt-0.5 leading-relaxed">{hint}</div>}
    </div>
    <div className="min-w-0">{children}</div>
  </div>
);
