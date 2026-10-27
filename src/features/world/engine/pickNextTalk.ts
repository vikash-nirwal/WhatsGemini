import { Character } from "../../../types";
import { awakeAt } from "../../character/firstTexts";
import { lifeScaled } from "../../life/lifeDial";
import { fairOrder, markServed } from "../../life/scheduler";
import { pickWorldTalk, WORLD_TALK_GAP_MS } from "../worldTalk";

// The pair who talk next (#145, #209). Worlds take turns, My world among
// them: the one whose people talked longest ago (by this job's turns) goes
// first, and within it the pair who've gone longest without talking.
// Picking one pair across every world let a world with many people crowd
// out the others.
export const pickNextTalk = (characters: Character[], worlds: Parameters<typeof pickWorldTalk>[1], now: number): [Character, Character] | undefined => {
  const opts = { gapMs: lifeScaled(WORLD_TALK_GAP_MS), awake: (c: Character) => awakeAt(c, now) };
  for (const worldId of fairOrder("world-talk", [null, ...worlds.map((w) => w.id)], (id) => id, now)) {
    const pair = pickWorldTalk(characters, worlds, now, { ...opts, worldAllowed: (w) => w === worldId });
    if (pair) {
      markServed("world-talk", worldId, now);
      return pair;
    }
  }
  return undefined;
};
