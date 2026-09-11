import React, { useMemo, useState } from "react";
import { FaFileArchive, FaTimes } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import {
  LS_FIRST_USED_AT,
  LS_LAST_BACKUP_AT,
  LS_BACKUP_REMINDER_SNOOZE_UNTIL,
  BACKUP_REMINDER_INTERVAL_DAYS,
} from "../../utils/constants";
import { Button } from "src/components/atoms/button";
import { Alert, AlertDescription } from "src/components/atoms/alert";

const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_INTERVAL_MS = BACKUP_REMINDER_INTERVAL_DAYS * DAY_MS;

// Nudges the user to back up if it's been a while since the last one (or,
// for a user who's never backed up, since they first started using the
// app). Dismissing snoozes for the same interval rather than disabling the
// reminder outright, so it resurfaces on the same cadence instead of going
// quiet forever after one click.
const BackupReminderBanner = () => {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  const lastBackupAt = useMemo(() => Number(localStorage.getItem(LS_LAST_BACKUP_AT) || 0), []);

  const shouldShow = useMemo(() => {
    const snoozeUntil = Number(localStorage.getItem(LS_BACKUP_REMINDER_SNOOZE_UNTIL) || 0);
    if (Date.now() < snoozeUntil) return false;

    const referenceTime = lastBackupAt || Number(localStorage.getItem(LS_FIRST_USED_AT) || Date.now());
    return Date.now() - referenceTime >= REMINDER_INTERVAL_MS;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastBackupAt]);

  if (!shouldShow || dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(LS_BACKUP_REMINDER_SNOOZE_UNTIL, String(Date.now() + REMINDER_INTERVAL_MS));
    setDismissed(true);
  };

  const handleBackupNow = () => {
    setDismissed(true);
    navigate("/settings", { state: { openSection: "data" } });
  };

  return (
    <Alert className="flex items-center gap-3 rounded-none border-x-0 border-t-0 border-primary/30 bg-primary/10 px-4 py-2.5 text-[13px] flex-shrink-0">
      <span className="flex text-primary flex-shrink-0"><FaFileArchive size={14} /></span>
      <AlertDescription className="flex-1 text-foreground font-medium min-w-0">
        {lastBackupAt
          ? "It's been a while since your last backup - everything here only lives in this browser."
          : "You haven't backed up yet - everything here only lives in this browser."}
      </AlertDescription>
      <Button
        onClick={handleBackupNow}
        className="h-auto px-3 py-1.5 text-[12.5px] flex-shrink-0"
      >
        Back up now
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleDismiss}
        className="h-auto w-auto p-1.5 rounded-md flex-shrink-0"
        aria-label="Dismiss, remind me later"
        title="Remind me later"
      >
        <FaTimes size={12} />
      </Button>
    </Alert>
  );
};

export default BackupReminderBanner;
