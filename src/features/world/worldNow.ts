import { Character, World } from "../../types";
import { activePlaceStates } from "./aftermath";
import { bondOf, bondWords, intensity, moodOf, moodReasonOf, reasonOf } from "./bonds";
import { canonLine, canonOf } from "./canon";
import { extrasLine } from "./extras";
import { seasonOf } from "./rhythm";
import type { TimelineEntry } from "./timeline";
import { featureOn } from "./worldPrefs";

// The world as it is now, for the chats you type in (#226). The world engine's
// own prompts (talks, life events, events) hear what's settled (#220), the
// season and how places are after an event (#219, #222), the people around
// (#218) and each person's mood and bonds (#211), but replies to you used
// to hear none of it: someone who died a fortnight ago, out of the last few
// timeline entries, could be talked about as alive in your private chat.

// What's settled: always sent, like god mode's truths.
export const buildCanonNote = (world: World | undefined, cast: Character[], timeline: TimelineEntry[]): string | undefined =>
  world ? canonLine(canonOf(world, cast.filter((c) => c.worldId === world.id), timeline)) : undefined;

// The season and how places are, for everyone in the chat.
export const buildWorldNowNote = (world: World | undefined, now: number): string | undefined => {
  if (!world) return undefined;
  const states = activePlaceStates(world, now);
  return [
    `In ${world.name} it's ${seasonOf(world, now)}; let the season show when it fits (weather, light, what people do).`,
    ...(states.length ? [`Around ${world.name} right now: ${states.map((s) => `${s.name} is ${s.text}`).join("; ")}.`] : []),
  ].join(" ");
};

const STRONG_MOOD = 25;
const STRONG_BOND = 30;

// One person's own state: their mood, the people they're closest to or
// most at odds with lately and why, and the people around them who aren't
// characters (with that switch on).
export const buildInnerStateNote = (character: Character | undefined, world: World | undefined, cast: Character[], now: number): string | undefined => {
  if (!character) return undefined;
  const lines: string[] = [];
  const mood = moodOf(character, now);
  if (Math.abs(mood) >= STRONG_MOOD) {
    const why = moodReasonOf(character, now);
    lines.push(`Lately you've been ${mood > 0 ? (mood >= 60 ? "on top of the world" : "in good spirits") : mood <= -60 ? "really low" : "a bit down"}${why ? ` (${why})` : ""}. It colours how you sound, without explaining it unless asked.`);
  }
  const known = cast.filter((c) => c.id !== character.id && c.worldId === character.worldId);
  const felt = known
    .map((other) => ({ other, words: bondWords(character, other.id, now), strength: intensity(character, other, now), why: reasonOf(character, other.id, now), bond: bondOf(character, other.id, now) }))
    .filter((x) => x.words && (Math.abs(x.bond.closeness) >= STRONG_BOND || x.bond.tension >= STRONG_BOND))
    .sort((x, y) => y.strength - x.strength)
    .slice(0, 3);
  for (const f of felt) lines.push(`With ${f.other.name} things are ${f.words} lately${f.why ? `: ${f.why}` : ""}.`);
  if (world && featureOn(world.id, "extras")) {
    const extras = extrasLine(world, [character], cast);
    if (extras) lines.push(extras);
  }
  return lines.length ? lines.join("\n") : undefined;
};
