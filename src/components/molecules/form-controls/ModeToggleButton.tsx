import React from "react";

// Shared by PresetSelectField and ChipSelectField for their "Custom/Presets"
// and "Hide/Show suggestions" toggle links. The text is only 16px tall, so the
// button is stretched to a 24px touch target (WCAG 2.5.8) and pulled back with
// negative margins, which keeps the label row exactly as tall as before.
export const ModeToggleButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="-my-1 inline-flex min-h-6 items-center text-xs font-medium text-primary hover:underline shrink-0"
  >
    {label}
  </button>
);
