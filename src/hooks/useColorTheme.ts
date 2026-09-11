import { useCallback, useContext } from "react";
import { ThemeContext } from "src/contexts/ThemeContext";
import { COLOR_THEMES } from "src/utils/constants";

export type ColorThemeName = (typeof COLOR_THEMES)[number]["value"];

export interface UseColorThemeResult {
  colorTheme: string;
  accentPalette: string;
  setColorTheme: (colorTheme: string) => void;
  setAccentPalette: (accentPalette: string) => void;
  /** colorTheme === name, typed against the registered theme list so a
   *  misspelled/stale theme name is a compile error instead of a silent
   *  always-false no-op. Prefer this over re-deriving `colorTheme === "x"`
   *  locally - see src/styles/THEMING.md. */
  is: (name: ColorThemeName) => boolean;
}

// Centralizes color-theme (not light/dark - see ThemeContext's own `theme`/
// `toggleTheme` for that) reads so components stop hand-rolling their own
// `colorTheme === "neumorphic"` booleans. Most call sites should reach for a
// static `surface-*`/`cta-surface` class in tokens.css instead of a JS branch
// at all - this hook is for the few genuinely structural exceptions (see
// THEMING.md) where the DOM shape itself differs per theme.
export function useColorTheme(): UseColorThemeResult {
  const { colorTheme, setColorTheme, accentPalette, setAccentPalette } = useContext(ThemeContext);
  const is = useCallback((name: ColorThemeName) => colorTheme === name, [colorTheme]);
  return { colorTheme, accentPalette, setColorTheme, setAccentPalette, is };
}
