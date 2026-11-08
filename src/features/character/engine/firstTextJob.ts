import { toast } from "sonner";
import { Character, Chat, MessageNote } from "../../../types";
import { AI } from "../../../utils/constants";
import { formatTranscript } from "../../ai/utils/chatHistoryUtils";
import { trimToLatestSummary } from "../../ai/utils/transcript";
import { generateAssistText } from "../../aiSlice";
import { patchCharacter } from "../../characterSlice";
import { addChat, addMessage, fetchChats } from "../../chatSlice";
import { openPlans } from "../../chat/sharedPlans";
import { notifyChatMessage } from "../../notifications/notifications";
import { dayMoodFor } from "../badDays";
import { zoneOf } from "../characterClock";
import { isNsfwCharacter } from "../contentRating";
import { dayLogText } from "../dayLog";
import { buildDreamDirective, dreamDue, dreamIngredients } from "../dreams";
import { addFirstText, buildFirstTextPrompt, cleanFirstText, firstTextDue, unansweredFirstTexts } from "../firstTexts";
import { concernsLine } from "../preoccupations";
import { placeLine } from "../realWorld";
import { currentBlock } from "../schedule";
import { writingStyleLine } from "../writingStyle";
import { GetState, JobUi, PersonalDispatch, personalState } from "./state";

const HOUR_MS = 60 * 60 * 1000;

// The character's main 1:1 chat: not a what-if or a chat with its own memory.
const mainChatOf = (chats: Chat[], id: number) => chats.find((c) => c.characterIds?.length === 1 && c.characterIds[0] === id && c.memoryScope !== "chat" && !c.whatIf);

// Who texts first this check. Only a character with no 1:1 chat at all may
// open one; one whose only chats are what-ifs or keep their own memory is
// left alone. Blocked either way (#133): no first texts.
export const pickFirstTexter = (characters: Character[], chats: Chat[], now: number): Character | undefined => {
  const hasOneToOne = (id: number) => chats.some((c) => c.characterIds?.length === 1 && c.characterIds[0] === id);
  return characters.find((c) => {
    const main = mainChatOf(chats, c.id);
    return (main || !hasOneToOne(c.id)) && !main?.blocked && firstTextDue(c, main, now);
  });
};

// A check still under way when another starts is left alone (see dayLogJob).
let busy = false;

// They text first (#93): a character with the switch on whose 1:1 chat has
// gone quiet sends a short text into it, at most one per check, on the
// cheaper helper model. In the morning, with dreams on (#94), the text can
// be about a dream instead. A character you've never chatted with one to
// one starts a new chat with their first text. `at`: a catch-up turn back
// in your absence (#130), stamped with it.
export const firstTextCheck = (ui: JobUi, at?: number) => async (dispatch: PersonalDispatch, getState: GetState) => {
  if (busy) return;
  const now = at ?? Date.now();
  const { chats, characters, persona } = personalState(getState);
  const texter = pickFirstTexter(characters, chats, now);
  if (!texter) return;
  busy = true;
  try {
    let chat = mainChatOf(chats, texter.id);
    const content = chat?.content || [];
    const firstContact = !content.some((m) => !m.isSystem && !m.isCompressionSummary);
    const userName = persona?.name?.trim() || "the user";
    const last = content[content.length - 1]?.timestamp || chat?.timestamp || now;
    const dreaming = Boolean(chat) && !firstContact && dreamDue(texter, chat!, now);
    const reply = await dispatch(generateAssistText({
      instruction: buildFirstTextPrompt(texter, userName, {
        hoursQuiet: Math.max(1, Math.round((now - last) / HOUR_MS)),
        firstContact,
        unanswered: unansweredFirstTexts(content),
        scenario: firstContact ? texter.scenario : undefined,
        nowDoing: currentBlock(texter.schedule, now, zoneOf(texter))?.activity,
        plans: openPlans(chat?.plans).slice(0, 3).map((p) => p.what),
        facts: [...(texter.pinnedMemory || []), ...(texter.memory || [])],
        transcript: formatTranscript(trimToLatestSummary(content).slice(-8), { userName, charName: texter.name }),
        dayMood: dayMoodFor(texter, now)?.label,
        dayLog: dayLogText(texter, now),
        concerns: concernsLine(texter.concerns),
        style: writingStyleLine(texter.writingStyle),
        place: placeLine(texter.home, now),
        dream: dreaming ? buildDreamDirective(texter.name, userName, dreamIngredients(texter, chat!)) : undefined,
      }),
      background: true,
      activity: { at: now, kind: dreaming ? "dream" : "first-text", text: dreaming ? `${texter.name} told you a dream` : `${texter.name} texted you first`, characterId: texter.id, name: texter.name },
    })).unwrap();
    const text = cleanFirstText(reply);
    // Recorded even when the reply was unusable, so a failing model
    // isn't asked again on every check.
    await dispatch(patchCharacter(texter.id, (fresh) => ({ firstTexts: addFirstText(fresh.firstTexts, now), ...(dreaming && text ? { lastDreamAt: now } : {}) })));
    if (!text) return;
    if (!chat?.id) chat = await dispatch(addChat({ title: texter.name, characterIds: [texter.id] })).unwrap();
    if (!chat?.id) return;
    const notes: MessageNote[] = dreaming ? ["texted-first", "dream"] : ["texted-first"];
    await dispatch(addMessage({ chatId: chat.id, role: AI, text, speakerId: texter.id, notes, noGreeting: firstContact, at: at }));
    await dispatch(fetchChats());
    // From another world (#146): the notification and toast say which.
    const after = personalState(getState);
    const world = after.elsewhere(texter);
    const shown = await notifyChatMessage({ chatId: chat.id, speaker: texter, text, isNsfwChat: isNsfwCharacter(texter), privacy: after.privacy, muted: chat.muted, world });
    // In the app but in another chat: a toast instead (not for a muted chat).
    const chatId = chat.id;
    if (!shown && !chat.muted && ui.path?.() !== `/chat/${chatId}`) {
      toast.message(world ? `${texter.name} texted you in ${world}` : `${texter.name} texted you`, { description: text.length > 90 ? `${text.slice(0, 87)}...` : text, action: { label: "Open", onClick: () => ui.navigate(`/chat/${chatId}`) } });
    }
  } catch (err) {
    console.warn("First text failed (non-fatal):", err);
  } finally {
    busy = false;
  }
};
