import { backgroundAllowed, callsToday, countBackgroundCall, inQuietHours, saveWorldPrefs } from "./worldPrefs";

const at = (h: number) => new Date(2026, 9, 21, h, 30).getTime();

beforeEach(() => localStorage.clear());

test("quiet hours can run past midnight (#192)", () => {
  expect(inQuietHours([23, 8], at(23))).toBe(true);
  expect(inQuietHours([23, 8], at(3))).toBe(true);
  expect(inQuietHours([23, 8], at(12))).toBe(false);
  expect(inQuietHours([0, 7], at(6))).toBe(true);
  expect(inQuietHours(undefined, at(3))).toBe(false);
});

test("a world stops at its daily limit, counted per day (#192)", () => {
  saveWorldPrefs(4, { callCap: 2 });
  expect(backgroundAllowed(4, at(12))).toBe(true);
  countBackgroundCall(4, at(12));
  countBackgroundCall(4, at(13));
  expect(callsToday(4, at(14))).toBe(2);
  expect(backgroundAllowed(4, at(14))).toBe(false);
  expect(backgroundAllowed(4, at(14) + 86_400_000)).toBe(true);
  expect(backgroundAllowed(null, at(14))).toBe(true);
});
