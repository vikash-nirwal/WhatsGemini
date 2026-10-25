// While you were away (#130): when the app opens after hours closed, the
// background jobs that would plausibly have run meanwhile - texts first,
// statuses, channel posts, profile changes - each get one turn "back then":
// a moment inside the absence, checked against their own limits (is it
// due at that time?) and stamped with it.

export const LS_LAST_SEEN = "app_last_seen";
export const AWAY_MIN_MS = 2 * 60 * 60 * 1000;

const read = (): number => {
  try {
    return Number(localStorage.getItem(LS_LAST_SEEN)) || 0;
  } catch {
    return 0;
  }
};

export const saveLastSeen = (at: number = Date.now()): void => {
  try {
    localStorage.setItem(LS_LAST_SEEN, String(at));
  } catch {
    // Only a convenience.
  }
};

// Read once per page load, before anything saves a new "last seen".
let session: { lastSeen: number; openedAt: number } | null = null;
export const awaySession = (): { lastSeen: number; openedAt: number } => {
  if (!session) session = { lastSeen: read(), openedAt: Date.now() };
  return session;
};

// Whether this opening came after a long enough absence.
export const wasAway = (): boolean => {
  const { lastSeen, openedAt } = awaySession();
  return lastSeen > 0 && openedAt - lastSeen >= AWAY_MIN_MS;
};

const claimed = new Set<string>();
// One moment in the absence for this job, once per opening (undefined when
// the app wasn't away, or the job had its turn). Somewhere in the middle,
// not right at either end.
export const catchUpTime = (job: string, random: () => number = Math.random): number | undefined => {
  if (!wasAway() || claimed.has(job)) return undefined;
  claimed.add(job);
  const { lastSeen, openedAt } = awaySession();
  return Math.round(lastSeen + (openedAt - lastSeen) * (0.25 + 0.6 * random()));
};

// For tests: forget this page load's session.
export const resetAwaySession = () => {
  session = null;
  claimed.clear();
};
