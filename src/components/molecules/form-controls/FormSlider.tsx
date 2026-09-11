import React from "react";
import { Slider as ShadcnSlider } from "src/components/atoms/slider";

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  className?: string;
}

// Adapts this app's single-number Slider API onto Radix's array-valued Slider
// (which supports multi-thumb ranges we don't need here). Exported as
// `Slider` (same name as the atoms/slider primitive it wraps) - callers that
// need both in one file alias one at the import site, same convention this
// file itself already uses for ShadcnSlider.
export const Slider: React.FC<SliderProps> = ({ value, min, max, step, onChange, className }) => (
  <ShadcnSlider
    value={[value]}
    min={min}
    max={max}
    step={step}
    onValueChange={([v]) => onChange(v)}
    className={className}
  />
);
