import { useEffect, useRef } from "react";
import { AppDispatch } from "src/store/store";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { generateAssistText } from "src/features/aiSlice";
import { updateCharacter } from "src/features/characterSlice";
import { buildDayLogPrompt, cleanDayLog, dayLogDue } from "src/features/character/dayLog";
import { buildScheduleSection } from "src/features/character/schedule";
import { dayKey, dayMoodFor } from "src/features/character/badDays";
import { Character } from "src/types";

const CHECK_EVERY_MS = 20 * 60 * 1000;
// Before the status poster (15 s) and the first texter (20 s), so their first
// check already finds today's account.
const FIRST_CHECK_MS = 8 * 1000;

// Writes today's account for one character on the helper model and saves it,
// empty when the reply was unusable so it isn't retried all day. Yesterday's
// log, if that's what's there, gives the day a thread to pick up.
export const writeDayLog = async (dispatch: AppDispatch, character: Character, latest: () => Character | undefined, now = Date.now()): Promise<void> => {
  const yesterday = character.dayLog?.date === dayKey(now - 24 * 60 * 60 * 1000) ? character.dayLog.text || undefined : undefined;
  // Later in the day, today's earlier account is brought up to date.
  const earlier = character.dayLog?.date === dayKey(now) ? character.dayLog.text || undefined : undefined;
  const prompt = buildDayLogPrompt(character, now, {
    routine: buildScheduleSection(character.schedule, now),
    dayMood: dayMoodFor(character, now)?.label,
    facts: [...(character.pinnedMemory || []), ...(character.memory || [])].slice(-8),
    yesterday,
    earlier,
  });
  let text = "";
  try {
    text = cleanDayLog(await dispatch(generateAssistText({ instruction: prompt, background: true })).unwrap()) || "";
  } catch (err) {
    console.warn("Day log failed (non-fatal):", err);
  }
  const fresh = latest() || character;
  await dispatch(updateCharacter({ ...fresh, dayLog: { date: dayKey(now), text, writtenAt: now } }));
};

// One consistent day (#107): while the app is open, once a day each character
// with the switch on gets today's account written, one character per check.
const DayLogWriter = () => {
  const dispatch = useAppDispatch();
  const characters = useAppSelector((state) => state.character.characters);
  const charactersRef = useRef(characters);
  charactersRef.current = characters;
  const busy = useRef(false);

  useEffect(() => {
    const check = async () => {
      if (busy.current) return;
      const now = Date.now();
      const due = charactersRef.current.find((c) => dayLogDue(c, now));
      if (!due) return;
      busy.current = true;
      try {
        await writeDayLog(dispatch, due, () => charactersRef.current.find((c) => c.id === due.id), now);
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

export default DayLogWriter;
