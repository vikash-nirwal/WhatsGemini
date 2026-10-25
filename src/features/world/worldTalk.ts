import { Character, World, WorldTalk } from "../../types";
import { worldOf } from "./currentWorld";

// Life inside a world (#145): characters who know each other text on their
// own, one helper call per exchange. Who talks follows "who knows whom"
// (#74) and the wizard's ties (#144): a big world doesn't mean everyone
// talks to everyone.

export const WORLD_TALK_GAP_MS = 18 * 60 * 60 * 1000; // per pair, before the life dial
const KEEP_TALKS = 6; // per stored character
const NOTE_FRESH_MS = 2 * 24 * 60 * 60 * 1000;

const holderOf = (a: number, b: number) => Math.min(a, b);

export const knowEachOther = (a: Character, b: Character) =>
  Boolean(a.knowsAbout?.includes(b.id) || b.knowsAbout?.includes(a.id) || a.ties?.some((t) => t.withId === b.id) || b.ties?.some((t) => t.withId === a.id));

export const talksBetween = (characters: Character[], a: number, b: number): WorldTalk[] => {
  const holder = characters.find((c) => c.id === holderOf(a, b));
  const other = a === holder?.id ? b : a;
  return (holder?.talks || []).filter((t) => t.withId === other);
};

// The pair whose last talk is longest ago, among those due and awake.
export const pickWorldTalk = (
  characters: Character[],
  worlds: World[],
  now: number,
  {
    gapMs = WORLD_TALK_GAP_MS,
    awake = (): boolean => true,
    worldAllowed = (): boolean => true,
  }: { gapMs?: number; awake?: (c: Character) => boolean; worldAllowed?: (worldId: number | null) => boolean } = {}
): [Character, Character] | undefined => {
  let best: { pair: [Character, Character]; last: number } | undefined;
  for (let i = 0; i < characters.length; i++) {
    for (let j = i + 1; j < characters.length; j++) {
      const a = characters[i], b = characters[j];
      const world = worldOf(a, worlds);
      if (world !== worldOf(b, worlds) || !worldAllowed(world) || !knowEachOther(a, b)) continue;
      const last = talksBetween(characters, a.id, b.id).reduce((m, t) => Math.max(m, t.at), 0);
      if (now - last < gapMs || !awake(a) || !awake(b)) continue;
      if (!best || last < best.last) best = { pair: a.id < b.id ? [a, b] : [b, a], last };
    }
  }
  return best?.pair;
};

const tieOf = (from: Character, to: Character) => from.ties?.find((t) => t.withId === to.id)?.tie;

export const buildWorldTalkPrompt = (
  a: Character,
  b: Character,
  { world, userName, maxLines, previous }: { world?: World; userName: string; maxLines: number; previous?: WorldTalk }
) => {
  const who = (c: Character, other: Character) =>
    `${c.name}: ${[c.description, c.prompt].filter(Boolean).join(" ").slice(0, 500)}${tieOf(c, other) ? ` (${other.name} is ${c.name}'s ${tieOf(c, other)!.replace(/^your\s+/i, "")})` : ""}${c.dayLog?.text ? `\nTheir day so far: ${c.dayLog.text.slice(0, 300)}` : ""}`;
  const names = { [a.id]: a.name, [b.id]: b.name };
  return [
    `Write a text conversation between ${a.name} and ${b.name}, who know each other${world ? ` and live in ${world.name}: ${world.premise}` : ""}. ${userName} isn't in it.`,
    "",
    who(a, b),
    who(b, a),
    ...(previous?.lines.length ? ["", "The last time they texted:", ...previous.lines.map((l) => `${names[l.speakerId] || "?"}: ${l.text}`)] : []),
    "",
    `- 2 to ${maxLines} short texts, each starting with the sender's name and a colon, like "${a.name}: ...". Not strictly alternating: people double-text.`,
    `- About their own lives: plans, work, gossip, a favour, a joke. ${userName} may come up, but doesn't have to.`,
    "- Plain text, in character, no stage directions. Don't settle big story points.",
  ].join("\n");
};

export const addWorldTalk = (holder: Character, talk: WorldTalk): Character => ({
  ...holder,
  talks: [...(holder.talks || []), talk].slice(-KEEP_TALKS),
});

export interface TalkThread {
  a: Character;
  b: Character;
  talks: WorldTalk[];
  lastAt: number;
}

// Threads in one world, newest first, for Peek.
export const worldThreads = (characters: Character[], worlds: World[], worldId: number | null): TalkThread[] => {
  const here = characters.filter((c) => worldOf(c, worlds) === worldId);
  const threads: TalkThread[] = [];
  for (const holder of here) {
    const byOther = new Map<number, WorldTalk[]>();
    for (const t of holder.talks || []) byOther.set(t.withId, [...(byOther.get(t.withId) || []), t]);
    byOther.forEach((talks, otherId) => {
      const other = here.find((c) => c.id === otherId);
      if (other && talks.some((t) => t.lines.length)) threads.push({ a: holder, b: other, talks, lastAt: Math.max(...talks.map((t) => t.at)) });
    });
  }
  return threads.sort((x, y) => y.lastAt - x.lastAt);
};

// What the character's next replies are told: their latest talk, if recent.
export const worldTalkNoteFor = (character: Character | undefined, characters: Character[], now = Date.now()): string | undefined => {
  if (!character) return undefined;
  const mine = characters.flatMap((holder) =>
    (holder.talks || [])
      .filter((t) => holder.id === character.id || t.withId === character.id)
      .map((t) => ({ t, otherId: holder.id === character.id ? t.withId : holder.id }))
  );
  const latest = mine.filter(({ t }) => now - t.at < NOTE_FRESH_MS && t.lines.length).sort((x, y) => y.t.at - x.t.at)[0];
  if (!latest) return undefined;
  const other = characters.find((c) => c.id === latest.otherId);
  if (!other) return undefined;
  const names: Record<number, string> = { [character.id]: character.name, [other.id]: other.name };
  return `Recently you texted ${other.name}:\n${latest.t.lines.slice(-6).map((l) => `${names[l.speakerId]}: ${l.text}`).join("\n")}\nIt's part of your life; bring it up only if it fits.`;
};
