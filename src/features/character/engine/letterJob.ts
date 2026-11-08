import { Character, Chat } from "../../../types";
import { formatTranscript } from "../../ai/utils/chatHistoryUtils";
import { trimToLatestSummary } from "../../ai/utils/transcript";
import { generateAssistText } from "../../aiSlice";
import { patchCharacter } from "../../characterSlice";
import { latestStorySummary } from "../../chat/recap";
import { worldOfCharacter, worldTruthsLine } from "../../world/worldTruths";
import { zoneOf } from "../characterClock";
import { addLetter, buildLetterPrompt, cleanLetter, letterDue } from "../letters";
import { currentBlock } from "../schedule";
import { GetState, PersonalDispatch, personalState } from "./state";

const DAY_MS = 24 * 60 * 60 * 1000;

// The character who writes this check, with their main 1:1 chat: the first
// one with letters on whose chat has been quiet long enough.
export const pickLetterWriter = (characters: Character[], chats: Chat[], now: number): { writer: Character; chat: Chat } | undefined => {
  const chatFor = (id: number) => chats.find((c) => c.characterIds?.length === 1 && c.characterIds[0] === id && c.memoryScope !== "chat");
  const writer = characters.find((c) => letterDue(c, chatFor(c.id), now));
  const chat = writer && chatFor(writer.id);
  return writer && chat?.id ? { writer, chat } : undefined;
};

// A check still under way when another starts is left alone (see dayLogJob).
let busy = false;

// Letters (#61): a character with letters on whose 1:1 chat has been quiet
// for a few days writes you one, at most one per check, on the cheaper
// helper model.
export const letterCheck = () => async (dispatch: PersonalDispatch, getState: GetState) => {
  if (busy) return;
  const now = Date.now();
  const { chats, characters, persona, worlds } = personalState(getState);
  const picked = pickLetterWriter(characters, chats, now);
  if (!picked) return;
  const { writer, chat } = picked;
  busy = true;
  try {
    const userName = persona?.name?.trim() || "the user";
    const content = chat.content || [];
    const last = content[content.length - 1]?.timestamp || chat.timestamp || now;
    const recent = trimToLatestSummary(content).slice(-10);
    const reply = await dispatch(generateAssistText({
      instruction: buildLetterPrompt(writer, userName, Math.max(1, Math.round((now - last) / DAY_MS)), writer.memory || [], formatTranscript(recent, { userName, charName: writer.name }), currentBlock(writer.schedule, now, zoneOf(writer))?.activity, latestStorySummary(content), worldTruthsLine(worldOfCharacter(writer, worlds), [writer])),
      background: true,
      activity: { kind: "letter", text: `${writer.name} wrote you a letter`, characterId: writer.id, name: writer.name },
    })).unwrap();
    const text = cleanLetter(reply);
    // Saved even when the reply was unusable, so one absence never asks twice.
    await dispatch(patchCharacter(writer.id, (fresh) => ({ letters: addLetter(fresh.letters, { id: `letter-${now.toString(36)}`, at: now, text: text || "", chatId: chat.id }) })));
  } catch (err) {
    console.warn("Letter failed (non-fatal):", err);
  } finally {
    busy = false;
  }
};
