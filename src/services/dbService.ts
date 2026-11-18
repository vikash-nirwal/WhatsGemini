import Dexie, { Table } from "dexie";
import { DB_NAME } from "../utils/constants";
import { Chat, Character, World, Adventure } from "../types";
import { blobToDataUrl, chatHasInlineMedia, dataUrlToBlob, inlineChatMedia, isMediaRef, MEDIA_PREFIX, mediaIdFor, mediaIdOf, moveChatMedia, shouldMove } from "../features/media/mediaRefs";

// A picture or video kept apart from its chat (features/media/mediaRefs.ts).
export interface MediaRecord {
  id: string;
  blob: Blob;
  createdAt: number;
}

class KindredDB extends Dexie {
  chats!: Table<Chat, number>;
  characters!: Table<Character, number>;
  worlds!: Table<World, number>;
  adventures!: Table<Adventure, number>;
  settings!: Table<{ key: string, value: any }, string>;
  media!: Table<MediaRecord, string>;

  constructor() {
    super(DB_NAME);
    this.version(4).stores({
      chats: "++id, title, timestamp, content, characterId",
      characters: "++id, name, description, prompt, relationship, appearance, avatar",
      settings: "key",
    }).upgrade(tx => {
      // Upgrade logic if needed from v3 to v4
    });
    // Phase 11: Chat.characterId (scalar) -> Chat.characterIds (array), so a
    // chat can hold more than one character (multi-character rooms, Phase
    // 12). `*characterIds` is a Dexie multi-entry index - `.where("characterIds")`
    // matches any chat whose array contains the given id, the array
    // equivalent of the old single-value `characterId` index. The legacy
    // `characterId` field is left in place on existing rows (unused by the
    // app from here on, but harmless) rather than deleted, so this upgrade
    // has nothing destructive to roll back if something goes wrong.
    this.version(5).stores({
      chats: "++id, title, timestamp, content, characterId, *characterIds",
      characters: "++id, name, description, prompt, relationship, appearance, avatar",
      settings: "key",
    }).upgrade(async (tx) => {
      await tx.table("chats").toCollection().modify((chat: any) => {
        if (!Array.isArray(chat.characterIds)) {
          chat.characterIds = chat.characterId != null ? [chat.characterId] : [];
        }
      });
    });
    // Adventure mode: two brand-new tables, no data migration needed - every
    // other table's schema is just carried forward unchanged.
    this.version(6).stores({
      chats: "++id, title, timestamp, content, characterId, *characterIds",
      characters: "++id, name, description, prompt, relationship, appearance, avatar",
      worlds: "++id, name",
      adventures: "++id, title, timestamp, worldId, *characterIds, status",
      settings: "key",
    });
    // Pictures and videos kept apart from chats (the crash of 2026-11-18).
    // A new table only: existing chats are moved over after opening, one at
    // a time (moveInlineMedia), so a failure leaves a chat as it was rather
    // than the whole database unopenable.
    this.version(7).stores({
      chats: "++id, title, timestamp, content, characterId, *characterIds",
      characters: "++id, name, description, prompt, relationship, appearance, avatar",
      worlds: "++id, name",
      adventures: "++id, title, timestamp, worldId, *characterIds, status",
      settings: "key",
      media: "id",
    });
  }
}

export const db = new KindredDB();

const chatLocks = new Map<number, Promise<void>>();

export const dbService = {
  // Settings (e.g. Directory Handle)
  async getSetting(key: string): Promise<any> {
    const setting = await db.settings.get(key);
    return setting ? setting.value : undefined;
  },

  async setSetting(key: string, value: any): Promise<void> {
    await db.settings.put({ key, value });
  },
  // Chats
  async getAllChats(): Promise<Chat[]> {
    return await db.chats.orderBy("timestamp").toArray();
  },

  async getChatById(id: number): Promise<Chat> {
    const chat = await db.chats.get(id);
    if (!chat) throw new Error(`Chat with id ${id} not found.`);
    return chat;
  },

  // Pictures and videos (features/media/mediaRefs.ts): stored once by their
  // fingerprint, and named in a message as "media:<id>".
  async storeMedia(src: string): Promise<string> {
    if (!shouldMove(src)) return src;
    const id = await mediaIdFor(src);
    if (!(await db.media.where("id").equals(id).count())) {
      await db.media.put({ id, blob: dataUrlToBlob(src), createdAt: Date.now() });
    }
    return `${MEDIA_PREFIX}${id}`;
  },

  async getMediaBlob(ref: string): Promise<Blob> {
    if (!isMediaRef(ref)) throw new Error("Not a stored picture.");
    const record = await db.media.get(mediaIdOf(ref));
    if (!record) throw new Error("This picture is missing from this browser.");
    return record.blob;
  },

  async getMediaRecords(ids: string[]): Promise<MediaRecord[]> {
    return (await db.media.bulkGet(ids)).filter((r): r is MediaRecord => Boolean(r));
  },

  async putMediaRecords(records: MediaRecord[]): Promise<void> {
    if (records.length > 0) await db.media.bulkPut(records);
  },

  // Every chat write moves the pictures in it out first, so nothing large is
  // ever kept inside a chat again, whichever path wrote it.
  async withMediaMoved<T extends Partial<Pick<Chat, "content" | "tree">>>(chat: T): Promise<T> {
    return moveChatMedia(chat, (src) => dbService.storeMedia(src));
  },

  // The chat with its stored pictures inside it again, for a file that
  // leaves the app. A picture missing here is left as its reference.
  async withMediaInlined<T extends Partial<Pick<Chat, "content" | "tree">>>(chat: T): Promise<T> {
    return inlineChatMedia(chat, async (ref) => {
      try {
        return await blobToDataUrl(await dbService.getMediaBlob(ref));
      } catch {
        return ref;
      }
    });
  },

  // Moves the pictures already inside chats into the media table, one chat
  // at a time, each under its chat's lock so nothing written meanwhile is
  // lost. Returns how many chats changed. A chat that fails stays as it was
  // and is tried again next time.
  async moveInlineMedia(): Promise<number> {
    let moved = 0;
    const ids = (await db.chats.toCollection().primaryKeys()) as number[];
    for (const id of ids) {
      try {
        const changed = await dbService.withChatLock(id, async () => {
          const chat = await db.chats.get(id);
          if (!chat || !chatHasInlineMedia(chat)) return false;
          await db.chats.put(await dbService.withMediaMoved(chat));
          return true;
        });
        if (changed) moved++;
      } catch (err) {
        console.warn(`Couldn't move the pictures out of chat ${id}; it's kept as it was.`, err);
      }
    }
    return moved;
  },

  async addChat(chat: Omit<Chat, "id">): Promise<number> {
    return await db.chats.add((await dbService.withMediaMoved(chat)) as Chat);
  },

  // One change at a time per chat (the user's report, 2026-10-27: a reply
  // went missing while background life was busy). Most changes read the
  // whole chat, change it and write it back; two at once - your reply and,
  // say, a character's news text or a group's talk - each wrote back its own
  // copy, and the later one erased the other. Changes to one chat now wait
  // their turn; different chats don't wait for each other.
  async withChatLock<T>(id: number, run: () => Promise<T>): Promise<T> {
    const before = chatLocks.get(id) || Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((resolve) => (release = resolve));
    const queue = before.then(() => mine);
    chatLocks.set(id, queue);
    await before;
    try {
      return await run();
    } finally {
      release();
      if (chatLocks.get(id) === queue) chatLocks.delete(id);
    }
  },

  async updateChat(chat: Chat): Promise<number> {
    return await db.chats.put(await dbService.withMediaMoved(chat));
  },

  // Read, patch and write a chat in one transaction, so two patches of
  // different fields landing at once (say a reply's scene state and its
  // story tags) can't overwrite each other.
  async patchChat(id: number, patch: Partial<Chat>): Promise<Chat> {
    // Pictures are stored before the transaction: it may only touch chats.
    patch = await dbService.withMediaMoved(patch);
    return await dbService.withChatLock(id, () =>
      db.transaction("rw", db.chats, async () => {
        const chat = await db.chats.get(id);
        if (!chat) throw new Error(`Chat with id ${id} not found.`);
        Object.assign(chat, patch);
        await db.chats.put(chat);
        return chat;
      })
    );
  },

  async deleteChat(id: number): Promise<void> {
    await db.chats.delete(id);
  },

  // Removes a deleted character from every chat/room it belonged to - a
  // 1:1 chat (its only member) is deleted outright, matching the old
  // behavior; a group room just loses that one participant and keeps
  // running with whoever's left, instead of the whole room (and everyone
  // else's history in it) disappearing because one member was removed.
  async removeCharacterFromChats(characterId: number): Promise<void> {
    const affected = await db.chats.where("characterIds").equals(characterId).toArray();
    for (const chat of affected) {
      const remaining = (chat.characterIds || []).filter((id) => id !== characterId);
      if (remaining.length === 0) {
        await db.chats.delete(chat.id);
      } else {
        await db.chats.update(chat.id, { characterIds: remaining });
      }
    }
  },

  // Characters
  async getAllCharacters(): Promise<Character[]> {
    return await db.characters.toArray();
  },

  async getCharacterById(id: number): Promise<Character> {
    const character = await db.characters.get(id);
    if (!character) throw new Error(`Character with id ${id} not found.`);
    return character;
  },

  async addCharacter(character: Omit<Character, "id">): Promise<number> {
    return await db.characters.add(character as Character);
  },

  async updateCharacter(character: Character): Promise<number> {
    return await db.characters.put(character);
  },

  async deleteCharacter(id: number): Promise<void> {
    return await db.characters.delete(id);
  },

  // Worlds
  async getAllWorlds(): Promise<World[]> {
    return await db.worlds.toArray();
  },

  async getWorldById(id: number): Promise<World> {
    const world = await db.worlds.get(id);
    if (!world) throw new Error(`World with id ${id} not found.`);
    return world;
  },

  async addWorld(world: Omit<World, "id">): Promise<number> {
    return await db.worlds.add(world as World);
  },

  async updateWorld(world: World): Promise<number> {
    return await db.worlds.put(world);
  },

  async deleteWorld(id: number): Promise<void> {
    await db.worlds.delete(id);
  },

  // Clears worldId on every adventure that referenced a deleted world instead
  // of deleting the adventure itself - unlike a character (which a 1:1 chat
  // is meaningless without), an adventure's own history/cast/premise all
  // still stand on their own once the World record is gone.
  async clearWorldFromAdventures(worldId: number): Promise<void> {
    const affected = await db.adventures.where("worldId").equals(worldId).toArray();
    for (const adventure of affected) {
      await db.adventures.update(adventure.id, { worldId: undefined });
    }
  },

  // Adventures
  async getAllAdventures(): Promise<Adventure[]> {
    return await db.adventures.orderBy("timestamp").toArray();
  },

  async getAdventureById(id: number): Promise<Adventure> {
    const adventure = await db.adventures.get(id);
    if (!adventure) throw new Error(`Adventure with id ${id} not found.`);
    return adventure;
  },

  async addAdventure(adventure: Omit<Adventure, "id">): Promise<number> {
    return await db.adventures.add(adventure as Adventure);
  },

  async updateAdventure(adventure: Adventure): Promise<number> {
    return await db.adventures.put(adventure);
  },

  async deleteAdventure(id: number): Promise<void> {
    await db.adventures.delete(id);
  },

  // Drops a deleted character from every adventure's cast. Unlike
  // removeCharacterFromChats, never deletes the adventure itself: the single
  // narrator voices every NPC, so the adventure still stands with one fewer
  // cast member instead of losing its meaning the way a 1:1 chat does when
  // its only character disappears.
  async removeCharacterFromAdventures(characterId: number): Promise<void> {
    const affected = await db.adventures.where("characterIds").equals(characterId).toArray();
    for (const adventure of affected) {
      const remaining = (adventure.characterIds || []).filter((id) => id !== characterId);
      await db.adventures.update(adventure.id, { characterIds: remaining });
    }
  },
};
