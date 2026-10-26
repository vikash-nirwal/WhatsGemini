import { Character, Faction, World } from "../../types";

// World export and import (#172): a whole world - premise, lore, map,
// calendar, groups, and its people with how they're tied - as one file, to
// share or to start fresh. Only the world as written travels: nothing they
// lived through (memories, chats, statuses, talk, secrets), and no pictures
// stored on this device ("local:" refs), which the other side couldn't open.

export const WORLD_FILE_KIND = "kindred-world";

// What they lived through here, left behind.
const LIVED: (keyof Character)[] = [
  "id", "worldId", "cardOf", "ties", "knowsAbout", "talks", "memory", "pinnedMemory", "memoryCategories", "memoryDates", "memoryStanding",
  "diary", "statuses", "lifeEvents", "keptSecrets", "dayLog", "concerns", "concernsWrittenAt", "firstTexts", "lastDreamAt", "dayMood",
] as (keyof Character)[];

// Drops this device's picture refs, however deep they sit.
const portable = <T,>(value: T): T => {
  if (typeof value === "string") return (value.startsWith("local:") ? undefined : value) as T;
  if (Array.isArray(value)) return value.map(portable).filter((v) => v !== undefined) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, portable(v)]).filter(([, v]) => v !== undefined)) as T;
  }
  return value;
};

export interface WorldFile {
  kind: typeof WORLD_FILE_KIND;
  version: 1;
  world: Omit<World, "id">;
  cast: (Partial<Character> & { name: string; key: number })[];
  ties: { a: number; b: number; tie: string }[]; // b is a's <tie>, by cast key
}

export const exportWorld = (world: World, cast: Character[]): WorldFile => {
  const { id: _id, events: _e, reputation: _r, newcomer: _n, arc: _a, lastEventCheckAt: _1, lastLifeAt: _2, lastNewcomerAt: _3, lastIntroAt: _4, lastSecretAt: _5, ...rest } = world;
  const factions = (world.factions || []).map(({ chatId: _c, ...f }) => f as Faction);
  return {
    kind: WORLD_FILE_KIND,
    version: 1,
    world: portable({ ...rest, ...(factions.length ? { factions } : {}) }),
    cast: cast.map((c) => {
      const card = Object.fromEntries(Object.entries(c).filter(([k]) => !LIVED.includes(k as keyof Character)));
      return { ...portable(card), name: c.name, key: c.id };
    }),
    ties: cast.flatMap((c) => (c.ties || []).filter((t) => cast.some((x) => x.id === t.withId)).map((t) => ({ a: c.id, b: t.withId, tie: t.tie }))),
  };
};

export const readWorldFile = (text: string): WorldFile => {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a world.");
  }
  if (data?.kind !== WORLD_FILE_KIND || !data.world?.name || !Array.isArray(data.cast)) throw new Error("That file isn't a world.");
  return data as WorldFile;
};

// After the world and its people are saved: their ties, knowing each other,
// and group memberships, on the new ids.
export const relink = (file: WorldFile, idOf: Record<number, number>) => {
  const ties: Record<number, { withId: number; tie: string }[]> = {};
  for (const t of file.ties) {
    const a = idOf[t.a], b = idOf[t.b];
    if (a === undefined || b === undefined) continue;
    (ties[a] = ties[a] || []).push({ withId: b, tie: t.tie });
  }
  const factions = (file.world.factions || []).map((f) => ({ ...f, memberIds: f.memberIds.map((id) => idOf[id]).filter((id): id is number => id !== undefined) }));
  return { ties, factions };
};

export const worldFileName = (name: string) => `${name.trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || "world"}.world.json`;
