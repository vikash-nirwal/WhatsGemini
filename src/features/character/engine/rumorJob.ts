import { Character, Chat } from "../../../types";
import { formatTranscript } from "../../ai/utils/chatHistoryUtils";
import { trimToLatestSummary } from "../../ai/utils/transcript";
import { generateAssistText } from "../../aiSlice";
import { patchCharacter } from "../../characterSlice";
import { addRumor, buildRumorPrompt, newRumorId, parseRumorReply, pickListener, rumorDue, rumorListenersFor } from "../rumors";
import { GetState, PersonalDispatch, personalState } from "./state";

// Who talks this check, from which chat, and to whom: the first character
// whose main 1:1 chat has something to pass on, and a listener for it.
export const pickRumor = (characters: Character[], chats: Chat[], now: number): { source: Character; chat: Chat; listener: Character } | undefined => {
  const chatFor = (id: number) => chats.find((c) => c.characterIds?.length === 1 && c.characterIds[0] === id && c.memoryScope !== "chat" && !c.whatIf);
  const source = characters.find((c) => rumorDue(c, chatFor(c.id), characters, chats, now));
  const chat = source && chatFor(source.id);
  const listener = source && pickListener(rumorListenersFor(source, characters, chats), now);
  return source && chat && listener ? { source, chat, listener } : undefined;
};

// A check still under way when another starts is left alone (see dayLogJob).
let busy = false;

// Rumors (#98): now and then something from the 1:1 chat of a character who
// "talks" reaches another character, a little wrong, at most one per check,
// on the cheaper helper model.
export const rumorCheck = () => async (dispatch: PersonalDispatch, getState: GetState) => {
  if (busy) return;
  const now = Date.now();
  const { chats, characters, persona } = personalState(getState);
  const picked = pickRumor(characters, chats, now);
  if (!picked) return;
  const { source, chat, listener } = picked;
  busy = true;
  try {
    const userName = persona?.name?.trim() || "the user";
    const transcript = formatTranscript(trimToLatestSummary(chat.content || []).slice(-16), { userName, charName: source.name });
    const reply = await dispatch(generateAssistText({ instruction: buildRumorPrompt(source.name, listener.name, userName, transcript), background: true, activity: { kind: "rumor", text: `${source.name} talked to ${listener.name} about you`, characterId: source.id, name: source.name } })).unwrap();
    const parsed = parseRumorReply(reply);
    // Kept even when there was nothing worth gossiping about (an empty
    // rumor, already "raised"), so the same stretch isn't asked about again.
    await dispatch(patchCharacter(listener.id, (fresh) => ({
      rumors: addRumor(fresh.rumors, { id: newRumorId(), fromId: source.id, heard: parsed?.heard || "", truth: parsed?.truth || "", at: now, ...(parsed ? {} : { raised: now }) }),
    })));
  } catch (err) {
    console.warn("Rumor failed (non-fatal):", err);
  } finally {
    busy = false;
  }
};
