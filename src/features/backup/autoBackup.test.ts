import { driveBackupDue, reminderDue, settingsFromStorage } from "./autoBackup";
import { LS_TEXTING_MODE, LS_USER_PERSONAS } from "../../utils/constants";

const DAY = 86_400_000;

test("a reminder after a week without a backup, once a day, when there's something to keep (#198)", () => {
  expect(reminderDue(8 * DAY, 0, 0, 3)).toBe(true);
  expect(reminderDue(8 * DAY, 2 * DAY, 0, 3)).toBe(false);
  expect(reminderDue(8 * DAY, 0, 7.5 * DAY, 3)).toBe(false);
  expect(reminderDue(8 * DAY, 0, 0, 1)).toBe(false);
  expect(driveBackupDue(2 * DAY, DAY / 2)).toBe(true);
  expect(driveBackupDue(DAY, DAY / 2)).toBe(false);
});

test("settings come from where they're kept", () => {
  localStorage.setItem(LS_TEXTING_MODE, "true");
  localStorage.setItem(LS_USER_PERSONAS, JSON.stringify([{ id: "p", name: "Sam" }]));
  const s = settingsFromStorage() as Record<string, unknown>;
  expect(s[LS_TEXTING_MODE]).toBe(true);
  expect(s[LS_USER_PERSONAS]).toEqual([{ id: "p", name: "Sam" }]);
});
