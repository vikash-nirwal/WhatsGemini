import { Message } from "../../types";
import { buildOnThisDayNote, milestoneOn, momentsOnThisDay } from "./onThisDay";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const msg = (id: string, role: string, timestamp: number, extra: Partial<Message> = {}): Message => ({ id, role, txt: "hi", timestamp, ...extra } as Message);

describe("on this day", () => {
  it("finds a month, 100 days and each year, and nothing in between", () => {
    const start = at(2025, 1, 15, 22);
    expect(milestoneOn(start, at(2025, 2, 15, 8))).toBe("one month");
    expect(milestoneOn(start, at(2025, 4, 25))).toBe("100 days");
    expect(milestoneOn(start, at(2026, 1, 15))).toBe("one year");
    expect(milestoneOn(start, at(2027, 1, 15))).toBe("two years");
    expect(milestoneOn(start, at(2025, 2, 16))).toBeUndefined();
    expect(milestoneOn(start, at(2025, 1, 15, 23))).toBeUndefined();
  });

  it("puts a month after the 31st on the month's last day", () => {
    expect(milestoneOn(at(2025, 1, 31), at(2025, 2, 28))).toBe("one month");
  });

  it("counts the first chat and each chapter's end", () => {
    const messages = [msg("a", "ai", at(2025, 10, 22)), msg("b", "you", at(2025, 10, 22)), msg("c", "ai", at(2026, 7, 14), { chapterTitle: "The Storm", isCompressionSummary: true })];
    expect(momentsOnThisDay(messages, at(2026, 10, 22)).map((m) => [m.what, m.milestone])).toEqual([["your first chat", "one year"], ["the end of the chapter \"The Storm\"", "100 days"]]);
  });

  it("asks once, until the character's first reply of the day", () => {
    const messages = [msg("a", "ai", at(2025, 10, 22)), msg("b", "you", at(2026, 10, 22, 9))];
    const note = buildOnThisDayNote(messages, "Sam", at(2026, 10, 22, 10));
    expect(note).toContain("one year today since your first chat with Sam (October 22, 2025)");
    expect(buildOnThisDayNote([...messages, msg("c", "ai", at(2026, 10, 22, 9))], "Sam", at(2026, 10, 22, 10))).toBeUndefined();
    expect(buildOnThisDayNote(messages, "Sam", at(2026, 10, 23))).toBeUndefined();
  });
});
