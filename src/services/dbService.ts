import Dexie, { Table } from "dexie";
import { DB_NAME } from "../utils/constants";
import { Chat, Character } from "../types";

class WhatsGeminiDB extends Dexie {
  chats!: Table<Chat, number>;
  characters!: Table<Character, number>;
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
  }
};
