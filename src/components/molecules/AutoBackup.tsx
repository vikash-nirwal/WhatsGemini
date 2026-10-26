import { useEffect, useRef } from "react";
import { driveAutoOn, driveBackupDue, lastBackupAt, markBackupDone, settingsFromStorage } from "src/features/backup/autoBackup";
import { cachedDriveToken, encryptBackup, pruneDriveBackups, rememberedPassphrase, uploadDriveBackup } from "src/services/driveBackup";

const CHECK_EVERY_MS = 30 * 60 * 1000;
const FIRST_CHECK_MS = 90 * 1000;

// Automatic backups (#198): when switched on, a daily backup to Google
// Drive while the app is open - only with this visit's sign-in and
// passphrase, so it never asks on its own. (Reminders to back up are the
// BackupReminderBanner's.)
const AutoBackup = () => {
  const busy = useRef(false);

  useEffect(() => {
    const check = async () => {
      if (busy.current) return;
      const now = Date.now();
      const token = cachedDriveToken();
      const passphrase = rememberedPassphrase();
      if (driveAutoOn() && token && passphrase && driveBackupDue(now, lastBackupAt())) {
        busy.current = true;
        try {
          const { getFullBackupZip } = await import("src/services/backupService");
          const { blob } = await getFullBackupZip(settingsFromStorage());
          const sealed = await encryptBackup(await blob.arrayBuffer(), passphrase);
          await uploadDriveBackup(token, sealed, `kindred_backup_${new Date(now).toISOString().replace(/[:.]/g, "-")}.wgbk`);
          await pruneDriveBackups(token).catch(() => 0);
          markBackupDone(now);
        } catch (err) {
          console.warn("Daily Drive backup failed (non-fatal):", err);
        } finally {
          busy.current = false;
        }
      }
    };
    const first = window.setTimeout(() => void check(), FIRST_CHECK_MS);
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  return null;
};

export default AutoBackup;
