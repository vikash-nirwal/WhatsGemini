// Reading comfort (#91): a reading font, line spacing and a high-contrast
// option, next to the chat's font size. Stored on this device and applied as
// CSS variables on <html>, like the font size. The font and spacing only
// take over chat text (`data-chat-text`) once chosen, so by default each
// theme keeps its own (the terminal's monospace, the novel view's serif).

export type ReadingFont = "theme" | "atkinson" | "lexend";
export type LineSpacing = "normal" | "relaxed" | "loose";

export interface ReadingComfort {
  font: ReadingFont;
  lineSpacing: LineSpacing;
  highContrast: boolean;
}

export const LS_READING_COMFORT = "reading_comfort";
export const DEFAULT_READING_COMFORT: ReadingComfort = { font: "theme", lineSpacing: "normal", highContrast: false };

// Atkinson Hyperlegible was made for low-vision readers; Lexend for reading
// fluency, and is often suggested for dyslexia. Both from Google Fonts,
// loaded only when chosen.
const FONTS: Record<Exclude<ReadingFont, "theme">, { family: string; css: string }> = {
  atkinson: { family: '"Atkinson Hyperlegible", system-ui, sans-serif', css: "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap" },
  lexend: { family: '"Lexend", system-ui, sans-serif', css: "https://fonts.googleapis.com/css2?family=Lexend:wght@400;600&display=swap" },
};

const LINE_HEIGHTS: Record<LineSpacing, string | undefined> = { normal: undefined, relaxed: "1.75", loose: "2" };

export const loadReadingComfort = (): ReadingComfort => {
  try {
    const raw = localStorage.getItem(LS_READING_COMFORT);
    return raw ? { ...DEFAULT_READING_COMFORT, ...JSON.parse(raw) } : DEFAULT_READING_COMFORT;
  } catch {
    return DEFAULT_READING_COMFORT;
  }
};

export const saveReadingComfort = (value: ReadingComfort): void => {
  try {
    localStorage.setItem(LS_READING_COMFORT, JSON.stringify(value));
  } catch {
    // Only a convenience.
  }
};

export const applyReadingComfort = (value: ReadingComfort, root: HTMLElement = document.documentElement): void => {
  if (value.font !== "theme") {
    const font = FONTS[value.font];
    const id = `reading-font-${value.font}`;
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = font.css;
      document.head.appendChild(link);
    }
    root.style.setProperty("--chat-font-family", font.family);
    root.dataset.readingFont = value.font;
  } else {
    root.style.removeProperty("--chat-font-family");
    delete root.dataset.readingFont;
  }
  const lineHeight = LINE_HEIGHTS[value.lineSpacing];
  if (lineHeight) {
    root.style.setProperty("--chat-line-height", lineHeight);
    root.dataset.lineSpacing = value.lineSpacing;
  } else {
    root.style.removeProperty("--chat-line-height");
    delete root.dataset.lineSpacing;
  }
  if (value.highContrast) root.dataset.contrast = "high";
  else delete root.dataset.contrast;
};
