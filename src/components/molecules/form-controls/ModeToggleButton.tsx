import React from "react";

// Shared by PresetSelectField and ChipSelectField for their "Custom/Presets"
// and "Hide/Show suggestions" toggle links.
export const ModeToggleButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="text-xs font-medium text-primary hover:underline shrink-0"
  >
    {label}
  </button>
);
