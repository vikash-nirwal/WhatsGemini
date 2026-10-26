// Android background sync (#201). On Chrome for Android, an installed app
// can ask to be woken now and then (at the browser's pace, around twice a
// day at best). The service worker can't run the app's AI or read your API
// key, so a wake-up only does what's true from your saved data: a plan
// that's tomorrow gets a reminder, and after a quiet day, a nudge that
// catch-up is waiting. No imports beyond types: the service worker uses it.

export const SYNC_TAG = "kindred-tick";
export const SYNC_MIN_INTERVAL_MS = 12 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

interface ChatLike {
  id?: number;
  title?: string;
  content?: { timestamp?: number }[];
  groupPlan?: { title: string; date?: string; outcome?: string; remindedAt?: number };
}

export interface WakeNotice {
  title: string;
  body: string;
  path: string;
  tag: string;
}

const localDate = (now: number, plusDays = 0) => {
  const d = new Date(now + plusDays * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// What to show on a wake-up. `remindedPlans`: plan chats already reminded by
// a wake-up; `nudgedAt`: the last nudge.
export const wakeNotices = (chats: ChatLike[], now: number, remindedPlans: number[], nudgedAt: number): WakeNotice[] => {
  const tomorrow = localDate(now, 1);
  const notices: WakeNotice[] = chats
    .filter((c) => c.id != null && c.groupPlan?.date === tomorrow && !c.groupPlan.outcome && !c.groupPlan.remindedAt && !remindedPlans.includes(c.id))
    .map((c) => ({ title: `Tomorrow: ${c.groupPlan!.title}`, body: "Your group is getting ready. Open the chat to see who's bringing what.", path: `/chat/${c.id}`, tag: `plan-${c.id}` }));
  const latest = Math.max(0, ...chats.flatMap((c) => (c.content || []).map((m) => m.timestamp || 0)));
  if (latest && now - latest >= DAY && now - nudgedAt >= DAY) {
    notices.push({ title: "Your worlds kept going", body: "It's been a while. Open Kindred to catch up on what happened.", path: "/", tag: "kindred-nudge" });
  }
  return notices;
};

// From the page: ask to be woken, where it's possible - Chrome on Android,
// the installed app, notifications on. Quietly does nothing elsewhere.
export const askForWakeUps = async () => {
  try {
    if (!("serviceWorker" in navigator)) return false;
    const registration = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & { periodicSync?: { register: (tag: string, opts: { minInterval: number }) => Promise<void> } };
    if (!registration.periodicSync) return false;
    const status = await navigator.permissions.query({ name: "periodic-background-sync" as PermissionName });
    if (status.state !== "granted") return false;
    await registration.periodicSync.register(SYNC_TAG, { minInterval: SYNC_MIN_INTERVAL_MS });
    return true;
  } catch {
    return false;
  }
};
