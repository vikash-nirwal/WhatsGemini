import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { generateAssistText } from "src/features/aiSlice";
import { addMessage, fetchChats } from "src/features/chatSlice";
import { updateCharacter } from "src/features/characterSlice";
import { selectActivePersona } from "src/features/settingsSlice";
import { addFirstText, buildFirstTextPrompt, cleanFirstText, firstTextDue } from "src/features/character/firstTexts";
import { buildDreamDirective, dreamDue, dreamIngredients } from "src/features/character/dreams";
import { dayMoodFor } from "src/features/character/badDays";
import { dayLogText } from "src/features/character/dayLog";
import { concernsLine } from "src/features/character/preoccupations";
import { writingStyleLine } from "src/features/character/writingStyle";
import { currentBlock } from "src/features/character/schedule";
import { openPlans } from "src/features/chat/sharedPlans";
import { formatTranscript } from "src/features/ai/utils/chatHistoryUtils";
import { trimToLatestSummary } from "src/features/ai/utils/transcript";
import { isNsfwCharacter } from "src/features/character/contentRating";
import { notifyChatMessage } from "src/features/notifications/notifications";
import { AI } from "src/utils/constants";
import { MessageNote } from "src/types";

const CHECK_EVERY_MS = 20 * 60 * 1000;
const FIRST_CHECK_MS = 20 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// They text first (#93): while the app is open, a character with the switch
// on whose 1:1 chat has gone quiet sends a short text into it, at most one
// per check, on the cheaper helper model. In the morning, with dreams on
// (#94), the text can be about a dream instead.
const FirstTexter = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const chats = useAppSelector((state) => state.chat.chats);
  const characters = useAppSelector((state) => state.character.characters);
  const persona = useAppSelector(selectActivePersona);
  const privacy = useAppSelector((state) => state.settings.privacy);
  const latest = useRef({ chats, characters, persona, privacy, path: location.pathname });
  latest.current = { chats, characters, persona, privacy, path: location.pathname };
  const busy = useRef(false);

  useEffect(() => {
    const check = async () => {
      if (busy.current) return;
      const now = Date.now();
      const { chats, characters, persona } = latest.current;
      // The character's main 1:1 chat: not a what-if or a chat with its own memory.
      const chatFor = (id: number) => chats.find((c) => c.characterIds?.length === 1 && c.characterIds[0] === id && c.memoryScope !== "chat" && !c.whatIf);
      const texter = characters.find((c) => firstTextDue(c, chatFor(c.id), now));
      const chat = texter && chatFor(texter.id);
      if (!texter || !chat?.id) return;
      busy.current = true;
      try {
        const userName = persona?.name?.trim() || "the user";
        const content = chat.content || [];
        const last = content[content.length - 1]?.timestamp || chat.timestamp || now;
        const dreaming = dreamDue(texter, chat, now);
        const reply = await dispatch(generateAssistText({
          instruction: buildFirstTextPrompt(texter, userName, {
            hoursQuiet: Math.max(1, Math.round((now - last) / HOUR_MS)),
            nowDoing: currentBlock(texter.schedule, now)?.activity,
            plans: openPlans(chat.plans).slice(0, 3).map((p) => p.what),
            facts: [...(texter.pinnedMemory || []), ...(texter.memory || [])],
            transcript: formatTranscript(trimToLatestSummary(content).slice(-8), { userName, charName: texter.name }),
            dayMood: dayMoodFor(texter, now)?.label,
            dayLog: dayLogText(texter, now),
            concerns: concernsLine(texter.concerns),
            style: writingStyleLine(texter.writingStyle),
            dream: dreaming ? buildDreamDirective(texter.name, userName, dreamIngredients(texter, chat)) : undefined,
          }),
          background: true,
        })).unwrap();
        const text = cleanFirstText(reply);
        // Recorded even when the reply was unusable, so a failing model
        // isn't asked again on every check.
        const fresh = latest.current.characters.find((c) => c.id === texter.id) || texter;
        await dispatch(updateCharacter({ ...fresh, firstTexts: addFirstText(fresh.firstTexts, now), ...(dreaming && text ? { lastDreamAt: now } : {}) }));
        if (!text) return;
        const notes: MessageNote[] = dreaming ? ["texted-first", "dream"] : ["texted-first"];
        await dispatch(addMessage({ chatId: chat.id, role: AI, text, speakerId: texter.id, notes }));
        await dispatch(fetchChats());
        const shown = await notifyChatMessage({ chatId: chat.id, speaker: texter, text, isNsfwChat: isNsfwCharacter(texter), privacy: latest.current.privacy });
        // In the app but in another chat: a toast instead.
        if (!shown && latest.current.path !== `/chat/${chat.id}`) {
          toast.message(`${texter.name} texted you`, { description: text.length > 90 ? `${text.slice(0, 87)}...` : text, action: { label: "Open", onClick: () => navigate(`/chat/${chat.id}`) } });
        }
      } catch (err) {
        console.warn("First text failed (non-fatal):", err);
      } finally {
        busy.current = false;
      }
    };
    const first = window.setTimeout(check, FIRST_CHECK_MS);
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [dispatch, navigate]);

  return null;
};

export default FirstTexter;
