import { Character, Chat } from "../../types";
import { AppDispatch, RootState } from "../../store/store";
import { generateAssistText } from "../aiSlice";
import { addMessage, fetchChats, updateChatOptions } from "../chatSlice";
import { AI } from "../../utils/constants";
import { buildTheirGroupPrompt, DEFAULT_LIMIT, lastLines, parseTheirLines } from "./theirGroup";
import { worldOf } from "../world/currentWorld";
import { editTimeline, loadTimeline, logToTimeline } from "../world/timeline";
import { applyShared, buildShareSection, parseNewFact, parseShared } from "../world/knowledge";
import { buildSceneNow } from "../world/sceneNow";

// One round of a group of theirs (#202): what they say next, saved as their
// messages in the chat, a little apart. Resolves to how many were added.
export const runTheirGroup = (chat: Chat, characters: Character[], userName: string, now = Date.now()) => async (dispatch: AppDispatch, getState: () => RootState) => {
  if (!chat.id || !chat.theirs) return 0;
  const members = (chat.characterIds || []).map((id) => characters.find((c) => c.id === id)).filter((c): c is Character => Boolean(c));
  if (members.length < 2) return 0;
  const limit = chat.theirs.limit || DEFAULT_LIMIT;
  // Recorded first, so a failed round waits its turn like the others.
  await dispatch(updateChatOptions({ chatId: chat.id, patch: { theirs: { ...chat.theirs, lastAt: now } } }));
  // What each of them knows (#204), at the world's time and places (#205).
  const worlds = getState().world.worlds;
  const worldId = worldOf(members[0], worlds);
  const world = worlds.find((w) => w.id === worldId);
  const share = buildShareSection(members, await loadTimeline(worldId), now, characters);
  const reply = await dispatch(generateAssistText({
    instruction: buildTheirGroupPrompt(members, chat.title, lastLines(chat), { limit, scenario: chat.scenario, userName, sceneNow: buildSceneNow(world, members, now), share }),
    background: true,
    activity: { at: now, kind: "talk", text: `${chat.title}: they talked`, characterId: members[0].id, name: chat.title },
  })).unwrap();
  const lines = parseTheirLines(reply, members, limit);
  for (const [i, line] of lines.entries()) {
    await dispatch(addMessage({ chatId: chat.id, role: AI, text: line.text, speakerId: line.speakerId, noGreeting: true, at: now - (lines.length - 1 - i) * 20_000 }));
  }
  // Hearsay (#206): everyone in the group heard what was told.
  const told = lines.length ? parseShared(reply) : [];
  if (told.length) void editTimeline(worldId, (list) => applyShared(list, share.items, told, members.map((m) => m.id), now));
  const fresh = lines.length ? parseNewFact(reply) : undefined;
  if (fresh) void logToTimeline(worldId, { kind: "talk", text: fresh, characterIds: members.map((m) => m.id), audience: "private", at: now }, world?.storyTime);
  if (lines.length) await dispatch(fetchChats());
  return lines.length;
};
