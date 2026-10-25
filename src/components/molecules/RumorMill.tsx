import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { generateAssistText } from "src/features/aiSlice";
import { updateCharacter } from "src/features/characterSlice";
import { selectActivePersona } from "src/features/settingsSlice";
import { addRumor, buildRumorPrompt, newRumorId, parseRumorReply, pickListener, rumorDue, rumorListenersFor } from "src/features/character/rumors";
import { formatTranscript } from "src/features/ai/utils/chatHistoryUtils";
import { trimToLatestSummary } from "src/features/ai/utils/transcript";

const CHECK_EVERY_MS = 30 * 60 * 1000;
const FIRST_CHECK_MS = 35 * 1000;

// Rumors (#98): while the app is open, now and then something from the 1:1
// chat of a character who "talks" reaches another character, a little wrong,
// at most one per check, on the cheaper helper model.
const RumorMill = () => {
  const dispatch = useAppDispatch();
  const chats = useAppSelector((state) => state.chat.chats);
  const characters = useAppSelector((state) => state.character.characters);
  const persona = useAppSelector(selectActivePersona);
  const latest = useRef({ chats, characters, persona });
  latest.current = { chats, characters, persona };
  const busy = useRef(false);

  useEffect(() => {
    const check = async () => {
      if (busy.current) return;
      const now = Date.now();
      const { chats, characters, persona } = latest.current;
      const chatFor = (id: number) => chats.find((c) => c.characterIds?.length === 1 && c.characterIds[0] === id && c.memoryScope !== "chat" && !c.whatIf);
      const source = characters.find((c) => rumorDue(c, chatFor(c.id), characters, chats, now));
      const chat = source && chatFor(source.id);
      const listener = source && pickListener(rumorListenersFor(source, characters, chats), now);
      if (!source || !chat || !listener) return;
      busy.current = true;
      try {
        const userName = persona?.name?.trim() || "the user";
        const transcript = formatTranscript(trimToLatestSummary(chat.content || []).slice(-16), { userName, charName: source.name });
        const reply = await dispatch(generateAssistText({ instruction: buildRumorPrompt(source.name, listener.name, userName, transcript), background: true, activity: { kind: "rumor", text: `${source.name} talked to ${listener.name} about you`, characterId: source.id, name: source.name } })).unwrap();
        const parsed = parseRumorReply(reply);
        const fresh = latest.current.characters.find((c) => c.id === listener.id) || listener;
        // Kept even when there was nothing worth gossiping about (an empty
        // rumor, already "raised"), so the same stretch isn't asked about again.
        await dispatch(updateCharacter({
          ...fresh,
          rumors: addRumor(fresh.rumors, { id: newRumorId(), fromId: source.id, heard: parsed?.heard || "", truth: parsed?.truth || "", at: now, ...(parsed ? {} : { raised: now }) }),
        }));
      } catch (err) {
        console.warn("Rumor failed (non-fatal):", err);
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
  }, [dispatch]);

  return null;
};

export default RumorMill;
