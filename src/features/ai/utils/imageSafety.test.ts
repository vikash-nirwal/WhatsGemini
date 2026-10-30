import { imageSafetyFor } from "./imageSafety";

const harm = { harassment: "BLOCK_NONE", hate_speech: "BLOCK_NONE", sexual: "BLOCK_NONE", dangerous: "BLOCK_NONE" };

test("on and off are passed through whoever is in the picture", () => {
  expect(imageSafetyFor(harm, true).falSafetyChecker).toBeUndefined();
  expect(imageSafetyFor({ ...harm, falSafetyChecker: false }, false).falSafetyChecker).toBe(false);
});

test("off for 18+ characters is off only when everyone is an adult character", () => {
  const adults = { ...harm, falSafetyChecker: "adults" as const };
  expect(imageSafetyFor(adults, true).falSafetyChecker).toBe(false);
  expect(imageSafetyFor(adults, false).falSafetyChecker).toBe(true);
  expect(imageSafetyFor(adults).falSafetyChecker).toBe(true);
});
