import { Character } from "../../types";
import { dayKey } from "./badDays";
import { buildDayLogPrompt, buildDayLogSection, cleanDayLog, dayLogDue, dayLogFor, dayLogText, DAY_LOG_REFRESH_MS } from "./dayLog";

const HOUR = 60 * 60 * 1000;
// A Wednesday, 10 am local time.
const MORNING = new Date(2026, 9, 21, 10, 0, 0).getTime();
const aria = (extra: Partial<Character> = {}) => ({ id: 1, name: "Aria", description: "Warm.", prompt: "You are Aria.", ...extra } as Character);
const today = { date: dayKey(MORNING), text: "Aria opened the café at seven.", writtenAt: MORNING };

describe("one consistent day (#107)", () => {
  it("is due once a day from mid-morning, with the switch on", () => {
    expect(dayLogDue(aria(), MORNING)).toBe(false);
    expect(dayLogDue(aria({ dayLogs: true }), MORNING)).toBe(true);
    expect(dayLogDue(aria({ dayLogs: true }), MORNING - 3 * HOUR)).toBe(false);
    expect(dayLogDue(aria({ dayLogs: true, dayLog: today }), MORNING)).toBe(false);
    // Yesterday's log doesn't count for today.
    expect(dayLogDue(aria({ dayLogs: true, dayLog: { ...today, date: dayKey(MORNING - 24 * HOUR) } }), MORNING)).toBe(true);
    // An empty one does, so a failing model isn't asked all day.
    expect(dayLogDue(aria({ dayLogs: true, dayLog: { ...today, text: "" } }), MORNING)).toBe(false);
  });

  it("gives today's text to prompts, and nothing for another day or an empty one", () => {
    expect(dayLogFor(aria({ dayLog: today }), MORNING)).toBe(today);
    expect(dayLogText(aria({ dayLog: today }), MORNING + 24 * HOUR)).toBeUndefined();
    expect(dayLogText(aria({ dayLog: { ...today, text: "" } }), MORNING)).toBeUndefined();
    expect(buildDayLogSection("Aria", today.text)).toContain("What Aria's day has actually been like today: Aria opened the café at seven. This is the one true account");
    expect(buildDayLogSection("Aria", undefined)).toBeUndefined();
  });

  it("asks for an ordinary day in keeping with the routine, mood and yesterday", () => {
    const prompt = buildDayLogPrompt(aria(), MORNING, { routine: "Aria's routine: 7-15 the café.", dayMood: "tired", facts: ["Sam likes jazz"], yesterday: "Aria burnt the toast." });
    expect(prompt).toContain("Wednesday morning");
    expect(prompt).toContain("Aria's routine: 7-15 the café.");
    expect(prompt).toContain("Today they're tired");
    expect(prompt).toContain("Yesterday: Aria burnt the toast.");
    expect(prompt).toContain("- Sam likes jazz");
    expect(prompt).toContain("nothing about the person they text");
    expect(buildDayLogPrompt(aria(), MORNING + 10 * HOUR, { facts: [] })).toContain("Wednesday evening");
  });

  it("cleans the reply into one paragraph and drops unusable ones", () => {
    expect(cleanDayLog('```\n"Aria opened the café at seven.\nThe regulars came in late."\n```')).toBe("Aria opened the café at seven. The regulars came in late.");
    expect(cleanDayLog("Sure!")).toBeUndefined();
    expect(cleanDayLog("x".repeat(800))).toHaveLength(700);
  });
});

describe("a day log kept up to date", () => {
  it("is written again every six hours until 10 pm, not after a failed try", () => {
    expect(dayLogDue(aria({ dayLogs: true, dayLog: today }), MORNING + DAY_LOG_REFRESH_MS - 1)).toBe(false);
    expect(dayLogDue(aria({ dayLogs: true, dayLog: today }), MORNING + DAY_LOG_REFRESH_MS)).toBe(true);
    expect(dayLogDue(aria({ dayLogs: true, dayLog: { ...today, text: "" } }), MORNING + DAY_LOG_REFRESH_MS)).toBe(false);
    expect(dayLogDue(aria({ dayLogs: true, dayLog: today }), new Date(2026, 9, 21, 22, 30).getTime())).toBe(false);
  });

  it("continues the earlier account, moving what was ahead into the past", () => {
    const prompt = buildDayLogPrompt(aria(), MORNING + 8 * HOUR, { facts: [], earlier: "Aria opened the café; a delivery is due at four." });
    expect(prompt).toContain("Earlier today it went like this: Aria opened the café; a delivery is due at four.");
    expect(prompt).toContain("move what was still ahead into the past");
  });
});
