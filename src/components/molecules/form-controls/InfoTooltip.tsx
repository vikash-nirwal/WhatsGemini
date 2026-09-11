import React from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "src/components/atoms/tooltip";

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
