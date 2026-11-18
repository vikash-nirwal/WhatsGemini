// Keeping unchanged pictures in memory once (the out-of-memory crash of
// 2026-11-18). A character is read afresh from the database each time it's
// saved (patchCharacter), several times a reply, and every read makes new
// copies of all its pictures. Old renders' event handlers keep old copies of
// the character alive, so each reply pinned more copies of 100 MB of
// pictures until the tab ran out of memory. A fresh copy now reuses every
// large value the previous one already had, so old copies share their
// pictures and cost almost nothing to keep.

// Only long strings are compared: short ones cost nothing to keep twice.
const LARGE = 4096;

export const shareUnchanged = <T,>(prev: unknown, next: T, depth = 0): T => {
  if (prev === next || prev == null || next == null || depth > 8) return next;
  if (typeof next === "string") {
    return (typeof prev === "string" && next.length >= LARGE && prev.length === next.length && prev === next ? prev : next) as T;
  }
  if (Array.isArray(next)) {
    if (!Array.isArray(prev)) return next;
    let same = prev.length === next.length;
    const out = next.map((item, i) => {
      const kept = shareUnchanged(prev[i], item, depth + 1);
      if (kept !== prev[i]) same = false;
      return kept;
    });
    return (same ? prev : out) as T;
  }
  if (typeof next === "object") {
    if (typeof prev !== "object" || Array.isArray(prev)) return next;
    const before = prev as Record<string, unknown>;
    const after = next as Record<string, unknown>;
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(after)) {
      const kept = shareUnchanged(before[key], after[key], depth + 1);
      if (kept !== after[key]) changed = true;
      out[key] = kept;
    }
    return (changed ? out : next) as T;
  }
  return next;
};
