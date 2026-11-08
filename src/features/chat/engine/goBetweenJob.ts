import { toast } from "sonner";
import { Character, Chat } from "../../../types";
import { AI } from "../../../utils/constants";
import { formatTranscript } from "../../ai/utils/chatHistoryUtils";
import { trimToLatestSummary } from "../../ai/utils/transcript";
import { generateAssistText } from "../../aiSlice";
import { GetState, JobUi, PersonalDispatch, personalState } from "../../character/engine/state";
import { cleanFirstText } from "../../character/firstTexts";
import { addChatNotice, addMessage, fetchChats, updateChatOptions } from "../../chatSlice";
import { buildGoBetweenPrompt, goBetweenDue, mainChatWith, mutualFriends } from "../blocking";

// The blocked 1:1 chat whose character asks a friend to put in a word this
// check, and that character (only while they're living).
export const pickGoBetween = (chats: Chat[], characters: Character[], now: number): { blockedChat: Chat; blocked: Character } | undefined => {
  const blockedChat = chats.find((c) => c.characterIds?.length === 1 && goBetweenDue(c, now));
  const blocked = blockedChat && characters.find((c) => c.id === blockedChat.characterIds![0]);
  return blockedChat?.id && blocked ? { blockedChat, blocked } : undefined;
};

// A check still under way when another starts is left alone, as the
// component's own flag did.
let busy = false;

// The go-between (#133): now and then, someone you blocked asks a friend
// you share to put in a word, and that friend brings it up in your chat
// with them - a notice, then their text, in their own voice. Their next
// replies know about it (blockNotesFor), so you can talk it through.
// `random` picks the friend; tests pass their own.
export const goBetweenCheck = (ui: JobUi, random: () => number = Math.random) => async (dispatch: PersonalDispatch, getState: GetState) => {
  if (busy) return;
  const now = Date.now();
  const { chats, characters, persona } = personalState(getState);
  const picked = pickGoBetween(chats, characters, now);
  if (!picked) return;
  const { blockedChat, blocked } = picked;
  const friends = mutualFriends(blocked, characters, chats);
  const friend = friends[Math.floor(random() * friends.length)];
  // Recorded even with nobody to ask, so it isn't checked again too soon.
  const nudged = { ...blockedChat.blocked!, nudgedAt: now, ...(friend ? { nudgedBy: friend.id } : {}) };
  busy = true;
  try {
    await dispatch(updateChatOptions({ chatId: blockedChat.id!, patch: { blocked: nudged } }));
    const friendChat = friend && mainChatWith(chats, friend.id);
    if (!friend || !friendChat?.id) return;
    const friendChatId = friendChat.id;
    const userName = persona?.name?.trim() || "the user";
    const recent = formatTranscript(trimToLatestSummary(friendChat.content || []).slice(-8), { userName, charName: friend.name });
    const reply = await dispatch(generateAssistText({
      instruction: buildGoBetweenPrompt(friend, blocked, userName, { fight: blockedChat.conflict?.about, recent }),
      background: true,
      activity: { kind: "other", text: `${friend.name} brought up ${blocked.name}`, characterId: friend.id, name: friend.name },
    })).unwrap();
    const text = cleanFirstText(reply);
    if (!text) return;
    await dispatch(addChatNotice({ chatId: friendChatId, text: `${friend.name} is talking about ${blocked.name}` }));
    await dispatch(addMessage({ chatId: friendChatId, role: AI, text, speakerId: friend.id }));
    await dispatch(fetchChats());
    toast.message(`${friend.name} texted you`, { description: text.length > 90 ? `${text.slice(0, 87)}...` : text, action: { label: "Open", onClick: () => ui.navigate(`/chat/${friendChatId}`) } });
  } catch (err) {
    console.warn("Go-between failed (non-fatal):", err);
  } finally {
    busy = false;
  }
};
