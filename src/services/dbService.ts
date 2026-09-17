import Dexie, { Table } from "dexie";
import { DB_NAME } from "../utils/constants";
import { Chat, Character, World, Adventure } from "../types";

class WhatsGeminiDB extends Dexie {
  chats!: Table<Chat, number>;
  characters!: Table<Character, number>;
  worlds!: Table<World, number>;
  adventures!: Table<Adventure, number>;
  settings!: Table<{ key: string, value: any }, string>;

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
  }
}

export const db = new WhatsGeminiDB();

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

  async addChat(chat: Omit<Chat, "id">): Promise<number> {
    return await db.chats.add(chat as Chat);
  },

  async updateChat(chat: Chat): Promise<number> {
    return await db.chats.put(chat);
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
