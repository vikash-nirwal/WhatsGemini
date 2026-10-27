import JSZip from "jszip";
import { dbService } from "./dbService";
import { Adventure, Channel, Chat, Character, Message, ConversationTree, MyStatus, UserProfile, World } from "../types";
import { IdMaps, localImagesIn, rehomeTalks, remapAdventure, remapChannel, remapCharacter, remapChat, remapMessage, remapMyStatus, remapTreeRefs, remapWorld } from "./backupRemap";
import { LS_USER_PERSONAS } from "../utils/constants";
import { appendEntry, editTimeline, loadTimeline, TimelineEntry } from "../features/world/timeline";
import { allWorldPrefs, replaceAllWorldPrefs, WorldPrefs } from "../features/world/worldPrefs";

// The old app name, kept so backups made before the rename to Kindred restore.
export const BACKUP_FILE_TYPE = "whatsgemini-backup";
export const BACKUP_FILE_VERSION = 1;
export const BACKUP_ZIP_JSON_ENTRY = "backup.json";
export const BACKUP_ZIP_IMAGES_DIR = "images";

export interface BackupData {
  type: typeof BACKUP_FILE_TYPE;
  version: typeof BACKUP_FILE_VERSION;
  exportedAt: number;
  chats: Chat[];
  characters: Character[];
  // Worlds and what's kept per world (#215). Backups made before have none
  // of these, and restore the way they always did.
  worlds?: World[];
  timelines?: Record<string, TimelineEntry[]>; // keyed by world id, or "mine" for My world
  worldPrefs?: Record<string, WorldPrefs>; // the same keys
  // Adventures, channels and your own statuses (#235). Older backups have
  // none, and restore without them as before.
  adventures?: Adventure[];
  channels?: Channel[];
  myStatuses?: MyStatus[];
}

const CHANNELS_KEY = "channels";
const MY_STATUSES_KEY = "my_statuses";

const MINE = "mine";

export const getFullBackupData = async (): Promise<BackupData> => {
  const [chats, characters, worlds, adventures, channels, myStatuses] = await Promise.all([
    dbService.getAllChats(),
    dbService.getAllCharacters(),
    dbService.getAllWorlds(),
    dbService.getAllAdventures(),
    dbService.getSetting(CHANNELS_KEY) as Promise<Channel[] | undefined>,
    dbService.getSetting(MY_STATUSES_KEY) as Promise<MyStatus[] | undefined>,
  ]);
  // Only worlds that still exist: deleting a world leaves its timeline and
  // prefs behind on this device, and they'd have nothing to restore onto.
  const keys = [MINE, ...worlds.map((w) => String(w.id))];
  const timelines: Record<string, TimelineEntry[]> = {};
  for (const key of keys) {
    const list = await loadTimeline(key === MINE ? null : Number(key));
    if (list.length) timelines[key] = list;
  }
  const prefs = allWorldPrefs();
  const worldPrefs = Object.fromEntries(keys.filter((k) => prefs[k]).map((k) => [k, prefs[k]]));
  return {
    type: BACKUP_FILE_TYPE,
    version: BACKUP_FILE_VERSION,
    exportedAt: Date.now(),
    chats,
    characters,
    worlds,
    timelines,
    worldPrefs,
    adventures,
    channels: channels || [],
    myStatuses: myStatuses || [],
  };
};

// Remaps an array of character ids (Chat.characterIds, Chat.mutedParticipantIds)
// through the old-id->new-id map, dropping any id whose character wasn't
// part of this restore (e.g. deleted before the backup was taken) rather
// than leaving a dangling reference to nothing.
export const remapIdArray = (ids: number[] | undefined, idMap: Map<number, number>): number[] | undefined =>
  ids ? ids.map((cid) => idMap.get(cid)).filter((cid): cid is number => cid != null) : undefined;

// Remaps a single message's speakerId through the same map - used for both a
// chat's flat `content` and every node's message inside its `tree`
// (branching means the same message can live in more than one place). Same
// "drop rather than dangle" rule as remapIdArray.
// It now follows every character a message names (#235: quoted statuses,
// replies, polls, contact cards, reactions, an adventure's moods), not only
// its speaker; see backupRemap.ts.
export const remapMessageSpeaker = (message: Message, idMap: Map<number, number>): Message => {
  const m = remapMessage(message, idMap);
  return message.speakerId != null && m.speakerId == null ? { ...m, speakerId: undefined } : m;
};

export const remapTree = (tree: ConversationTree | undefined, idMap: Map<number, number>): ConversationTree | undefined => remapTreeRefs(tree, idMap);

// Restores chats and characters as new records - never overwrites or collides
// with anything already in the database, so it's safe to run against a browser
// that already has data (or to import the same backup twice). Characters are
// restored first and their old->new id remapped, so restored chats keep
// pointing at the right (newly assigned) character - and so does every
// individual message's speakerId and the chat's own mutedParticipantIds,
// both of which reference character ids just as much as characterIds does
// but are easy to miss since they're nested inside `content`/`tree` rather
// than sitting on the chat record itself.
//
// With keepIds, every record keeps the id it had (the caller has checked
// none is taken), so everything nested that names a character, chat or world
// - ties, talks, secrets, timelines - still points at the right one.
// worldIdOf moves a character's or chat's world onto its restored id.
export const restoreChatsAndCharacters = async (
  chats: Chat[],
  characters: Character[],
  options: { keepIds?: boolean; worldIdOf?: (id: number | undefined) => number | undefined; worldMap?: Map<number, number> } = {}
): Promise<{ chatsRestored: number; charactersRestored: number; idMap: Map<number, number>; chatIdMap: Map<number, number> }> => {
  const { keepIds = false, worldIdOf = (id) => id, worldMap = new Map<number, number>() } = options;
  const idMap = new Map<number, number>();
  const chatIdMap = new Map<number, number>();
  const withWorld = <T extends { worldId?: number }>(record: T): T => {
    if (record.worldId == null) return record;
    const worldId = worldIdOf(record.worldId);
    if (worldId != null) return { ...record, worldId };
    const { worldId: _w, ...rest } = record;
    return rest as T;
  };

  for (const character of characters) {
    const { id: oldId, ...rest } = character;
    const newId = await dbService.addCharacter(withWorld(keepIds && oldId != null ? character : rest));
    if (oldId != null) idMap.set(oldId, newId);
  }

  let chatsRestored = 0;
  for (const chat of chats) {
    // Accepts a pre-migration backup (`characterId` scalar) alongside the
    // current `characterIds` array shape - a backup zip made before Phase 11
    // restored on a build after it shouldn't lose its character links.
    const { id, characterId, characterIds, content, tree, mutedParticipantIds, ...rest } = chat as Chat & { characterId?: number | null };
    const sourceIds = Array.isArray(characterIds) ? characterIds : (characterId != null ? [characterId] : []);

    // Everything else the chat names follows too (#235); a what-if's parent
    // chat only has its new id once every chat is in, so it waits.
    const maps: IdMaps = { characters: idMap, chats: chatIdMap, worlds: worldMap };
    const relinked = keepIds ? null : remapChat({ ...rest, characterIds: sourceIds, mutedParticipantIds, content: content || [], tree } as Chat, maps);
    const newId = await dbService.addChat(withWorld({
      ...(keepIds && id != null ? { id } : {}),
      ...rest,
      ...(relinked ? { ...relinked, whatIf: rest.whatIf } : {}),
      characterIds: remapIdArray(sourceIds, idMap) || [],
      mutedParticipantIds: remapIdArray(mutedParticipantIds, idMap),
      content: (content || []).map((m) => remapMessageSpeaker(m, idMap)),
      tree: remapTree(tree, idMap),
    }));
    if (id != null) chatIdMap.set(id, newId);
    chatsRestored++;
  }

  // Second pass, on new ids only (#235): what characters name - ties, talks
  // (moved to whichever of the two now has the lower id), who knows whom,
  // secrets, rumors, likes, a letter's chat - and a what-if's parent chat.
  if (!keepIds) {
    const maps: IdMaps = { characters: idMap, chats: chatIdMap, worlds: worldMap };
    const restored = characters.filter((c) => c.id != null && idMap.has(c.id)).map((c) => ({ ...remapCharacter(c, maps), id: idMap.get(c.id)! }));
    for (const c of rehomeTalks(restored)) {
      const saved = await dbService.getCharacterById(c.id);
      await dbService.updateCharacter({ ...saved, ...c, worldId: saved.worldId });
    }
    for (const chat of chats) {
      const parent = chat.whatIf?.parentChatId;
      const newId = chat.id != null ? chatIdMap.get(chat.id) : undefined;
      if (parent == null || newId == null) continue;
      const next = chatIdMap.get(parent);
      const { parentChatId: _p, ...whatIf } = chat.whatIf!;
      await dbService.patchChat(newId, { whatIf: next != null ? { ...whatIf, parentChatId: next } : whatIf });
    }
  }

  return { chatsRestored, charactersRestored: characters.length, idMap, chatIdMap };
};

// A timeline entry's people on their restored ids, dropping anyone who
// wasn't part of the restore (the same rule as remapIdArray).
export const remapTimelineEntry = (entry: TimelineEntry, idMap: Map<number, number>): TimelineEntry => ({
  ...entry,
  ...(entry.characterIds ? { characterIds: remapIdArray(entry.characterIds, idMap) } : {}),
  ...(entry.knownBy ? { knownBy: remapIdArray(entry.knownBy, idMap) } : {}),
  ...(entry.heard ? { heard: entry.heard.filter((h) => idMap.has(h.id) && idMap.has(h.from)).map((h) => ({ ...h, id: idMap.get(h.id)!, from: idMap.get(h.from)! })) } : {}),
  ...(entry.folded ? { folded: remapIdArray(entry.folded, idMap) } : {}),
});

// My world's timeline on this device and in the backup, as one: each entry
// once, oldest first, capped the way the timeline caps itself.
export const mergeTimelines = (here: TimelineEntry[], restored: TimelineEntry[]): TimelineEntry[] => {
  const seen = new Set(here.map((e) => e.id));
  return [...here, ...restored.filter((e) => !seen.has(e.id))].sort((a, b) => a.at - b.at).reduce(appendEntry, [] as TimelineEntry[]);
};

// Whether a backup's records can keep their ids here: true when none of its
// chats, characters or worlds would land on an id already in use, as on a
// new device or after clearing the app, the usual reason to restore.
const idsFree = <T extends { id?: number }>(here: T[], incoming: T[]) => {
  const taken = new Set(here.map((r) => r.id));
  return !incoming.some((r) => r.id != null && taken.has(r.id));
};

// Restores a whole backup (#215): worlds, then their people and chats, then
// the world's own groups, timelines and prefs on whatever ids they landed on.
// Like restoreChatsAndCharacters it only adds: My world's timeline is merged
// with this device's, and this device's own My world prefs win over the
// backup's.
export const restoreLibrary = async (
  data: BackupData
): Promise<{ chatsRestored: number; charactersRestored: number; worldsRestored: number; adventuresRestored: number }> => {
  const worlds = Array.isArray(data.worlds) ? data.worlds : [];
  const [chatsHere, charactersHere, worldsHere] = await Promise.all([dbService.getAllChats(), dbService.getAllCharacters(), dbService.getAllWorlds()]);
  const keepIds = idsFree(chatsHere, data.chats) && idsFree(charactersHere, data.characters) && idsFree(worldsHere, worlds);

  const worldMap = new Map<number, number>();
  for (const world of worlds) {
    const { id: oldId, ...rest } = world;
    const newId = await dbService.addWorld(keepIds && oldId != null ? world : rest);
    if (oldId != null) worldMap.set(oldId, newId);
  }
  // A backup from before #215 has no worlds, so its people and chats keep
  // the world id they had, as restores always did.
  const worldIdOf = (id: number | undefined) => (id == null || !Array.isArray(data.worlds) ? id : worldMap.get(id));

  const { chatsRestored, charactersRestored, idMap, chatIdMap } = await restoreChatsAndCharacters(data.chats, data.characters, { keepIds, worldIdOf, worldMap });
  const maps: IdMaps = { characters: idMap, chats: chatIdMap, worlds: worldMap };

  // Groups name their members and their group chat, and the people around
  // name whose they are, which only now have ids.
  if (!keepIds) {
    for (const world of worlds) {
      if (world.id == null || (!world.factions?.length && !world.extras?.length)) continue;
      await dbService.updateWorld({ ...remapWorld(world, maps), id: worldMap.get(world.id)! });
    }
  }

  // Adventures, channels and your statuses (#235), added beside what's here.
  // With ids kept, the maps send each id to itself, so the same code serves.
  const outerMaps = maps;
  let adventuresRestored = 0;
  const adventuresHere = Array.isArray(data.adventures) && data.adventures.length ? await dbService.getAllAdventures() : [];
  const adventureIdsTaken = new Set(adventuresHere.map((a) => a.id));
  for (const adventure of Array.isArray(data.adventures) ? data.adventures : []) {
    const { id, ...rest } = remapAdventure(adventure, outerMaps);
    await dbService.addAdventure(keepIds && id != null && !adventureIdsTaken.has(id) ? ({ id, ...rest } as Adventure) : rest);
    adventuresRestored++;
  }
  if (Array.isArray(data.channels) && data.channels.length) {
    const here: Channel[] = (await dbService.getSetting(CHANNELS_KEY)) || [];
    const incoming = data.channels.flatMap((ch) => { const next = remapChannel(ch, outerMaps); return next && !here.some((h) => h.id === next.id) ? [next] : []; });
    if (incoming.length) await dbService.setSetting(CHANNELS_KEY, [...here, ...incoming]);
  }
  if (Array.isArray(data.myStatuses) && data.myStatuses.length) {
    const here: MyStatus[] = (await dbService.getSetting(MY_STATUSES_KEY)) || [];
    const incoming = data.myStatuses.filter((s) => !here.some((h) => h.id === s.id)).map((s) => remapMyStatus(s, outerMaps));
    if (incoming.length) await dbService.setSetting(MY_STATUSES_KEY, [...here, ...incoming].sort((a, b) => a.createdAt - b.createdAt));
  }

  const targetOf = (key: string): number | null | undefined => (key === MINE ? null : worldMap.get(Number(key)));

  for (const [key, list] of Object.entries(data.timelines || {})) {
    const target = targetOf(key);
    if (target === undefined || !Array.isArray(list)) continue;
    const entries = keepIds ? list : list.map((e) => remapTimelineEntry(e, idMap));
    await editTimeline(target, (here) => (target === null ? mergeTimelines(here, entries) : entries));
  }

  if (data.worldPrefs && typeof data.worldPrefs === "object") {
    const here = allWorldPrefs();
    const next = { ...here };
    for (const [key, prefs] of Object.entries(data.worldPrefs)) {
      const target = targetOf(key);
      if (target === undefined || !prefs || typeof prefs !== "object") continue;
      if (target === null) next[MINE] = { ...prefs, ...here[MINE] };
      else next[String(target)] = prefs;
    }
    replaceAllWorldPrefs(next);
  }

  return { chatsRestored, charactersRestored, worldsRestored: worlds.length, adventuresRestored };
};


// Every `local:` picture the backup's records name, wherever it sits
// (#235: albums, stickers, mood portraits, outfits, status photos and
// adventure scenes were missing), plus the personas' pictures.
const collectLocalImageFilenames = (data: Pick<BackupData, "chats" | "characters" | "worlds" | "adventures" | "myStatuses" | "channels">, personas: UserProfile[]): string[] => {
  const found = new Set<string>();
  for (const part of [data.chats, data.characters, data.worlds, data.adventures, data.myStatuses, personas]) localImagesIn(part, found);
  return Array.from(found);
};

// Bundles chats, characters, and settings alongside the actual bytes of every
// locally-stored image they reference, so restoring on another browser/profile
// doesn't leave `local:` references pointing at nothing. Images that can't be
// read (moved, deleted, or no save directory configured) are silently skipped -
// the JSON portion of the backup still restores fine without them.
export const getFullBackupZip = async (
  settings: unknown
): Promise<{ blob: Blob; chats: Chat[]; characters: Character[]; worlds: World[]; adventures: Adventure[]; imagesIncluded: number; imagesSkipped: number }> => {
  const backupData = await getFullBackupData();
  const personas = ((settings as Record<string, unknown>)?.[LS_USER_PERSONAS] as UserProfile[] | undefined) || [];
  const filenames = collectLocalImageFilenames(backupData, personas);

  const zip = new JSZip();
  zip.file(BACKUP_ZIP_JSON_ENTRY, JSON.stringify({ ...backupData, settings }, null, 2));

  let imagesIncluded = 0;
  let imagesSkipped = 0;
  if (filenames.length > 0) {
    const dirHandle = await dbService.getSetting("image_save_directory");
    const imagesFolder = zip.folder(BACKUP_ZIP_IMAGES_DIR)!;
    for (const filename of filenames) {
      try {
        const fileHandle = await dirHandle.getFileHandle(filename);
        const file = await fileHandle.getFile();
        imagesFolder.file(filename, file);
        imagesIncluded++;
      } catch (e) {
        console.warn(`Backup: skipping unreadable local image "${filename}"`, e);
        imagesSkipped++;
      }
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, chats: backupData.chats, characters: backupData.characters, worlds: backupData.worlds || [], adventures: backupData.adventures || [], imagesIncluded, imagesSkipped };
};

export interface ParsedBackup {
  data: BackupData & { settings?: unknown };
  imageFilenames: string[];
  zip?: JSZip;
}

// Reads either a full-backup zip (new format, may bundle images) or a legacy
// full-backup .json (chats/characters/settings only) into a common shape.
export const parseBackupFile = async (file: File): Promise<ParsedBackup> => {
  const isZip = file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip";

  if (isZip) {
    const zip = await JSZip.loadAsync(file);
    const jsonEntry = zip.file(BACKUP_ZIP_JSON_ENTRY);
    if (!jsonEntry) throw new Error("Backup zip is missing backup.json");

    const data = JSON.parse(await jsonEntry.async("string"));
    if (data.type !== BACKUP_FILE_TYPE || !Array.isArray(data.chats) || !Array.isArray(data.characters)) {
      throw new Error("Not a Kindred backup file");
    }

    const imageFilenames: string[] = [];
    zip.folder(BACKUP_ZIP_IMAGES_DIR)?.forEach((relativePath, entry) => {
      if (!entry.dir) imageFilenames.push(relativePath);
    });

    return { data, imageFilenames, zip };
  }

  const data = JSON.parse(await file.text());
  if (data.type !== BACKUP_FILE_TYPE || !Array.isArray(data.chats) || !Array.isArray(data.characters)) {
    throw new Error("Not a Kindred backup file");
  }
  return { data, imageFilenames: [] };
};

// Restores worlds, chats and characters, then (for zip backups, when a save directory is
// currently configured) writes bundled images back to disk so `local:`
// references resolve again. Per-image failures are logged and skipped rather
// than failing the whole restore.
export const applyParsedBackup = async (
  parsed: ParsedBackup
): Promise<{ chatsRestored: number; charactersRestored: number; worldsRestored: number; adventuresRestored: number; imagesRestored: number }> => {
  const { chatsRestored, charactersRestored, worldsRestored, adventuresRestored } = await restoreLibrary(parsed.data);

  let imagesRestored = 0;
  if (parsed.zip && parsed.imageFilenames.length > 0) {
    const dirHandle = await dbService.getSetting("image_save_directory");
    if (dirHandle) {
      const imagesFolder = parsed.zip.folder(BACKUP_ZIP_IMAGES_DIR);
      for (const filename of parsed.imageFilenames) {
        try {
          const entry = imagesFolder?.file(filename);
          if (!entry) continue;
          const arrayBuffer = await entry.async("arraybuffer");
          const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(arrayBuffer);
          await writable.close();
          imagesRestored++;
        } catch (e) {
          console.warn(`Restore: failed to write local image "${filename}"`, e);
        }
      }
    }
  }

  return { chatsRestored, charactersRestored, worldsRestored, adventuresRestored, imagesRestored };
};
