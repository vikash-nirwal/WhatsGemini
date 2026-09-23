import React, { useState } from "react";
import { cn } from "src/utils/cn";

// Blurs its content until tapped (Privacy > Blur NSFW images). Reveals only
// this one instance; the click doesn't reach the parent (e.g. a card link).
export const NsfwBlur: React.FC<{ active: boolean; className?: string; children: React.ReactNode }> = ({ active, className, children }) => {
  const [revealed, setRevealed] = useState(false);
  if (!active || revealed) return <>{children}</>;
  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div aria-hidden className="w-full h-full blur-2xl scale-110 pointer-events-none select-none">{children}</div>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setRevealed(true);
        }}
        className="absolute inset-0 flex items-center justify-center bg-black/30 text-white text-xs font-medium"
      >
        Tap to show
      </button>
    </div>
  );
};
