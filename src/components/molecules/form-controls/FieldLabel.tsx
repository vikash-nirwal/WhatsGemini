import React from "react";
import { cn } from "src/utils/cn";
import { Label } from "src/components/atoms/label";
import { InfoTooltip } from "./InfoTooltip";

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
      <Label htmlFor={htmlFor} data-slot="field-label">{children}</Label>
      {hint && <InfoTooltip hint={hint} />}
    </div>
    {action}
  </div>
);
