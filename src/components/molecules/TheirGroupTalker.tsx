import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { selectActivePersona } from "src/features/settingsSlice";
import { theirTalkDue } from "src/features/chat/theirGroup";
import { runTheirGroup } from "src/features/chat/runTheirGroup";
import { registerTick } from "src/features/life/ticks";
import { useLivingCharacters, useLivingChats } from "src/hooks/useWorld";

const CHECK_EVERY_MS = 20 * 60 * 1000;
const FIRST_CHECK_MS = 45 * 1000;

// Groups of theirs (#202): while the app is open, one that's due talks -
// one group per check, on the background model.
const TheirGroupTalker = () => {
  const dispatch = useAppDispatch();
  const chats = useLivingChats();
  const characters = useLivingCharacters();
  const persona = useAppSelector(selectActivePersona);
  const latest = useRef({ chats, characters, persona });
  latest.current = { chats, characters, persona };
  const busy = useRef(false);

  useEffect(() => {
    const check = async (at?: number) => {
      if (busy.current) return;
      const now = at ?? Date.now();
      const { chats, characters, persona } = latest.current;
      const chat = chats.find((c) => theirTalkDue(c, now));
      if (!chat) return;
      busy.current = true;
      try {
        await dispatch(runTheirGroup(chat, characters, persona?.name?.trim() || "the user", now));
      } catch (err) {
        console.warn("Their group's talk failed (non-fatal):", err);
      } finally {
        busy.current = false;
      }
    };
    const first = window.setTimeout(() => void check(), FIRST_CHECK_MS);
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    const offTick = registerTick("their-groups", (at) => check(at));
    return () => {
      offTick();
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [dispatch]);

  return null;
};

export default TheirGroupTalker;
