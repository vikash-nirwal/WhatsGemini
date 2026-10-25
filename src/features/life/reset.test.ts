import { restartStoryTime, withoutProgress } from "./reset";
import { setStoryDate, skipStoryTime, newStoryTime, formatStoryDate } from "../world/storyTime";
import { Chat } from "../../types";

describe("reset (#158)", () => {
  it("a chat keeps its messages and settings but forgets what it learned", () => {
    const chat = { id: 1, title: "Aria", timestamp: 1, content: [{ role: "you", txt: "hi" }], characterIds: [1], textingMode: true, memory: ["tea"], memoryStanding: { text: "warm", at: 1 }, stage: "dating", plans: [] } as unknown as Chat;
    expect(withoutProgress(chat)).toEqual({ id: 1, title: "Aria", timestamp: 1, content: [{ role: "you", txt: "hi" }], characterIds: [1], textingMode: true });
  });

  it("story time goes back to the date it was set to, not to skips", () => {
    const T0 = new Date(2026, 9, 21, 12).getTime();
    const set = setStoryDate({ ...newStoryTime(T0), daysPerMonth: 10, months: ["A", "B", "C"] }, { year: 312, monthIndex: 1, day: 4 }, T0);
    const later = skipStoryTime(set, 30, T0 + 5 * 86_400_000);
    expect(formatStoryDate(later, T0 + 5 * 86_400_000)).toBe("Year 313, B, day 9");
    expect(formatStoryDate(restartStoryTime(later, T0 + 9 * 86_400_000), T0 + 9 * 86_400_000)).toBe("Year 312, B, day 4");
  });
});
