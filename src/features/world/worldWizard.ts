import { Character, World } from "../../types";

// The world wizard (#144): the world, its cast, how they're connected, and
// who you are there. These are the pieces that don't need the page.

type WorldBasics = Pick<World, "name" | "premise" | "tone" | "era">;

const describeWorld = (w: WorldBasics) =>
  [`${w.name}: ${w.premise.trim()}`, w.tone?.trim() && `Tone: ${w.tone.trim()}.`, w.era?.trim() && `Era and technology: ${w.era.trim()}.`].filter(Boolean).join(" ");

// A "character from one line" idea (#45) that fits the world.
// `connection`: someone already there the new person is tied to, so the draft
// fits them (a brother who shares the family name, knows their story).
export const castIdea = (line: string, world: WorldBasics, connection?: { name: string; description?: string; tie: string }) =>
  `${line.trim()}. They live in this world - ${describeWorld(world)} Their look, job, way of talking and what they own fit it.${connection ? ` They are ${connection.name}'s ${connection.tie.replace(/^your\s+/i, "")}${connection.description ? ` (${connection.name}: ${connection.description.trim().slice(0, 300)})` : ""}; write them so that fits - shared history, family name or ways if it's family, and what they think of ${connection.name}.` : ""}`;

export interface CastMember {
  key: string; // stable while the wizard is open; ids don't exist yet for new people
  name: string;
  description?: string;
  about?: string; // more of who they are: their personality, for the mapper (#237)
  withYou: string; // their starting relationship with you
  withYouSet?: boolean; // typed by you, so "Suggest again" leaves it (#237)
}

export interface WorldTie {
  a: string; // CastMember keys
  b: string;
  aToB: string; // what b is to a: "your older brother"
  bToA: string;
  story?: string; // how they know each other, one line (#237)
  kept?: boolean; // made or edited by you, so "Suggest again" keeps it (#237)
}

// How many of them know each other (#237).
export type Closeness = "close" | "mix" | "scattered";
export const CLOSENESS_LABELS: Record<Closeness, string> = { close: "Close-knit", mix: "A mix", scattered: "Scattered" };
const CLOSENESS_ASK: Record<Closeness, string> = {
  close: "A close-knit place: most of them know each other, several are family or old friends, and their lives overlap.",
  mix: "A mix: some are family or close, others only acquaintances, and a few don't know each other at all.",
  scattered: "Scattered: most of them don't know each other yet; only a few connections, each one strong.",
};

// The connections the mapper proposes. `kept`: ties you made or edited,
// which stay as they are; the new ones fill in around them. Each new one
// says how they know each other, which their chats and talks use.
export const buildConnectionsPrompt = (world: WorldBasics, cast: CastMember[], userName: string, { kept = [], closeness = "mix" }: { kept?: WorldTie[]; closeness?: Closeness } = {}) => {
  const nameOf = (key: string) => cast.find((c) => c.key === key)?.name || "?";
  return [
    `These people live in the same world. ${describeWorld(world)}`,
    "",
    ...cast.map((c) => `- ${c.name}${c.description ? `: ${c.description.trim()}` : ""}${c.about ? ` (${c.about.trim().slice(0, 240)})` : ""}${c.withYouSet && c.withYou.trim() ? ` [to ${userName}: ${c.withYou.trim()}]` : ""}`),
    "",
    ...(kept.length ? ["Already decided (keep these; don't repeat or contradict them):", ...kept.map((t) => `- ${nameOf(t.b)} is ${nameOf(t.a)}'s ${t.aToB.replace(/^your\s+/i, "")}${t.story ? ` (${t.story})` : ""}`), ""] : []),
    `Propose how they're connected: families, friends, rivals, exes, coworkers, neighbours, each fitting who they are and this world. ${CLOSENESS_ASK[closeness]} Make the two sides agree (an older sister's sibling is her younger brother or sister). Also say who each of them is to ${userName}, who is new here${cast.some((c) => c.withYouSet) ? ", except those already given in brackets" : ""}.`,
    "Answer with one line per connection, nothing else:",
    "TIE: <name> | <name> | <what the second is to the first, e.g. your older sister> | <what the first is to the second> | <how they know each other, one short line of shared history, e.g. shared a room growing up; fell out over the boat>",
    `YOU: <name> | <what they are to ${userName}, e.g. Childhood friend>`,
  ].join("\n");
};

const clean = (s: string | undefined) => (s || "").trim().replace(/^["']|["']$/g, "").trim();

// Lenient: names are matched case-insensitively, unknown names and malformed
// lines are skipped, and a pair only appears once.
export const parseConnections = (reply: string, cast: CastMember[]): { ties: WorldTie[]; withYou: Record<string, string> } => {
  const byName = new Map(cast.map((c) => [c.name.trim().toLowerCase(), c.key]));
  const keyOf = (name: string) => byName.get(clean(name).toLowerCase());
  const ties: WorldTie[] = [];
  const withYou: Record<string, string> = {};
  for (const raw of reply.split("\n")) {
    const line = raw.replace(/^[\s*-]+/, "");
    const tie = line.match(/^TIE:\s*(.+)$/i);
    const you = line.match(/^YOU:\s*(.+)$/i);
    if (tie) {
      const [a, b, aToB, bToA, story] = tie[1].split("|").map(clean);
      const ka = keyOf(a || ""), kb = keyOf(b || "");
      if (!ka || !kb || ka === kb || !aToB) continue;
      if (ties.some((t) => (t.a === ka && t.b === kb) || (t.a === kb && t.b === ka))) continue;
      ties.push({ a: ka, b: kb, aToB, bToA: bToA || aToB, ...(story ? { story: story.slice(0, 200) } : {}) });
    } else if (you) {
      const [name, what] = you[1].split("|").map(clean);
      const key = keyOf(name || "");
      if (key && what) withYou[key] = what;
    }
  }
  return { ties, withYou };
};

// Ties become each side's own list (by the ids the cast got when saved), and
// both sides know each other (#74).
export const applyTies = (characters: Character[], ties: WorldTie[], idOf: Record<string, number>): Character[] => {
  const next = new Map(characters.map((c) => [c.id, { ...c }]));
  const add = (from: number, to: number, tie: string, story?: string) => {
    const c = next.get(from);
    if (!c) return;
    c.ties = [...(c.ties || []).filter((t) => t.withId !== to), { withId: to, tie, ...(story?.trim() ? { story: story.trim() } : {}) }];
    if (!(c.knowsAbout || []).includes(to)) c.knowsAbout = [...(c.knowsAbout || []), to];
  };
  for (const t of ties) {
    const a = idOf[t.a], b = idOf[t.b];
    if (a === undefined || b === undefined) continue;
    add(a, b, t.aToB, t.story);
    add(b, a, t.bToA, t.story);
  }
  return characters.map((c) => next.get(c.id)!).filter((c) => JSON.stringify(c) !== JSON.stringify(characters.find((o) => o.id === c.id)));
};

// For their prompt: the people they're tied to in this world.
export const tiesNoteFor = (character: Character | undefined, characters: Character[]): string | undefined => {
  const lines = (character?.ties || [])
    .map((t) => ({ who: characters.find((c) => c.id === t.withId)?.name, tie: t.tie, story: t.story }))
    .filter((t) => t.who)
    .map((t) => `- ${t.who}: ${t.tie}${t.story ? ` (${t.story})` : ""}`);
  return lines.length ? `People in your life here (they have their own lives; mention them naturally when it fits):\n${lines.join("\n")}` : undefined;
};

// "Suggest again" (#237): your ties stay, and new ones fill in around them;
// a pair you've already connected isn't connected twice. Who someone is to
// you stays when you typed it.
export const mergeSuggested = (current: WorldTie[], suggested: WorldTie[]): WorldTie[] => {
  const kept = current.filter((t) => t.kept);
  const taken = (a: string, b: string) => kept.some((t) => (t.a === a && t.b === b) || (t.a === b && t.b === a));
  return [...kept, ...suggested.filter((t) => !taken(t.a, t.b))];
};
