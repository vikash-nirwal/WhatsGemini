import { replyLengthFor, worldLanguageLine } from "./worldVoice";

test("a world's language becomes one line for every prompt", () => {
  expect(worldLanguageLine({ name: "Harbour Town", language: "Hindi" })).toContain("Everyone in Harbour Town speaks Hindi");
  expect(worldLanguageLine({ name: "Harbour Town", language: "  " })).toBeUndefined();
  expect(worldLanguageLine(undefined)).toBeUndefined();
});

test("a world's reply length wins over the setting, unless unset", () => {
  expect(replyLengthFor({ replyLengthLimit: 300 }, 800)).toBe(300);
  expect(replyLengthFor({}, 800)).toBe(800);
  expect(replyLengthFor({ replyLengthLimit: 0 }, 800)).toBe(800);
  expect(replyLengthFor(undefined, 800)).toBe(800);
});
