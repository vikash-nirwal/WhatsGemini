import {
  LS_AI_MODEL, LS_MAX_OUTPUT_TOKENS, LS_REPLY_LENGTH_LIMIT, LS_COMPRESS_THRESHOLD, LS_TEMPRATURE, LS_SAMPLERS, LS_ROLEPLAY_STYLE, LS_SAFETY_SETTINGS,
  LS_MAX_CHAT_LENGTH, LS_FONT_SIZE, LS_IMAGE_RESOLUTION, LS_GEMINI_IMAGE_SIZE, LS_PORTRAIT_SAVE_SIZE, LS_PORTRAIT_RESIZE_ENABLED, LS_EMOTION_PANEL_ENABLED,
  LS_EMOTION_POPUP_ENABLED, LS_EMOTION_POPUP_DURATION, LS_ALWAYS_SHOW_INITIALS, LS_TEXTING_MODE, LS_RECAP_AFTER_DAYS, LS_USER_PERSONAS, LS_ACTIVE_PERSONA_ID,
  LS_INITIAL_MESSAGES, LS_SPENDING_LEDGER, LS_SPENDING_BUDGET, LS_LAST_BACKUP_AT,
} from "../../utils/constants";
import { getSpendingSnapshot } from "../spending/spending";

// Automatic backups (#198). With no server, nothing can back up while the
// app is closed, so: a reminder when it's been a week, and - once you've
// backed up to Google Drive this visit with "daily" on - a backup to Drive
// every day while the app is open. The passphrase is kept only in memory
// until the app closes, never stored.

const DAY = 24 * 60 * 60 * 1000;
export const REMIND_AFTER_MS = 7 * DAY;
export const LS_DRIVE_AUTO = "drive_auto_backup";
const LS_REMINDED_AT = "backup_reminded_at";

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Only a convenience.
  }
};

export const lastBackupAt = () => Number(read(LS_LAST_BACKUP_AT)) || 0;
export const markBackupDone = (now: number) => write(LS_LAST_BACKUP_AT, String(now));
export const driveAutoOn = () => read(LS_DRIVE_AUTO) === "true";
export const setDriveAuto = (on: boolean) => write(LS_DRIVE_AUTO, String(on));

// A gentle reminder: a week without a backup, at most once a day, and only
// once there's something worth keeping.
export const reminderDue = (now: number, lastAt: number, remindedAt: number, chatCount: number) =>
  chatCount >= 2 && now - lastAt >= REMIND_AFTER_MS && now - remindedAt >= DAY;
export const remindedAt = () => Number(read(LS_REMINDED_AT)) || 0;
export const markReminded = (now: number) => write(LS_REMINDED_AT, String(now));

export const driveBackupDue = (now: number, lastAt: number) => now - lastAt >= DAY;

// The same settings the full backup carries, read from where they're kept,
// for a backup made outside the Settings page.
const SETTINGS_KEYS = [
  LS_AI_MODEL, LS_MAX_OUTPUT_TOKENS, LS_REPLY_LENGTH_LIMIT, LS_COMPRESS_THRESHOLD, LS_TEMPRATURE, LS_SAMPLERS, LS_ROLEPLAY_STYLE, LS_SAFETY_SETTINGS,
  LS_MAX_CHAT_LENGTH, LS_FONT_SIZE, LS_IMAGE_RESOLUTION, LS_GEMINI_IMAGE_SIZE, LS_PORTRAIT_SAVE_SIZE, LS_PORTRAIT_RESIZE_ENABLED, LS_EMOTION_PANEL_ENABLED,
  LS_EMOTION_POPUP_ENABLED, LS_EMOTION_POPUP_DURATION, LS_ALWAYS_SHOW_INITIALS, LS_TEXTING_MODE, LS_RECAP_AFTER_DAYS, LS_USER_PERSONAS, LS_ACTIVE_PERSONA_ID,
  LS_INITIAL_MESSAGES,
];
export const settingsFromStorage = () => ({
  ...Object.fromEntries(SETTINGS_KEYS.map((k) => {
    const raw = read(k);
    if (raw == null) return [k, undefined];
    try {
      return [k, JSON.parse(raw)];
    } catch {
      return [k, raw];
    }
  })),
  [LS_SPENDING_LEDGER]: getSpendingSnapshot().ledger,
  [LS_SPENDING_BUDGET]: getSpendingSnapshot().budget,
});
