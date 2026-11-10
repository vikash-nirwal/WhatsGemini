import { toast } from "sonner";
import { AI } from "../../utils/constants";
import { formatTranscript } from "../ai/utils/chatHistoryUtils";
import { trimToLatestSummary } from "../ai/utils/transcript";
import { generateAssistText } from "../aiSlice";
import { addMessage, fetchChats, updateChatOptions } from "../chatSlice";
import { isNsfwCharacter } from "../character/contentRating";
import { GetState, JobUi, PersonalDispatch, personalState } from "../character/engine/state";
import { notifyChatMessage } from "../notifications/notifications";
import { buildReminderPrompt, cleanReminderText, fallbackReminderText, nextDueReminder } from "./reminders";

// A check still under way when another starts is left alone.
let busy = false;

// Reminders and timers (#268): a reminder that's due is sent as a text from
// the character who set it, one per check. It's taken off the chat before
// the text is written, so a slow model can't send it twice, and it's sent
// even with the tool since switched off: you asked for it. It always uses
// the real clock, never a catch-up or simulated moment.
export const reminderCheck = (ui: JobUi) => async (dispatch: PersonalDispatch, getState: GetState) => {
  if (busy) return;
  const now = Date.now();
  const { chats, persona } = personalState(getState);
  const due = nextDueReminder(chats, now);
  if (!due?.chat.id) return;
  busy = true;
  try {
    const { chat, reminder } = due;
    const chatId = chat.id!;
    await dispatch(updateChatOptions({ chatId, patch: { reminders: (chat.reminders || []).filter((r) => r.id !== reminder.id) } }));
    const everyone = getState().character.characters;
    const speakerId = reminder.by ?? chat.characterIds?.[0];
    const speaker = everyone.find((c) => c.id === speakerId) || everyone.find((c) => c.id === chat.characterIds?.[0]);
    if (!speaker) return;
    const userName = persona?.name?.trim() || "the user";
    let text = "";
    try {
      const transcript = formatTranscript(trimToLatestSummary(chat.content || []).slice(-6), { userName, charName: speaker.name });
      text = cleanReminderText(await dispatch(generateAssistText({ instruction: buildReminderPrompt(speaker.name, userName, reminder, now, transcript), background: true, purpose: "reminder" })).unwrap());
    } catch (err) {
      console.warn("Couldn't write the reminder text, sending it plain:", err);
    }
    if (!text) text = fallbackReminderText(reminder);
    await dispatch(addMessage({ chatId, role: AI, text, speakerId: speaker.id }));
    await dispatch(fetchChats());
    const after = personalState(getState);
    const world = after.elsewhere(speaker);
    const shown = await notifyChatMessage({ chatId, speaker, text, isNsfwChat: isNsfwCharacter(speaker), privacy: after.privacy, world });
    // A muted chat still gets its reminder: it was asked for.
    if (!shown && ui.path?.() !== `/chat/${chatId}`) {
      toast.message(`${speaker.name}: reminder`, { description: text.length > 90 ? `${text.slice(0, 87)}...` : text, action: { label: "Open", onClick: () => ui.navigate(`/chat/${chatId}`) } });
    }
  } catch (err) {
    console.warn("Reminder failed (non-fatal):", err);
  } finally {
    busy = false;
  }
};
