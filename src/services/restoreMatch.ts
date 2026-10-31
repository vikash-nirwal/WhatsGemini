import { Chat, Character, World } from "../types";

// Restoring a backup onto a device that already has some of it (the user's
// report, 2026-10-31): restores only ever added, so the same world, person
// or chat came back a second time beside the one already here. Now a record
// that's already here is matched and linked to instead of added again. The
// device's copy wins, as it may have moved on since the backup.

const norm = (s?: string) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

export const worldKey = (w: Pick<World, "name" | "premise">) => `${norm(w.name)}|${norm(w.premise)}`;

// Who they are, in the world they're restored into (`worldId` already moved
// onto its id here).
export const characterKey = (c: Pick<Character, "name" | "prompt" | "description" | "worldId">) =>
  `${norm(c.name)}|${norm(c.prompt)}|${norm(c.description)}|${c.worldId ?? ""}`;

// The same conversation: the same people (on their ids here) and the same
// first message. Message ids are made once, when the message is.
export const chatKey = (c: Pick<Chat, "characterIds" | "content">) => {
  const first = (c.content || []).find((m) => m.id)?.id;
  return first ? `${[...(c.characterIds || [])].sort((a, b) => a - b).join(",")}|${first}` : undefined;
};

// The same adventure: its title and first message.
export const adventureKey = (a: { title?: string; content?: { id?: string }[] }) => {
  const first = (a.content || []).find((m) => m.id)?.id;
  return first ? `${norm(a.title)}|${first}` : undefined;
};

export const indexBy = <T extends { id?: number }>(records: T[], key: (r: T) => string | undefined) => {
  const map = new Map<string, number>();
  for (const r of records) {
    const k = key(r);
    if (k && r.id != null && !map.has(k)) map.set(k, r.id);
  }
  return map;
};
