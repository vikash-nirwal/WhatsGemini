import { AUTHOR_NOTE_PRESETS, buildDraftReplyPrompt, cleanDraftReply, hasPreset, parseReplySuggestions, togglePreset } from "./narrativeTools";

describe("write my reply", () => {
  it("asks for only the user's own turn, in their voice", () => {
    const prompt = buildDraftReplyPrompt({ userName: "Arin", userBio: "A tired knight.", charName: "Mira", transcript: "Mira: Hello." });
    expect(prompt).toContain("Write Arin's next message");
    expect(prompt).toContain("About Arin: A tired knight.");
    expect(prompt).toContain("Never write anything Mira says or does");
    expect(prompt).toContain("Mira: Hello.");
  });

  it("strips a name label and wrapping quotes", () => {
    expect(cleanDraftReply("Arin: *smiles* Hi there.", "Arin")).toBe("*smiles* Hi there.");
    expect(cleanDraftReply('"Hi there."', "Arin")).toBe("Hi there.");
    expect(cleanDraftReply('He said "hi" and "bye"', "Arin")).toBe('He said "hi" and "bye"');
  });
});

describe("author's note presets", () => {
  const slow = AUTHOR_NOTE_PRESETS[0];
  const dialogue = AUTHOR_NOTE_PRESETS[1];

  it("adds a preset as its own line, keeping hand-written text", () => {
    const note = togglePreset("Mira is grumpy today.", slow);
    expect(note).toBe(`Mira is grumpy today.\n${slow.text}`);
    expect(hasPreset(note, slow)).toBe(true);
  });

  it("removes exactly that preset's line", () => {
    const note = togglePreset(togglePreset(togglePreset("Hand note.", slow), dialogue), slow);
    expect(note).toBe(`Hand note.\n${dialogue.text}`);
  });

  it("works on an empty note", () => {
    expect(togglePreset(undefined, slow)).toBe(slow.text);
    expect(togglePreset(slow.text, slow)).toBe("");
  });
});

describe("reply suggestions", () => {
  it("reads numbered or bulleted lines, at most three", () => {
    expect(parseReplySuggestions('1. "Tell me more."\n2) I step closer.\n- Not now.\n4. Extra')).toEqual(["Tell me more.", "I step closer.", "Not now."]);
  });

  it("ignores blank lines", () => {
    expect(parseReplySuggestions("\n1. Yes\n\n2. No\n")).toEqual(["Yes", "No"]);
  });
});
