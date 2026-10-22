import { latestMood, tintFor } from "./moodTint";

describe("mood-tinted chat (#90)", () => {
  it("has a colour for the clear moods and none for neutral", () => {
    expect(tintFor("Sad")).toBe("90 130 220");
    expect(tintFor("neutral")).toBeUndefined();
    expect(tintFor(undefined)).toBeUndefined();
  });

  it("takes the newest mood a reply carried", () => {
    expect(latestMood([{ role: "ai", emotion: "happy" }, { role: "you" }, { role: "ai" }, { role: "ai", emotion: "sad" }])).toBe("sad");
    expect(latestMood([{ role: "ai", emotion: "happy" }, { role: "you", emotion: "angry" }])).toBe("happy");
  });
});
