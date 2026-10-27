import { generateAssistText } from "../../aiSlice";
import { patchCharacter } from "../../characterSlice";
import { patchWorld } from "../../worldSlice";
import { buildCatchUpPrompt, CATCH_UP_MIN_MS, catchUpFacts, cleanCatchUp, daysAway, driftWhileAway } from "../catchUp";
import { loadTimeline } from "../timeline";
import { featureOn } from "../worldPrefs";
import { EngineDispatch, engineState, GetState } from "./state";

// Catch-up that fits the absence (#213): after the catch-up turns have
// run, each world on world turns has its numbers moved on for the days
// you were away, then one call tells you what you missed. Runs once per
// absence per world: the world remembers which absence it last told.
export const catchUpWorlds = (lastSeen: number, openedAt: number) => async (dispatch: EngineDispatch, getState: GetState) => {
  if (openedAt - lastSeen < CATCH_UP_MIN_MS) return;
  const { worlds, userName } = engineState(getState);
  for (const world of worlds.filter((w) => featureOn(w.id, "worldTurn") && w.catchUp?.from !== lastSeen)) {
    const castNow = () => engineState(getState).characters.filter((c) => c.worldId === world.id);
    if (!castNow().length) continue;
    try {
      // Claimed first, so a second run in the same absence (a remount, a
      // failed call) never moves the numbers twice.
      await dispatch(patchWorld(world.id, { catchUp: { text: "", from: lastSeen, to: openedAt } }));
      for (const [id, change] of Array.from(driftWhileAway(castNow(), lastSeen, openedAt))) await dispatch(patchCharacter(id, change));
      const facts = catchUpFacts(castNow(), await loadTimeline(world.id), lastSeen, openedAt);
      if (!facts.length) continue;
      const text = cleanCatchUp(await dispatch(generateAssistText({
        instruction: buildCatchUpPrompt(world, facts, daysAway(lastSeen, openedAt), userName),
        background: true,
        activity: { at: openedAt, kind: "other", text: `What you missed in ${world.name}`, name: world.name },
        worldId: world.id,
        replyKind: "catch-up",
      })).unwrap());
      if (text) await dispatch(patchWorld(world.id, { catchUp: { text, from: lastSeen, to: openedAt } }));
    } catch (err) {
      console.warn("Catch-up story failed (non-fatal):", err);
    }
  }
};
