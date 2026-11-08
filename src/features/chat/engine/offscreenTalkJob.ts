import { Character, Chat } from "../../../types";
import { formatTranscript } from "../../ai/utils/chatHistoryUtils";
import { trimToLatestSummary } from "../../ai/utils/transcript";
import { generateAssistText } from "../../aiSlice";
import { GetState, PersonalDispatch, personalState } from "../../character/engine/state";
import { updateChatOptions } from "../../chatSlice";
import { worldOf } from "../../world/currentWorld";
import { applyShared, buildShareSection, parseNewFact, parseShared } from "../../world/knowledge";
import { buildSceneNow } from "../../world/sceneNow";
import { editTimeline, loadTimeline, logToTimeline } from "../../world/timeline";
import { addTalk, buildOffscreenTalkPrompt, parseOffscreenTalk, pickPair, talkDue } from "../offscreenTalk";

// The group chat that talks this check, its living members and the two who
// talk: the first group that's due and has a pair to talk.
export const pickOffscreenTalk = (chats: Chat[], characters: Character[], now: number): { chat: Chat; members: Character[]; pair: [Character, Character] } | undefined => {
  const chat = chats.find((c) => talkDue(c, now));
  if (!chat?.id) return undefined;
  const members = (chat.characterIds || []).map((id) => characters.find((c) => c.id === id)).filter((c): c is Character => Boolean(c));
  const pair = pickPair(members, chat.roomRelationships);
  return pair ? { chat, members, pair } : undefined;
};

// A check still under way when another starts is left alone, as the
// component's own flag did.
let busy = false;

// Characters talk while you're away (#58): a group chat with this switched
// on gets a short conversation between two of its members once you've been
// gone a while, at most one per check, on the cheaper helper model.
export const offscreenTalkCheck = () => async (dispatch: PersonalDispatch, getState: GetState) => {
  if (busy) return;
  const now = Date.now();
  const { livingChats, characters, persona, worlds } = personalState(getState);
  const picked = pickOffscreenTalk(livingChats, characters, now);
  if (!picked) return;
  const { chat, members, pair } = picked;
  busy = true;
  try {
    const userName = persona?.name?.trim() || "the user";
    const namesById = Object.fromEntries(members.map((m) => [m.id, m.name]));
    const recent = trimToLatestSummary(chat.content || []).slice(-12);
    const feelings = (chat.roomRelationships || [])
      .filter((r) => r.note.trim() && pair.some((p) => p.id === r.fromId) && pair.some((p) => p.id === r.toId))
      .map((r) => `${namesById[r.fromId]} about ${namesById[r.toId]}: ${r.note.trim()}`);
    const worldId = worldOf(pair[0], worlds);
    const world = worlds.find((w) => w.id === worldId);
    const share = buildShareSection(pair, await loadTimeline(worldId), now, characters);
    const reply = await dispatch(generateAssistText({
      instruction: buildOffscreenTalkPrompt(pair[0], pair[1], userName, feelings, formatTranscript(recent, { userName, speakerNames: namesById }), chat.scenario, { sceneNow: buildSceneNow(world, pair, now), share }),
      background: true,
      activity: { kind: "talk", text: `${pair[0].name} and ${pair[1].name} talked`, characterId: pair[0].id, name: pair[0].name },
    })).unwrap();
    const lines = parseOffscreenTalk(reply, pair);
    // Hearsay (#206): what was passed on, and anything new about them.
    const told = lines.length ? parseShared(reply) : [];
    if (told.length) void editTimeline(worldId, (list) => applyShared(list, share.items, told, pair.map((p) => p.id), now));
    const fresh = lines.length ? parseNewFact(reply) : undefined;
    if (fresh) void logToTimeline(worldId, { kind: "talk", text: fresh, characterIds: pair.map((p) => p.id), audience: "private", at: now }, world?.storyTime);
    // Saved even when empty, so a failed attempt waits for the next stretch away.
    await dispatch(updateChatOptions({
      chatId: chat.id!,
      patch: { offscreenTalks: addTalk(chat.offscreenTalks, { id: `talk-${now.toString(36)}`, at: now, lines }) },
    }));
  } catch (err) {
    console.warn("Off-screen conversation failed (non-fatal):", err);
  } finally {
    busy = false;
  }
};
