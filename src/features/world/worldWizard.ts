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
  withYou: string; // their starting relationship with you
}

export interface WorldTie {
  a: string; // CastMember keys
  b: string;
  aToB: string; // what b is to a: "your older brother"
  bToA: string;
}

export const buildConnectionsPrompt = (world: WorldBasics, cast: CastMember[], userName: string) =>
  [
    `These people live in the same world. ${describeWorld(world)}`,
    "",
    ...cast.map((c) => `- ${c.name}${c.description ? `: ${c.description.trim()}` : ""}`),
    "",
    `Propose how they're connected: families, friends, rivals, exes, coworkers, neighbours. Not everyone knows everyone. Also say who each of them is to ${userName}, who is new here.`,
    "Answer with one line per connection, nothing else:",
    "TIE: <name> | <name> | <what the second is to the first, e.g. your older sister> | <what the first is to the second>",
    `YOU: <name> | <what they are to ${userName}, e.g. Childhood friend>`,
  ].join("\n");

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
      const [a, b, aToB, bToA] = tie[1].split("|").map(clean);
      const ka = keyOf(a || ""), kb = keyOf(b || "");
      if (!ka || !kb || ka === kb || !aToB) continue;
      if (ties.some((t) => (t.a === ka && t.b === kb) || (t.a === kb && t.b === ka))) continue;
      ties.push({ a: ka, b: kb, aToB, bToA: bToA || aToB });
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
  const add = (from: number, to: number, tie: string) => {
    const c = next.get(from);
    if (!c) return;
    c.ties = [...(c.ties || []).filter((t) => t.withId !== to), { withId: to, tie }];
    if (!(c.knowsAbout || []).includes(to)) c.knowsAbout = [...(c.knowsAbout || []), to];
  };
  for (const t of ties) {
    const a = idOf[t.a], b = idOf[t.b];
    if (a === undefined || b === undefined) continue;
    add(a, b, t.aToB);
    add(b, a, t.bToA);
  }
  return characters.map((c) => next.get(c.id)!).filter((c) => JSON.stringify(c) !== JSON.stringify(characters.find((o) => o.id === c.id)));
};

// For their prompt: the people they're tied to in this world.
export const tiesNoteFor = (character: Character | undefined, characters: Character[]): string | undefined => {
  const lines = (character?.ties || [])
    .map((t) => ({ who: characters.find((c) => c.id === t.withId)?.name, tie: t.tie }))
    .filter((t) => t.who)
    .map((t) => `- ${t.who}: ${t.tie}`);
  return lines.length ? `People in your life here (they have their own lives; mention them naturally when it fits):\n${lines.join("\n")}` : undefined;
};
