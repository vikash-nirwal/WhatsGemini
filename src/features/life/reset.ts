import { createAsyncThunk } from "@reduxjs/toolkit";
import { dbService } from "../../services/dbService";
import { Channel, Character, Chat, StoryTime } from "../../types";
import { resetCharacter } from "../character/card";
import { updateCharacter } from "../characterSlice";
import { deleteChat, fetchChats } from "../chatSlice";
import { changeChannels } from "../channelSlice";
import { updateWorld } from "../worldSlice";
import { worldOf } from "../world/currentWorld";
import { channelId } from "../channels/channels";

// Reset (#158): a character or a world back to how it started. A character
// keeps their card (see CARD_FIELDS) and loses everything that built up; a
// world loses its progress: story time, news and its people's own talk.

// What a chat with them learned and where it got to; the messages stay
// unless you also asked to delete the chats.
const CHAT_PROGRESS: (keyof Chat)[] = [
  "memory", "pinnedMemory", "memoryStanding", "memoryCategories", "memoryDates", "callbackAt",
  "stage", "stageSuggestion", "relationshipSuggestion", "arcSuggestion", "offscreenTalks", "offscreenTalk",
  "plans", "revealedSecrets", "insideJokes", "conflicts", "conflict", "jealousy", "lies", "toldLies", "mood", "moodCarry",
];

export const withoutProgress = (chat: Chat): Chat => {
  const next: Record<string, unknown> = { ...chat };
  for (const key of CHAT_PROGRESS) delete next[key];
  return next as unknown as Chat;
};

// Back to the date the calendar was set to, counting on from now.
export const restartStoryTime = (st: StoryTime, now: number): StoryTime => ({
  ...st,
  year: st.start?.year ?? st.year,
  day: st.start?.day ?? 0,
  anchorAt: now,
});

// Others' talk with anyone being reset goes too (it's stored on the lower id).
const withoutTalksWith = (c: Character, ids: Set<number>): Character | undefined => {
  if (!c.talks?.some((t) => ids.has(t.withId))) return undefined;
  const talks = c.talks.filter((t) => !ids.has(t.withId));
  return { ...c, talks: talks.length ? talks : undefined };
};

type State = { character: { characters: Character[] }; chat: { chats: Chat[] }; world: { worlds: import("../../types").World[] } };

const resetPeople = async (dispatch: (a: unknown) => unknown, state: State, ids: Set<number>, deleteChats: boolean) => {
  const { characters } = state.character;
  for (const c of characters) {
    if (ids.has(c.id)) await dispatch(updateCharacter(resetCharacter(c)));
    else {
      const cleaned = withoutTalksWith(c, ids);
      if (cleaned) await dispatch(updateCharacter(cleaned));
    }
  }
  // Their own chats: one-to-one ones, and groups where everyone is being reset.
  const theirs = state.chat.chats.filter((chat) => chat.characterIds?.length && chat.characterIds.every((id) => ids.has(id)));
  for (const chat of theirs) {
    if (!chat.id) continue;
    if (deleteChats) await dispatch(deleteChat(chat.id));
    // Under the chat's lock, like every other change to a chat.
    else await dbService.withChatLock(chat.id, async () => { await dbService.updateChat(withoutProgress(await dbService.getChatById(chat.id!))); });
  }
  await dispatch(fetchChats());
};

export const resetCharacterLife = createAsyncThunk(
  "reset/character",
  async ({ characterId, deleteChats }: { characterId: number; deleteChats: boolean }, { dispatch, getState }) => {
    await resetPeople(dispatch, getState() as State, new Set([characterId]), deleteChats);
  }
);

export const resetWorldLife = createAsyncThunk(
  "reset/world",
  async ({ worldId, people, deleteChats }: { worldId: number | null; people: boolean; deleteChats: boolean }, { dispatch, getState }) => {
    const state = getState() as State;
    const now = Date.now();
    const here = state.character.characters.filter((c) => worldOf(c, state.world.worlds) === worldId);
    const world = state.world.worlds.find((w) => w.id === worldId);
    if (world?.storyTime) await dispatch(updateWorld({ ...world, storyTime: restartStoryTime(world.storyTime, now) }));
    if (worldId) await dispatch(changeChannels((list: Channel[]) => list.map((c) => (c.id === channelId("world", worldId) ? { ...c, posts: [], lastPostAt: undefined, lastReadAt: undefined } : c))));
    if (people) {
      await resetPeople(dispatch, state, new Set(here.map((c) => c.id)), deleteChats);
    } else {
      // Only their talk with each other, and what they'd heard by it (#207).
      for (const c of here) if (c.talks?.length || c.knownSummary) await dispatch(updateCharacter({ ...c, talks: undefined, knownSummary: undefined }));
    }
  }
);
