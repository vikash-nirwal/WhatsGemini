import { useEffect, useRef } from "react";
import { registerJob } from "src/features/life/scheduler";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { generateAssistText } from "src/features/aiSlice";
import { updateCharacter } from "src/features/characterSlice";
import { selectActivePersona } from "src/features/settingsSlice";
import { addLetter, buildLetterPrompt, cleanLetter, letterDue } from "src/features/character/letters";
import { currentBlock } from "src/features/character/schedule";
import { formatTranscript } from "src/features/ai/utils/chatHistoryUtils";
import { trimToLatestSummary } from "src/features/ai/utils/transcript";
import { latestStorySummary } from "src/features/chat/recap";
import { useLivingCharacters } from "src/hooks/useWorld";

const CHECK_EVERY_MS = 30 * 60 * 1000;
const FIRST_CHECK_MS = 25 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Letters (#61): while the app is open, a character with letters on whose
// 1:1 chat has been quiet for a few days writes you one, at most one per
// check, on the cheaper helper model.
const LetterWriter = () => {
  const dispatch = useAppDispatch();
  const chats = useAppSelector((state) => state.chat.chats);
  const characters = useLivingCharacters();
  const persona = useAppSelector(selectActivePersona);
  const latest = useRef({ chats, characters, persona });
  latest.current = { chats, characters, persona };
  const busy = useRef(false);

  useEffect(() => {
    const check = async () => {
      if (busy.current) return;
      const now = Date.now();
      const { chats, characters, persona } = latest.current;
      const chatFor = (id: number) => chats.find((c) => c.characterIds?.length === 1 && c.characterIds[0] === id && c.memoryScope !== "chat");
      const writer = characters.find((c) => letterDue(c, chatFor(c.id), now));
      const chat = writer && chatFor(writer.id);
      if (!writer || !chat?.id) return;
      busy.current = true;
      try {
        const userName = persona?.name?.trim() || "the user";
        const content = chat.content || [];
        const last = content[content.length - 1]?.timestamp || chat.timestamp || now;
        const recent = trimToLatestSummary(content).slice(-10);
        const reply = await dispatch(generateAssistText({
          instruction: buildLetterPrompt(writer, userName, Math.max(1, Math.round((now - last) / DAY_MS)), writer.memory || [], formatTranscript(recent, { userName, charName: writer.name }), currentBlock(writer.schedule, now)?.activity, latestStorySummary(content)),
          background: true,
          activity: { kind: "letter", text: `${writer.name} wrote you a letter`, characterId: writer.id, name: writer.name },
        })).unwrap();
        const text = cleanLetter(reply);
        const fresh = latest.current.characters.find((c) => c.id === writer.id) || writer;
        // Saved even when the reply was unusable, so one absence never asks twice.
        await dispatch(updateCharacter({ ...fresh, letters: addLetter(fresh.letters, { id: `letter-${now.toString(36)}`, at: now, text: text || "", chatId: chat.id }) }));
      } catch (err) {
        console.warn("Letter failed (non-fatal):", err);
      } finally {
        busy.current = false;
      }
    };
    // On the scheduler (#209): its own checks, catch-up and Simulate a day.
    return registerJob("letters", { everyMs: CHECK_EVERY_MS, firstMs: FIRST_CHECK_MS }, () => check());
  }, [dispatch]);

  return null;
};

export default LetterWriter;
