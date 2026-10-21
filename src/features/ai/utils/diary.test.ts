import { appendDiaryEntry, buildDiaryPrompt, buildDiarySection, cleanDiaryEntry } from "./diary";
import { MAX_DIARY_ENTRIES } from "../../../utils/constants";

describe("diary", () => {
  it("asks for a first-person entry in the character's voice", () => {
    const prompt = buildDiaryPrompt("Mira", "Arin", "Arin: hi", { id: "1", timestamp: 0, text: "Yesterday was odd." });
    expect(prompt).toContain("You are Mira");
    expect(prompt).toContain("how you feel about Arin");
    expect(prompt).toContain("Yesterday was odd.");
    expect(prompt).toContain("Arin: hi");
  });

  it("in a group chat, writes about the group as this member saw it", () => {
    const prompt = buildDiaryPrompt("Mira", "Arin", "Kai: hey", undefined, ["Kai", "Lin"]);
    expect(prompt).toContain("about the group conversation below with Arin and Kai, Lin");
    expect(prompt).toContain("how you feel about Arin and the others");
  });

  it("cleans headings, salutations and wrapping quotes", () => {
    expect(cleanDiaryEntry("# Entry\n\nDear diary,\nToday he smiled.")).toBe("Today he smiled.");
    expect(cleanDiaryEntry('"Today he smiled."')).toBe("Today he smiled.");
  });

  it("keeps at most MAX_DIARY_ENTRIES, dropping the oldest", () => {
    const full = Array.from({ length: MAX_DIARY_ENTRIES }, (_, i) => ({ id: String(i), timestamp: i, text: `entry ${i}` }));
    const next = appendDiaryEntry(full, { id: "new", timestamp: 999, text: "newest" });
    expect(next).toHaveLength(MAX_DIARY_ENTRIES);
    expect(next[0].id).toBe("1");
    expect(next[next.length - 1].id).toBe("new");
  });

  it("puts only the newest entry in the prompt", () => {
    const section = buildDiarySection([{ id: "a", timestamp: 1, text: "old" }, { id: "b", timestamp: 2, text: "new thoughts" }]);
    expect(section).toContain("new thoughts");
    expect(section).not.toContain("old");
    expect(buildDiarySection([])).toBeUndefined();
  });
});
