import { Character } from "../../../types";
import { generateAssistText } from "../../aiSlice";
import { patchCharacter } from "../../characterSlice";
import { zoneOf } from "../characterClock";
import { dayLogText } from "../dayLog";
import { applyConcerns, buildConcernsPrompt, concernsDue, openConcerns, parseConcerns } from "../preoccupations";
import { buildScheduleSection } from "../schedule";
import { GetState, PersonalDispatch, personalState } from "./state";

// Writes this week's preoccupations for one character and saves them. The
// writing time is recorded even when nothing usable came back, so a failing
// model isn't asked again every hour.
export const writeConcerns = async (dispatch: PersonalDispatch, character: Character, now = Date.now()): Promise<void> => {
  const current = openConcerns(character.concerns);
  const prompt = buildConcernsPrompt(character, now, {
    routine: buildScheduleSection(character.schedule, now, zoneOf(character)),
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

// A check still under way when another starts is left alone (see dayLogJob).
let busy = false;

// Their own preoccupations (#110): once a week each character with the
// switch on gets this week's list, one per check.
export const concernsCheck = () => async (dispatch: PersonalDispatch, getState: GetState) => {
  if (busy) return;
  const now = Date.now();
  const due = personalState(getState).characters.find((c) => concernsDue(c, now));
  if (!due) return;
  busy = true;
  try {
    await writeConcerns(dispatch, due, now);
  } finally {
    busy = false;
  }
};
