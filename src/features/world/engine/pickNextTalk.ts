import { Character, Chat } from "../../../types";
import { acquainted } from "../meetings";
import { awakeAt } from "../../character/firstTexts";
import { lifeScaled } from "../../life/lifeDial";
import { fairOrder, markServed } from "../../life/scheduler";
import { pickWorldTalk, WORLD_TALK_GAP_MS } from "../worldTalk";
import { featureOn } from "../worldPrefs";
import { talkGapFor } from "../bonds";
import { settingGapFactor, talkSettingFor } from "../talkMedium";
import { paceFactor } from "../activity";
import { goalsClash } from "../goals";

// The pair who talk next (#145, #209). Worlds take turns, My world among
// them: the one whose people talked longest ago (by this job's turns) goes
// first, and within it the pair who've gone longest without talking.
// Picking one pair across every world let a world with many people crowd
// out the others.
// `chats`: people in a group chat together know each other (#236).
export const pickNextTalk = (characters: Character[], worlds: Parameters<typeof pickWorldTalk>[1], now: number, chats: Chat[] = []): [Character, Character] | undefined => {
  const opts = { gapMs: lifeScaled(WORLD_TALK_GAP_MS), awake: (c: Character) => awakeAt(c, now) };
  // A world on world turns (#212) has its talk there.
  const ids = [null, ...worlds.map((w) => w.id).filter((id) => !featureOn(id, "worldTurn"))];
  for (const worldId of fairOrder("world-talk", ids, (id) => id, now)) {
    // With drift on (#211), people who are close or tense talk more often;
    // letters come half as often, and people in the same place talk sooner
    // (#216).
    const world = worlds.find((w) => w.id === worldId);
    const drift = featureOn(worldId, "drift");
    // Each at their own pace (#223), and sooner when their goals clash (#221).
    const gapFor = (a: Character, b: Character) =>
      (drift ? talkGapFor(opts.gapMs, a, b, now) : opts.gapMs) * settingGapFactor(talkSettingFor(a, b, world, now)) * paceFactor(a, b, now) * (goalsClash(a, b) ? 0.6 : 1);
    const pair = pickWorldTalk(characters, worlds, now, { ...opts, worldAllowed: (w) => w === worldId, gapFor, known: (a, b) => acquainted(a, b, { chats, world }) });
    if (pair) {
      markServed("world-talk", worldId, now);
      return pair;
    }
  }
  return undefined;
};
