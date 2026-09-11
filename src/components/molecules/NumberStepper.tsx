import React from 'react';
import { cn } from '../../utils/cn';
import { useColorTheme } from '../../hooks/useColorTheme';

interface NumberStepperProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  className?: string;
}

// A −/count/+ stepper for small bounded integer ranges (e.g. images per
// request) - replaces a bare numeric <input> per the redesign's Image
// generation screen.
export const NumberStepper: React.FC<NumberStepperProps> = ({ value, min, max, onChange, className }) => {
  const { is } = useColorTheme();
  return (
    <div className={cn("inline-flex items-center h-10 rounded-lg bg-background border border-input", is("aurora") && "surface-sunken", is("terminal") && "bg-transparent border-border", className)}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="Decrease"
        className="w-10 h-full grid place-items-center text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:pointer-events-none text-lg leading-none"
      >
        −
      </button>
      <span className="w-11 text-center text-sm tabular-nums border-x border-input">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="Increase"
        className="w-10 h-full grid place-items-center text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:pointer-events-none text-lg leading-none"
      >
        +
      </button>
    </div>
  );
};
