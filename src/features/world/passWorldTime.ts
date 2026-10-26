import { Character, Chat, World } from "../../types";
import { AppDispatch } from "../../store/store";
import { addChatNotice, addMessage, fetchChats, updateChatOptions } from "../chatSlice";
import { patchWorld } from "../worldSlice";
import { generateAssistText } from "../aiSlice";
import { cleanFirstText } from "../character/firstTexts";
import { buildWorldTimeTextPrompt, describeGap, firstAfterGap, gapDays, TimePassed, timePassedNotice, TimeUnit } from "../chat/passTime";
import { skipStoryTime } from "./storyTime";
import { logToTimeline } from "./timeline";
import { AI, YOU } from "../../utils/constants";

// Pass the time for a whole world: each of its chats gets the gap (so every
// next reply knows it), the world's calendar moves on, it goes in the
// timeline, and - if you like - the people you talk to most text first.
// Resolves to how many texted.
export const passWorldTime = (
  { world, worldId, chats, characters, userName }: { world?: World; worldId: number | null; chats: Chat[]; characters: Character[]; userName: string },
  { amount, unit, note, theyTextFirst }: { amount: number; unit: TimeUnit; note: string; theyTextFirst: boolean }
) => async (dispatch: AppDispatch) => {
  const now = Date.now();
  const gap = describeGap(amount, unit);
  const days = gapDays(amount, unit);
  for (const chat of chats) {
    if (!chat.id || chat.archived) continue;
    const passed: TimePassed = { gap, days, ...(note ? { note } : {}), at: now, fromMessage: (chat.content || []).length + 1 };
    await dispatch(addChatNotice({ chatId: chat.id, text: timePassedNotice(passed) }));
    await dispatch(updateChatOptions({ chatId: chat.id, patch: { timePassed: passed } }));
  }
  if (world?.storyTime && days >= 1) await dispatch(patchWorld(world.id, (w) => (w.storyTime ? { storyTime: skipStoryTime(w.storyTime, Math.round(days), now) } : {})));
  void logToTimeline(worldId, { kind: "time", text: `${gap} passed for everyone${note ? `: ${note}` : ""}`, at: now }, world?.storyTime);
  if (!theyTextFirst) return 0;
  let texted = 0;
  for (const c of firstAfterGap(characters, chats)) {
    const chat = chats.find((ch) => ch.characterIds?.length === 1 && ch.characterIds[0] === c.id && !ch.whatIf && !ch.archived);
    if (!chat?.id) continue;
    try {
      const last = (chat.content || []).filter((m) => !m.isSystem && !m.isRoomEvent && m.txt).slice(-4).map((m) => `${m.role === YOU ? userName : c.name}: ${(m.txt || "").slice(0, 200)}`);
      const text = cleanFirstText(await dispatch(generateAssistText({ instruction: buildWorldTimeTextPrompt(c, { gap, days, note }, userName, last), background: true, activity: { at: now, kind: "first-text", text: `${c.name} texted after ${gap}`, characterId: c.id, name: c.name } })).unwrap());
      if (!text) continue;
      await dispatch(addMessage({ chatId: chat.id, role: AI, text, speakerId: c.id, notes: ["texted-first"], at: Date.now() }));
      texted++;
    } catch (err) {
      console.warn(`${c.name} couldn't text after the gap (non-fatal):`, err);
    }
  }
  await dispatch(fetchChats());
  return texted;
};
