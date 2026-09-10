import React from 'react';
import { cn } from '../../utils/cn';
import { SettingsCard, SettingsCardHeader, SettingsRow } from './SettingsCard';
import { COLOR_THEMES } from '../../utils/constants';

interface AppearanceSettingsProps {
  colorTheme: string;
  setColorTheme: (value: string) => void;
}

// Light-mode swatches for each theme, just enough to preview the palette at a
// glance - dark mode uses the same hues at different luminance, no need for
// a second set here.
const THEME_SWATCHES: Record<string, [string, string, string]> = {
  cozy: ['#F7F1EC', '#E0562E', '#2A1E1A'],
  neumorphic: ['#E8EAEC', '#268B68', '#22262B'],
};

// Palette picker, independent of the existing light/dark toggle (header icon) -
// see ThemeContext's colorTheme/setColorTheme and tokens.css's [data-theme="x"]
// blocks. Cozy is the app's original look and stays the default.
const AppearanceSettings: React.FC<AppearanceSettingsProps> = ({ colorTheme, setColorTheme }) => {
  return (
    <div className="flex flex-col gap-5">
      <SettingsCard>
        <div className="p-5">
          <SettingsCardHeader title="Theme" hint="Applies instantly, in both light and dark mode" />
        </div>
        <SettingsRow label="Color theme" hint="Changes the app's palette everywhere - chats, characters, and settings." align="start">
          <div className="flex flex-wrap gap-3">
            {COLOR_THEMES.map((t) => {
              const active = t.value === colorTheme;
              const swatch = THEME_SWATCHES[t.value] || THEME_SWATCHES.cozy;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setColorTheme(t.value)}
                  aria-pressed={active}
                  className={cn(
                    "w-44 text-left rounded-xl border p-3.5 transition-colors",
                    active ? "border-primary bg-primary/[0.06]" : "border-border/60 hover:bg-muted/50"
                  )}
                >
                  <div className="flex items-center gap-1.5 mb-3">
                    {swatch.map((c, i) => (
                      <span
                        key={i}
                        className="w-5 h-5 rounded-full border border-black/10"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{t.label}</span>
                    {active && (
                      <span className="text-[10px] font-medium text-primary uppercase tracking-wide">Active</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{t.description}</div>
                </button>
              );
            })}
          </div>
        </SettingsRow>
      </SettingsCard>
    </div>
  );
};

export default AppearanceSettings;
