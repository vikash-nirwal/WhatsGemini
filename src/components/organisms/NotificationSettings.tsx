import React, { useEffect, useState } from "react";
import { SettingsCard, SettingsCardHeader, SettingsRow } from "src/components/molecules/settings-card";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import {
  getNotificationStatus,
  notificationsEnabled,
  NotificationStatus,
  requestNotificationPermission,
  setNotificationsEnabled,
} from "src/features/notifications/notifications";

// What to tell the user when the switch can't do its job. iPhones and iPads
// only offer notifications to web apps added to the Home Screen, which is
// the usual reason for "unsupported" there.
const STATUS_HINT: Partial<Record<NotificationStatus, string>> = {
  denied:
    "Your browser has blocked notifications for this site. To use them, allow notifications in the browser's site settings (usually the icon next to the address bar), then come back and turn this on.",
  unsupported:
    "This browser can't show notifications. On an iPhone or iPad, add Kindred to your Home Screen first (Share › Add to Home Screen) and open it from there.",
};

const NotificationSettings: React.FC = () => {
  const [status, setStatus] = useState<NotificationStatus>(getNotificationStatus);
  const [enabled, setEnabled] = useState(notificationsEnabled);
  const [asking, setAsking] = useState(false);

  // The permission can change in the browser's own settings while the app
  // is open, so read it again whenever the user comes back to the tab.
  useEffect(() => {
    const refresh = () => setStatus(getNotificationStatus());
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const handleChange = async (on: boolean) => {
    if (!on) {
      setNotificationsEnabled(false);
      setEnabled(false);
      return;
    }
    setAsking(true);
    try {
      const result = await requestNotificationPermission();
      setStatus(result);
      const granted = result === "granted";
      setNotificationsEnabled(granted);
      setEnabled(granted);
    } finally {
      setAsking(false);
    }
  };

  // Shown as on only while it can actually work, so a permission revoked in
  // the browser doesn't leave a switch that claims otherwise.
  const checked = enabled && status === "granted";
  const blocked = status === "denied" || status === "unsupported";
  const hint = STATUS_HINT[status];

  return (
    <SettingsCard>
      <div className="p-5">
        <SettingsCardHeader title="Notifications" />
      </div>
      <SettingsRow
        label="Notify me of new messages"
        hint="When a character reaches out on its own, or a reply arrives while Kindred is in the background. With the app lock on, or discreet mode for NSFW chats, the notification only says “New message”."
        align="start"
      >
        <ToggleSwitch
          checked={checked}
          onChange={handleChange}
          disabled={asking || blocked}
          label={<span className="sr-only">Notify me of new messages</span>}
        />
        {hint && (
          <p role="status" className={`text-xs mt-2 max-w-[22rem] ${status === "denied" ? "text-destructive" : "text-subtle"}`}>
            {hint}
          </p>
        )}
      </SettingsRow>
    </SettingsCard>
  );
};

export default NotificationSettings;
