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
  getCharacterById: async (id: number) => tables.characters.get(id),
  updateCharacter: async (c: Row) => {
    tables.characters.set(c.id!, c);
    return c.id;
  },
  patchChat: async (id: number, patch: Row) => {
    tables.chats.set(id, { ...tables.chats.get(id)!, ...patch });
    return tables.chats.get(id);
  },
  getAllAdventures: all("adventures"),
  addAdventure: add("adventures"),
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
  for (const name of ["chats", "characters", "worlds", "adventures"]) tables[name] = new Map();
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
  expect(result).toEqual({ chatsRestored: 1, charactersRestored: 2, worldsRestored: 1, adventuresRestored: 0 });
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

// Relinking (#235): with the ids taken, everything that names someone
// follows them, and the rest of the library comes along.
test("into a taken library, ties, talks, secrets, letters, what-ifs, adventures, channels and statuses follow the new ids", async () => {
  tables.characters.set(1, { id: 1, name: "Someone" });
  tables.chats.set(5, { id: 5, title: "Old" });
  settings.set("channels", [{ id: "character-9", kind: "character", refId: 9, followedAt: 0, posts: [] }]);
  const ariaB = {
    id: 1, name: "Aria", worldId: 3, ties: [{ withId: 2, tie: "your brother" }], knowsAbout: [2, 77], bonds: [{ withId: 2, closeness: 50, tension: 0, at: 0 }],
    talks: [{ id: "t", withId: 2, at: 1, lines: [{ speakerId: 2, text: "hey" }, { speakerId: 1, text: "hi" }] }],
    keptSecrets: [{ id: "s", fromId: 2, text: "the debt", at: 1 }, { id: "x", fromId: 77, text: "gone", at: 1 }],
    statuses: [{ id: "st", text: "Rain", createdAt: 1, likes: [2], comments: [{ id: "c", from: 2, text: "ugh", at: 2 }, { id: "y", from: "you", text: "same", at: 3 }] }],
  } as unknown as Character;
  const kaiB = { id: 2, name: "Kai", worldId: 3, ties: [{ withId: 1, tie: "your sister" }], letters: [{ id: "l", at: 1, text: "Dear Sam", chatId: 6 }], goal: { text: "win", setAt: 1, against: 1 } } as unknown as Character;
  const ariaChat = { id: 6, title: "Aria", characterIds: [1], worldId: 3, content: [{ role: "ai", txt: "hi", speakerId: 1, quotedStatus: { owner: 2, text: "x" } }] } as unknown as Chat;
  const flashback = { id: 7, title: "Childhood", characterIds: [1], worldId: 3, content: [], whatIf: { kind: "flashback", title: "Childhood", setting: "1999", parentChatId: 6 } } as unknown as Chat;
  await restoreLibrary({
    ...backup(),
    // Kai first, so Kai now has the lower id and must hold their talk.
    characters: [kaiB, ariaB],
    chats: [groupChat, ariaChat, flashback],
    adventures: [{ id: 1, title: "The Deep", worldId: 3, characterIds: [1, 2], status: "active", timestamp: 0, content: [{ role: "ai", txt: "Go", castEmotions: { 1: "happy" } }] } as never],
    channels: [{ id: "character-1", kind: "character", refId: 1, followedAt: 0, posts: [] }, { id: "world-3", kind: "world", refId: 3, followedAt: 0, posts: [] }],
    myStatuses: [{ id: "my", text: "Sunset", createdAt: 5, worldId: 3, views: [{ characterId: 1, at: 6 }], comments: [{ id: "m", from: 2, text: "wow", at: 7 }] }],
  });

  const by = (name: string) => Array.from(tables.characters.values()).find((c) => c.name === name)! as unknown as Character;
  const chat = (title: string) => Array.from(tables.chats.values()).find((c) => c.title === title)! as unknown as Chat;
  const aria = by("Aria"), kai = by("Kai");
  const world = Array.from(tables.worlds.values()).find((w) => w.name === "Harbour")!;
  expect(kai.id).toBe(2);
  expect(aria.id).toBe(3);
  expect(aria.ties).toEqual([{ withId: 2, tie: "your brother" }]);
  expect(kai.ties).toEqual([{ withId: 3, tie: "your sister" }]);
  expect(aria.knowsAbout).toEqual([2]);
  expect(aria.bonds?.[0].withId).toBe(2);
  expect(aria.keptSecrets).toEqual([{ id: "s", fromId: 2, text: "the debt", at: 1 }]);
  expect(aria.statuses?.[0]).toMatchObject({ likes: [2], comments: [{ from: 2 }, { from: "you" }] });
  // The talk moved to Kai, the lower id now, naming Aria and both speakers anew.
  expect(aria.talks).toEqual([]);
  expect(kai.talks).toEqual([{ id: "t", withId: 3, at: 1, lines: [{ speakerId: 2, text: "hey" }, { speakerId: 3, text: "hi" }] }]);
  expect(kai.letters?.[0].chatId).toBe(chat("Aria").id);
  expect(kai.goal?.against).toBe(3);
  expect(kai.worldId).toBe(world.id);
  expect(chat("Aria").content[0]).toMatchObject({ speakerId: 3, quotedStatus: { owner: 2 } });
  expect(chat("Childhood").whatIf?.parentChatId).toBe(chat("Aria").id);

  const adventure = Array.from(tables.adventures.values())[0] as unknown as { worldId: number; characterIds: number[]; content: { castEmotions: Record<number, string> }[] };
  expect(adventure).toMatchObject({ worldId: world.id, characterIds: [3, 2] });
  expect(adventure.content[0].castEmotions).toEqual({ 3: "happy" });
  expect((settings.get("channels") as { id: string }[]).map((c) => c.id)).toEqual(["character-9", "character-3", `world-${world.id}`]);
  expect(settings.get("my_statuses")).toEqual([{ id: "my", text: "Sunset", createdAt: 5, worldId: world.id, views: [{ characterId: 3, at: 6 }], comments: [{ id: "m", from: 2, text: "wow", at: 7 }] }]);
});

test("a backup carries adventures, channels, your statuses and every local picture", async () => {
  tables.adventures.set(1, { id: 1, title: "The Deep", content: [{ role: "ai", txt: "Go", images: ["local:scene.png"] }] });
  tables.characters.set(1, { id: 1, name: "Aria", album: [{ id: "a", image: "local:album.png" }], stickers: [{ id: "s", mood: "happy", image: "local:sticker.png" }] });
  settings.set("channels", [{ id: "character-1" }]);
  settings.set("my_statuses", [{ id: "my" }]);
  const data = await getFullBackupData();
  expect(data.adventures).toHaveLength(1);
  expect(data.channels).toEqual([{ id: "character-1" }]);
  expect(data.myStatuses).toEqual([{ id: "my" }]);
  const { localImagesIn } = require("./backupRemap");
  expect(Array.from(localImagesIn([data.characters, data.adventures]))).toEqual(["album.png", "sticker.png", "scene.png"]);
});
