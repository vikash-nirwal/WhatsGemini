import { driveBackupDue, settingsFromStorage } from "./autoBackup";
import { LS_TEXTING_MODE, LS_USER_PERSONAS } from "../../utils/constants";

const DAY = 86_400_000;

test("a daily Drive backup comes due a day after the last (#198)", () => {
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

test("the life dial goes in the daily backup too (#215)", () => {
  localStorage.setItem("life_dial", "lively");
  expect((settingsFromStorage() as Record<string, unknown>).life_dial).toBe("lively");
  // And comes back on restore, unless the value is one the dial can't show.
  const { restoreLifeDial, loadLifeDial } = require("../life/lifeDial");
  restoreLifeDial("quiet");
  restoreLifeDial("frantic");
  expect(loadLifeDial()).toBe("quiet");
});
