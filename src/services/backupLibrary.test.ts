import { getFullBackupData, mergeTimelines, restoreLibrary, BackupData } from "./backupService";
import { allWorldPrefs, saveWorldPrefs } from "../features/world/worldPrefs";
import { TimelineEntry } from "../features/world/timeline";
import { Chat, Character, World } from "../types";

// Worlds, their timelines and their prefs in the full backup (#215), against
// an in-memory stand-in for the database that hands out ids the way Dexie's
// ++id tables do (the given one if any, else one past the highest).
type Row = { id?: number; [k: string]: unknown };
const tables: Record<string, Map<number, Row>> = {};
const settings = new Map<string, unknown>();
const add = (name: string) => async (row: Row) => {
  const table = tables[name];
  const id = row.id ?? Math.max(0, ...Array.from(table.keys())) + 1;
  if (table.has(id)) throw new Error("Key already exists");
  table.set(id, { ...row, id });
  return id;
};
const all = (name: string) => async () => Array.from(tables[name].values());

// The factory runs lazily (on first use), by when mockDb is set.
jest.mock("./dbService", () => ({
  dbService: new Proxy({}, { get: (_t, name: string) => (...a: unknown[]) => mockDb[name](...a) }),
}));
const mockDb: Record<string, (...a: any[]) => Promise<unknown>> = {
  getAllChats: all("chats"),
  getAllCharacters: all("characters"),
  getAllWorlds: all("worlds"),
  addChat: add("chats"),
  addCharacter: add("characters"),
  addWorld: add("worlds"),
  updateWorld: async (w: Row) => {
    tables.worlds.set(w.id!, w);
    return w.id;
  },
  getSetting: async (key: string) => settings.get(key),
  setSetting: async (key: string, value: unknown) => void settings.set(key, value),
};

const entry = (id: string, at: number, extra: Partial<TimelineEntry> = {}): TimelineEntry => ({ id, at, kind: "talk", text: id, ...extra });

const world = { id: 3, name: "Harbour", premise: "A port.", factions: [{ id: "f", name: "The Vales", kind: "family", memberIds: [1, 2], chatId: 5 }] } as World;
const aria = { id: 1, name: "Aria", worldId: 3, ties: [{ withId: 2, tie: "your brother" }] } as unknown as Character;
const kai = { id: 2, name: "Kai", worldId: 3 } as Character;
const groupChat = { id: 5, title: "The Vales", characterIds: [1, 2], content: [], worldId: 3 } as unknown as Chat;

const backup = (): BackupData => ({
  type: "whatsgemini-backup",
  version: 1,
  exportedAt: 0,
  worlds: [world],
  characters: [aria, kai],
  chats: [groupChat],
  timelines: { "3": [entry("a", 1, { characterIds: [1, 2], heard: [{ id: 2, from: 1, at: 1 }] })], mine: [entry("m", 2)] },
  worldPrefs: { "3": { events: true, callCap: 40 }, mine: { secrets: true, talkLength: 6 } },
});

beforeEach(() => {
  for (const name of ["chats", "characters", "worlds"]) tables[name] = new Map();
  settings.clear();
  localStorage.clear();
});

test("a backup carries every world, its timeline and its prefs, but not a deleted world's", async () => {
  tables.worlds.set(3, world as unknown as Row);
  settings.set("world_timeline_3", [entry("a", 1)]);
  settings.set("world_timeline_9", [entry("gone", 1)]);
  saveWorldPrefs(3, { events: true });
  saveWorldPrefs(9, { drift: true });
  saveWorldPrefs(null, { peek: true });
  const data = await getFullBackupData();
  expect(data.worlds).toEqual([world]);
  expect(data.timelines).toEqual({ "3": [entry("a", 1)] });
  expect(data.worldPrefs).toEqual({ "3": { events: true }, mine: { peek: true } });
});

test("on an empty device everything keeps its id, so nested references hold", async () => {
  const result = await restoreLibrary(backup());
  expect(result).toEqual({ chatsRestored: 1, charactersRestored: 2, worldsRestored: 1 });
  expect(tables.worlds.get(3)).toEqual(world);
  expect(tables.characters.get(1)).toMatchObject({ worldId: 3, ties: [{ withId: 2, tie: "your brother" }] });
  expect(tables.chats.get(5)).toMatchObject({ worldId: 3, characterIds: [1, 2] });
  expect(settings.get("world_timeline_3")).toEqual(backup().timelines!["3"]);
  expect(allWorldPrefs()).toEqual({ "3": { events: true, callCap: 40 }, mine: { secrets: true, talkLength: 6 } });
});

test("into a library that has those ids, worlds and what hangs off them move to the new ids", async () => {
  tables.worlds.set(3, { id: 3, name: "Mine already" });
  tables.characters.set(1, { id: 1, name: "Someone" });
  tables.chats.set(5, { id: 5, title: "Old" });
  saveWorldPrefs(3, { drift: true });
  saveWorldPrefs(null, { talkLength: 12 });
  settings.set("world_timeline_mine", [entry("here", 5)]);

  await restoreLibrary(backup());

  const restored = Array.from(tables.worlds.values()).find((w) => w.name === "Harbour")!;
  expect(restored.id).toBe(4);
  const ariaNow = Array.from(tables.characters.values()).find((c) => c.name === "Aria")!;
  const kaiNow = Array.from(tables.characters.values()).find((c) => c.name === "Kai")!;
  const chatNow = Array.from(tables.chats.values()).find((c) => c.title === "The Vales")!;
  expect(ariaNow.worldId).toBe(4);
  expect(chatNow).toMatchObject({ worldId: 4, characterIds: [ariaNow.id, kaiNow.id] });
  expect((restored.factions as World["factions"])![0]).toMatchObject({ memberIds: [ariaNow.id, kaiNow.id], chatId: chatNow.id });
  expect(settings.get("world_timeline_4")).toEqual([entry("a", 1, { characterIds: [ariaNow.id as number, kaiNow.id as number], heard: [{ id: kaiNow.id as number, from: ariaNow.id as number, at: 1 }] })]);
  // The world already here keeps its own prefs; My world's choices made on
  // this device win, and the backup fills in the rest; the timelines merge.
  expect(allWorldPrefs()).toEqual({ "3": { drift: true }, "4": { events: true, callCap: 40 }, mine: { secrets: true, talkLength: 12 } });
  expect((settings.get("world_timeline_mine") as TimelineEntry[]).map((e) => e.id)).toEqual(["m", "here"]);
});

test("a backup from before worlds were in it restores as it always did", async () => {
  const { worlds: _w, timelines: _t, worldPrefs: _p, ...old } = backup();
  await restoreLibrary(old as BackupData);
  expect(tables.worlds.size).toBe(0);
  expect(tables.characters.get(1)).toMatchObject({ worldId: 3 });
  expect(allWorldPrefs()).toEqual({});
});

test("merging timelines keeps each entry once, oldest first", () => {
  expect(mergeTimelines([entry("b", 2), entry("c", 3)], [entry("a", 1), entry("b", 2)]).map((e) => e.id)).toEqual(["a", "b", "c"]);
});
