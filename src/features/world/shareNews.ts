import { Character, Chat, World } from "../../types";
import { AppDispatch } from "../../store/store";
import { generateAssistText } from "../aiSlice";
import { addMessage, fetchChats } from "../chatSlice";
import { updateCharacter } from "../characterSlice";
import { addFirstText, cleanFirstText } from "../character/firstTexts";
import { buildNewsTextPrompt, ownChat, pickNewsTellers } from "./news";
import { AI, YOU } from "../../utils/constants";

// Sends the texts; see news.ts for who and what.
export const shareNews = (
  { world, cast, chats, userName, news, about = [], max = 2, now = Date.now() }: { world?: World; cast: Character[]; chats: Chat[]; userName: string; news: string; about?: number[]; max?: number; now?: number }
) => async (dispatch: AppDispatch) => {
  let sent = 0;
  for (const c of pickNewsTellers(cast, chats, about, now, max)) {
    const chat = ownChat(chats, c.id)!;
    try {
      const last = (chat.content || []).filter((m) => !m.isSystem && !m.isRoomEvent && m.txt).slice(-4).map((m) => `${m.role === YOU ? userName : c.name}: ${(m.txt || "").slice(0, 200)}`);
      const text = cleanFirstText(await dispatch(generateAssistText({ instruction: buildNewsTextPrompt(c, news, userName, last, about.includes(c.id)), background: true, activity: { at: now, kind: "first-text", text: `${c.name} texted you the news`, characterId: c.id, name: c.name }, ...(world ? { worldId: world.id } : {}) })).unwrap());
      if (!text) continue;
      await dispatch(updateCharacter({ ...c, firstTexts: addFirstText(c.firstTexts, now) }));
      await dispatch(addMessage({ chatId: chat.id!, role: AI, text, speakerId: c.id, notes: ["texted-first"], at: now }));
      sent++;
    } catch (err) {
      console.warn(`${c.name} couldn't text the news (non-fatal):`, err);
    }
  }
  if (sent) await dispatch(fetchChats());
  return sent;
};
