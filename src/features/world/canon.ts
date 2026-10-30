import { Character, World } from "../../types";
import { extrasLine } from "./extras";
import type { TimelineEntry } from "./timeline";
import { featureOn } from "./worldPrefs";
import { worldLanguageLine } from "./worldVoice";

// A canon check (#220). The more a world writes about itself, the more it
// contradicts itself: someone who died turns up at the market, a couple who
// split acts as one, a closed shop is open again. A world now keeps its
// settled facts - lasting changes (#219), the big turns in people's lives,
// who has left - and every background prompt hears them as things never to
// contradict. People who have died take no further part in background life.

const BIG = /\b(married|wed|engaged|divorc\w*|died|passed away|was killed|had a (?:baby|son|daughter)|gave birth|moved away|left (?:town|for good)|retired|was arrested|went to prison|was elected|took over)\b/i;
const DEAD = /\b(died|passed away|was killed)\b/i;
const MAX_IN_PROMPT = 15;
const MAX_KEPT = 30;

// Someone whose own life has ended: their life event says so.
export const isGone = (c: Pick<Character, "lifeEvents">) => (c.lifeEvents || []).some((e) => DEAD.test(e.text));

export const canonOf = (world: Pick<World, "canon"> | undefined, cast: Pick<Character, "lifeEvents">[], timeline: TimelineEntry[]): string[] => {
  const facts = [
    ...timeline.filter((e) => e.kind === "departure").map((e) => e.text),
    ...cast.flatMap((c) => (c.lifeEvents || []).filter((e) => BIG.test(e.text)).map((e) => e.text)),
    ...(world?.canon || []),
  ];
  return Array.from(new Set(facts)).slice(-MAX_IN_PROMPT);
};

export const canonLine = (facts: string[]): string | undefined => (facts.length ? `Settled in this world (never contradict it): ${facts.map((f) => f.replace(/[.\s]+$/, "")).join("; ")}.` : undefined);

export const addCanon = (list: string[] | undefined, fact: string): string[] => Array.from(new Set([...(list || []), fact.trim()])).slice(-MAX_KEPT);

// What every background prompt about a world hears besides its own
// material: what's settled, and the people around (with that switch on).
export const worldContext = (world: World | undefined, people: Pick<Character, "id">[], cast: Character[], timeline: TimelineEntry[]): string[] => {
  if (!world) return [];
  const canon = canonLine(canonOf(world, cast, timeline));
  const extras = featureOn(world.id, "extras") ? extrasLine(world, people, cast) : undefined;
  return [worldLanguageLine(world), canon, extras].filter((x): x is string => Boolean(x));
};

// Generated text that puts someone who has died back on stage: it names
// them without any sign it's about remembering them. Such a talk, life
// event or event is dropped rather than kept.
const REMEMBERING = /\b(remember\w*|memory|memories|memorial|late|grave|funeral|mourn\w*|miss(?:es|ed|ing)?|died|death|passed|ghost|wake|in honou?r of)\b/i;
export const bringsBackGone = (text: string, gone: Pick<Character, "name">[]): boolean =>
  !REMEMBERING.test(text) &&
  gone.some((c) => new RegExp(`(?<![\\p{L}\\p{N}_])${c.name.split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`, "iu").test(text));

export const goneIn = (characters: Character[], worldId: number | undefined) => characters.filter((c) => c.worldId === worldId && isGone(c));
