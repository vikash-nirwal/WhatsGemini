import React from 'react';
import { cn } from 'src/utils/cn';

interface SettingsCardProps {
  className?: string;
  children: React.ReactNode;
}

// A grouped card of settings rows, hairline-divided between children -
// matches the "WhatsGemini Redesign" canvas's settings-tab screens (2a-2e):
// a rounded card per logical group, each field sitting on its own row with
// a divider instead of the old stacked-label-above-field layout.
export const SettingsCard: React.FC<SettingsCardProps> = ({ className, children }) => (
  <div className={cn("rounded-xl bg-card border border-border/50 overflow-hidden", className)}>
    <div className="divide-y divide-border/40">{children}</div>
  </div>
);
