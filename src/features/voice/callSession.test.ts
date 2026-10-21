import { buildCallSection, callStatusText, formatCallTime } from "./callSession";

describe("call helpers", () => {
  it("formats the call length", () => {
    expect(formatCallTime(0)).toBe("0:00");
    expect(formatCallTime(75)).toBe("1:15");
    expect(formatCallTime(3725)).toBe("1:02:05");
  });

  it("tells the character to talk, not write", () => {
    expect(buildCallSection("Aria")).toContain("no *actions* or narration");
  });

  it("describes each phase", () => {
    expect(callStatusText("thinking", "Aria")).toBe("Aria is thinking...");
    expect(callStatusText("unavailable", "Aria")).toContain("can't listen or speak");
  });
});
