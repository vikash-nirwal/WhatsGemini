import { Character, World } from "../../types";

// Background people (#218, a per-world switch, off by default). Real
// places are full of people who aren't main characters - the landlord, the
// baker's assistant, a rival's cousin - but every name a reply mentioned
// used to be invented fresh and never came back. Now a world keeps a light
// roster of them: background prompts are told to bring them back by name,
// and a talk or world turn that brings up someone new adds them.

export type Extra = NonNullable<World["extras"]>[number];

const MAX_EXTRAS = 30;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// The ones worth naming in a prompt about these people: theirs first, then
// the most recent.
export const extrasFor = (world: Pick<World, "extras"> | undefined, people: Pick<Character, "id">[], max = 8): Extra[] => {
  const list = world?.extras || [];
  const ids = new Set(people.map((p) => p.id));
  const theirs = list.filter((e) => e.tiedTo !== undefined && ids.has(e.tiedTo));
  const rest = list.filter((e) => !theirs.includes(e)).sort((a, b) => b.at - a.at);
  return [...theirs, ...rest].slice(0, max);
};

export const extrasLine = (world: Pick<World, "extras"> | undefined, people: Pick<Character, "id">[], characters: Pick<Character, "id" | "name">[]): string | undefined => {
  const list = extrasFor(world, people);
  if (!list.length) return undefined;
  const whose = (e: Extra) => (e.tiedTo !== undefined ? characters.find((c) => c.id === e.tiedTo)?.name : undefined);
  return `People around here who aren't in this (bring them back by name rather than inventing new people): ${list.map((e) => `${e.name} - ${e.about}${whose(e) ? ` (${whose(e)}'s)` : ""}`).join("; ")}.`;
};

export const PERSON_ASK = "- If someone who isn't one of the people above comes up by name for the first time, add a line: PERSON: <name> | <who they are, a few words> | <whose they are, like \"Kai's landlord\", or nothing>. Most talks don't; then leave it out.";

export interface FoundPerson {
  name: string;
  about: string;
  whose?: string; // a character's name, when they belong to someone
}

export const parsePeople = (reply: string): FoundPerson[] =>
  Array.from(reply.matchAll(/^[\s*_-]*PERSON\s*:\s*(.+)$/gim))
    .map((m) => m[1].replace(/[*_]/g, "").split("|").map((p) => p.trim()))
    .filter(([name, about]) => name && about && name.length <= 40 && /^[\p{L}][\p{L}'. -]*$/u.test(name))
    .map(([name, about, whose]) => ({ name, about: about.slice(0, 80), ...(whose && !/^(nothing|none|-)$/i.test(whose) ? { whose } : {}) }));

// Adds new people to the roster: never a character's name, never twice,
// the oldest dropping off past the cap. `whose` is matched to a character
// whose name it starts with ("Kai's landlord").
export const addExtras = (list: Extra[] | undefined, found: FoundPerson[], characters: Pick<Character, "id" | "name">[], now: number): Extra[] => {
  const out = [...(list || [])];
  for (const f of found) {
    if (characters.some((c) => same(c.name, f.name) || same(c.name.split(/\s+/)[0], f.name)) || out.some((e) => same(e.name, f.name))) continue;
    const owner = f.whose ? characters.find((c) => f.whose!.toLowerCase().startsWith(c.name.toLowerCase().split(/\s+/)[0])) : undefined;
    out.push({ name: f.name, about: f.about, at: now, ...(owner ? { tiedTo: owner.id } : {}) });
  }
  return out.slice(-MAX_EXTRAS);
};
