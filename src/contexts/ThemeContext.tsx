import React, { createContext, useState, useEffect, useCallback, ReactNode } from "react";
import {
  DARK,
  LIGHT,
  LS_THEME,
  LS_COLOR_THEME,
  DEFAULT_COLOR_THEME,
  LS_ACCENT_PALETTE,
  DEFAULT_ACCENT_PALETTE,
} from "../utils/constants";

interface ThemeContextType {
  theme: string;
  toggleTheme: () => void;
  colorTheme: string;
  setColorTheme: (colorTheme: string) => void;
  accentPalette: string;
  setAccentPalette: (accentPalette: string) => void;
}

export const ThemeContext = createContext<ThemeContextType>({
  theme: DARK,
  toggleTheme: () => {},
  colorTheme: DEFAULT_COLOR_THEME,
  setColorTheme: () => {},
  accentPalette: DEFAULT_ACCENT_PALETTE,
  setAccentPalette: () => {},
});

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  // Lazy initialization to prevent unnecessary localStorage reads
  const getStoredTheme = () => {
    try {
      return localStorage.getItem(LS_THEME) || DARK;
    } catch (error) {
      console.error("Error accessing localStorage:", error);
      return DARK; // Default theme fallback
    }
  };

  const getStoredColorTheme = () => {
    try {
      return localStorage.getItem(LS_COLOR_THEME) || DEFAULT_COLOR_THEME;
    } catch (error) {
      console.error("Error accessing localStorage:", error);
      return DEFAULT_COLOR_THEME;
    }
  };

  const getStoredAccentPalette = () => {
    try {
      return localStorage.getItem(LS_ACCENT_PALETTE) || DEFAULT_ACCENT_PALETTE;
    } catch (error) {
      console.error("Error accessing localStorage:", error);
      return DEFAULT_ACCENT_PALETTE;
    }
  };

  const [theme, setTheme] = useState<string>(getStoredTheme);
  const [colorTheme, setColorTheme] = useState<string>(getStoredColorTheme);
  const [accentPalette, setAccentPalette] = useState<string>(getStoredAccentPalette);

  useEffect(() => {
    try {
      document.documentElement.classList.toggle(DARK, theme === DARK);
      document.documentElement.classList.toggle(LIGHT, theme === LIGHT);
      localStorage.setItem(LS_THEME, theme);
    } catch (error) {
      console.error("Error saving theme to localStorage:", error);
    }
  }, [theme]);

  useEffect(() => {
    try {
      // Palette selection is a separate axis from light/dark - see tokens.css's
      // [data-theme="x"] blocks. Left unset for the default so a fresh profile
      // (no localStorage entry yet) still renders the original look pre-hydration.
      if (colorTheme === DEFAULT_COLOR_THEME) {
        document.documentElement.removeAttribute("data-theme");
      } else {
        document.documentElement.setAttribute("data-theme", colorTheme);
      }
      localStorage.setItem(LS_COLOR_THEME, colorTheme);
    } catch (error) {
      console.error("Error saving color theme to localStorage:", error);
    }
  }, [colorTheme]);

  useEffect(() => {
    try {
      // Only meaningful under [data-theme="aurora"] in tokens.css - every
      // other color theme ignores data-palette. Left unset for the default
      // so a fresh profile still renders aurora's own default (violet)
      // pre-hydration, same reasoning as data-theme above.
      if (accentPalette === DEFAULT_ACCENT_PALETTE) {
        document.documentElement.removeAttribute("data-palette");
      } else {
        document.documentElement.setAttribute("data-palette", accentPalette);
      }
      localStorage.setItem(LS_ACCENT_PALETTE, accentPalette);
    } catch (error) {
      console.error("Error saving accent palette to localStorage:", error);
    }
  }, [accentPalette]);

  // Memoized theme toggle function
  const toggleTheme = useCallback(() => {
    setTheme((prevTheme) => (prevTheme === LIGHT ? DARK : LIGHT));
  }, []);

  return (
    <ThemeContext.Provider
      value={{ theme, toggleTheme, colorTheme, setColorTheme, accentPalette, setAccentPalette }}
    >
      {children}
    </ThemeContext.Provider>
  );
};
