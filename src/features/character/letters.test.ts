import { addLetter, buildLetterPrompt, buildLetterSection, cleanLetter, letterDue, letterReplyDraft, LETTER_AWAY_MS } from "./letters";

const NOW = Date.UTC(2026, 9, 22, 12);
const chatLastAt = (t: number) => ({ content: [{ role: "you", txt: "bye", timestamp: t }] });

describe("letterDue", () => {
  it("writes once per absence of a few days, only when switched on", () => {
    const away = chatLastAt(NOW - LETTER_AWAY_MS - 1);
    expect(letterDue({ writesLetters: true }, away, NOW)).toBe(true);
    expect(letterDue({ writesLetters: false }, away, NOW)).toBe(false);
    expect(letterDue({ writesLetters: true }, chatLastAt(NOW - 60_000), NOW)).toBe(false);
    expect(letterDue({ writesLetters: true, letters: [{ id: "l", at: NOW - 1000, text: "Hi" }] }, away, NOW)).toBe(false);
    expect(letterDue({ writesLetters: true }, undefined, NOW)).toBe(false);
  });
});

describe("the letter", () => {
  it("asks for a letter in their voice and cleans the reply", () => {
    expect(buildLetterPrompt({ name: "Aria", description: "A barista", prompt: "Warm." }, "Vik", 4, ["Vik loves rain"], "Vik: bye")).toContain("Vik hasn't written in 4 days.");
    expect(cleanLetter("Letter: Dear Vik,\nThe cafe is quiet without you. I keep saving the window seat.\n\nAria")).toMatch(/^Dear Vik,/);
    expect(cleanLetter("ok")).toBeUndefined();
  });

  it("quotes its opening in a reply and keeps the last twenty", () => {
    expect(letterReplyDraft({ id: "l", at: NOW, text: "Dear Vik,\nIt rained." })).toBe('(Replying to your letter: "Dear Vik,") ');
    expect(addLetter(Array.from({ length: 21 }, (_, i) => ({ id: `${i}`, at: i, text: "x" })), { id: "n", at: 99, text: "y" })).toHaveLength(20);
    expect(buildLetterSection({ id: "l", at: NOW, text: "Dear Vik" }, "Vik")).toContain("While Vik was away, you wrote them this letter");
  });
});
