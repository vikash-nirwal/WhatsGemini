import { applyReadingComfort, DEFAULT_READING_COMFORT, loadReadingComfort, LS_READING_COMFORT, saveReadingComfort } from "./readingComfort";

describe("reading comfort", () => {
  beforeEach(() => {
    localStorage.clear();
    document.head.innerHTML = "";
    document.documentElement.removeAttribute("style");
    delete document.documentElement.dataset.contrast;
    delete document.documentElement.dataset.readingFont;
    delete document.documentElement.dataset.lineSpacing;
  });

  it("loads the defaults when nothing is saved or the saved value is broken", () => {
    expect(loadReadingComfort()).toEqual(DEFAULT_READING_COMFORT);
    localStorage.setItem(LS_READING_COMFORT, "{not json");
    expect(loadReadingComfort()).toEqual(DEFAULT_READING_COMFORT);
  });

  it("loads back what was saved", () => {
    saveReadingComfort({ font: "atkinson", lineSpacing: "relaxed", highContrast: true });
    expect(loadReadingComfort()).toEqual({ font: "atkinson", lineSpacing: "relaxed", highContrast: true });
  });

  it("fills fields missing from an older saved value with the defaults", () => {
    localStorage.setItem(LS_READING_COMFORT, JSON.stringify({ font: "lexend" }));
    expect(loadReadingComfort()).toEqual({ font: "lexend", lineSpacing: "normal", highContrast: false });
  });

  it("sets the font, line spacing and contrast on the root, loading the font once", () => {
    const root = document.documentElement;
    applyReadingComfort({ font: "atkinson", lineSpacing: "loose", highContrast: true });
    applyReadingComfort({ font: "atkinson", lineSpacing: "loose", highContrast: true });
    expect(root.style.getPropertyValue("--chat-font-family")).toContain("Atkinson Hyperlegible");
    expect(root.style.getPropertyValue("--chat-line-height")).toBe("2");
    expect(root.dataset.contrast).toBe("high");
    expect(root.dataset.readingFont).toBe("atkinson");
    expect(root.dataset.lineSpacing).toBe("loose");
    expect(document.querySelectorAll("link#reading-font-atkinson")).toHaveLength(1);
  });

  it("clears everything when set back to the defaults", () => {
    const root = document.documentElement;
    applyReadingComfort({ font: "lexend", lineSpacing: "relaxed", highContrast: true });
    applyReadingComfort(DEFAULT_READING_COMFORT);
    expect(root.style.getPropertyValue("--chat-font-family")).toBe("");
    expect(root.style.getPropertyValue("--chat-line-height")).toBe("");
    expect(root.dataset.contrast).toBeUndefined();
    expect(root.dataset.readingFont).toBeUndefined();
    expect(root.dataset.lineSpacing).toBeUndefined();
  });
});
