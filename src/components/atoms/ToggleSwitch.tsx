import React from "react";
import { Switch } from "./switch";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: React.ReactNode;
  title?: string;
  className?: string;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  label,
  title,
  className = ""
}) => {
  return (
    <label
      title={title}
      className={`flex items-center gap-2 cursor-pointer text-sm transition select-none ${disabled ? 'opacity-50 pointer-events-none' : ''} ${checked ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'} ${className}`}
    >
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
      {label && <span>{label}</span>}
    </label>
  );
};

export default ToggleSwitch;
