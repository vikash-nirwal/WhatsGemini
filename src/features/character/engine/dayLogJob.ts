import { Character } from "../../../types";
import { generateAssistText } from "../../aiSlice";
import { patchCharacter } from "../../characterSlice";
import { dayKey, dayMoodFor } from "../badDays";
import { zoneOf } from "../characterClock";
import { buildDayLogPrompt, cleanDayLog, dayLogDue } from "../dayLog";
import { buildScheduleSection } from "../schedule";
import { GetState, PersonalDispatch, personalState } from "./state";

// Writes today's account for one character on the helper model and saves it,
// empty when the reply was unusable so it isn't retried all day. Yesterday's
// log, if that's what's there, gives the day a thread to pick up.
export const writeDayLog = async (dispatch: PersonalDispatch, character: Character, now = Date.now()): Promise<void> => {
  const yesterday = character.dayLog?.date === dayKey(now - 24 * 60 * 60 * 1000, zoneOf(character)) ? character.dayLog.text || undefined : undefined;
  // Later in the day, today's earlier account is brought up to date.
  const earlier = character.dayLog?.date === dayKey(now, zoneOf(character)) ? character.dayLog.text || undefined : undefined;
  const prompt = buildDayLogPrompt(character, now, {
    routine: buildScheduleSection(character.schedule, now, zoneOf(character)),
    dayMood: dayMoodFor(character, now)?.label,
    facts: [...(character.pinnedMemory || []), ...(character.memory || [])].slice(-8),
    yesterday,
    earlier,
  });
  let text = "";
  try {
    text = cleanDayLog(await dispatch(generateAssistText({ instruction: prompt, background: true, activity: { kind: "day-log", text: `${character.name}'s day was planned`, characterId: character.id, name: character.name } })).unwrap()) || "";
  } catch (err) {
    console.warn("Day log failed (non-fatal):", err);
  }
  await dispatch(patchCharacter(character.id, { dayLog: { date: dayKey(now, zoneOf(character)), text, writtenAt: now } }));
};

// The scheduler runs one check at a time, but a check still under way when
// another starts (a catch-up, Simulate a day) leaves it alone, as the
// component's own flag did.
let busy = false;

// One consistent day (#107): once a day each character with the switch on
// gets today's account written, one character per check.
export const dayLogCheck = () => async (dispatch: PersonalDispatch, getState: GetState) => {
  if (busy) return;
  const now = Date.now();
  const due = personalState(getState).characters.find((c) => dayLogDue(c, now));
  if (!due) return;
  busy = true;
  try {
    await writeDayLog(dispatch, due, now);
  } finally {
    busy = false;
  }
};
