import React from 'react';
import { cn } from '../../utils/cn';
import { SettingsCard, SettingsCardHeader, SettingsRow } from 'src/components/molecules/settings-card';
import ToggleSwitch from 'src/components/atoms/ToggleSwitch';
import {
  COLOR_THEMES,
  COZY_PALETTES,
  DEFAULT_ACCENT_PALETTE,
  DEFAULT_COZY_PALETTE,
  DEFAULT_NEUMORPHIC_PALETTE,
  DEFAULT_TERMINAL_PALETTE,
  NEUMORPHIC_PALETTES,
  AURORA_PALETTES,
  TERMINAL_PALETTES,
} from '../../utils/constants';

interface AppearanceSettingsProps {
  colorTheme: string;
  setColorTheme: (value: string) => void;
  accentPalette: string;
  setAccentPalette: (value: string) => void;
  alwaysShowInitials: boolean;
  setAlwaysShowInitials: (value: boolean) => void;
}

// Light-mode swatches for each theme, just enough to preview the palette at a
// glance - dark mode uses the same hues at different luminance, no need for
// a second set here.
const THEME_SWATCHES: Record<string, [string, string, string]> = {
  cozy: ['#F7F1EC', '#E0562E', '#2A1E1A'],
  neumorphic: ['#E8EAEC', '#268B68', '#22262B'],
  aurora: ['#F4F0FB', '#8B5CF6', '#1A1330'],
  terminal: ['#F2F1E9', '#0A6B78', '#08210F'],
};

// Every color theme's own accent-palette sub-choice - see tokens.css's
// [data-theme="x"][data-palette="y"] blocks (cozy's own live under
// :root/.dark instead, since it never gets a data-theme attribute). Keyed by
// COLOR_THEMES value so adding a theme's palette picker is just adding an
// entry here. `defaultValue` is that theme's OWN baked-in default (e.g.
// terminal's "green") - distinct from the app-wide DEFAULT_ACCENT_PALETTE
// ("violet", aurora's default), which is what accentPalette actually holds
// until a user picks something under THIS theme specifically.
const PALETTE_PICKERS: Record<string, { label: string; hint: string; palettes: { value: string; label: string; colors: [string, string, string] }[]; defaultValue: string }> = {
  cozy: { label: "Accent palette", hint: "Cozy's own choice of accent color - has no effect under other color themes.", palettes: COZY_PALETTES, defaultValue: DEFAULT_COZY_PALETTE },
  neumorphic: { label: "Accent palette", hint: "Neumorphic's own choice of accent color - has no effect under other color themes.", palettes: NEUMORPHIC_PALETTES, defaultValue: DEFAULT_NEUMORPHIC_PALETTE },
  aurora: { label: "Accent palette", hint: "Aurora's own choice of gradient - has no effect under other color themes.", palettes: AURORA_PALETTES, defaultValue: DEFAULT_ACCENT_PALETTE },
  terminal: { label: "Phosphor color", hint: "Terminal's own choice of CRT color - has no effect under other color themes.", palettes: TERMINAL_PALETTES, defaultValue: DEFAULT_TERMINAL_PALETTE },
};

// Palette picker, independent of the existing light/dark toggle (header icon) -
// see ThemeContext's colorTheme/setColorTheme and tokens.css's [data-theme="x"]
// blocks. Cozy is the app's original look and stays the default.
const AppearanceSettings: React.FC<AppearanceSettingsProps> = ({
  colorTheme,
  setColorTheme,
  accentPalette,
  setAccentPalette,
  alwaysShowInitials,
  setAlwaysShowInitials,
}) => {
  const picker = PALETTE_PICKERS[colorTheme];
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
        {picker && (
          <SettingsRow label={picker.label} hint={picker.hint} align="start">
            <div className="flex flex-wrap gap-3">
              {picker.palettes.map((p) => {
                // accentPalette holds the shared, app-wide value - it only
                // names one of THIS theme's own palettes once the user has
                // actually picked one under it. Until then (still sitting at
                // DEFAULT_ACCENT_PALETTE, e.g. arriving fresh or from another
                // theme) treat this theme's own default as the active one,
                // matching what's actually rendered on screen.
                const active = accentPalette === DEFAULT_ACCENT_PALETTE
                  ? p.value === picker.defaultValue
                  : p.value === accentPalette;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setAccentPalette(p.value)}
                    aria-pressed={active}
                    className={cn(
                      "w-32 text-left rounded-xl border p-3 transition-colors",
                      active ? "border-primary bg-primary/[0.06]" : "border-border/60 hover:bg-muted/50"
                    )}
                  >
                    <div
                      className="w-full h-7 rounded-lg mb-2.5"
                      style={{ background: `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]} 55%, ${p.colors[2]})` }}
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{p.label}</span>
                      {active && (
                        <span className="text-[10px] font-medium text-primary uppercase tracking-wide">Active</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </SettingsRow>
        )}
      </SettingsCard>

      <SettingsCard>
        <SettingsRow
          label="Always show initials"
          hint="Show initials instead of pictures for every character and persona avatar, even when one has a picture set."
        >
          <ToggleSwitch checked={alwaysShowInitials} onChange={setAlwaysShowInitials} />
        </SettingsRow>
      </SettingsCard>
    </div>
  );
};

export default AppearanceSettings;
