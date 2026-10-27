import { Character, Chat } from "../../types";
import { AppDispatch } from "../../store/store";
import { generateAssistText } from "../aiSlice";
import { addMessage, fetchChats, updateChatOptions } from "../chatSlice";
import { AI } from "../../utils/constants";
import { buildTheirGroupPrompt, DEFAULT_LIMIT, lastLines, parseTheirLines } from "./theirGroup";

// One round of a group of theirs (#202): what they say next, saved as their
// messages in the chat, a little apart. Resolves to how many were added.
export const runTheirGroup = (chat: Chat, characters: Character[], userName: string, now = Date.now()) => async (dispatch: AppDispatch) => {
  if (!chat.id || !chat.theirs) return 0;
  const members = (chat.characterIds || []).map((id) => characters.find((c) => c.id === id)).filter((c): c is Character => Boolean(c));
  if (members.length < 2) return 0;
  const limit = chat.theirs.limit || DEFAULT_LIMIT;
  // Recorded first, so a failed round waits its turn like the others.
  await dispatch(updateChatOptions({ chatId: chat.id, patch: { theirs: { ...chat.theirs, lastAt: now } } }));
  const reply = await dispatch(generateAssistText({
    instruction: buildTheirGroupPrompt(members, chat.title, lastLines(chat), { limit, scenario: chat.scenario, userName }),
    background: true,
    activity: { at: now, kind: "talk", text: `${chat.title}: they talked`, characterId: members[0].id, name: chat.title },
  })).unwrap();
  const lines = parseTheirLines(reply, members, limit);
  for (const [i, line] of lines.entries()) {
    await dispatch(addMessage({ chatId: chat.id, role: AI, text: line.text, speakerId: line.speakerId, noGreeting: true, at: now - (lines.length - 1 - i) * 20_000 }));
  }
  if (lines.length) await dispatch(fetchChats());
  return lines.length;
};
