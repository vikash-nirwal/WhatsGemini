import { ChatMood } from "../../types";
import { buildMoodSection, describeMood, FADE_MS, fadedMood, moodAfterReply } from "./lingeringMood";

const NOW = new Date(2026, 9, 21, 21, 0, 0).getTime();
const HOUR = 60 * 60 * 1000;

describe("moods that carry over (#106)", () => {
  it("starts from a lingering emotion, stronger for a bad one, with what you said as the cause", () => {
    const angry = moodAfterReply(undefined, "angry", "  you never   listen to me ", NOW);
    expect(angry).toEqual({ feeling: "angry", intensity: 2, cause: "you never listen to me", since: NOW, updatedAt: NOW });
    expect(moodAfterReply(undefined, "happy", "good news!", NOW)?.intensity).toBe(1);
    expect(moodAfterReply(undefined, "neutral", "hi", NOW)).toBeUndefined();
    expect(moodAfterReply(undefined, "thinking", "hi", NOW)).toBeUndefined();
    expect(moodAfterReply(undefined, undefined, "hi", NOW)).toBeUndefined();
  });

  it("fades a step every few hours and is gone after", () => {
    const mood: ChatMood = { feeling: "sad", intensity: 2, since: NOW, updatedAt: NOW };
    expect(fadedMood(mood, NOW + HOUR)).toBe(mood);
    expect(fadedMood(mood, NOW + FADE_MS)?.intensity).toBe(1);
    expect(fadedMood(mood, NOW + 2 * FADE_MS)).toBeUndefined();
    expect(fadedMood(undefined, NOW)).toBeUndefined();
  });

  it("deepens with the same feeling, lifts a step with warmth, and is replaced by a new one", () => {
    const sad = moodAfterReply(undefined, "sad", "my dog died", NOW)!;
    const sadder = moodAfterReply(sad, "sad", "and then", NOW + HOUR)!;
    expect(sadder.intensity).toBe(3);
    expect(sadder.cause).toBe("my dog died");
    expect(sadder.since).toBe(NOW);
    const lifted = moodAfterReply(sadder, "happy", "I'm here for you", NOW + 2 * HOUR)!;
    expect(lifted).toMatchObject({ feeling: "sad", intensity: 2 });
    // A single trace of sadness goes with one kind turn.
    expect(moodAfterReply({ ...sad, intensity: 1 }, "happy", "hug", NOW + HOUR)).toBeUndefined();
    // A bad turn cuts a good mood short.
    const happy = moodAfterReply(undefined, "excited", "we got the tickets", NOW)!;
    expect(moodAfterReply(happy, "angry", "I sold them", NOW + HOUR)).toMatchObject({ feeling: "angry", intensity: 2, cause: "I sold them" });
    // Caps at the top.
    expect(moodAfterReply(sadder, "sad", "x", NOW + HOUR)!.intensity).toBe(3);
    // A passing emotion leaves the mood to fade on its own.
    expect(moodAfterReply(sadder, "surprised", "x", NOW + HOUR + FADE_MS)!.intensity).toBe(2);
  });

  it("writes the note and the panel line", () => {
    const mood: ChatMood = { feeling: "embarrassed", intensity: 1, cause: "nice singing", since: NOW - 2 * HOUR, updatedAt: NOW - 2 * HOUR };
    const note = buildMoodSection("Aria", mood, "Sam", NOW);
    expect(note).toContain("Earlier (2 hours ago) Aria was embarrassed, after Sam said: \"nice singing\"");
    expect(note).toContain("mostly faded");
    expect(note).not.toContain("warmth from Sam");
    expect(buildMoodSection("Aria", { ...mood, intensity: 3, cause: undefined }, "Sam", NOW)).toContain("Aria was embarrassed. It's still very much there");
    expect(describeMood(mood, NOW)).toBe("Still a bit embarrassed · since 2 hours ago");
    expect(describeMood({ ...mood, intensity: 3, since: NOW - 30_000 }, NOW)).toBe("Still very embarrassed · since 1 minute ago");
  });
});
