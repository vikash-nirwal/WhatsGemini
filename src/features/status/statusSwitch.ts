// Statuses on or off for the whole app (the user's ask, 2026-10-30). Off,
// characters don't post statuses or react to yours, and statuses stay out
// of chat prompts; what's already posted can still be read. On by default.
export const LS_STATUSES_ON = "statuses_on";

export const statusesOn = (): boolean => {
  try {
    return localStorage.getItem(LS_STATUSES_ON) !== "false";
  } catch {
    return true;
  }
};

export const setStatusesOn = (on: boolean): void => {
  try {
    localStorage.setItem(LS_STATUSES_ON, String(on));
  } catch {
    // Only a convenience.
  }
};
