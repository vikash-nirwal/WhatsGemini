import React from 'react';
import { cn } from 'src/utils/cn';

interface SettingsCardHeaderProps {
  title: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}

// A card-level header (e.g. "Provider", "Output") - distinct from a row's own
// left-side label, used when a card groups a heading + free-form content
// (like a pill picker) above its regular rows.
export const SettingsCardHeader: React.FC<SettingsCardHeaderProps> = ({ title, hint, className }) => (
  <div className={cn("flex items-baseline justify-between gap-4 flex-wrap", className)}>
    <h4 className="font-semibold text-[14.5px] text-foreground">{title}</h4>
    {hint && <span className="text-xs text-subtle">{hint}</span>}
  </div>
);
