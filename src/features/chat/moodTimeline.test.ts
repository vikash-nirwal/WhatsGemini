import { moodPoints, summarizeMoods } from "./moodTimeline";
import { Message } from "../../types";

const reply = (emotion: string | undefined, i: number, speakerId = 1): Message => ({ id: `r${i}`, role: "ai", txt: "x", emotion, timestamp: i * 1000, speakerId });

describe("moodPoints", () => {
  it("takes the character's replies that reported a mood", () => {
    const points = moodPoints([{ role: "you", txt: "hi" }, reply("happy", 1), reply(undefined, 2), reply("angry", 3), reply("sad", 4, 2)], 1);
    expect(points.map((p) => [p.emotion, p.score])).toEqual([["happy", 2], ["angry", -3]]);
  });

  it("counts an unknown custom mood as neutral", () => {
    expect(moodPoints([reply("wistful", 1)])[0].score).toBe(0);
  });
});

describe("summarizeMoods", () => {
  it("finds the most common mood", () => {
    const s = summarizeMoods(moodPoints([reply("happy", 1), reply("happy", 2), reply("sad", 3)]));
    expect(s.topMood).toBe("happy");
    expect(s.topShare).toBeCloseTo(2 / 3);
  });

  it("calls the trend from recent replies against earlier ones", () => {
    const warming = ["angry", "sad", "annoyed", "happy", "flirty", "excited"].map((e, i) => reply(e, i));
    expect(summarizeMoods(moodPoints(warming)).trend).toBe("warmer");
    const steady = ["happy", "happy", "happy", "happy", "happy", "happy"].map((e, i) => reply(e, i));
    expect(summarizeMoods(moodPoints(steady)).trend).toBe("steady");
    expect(summarizeMoods(moodPoints(steady.slice(0, 4))).trend).toBeUndefined();
  });
});
