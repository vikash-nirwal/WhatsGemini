import { moodTone } from "./speech";

describe("mood-aware voice (#76)", () => {
  it("nudges the character's own rate and pitch with the mood", () => {
    expect(moodTone({ rate: 1, pitch: 1 }, "sad")).toEqual({ rate: 0.85, pitch: 0.9 });
    expect(moodTone({ rate: 1.8, pitch: 1 }, "excited")).toEqual({ rate: 2, pitch: 1.12 });
    expect(moodTone(undefined, "neutral")).toEqual({ rate: 1, pitch: 1 });
  });

  it("can be switched off per character", () => {
    expect(moodTone({ rate: 1.2, pitch: 0.8, flatTone: true }, "happy")).toEqual({ rate: 1.2, pitch: 0.8 });
  });
});
