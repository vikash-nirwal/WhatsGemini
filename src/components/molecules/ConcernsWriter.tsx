import { useEffect, useRef } from "react";
import { registerJob } from "src/features/life/scheduler";
import { AppDispatch } from "src/store/store";
import { useAppDispatch } from "src/store/hooks";
import { generateAssistText } from "src/features/aiSlice";
import { patchCharacter } from "src/features/characterSlice";
import { applyConcerns, buildConcernsPrompt, concernsDue, openConcerns, parseConcerns } from "src/features/character/preoccupations";
import { buildScheduleSection } from "src/features/character/schedule";
import { dayLogText } from "src/features/character/dayLog";
import { Character } from "src/types";
import { useLivingCharacters } from "src/hooks/useWorld";

const CHECK_EVERY_MS = 60 * 60 * 1000;
// After the day log (8 s), so this week's list can lean on today's account.
const FIRST_CHECK_MS = 12 * 1000;

// Writes this week's preoccupations for one character and saves them. The
// writing time is recorded even when nothing usable came back, so a failing
// model isn't asked again every hour.
export const writeConcerns = async (dispatch: AppDispatch, character: Character, latest: () => Character | undefined, now = Date.now()): Promise<void> => {
  const current = openConcerns(character.concerns);
  const prompt = buildConcernsPrompt(character, now, {
    routine: buildScheduleSection(character.schedule, now),
    dayLog: dayLogText(character, now),
    facts: [...(character.pinnedMemory || []), ...(character.memory || [])].slice(-8),
    current,
  });
  let concerns = character.concerns;
  try {
    const update = parseConcerns(await dispatch(generateAssistText({ instruction: prompt, background: true, activity: { kind: "concerns", text: `What's on ${character.name}'s mind was updated`, characterId: character.id, name: character.name } })).unwrap(), current.length);
    if (update.added.length > 0 || update.done.length > 0) concerns = applyConcerns(character.concerns, update, now);
  } catch (err) {
    console.warn("Preoccupations failed (non-fatal):", err);
  }
  await dispatch(patchCharacter(character.id, { concerns, concernsWrittenAt: now }));
};

// Their own preoccupations (#110): while the app is open, once a week each
// character with the switch on gets this week's list, one per check.
const ConcernsWriter = () => {
  const dispatch = useAppDispatch();
  const characters = useLivingCharacters();
  const charactersRef = useRef(characters);
  charactersRef.current = characters;
  const busy = useRef(false);

  useEffect(() => {
    const check = async () => {
      if (busy.current) return;
      const now = Date.now();
      const due = charactersRef.current.find((c) => concernsDue(c, now));
      if (!due) return;
      busy.current = true;
      try {
        await writeConcerns(dispatch, due, () => charactersRef.current.find((c) => c.id === due.id), now);
      } finally {
        busy.current = false;
      }
    };
    // On the scheduler (#209): its own checks, catch-up and Simulate a day.
    return registerJob("concerns", { everyMs: CHECK_EVERY_MS, firstMs: FIRST_CHECK_MS }, () => check());
  }, [dispatch]);

  return null;
};

export default ConcernsWriter;
