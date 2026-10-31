import { autoRepliesOn, backgroundAllowed, callsToday, countBackgroundCall, inQuietHours, livingIn, saveWorldPrefs } from "./worldPrefs";

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

describe("auto replies (2026-10-31)", () => {
  beforeEach(() => localStorage.clear());

  it("are off in Default and on in a world of yours until switched", () => {
    expect(autoRepliesOn(null)).toBe(false);
    expect(autoRepliesOn(4)).toBe(true);
    saveWorldPrefs(null, { autoReplies: true });
    saveWorldPrefs(4, { autoReplies: false });
    expect(autoRepliesOn(null)).toBe(true);
    expect(autoRepliesOn(4)).toBe(false);
  });

  it("off, nothing lives there in the background, even the world on screen", () => {
    expect(livingIn(4, 4)).toBe(true);
    saveWorldPrefs(4, { autoReplies: false });
    expect(livingIn(4, 4)).toBe(false);
    expect(livingIn(null, null)).toBe(false);
  });
});
