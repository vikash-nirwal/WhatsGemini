import { buildLanguageDirective, buildTranslatePrompt } from "./languagePractice";
import { extractCorrection, stripStreamingCorrection, stripStreamingTags } from "../ai/utils/messageTags";

describe("language practice", () => {
  it("asks for replies in the language, at the level, with corrections", () => {
    const d = buildLanguageDirective({ target: "Spanish", level: "beginner" }, "Vik");
    expect(d).toContain("Vik is practising Spanish. Always reply in Spanish");
    expect(d).toContain("short, simple sentences");
    expect(d).toContain("<fix>the corrected sentence(s) - a very short reason</fix>");
  });

  it("takes the correction off the reply, also while it streams", () => {
    expect(extractCorrection("¡Qué bien!\n<fix>Yo soy feliz - ser, not es</fix>")).toEqual({ text: "¡Qué bien!", correction: "Yo soy feliz - ser, not es" });
    expect(extractCorrection("Hola")).toEqual({ text: "Hola" });
    expect(stripStreamingCorrection("¡Qué bien!\n<fix>Yo so")).toBe("¡Qué bien!");
    expect(stripStreamingTags("Hola\n<fi")).toBe("Hola");
  });

  it("translates into the user's language", () => {
    expect(buildTranslatePrompt("Hola", "English")).toBe("Translate this message into English. Keep its tone and meaning; keep *actions in asterisks* as they are. Reply with only the translation.\n\nHola");
  });
});
