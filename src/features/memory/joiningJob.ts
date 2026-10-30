import { Character, Chat } from "../../types";
import { AppDispatch, RootState } from "../../store/store";
import { extractCharacterMemory, generateAssistText } from "../aiSlice";
import { patchCharacter } from "../characterSlice";
import { selectActivePersona } from "../settingsSlice";
import { dbService } from "../../services/dbService";
import { applyMemoryChanges, carryMemoryCategories, parseMemoryChanges } from "../ai/utils/memoryExtraction";
import { carryMemoryDates } from "../ai/utils/memoryTime";
import { formatTranscript, TranscriptNames } from "../ai/utils/transcript";
import { groupFactsFor, rememberFacts } from "./sharedMoments";
import { condenseMemoryIfDue } from "./condenseJob";
import { BRIEF_FACTS, briefMessages, buildJoinBriefPrompt, unremembered } from "./joining";

// Running the catch-up when someone joins a chat; what it reads and asks
// for is in joining.ts.

const namesFor = (chat: Chat, members: Character[], userName: string): TranscriptNames => ({
  userName,
  charName: members.find((c) => c.id === chat.characterIds?.[0])?.name,
  speakerNames: (chat.characterIds || []).length > 1 ? Object.fromEntries(members.map((c) => [c.id, c.name])) : undefined,
});

// The 1:1 someone was invited from: its character remembers the latest
// messages now, the same way the regular update would have. A 1:1 that
// keeps its own memory is a what-if, and disappearing messages are never
// kept, so neither is touched.
const catchUpOneToOne = async (dispatch: AppDispatch, chatId: number, userName: string) => {
  const chat: Chat = await dbService.getChatById(chatId);
  const characterId = chat.characterIds?.[0];
  if (characterId == null || (chat.characterIds || []).length > 1 || chat.memoryScope === "chat" || chat.disappearing) return;
  const character: Character = await dbService.getCharacterById(characterId);
  const recent = unremembered(chat.content || [], character.memoryStanding?.at);
  if (recent.length < 2) return;
  const existing = character.memory || [];
  const pinned = character.pinnedMemory || [];
  const changes = await dispatch(extractCharacterMemory({ recentMessages: recent, memory: existing, pinnedMemory: pinned, names: { userName, charName: character.name } })).unwrap();
  const merged = applyMemoryChanges(existing, changes, pinned);
  const memoryStanding = changes.standing ? { text: changes.standing, at: Date.now() } : undefined;
  await dispatch(patchCharacter(character.id, (fresh) => ({
    memory: merged,
    memoryCategories: carryMemoryCategories(merged, pinned, fresh.memoryCategories, existing, changes),
    memoryDates: carryMemoryDates(merged, pinned, fresh.memoryDates, existing, changes, Date.now()),
    ...(memoryStanding ? { memoryStanding } : {}),
  })));
  void dispatch(condenseMemoryIfDue({ kind: "character", id: character.id, name: character.name }, userName));
};

// The newcomer keeps a few facts from what came before, labelled with the
// group like everything else they learn there (sharedMoments.ts).
const briefNewcomer = async (dispatch: AppDispatch, chatId: number, characterId: number, userName: string) => {
  const chat: Chat = await dbService.getChatById(chatId);
  if (chat.disappearing) return;
  const messages = briefMessages(chat.content || []);
  if (messages.length < 2) return;
  const members: Character[] = (await Promise.all((chat.characterIds || []).map((id) => dbService.getCharacterById(id).catch(() => undefined)))).filter(Boolean) as Character[];
  const newcomer = members.find((c) => c.id === characterId);
  if (!newcomer) return;
  const known = [...(newcomer.pinnedMemory || []), ...(newcomer.memory || [])];
  const reply = await dispatch(generateAssistText({
    purpose: "memory",
    instruction: buildJoinBriefPrompt(newcomer.name, userName, formatTranscript(messages, namesFor(chat, members, userName)), known),
    background: true,
    activity: { kind: "other", text: `${newcomer.name} caught up on ${chat.title || "the group"}`, characterId: newcomer.id, name: newcomer.name },
  })).unwrap();
  const parsed = parseMemoryChanges(reply, 0);
  const added = parsed.added.slice(0, BRIEF_FACTS);
  if (!added.length) return;
  const { facts, categories } = groupFactsFor(chat.title || "the group", added, parsed.categories);
  await dispatch(patchCharacter(newcomer.id, (fresh) => rememberFacts(fresh, facts, categories, Date.now())));
  void dispatch(condenseMemoryIfDue({ kind: "character", id: newcomer.id, name: newcomer.name }, userName));
};

// Runs when `characterId` joins `chatId`; `fromChatId` is the 1:1 it was
// branched from, when inviting turned a 1:1 into a group. Best-effort and
// silent, like every memory update: a failure leaves memory as it was.
export const catchUpOnJoin = ({ chatId, characterId, fromChatId }: { chatId: number; characterId: number; fromChatId?: number }) =>
  async (dispatch: AppDispatch, getState: () => RootState) => {
    const userName = selectActivePersona(getState())?.name?.trim() || "the user";
    await Promise.all([
      fromChatId != null ? catchUpOneToOne(dispatch, fromChatId, userName).catch((err) => console.warn("Memory catch-up failed (non-fatal):", err)) : undefined,
      briefNewcomer(dispatch, chatId, characterId, userName).catch((err) => console.warn("Newcomer's catch-up failed (non-fatal):", err)),
    ]);
  };
