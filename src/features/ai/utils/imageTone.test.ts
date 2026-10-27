import { buildToneRewritePrompt, cleanToneRewrite, looksBlocked, saveTone, toneLadder, toneLevel, toneRetryOn } from "./imageTone";

test("levels are tried from the chosen one up, when retrying", () => {
  expect(toneLadder(0, true)).toEqual([0, 1, 2, 3]);
  expect(toneLadder(2, true)).toEqual([2, 3]);
  expect(toneLadder(1, false)).toEqual([1]);
  expect(toneLadder(3, true)).toEqual([3]);
});

test("the rewrite keeps the idea and says the level", () => {
  const p = buildToneRewritePrompt("two lovers in bed", 2);
  expect(p).toContain("Level 2, medium");
  expect(p).toContain("The idea of the picture must stay the same");
  expect(p).toContain("two lovers in bed");
  expect(cleanToneRewrite('Prompt: "two people resting close"', "x")).toBe('"two people resting close"');
  expect(cleanToneRewrite("ok", "fallback")).toBe("fallback");
});

test("blocked answers are recognised, and the choice is kept", () => {
  expect(looksBlocked("Your request was rejected by the safety system")).toBe(true);
  expect(looksBlocked("fal.ai error: content policy violation")).toBe(true);
  expect(looksBlocked("rate limit exceeded")).toBe(false);
  expect(toneLevel()).toBe(0);
  expect(toneRetryOn()).toBe(true);
  saveTone(2, false);
  expect(toneLevel()).toBe(2);
  expect(toneRetryOn()).toBe(false);
});

