import { Character, Faction, World } from "../../types";

// Families and factions (#171): groups of people in a world who stick
// together - a family, a crew, a guild - each with a group chat. Members
// are loyal to their own, and it shows in how they talk about the others.

export const newFactionId = () => `fx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const buildFactionsPrompt = (world: Pick<World, "name" | "premise">, cast: Character[], existing: Faction[]) =>
  [
    `${world.name}: ${world.premise}`,
    "People here, and how they're tied:",
    ...cast.map((c) => `- ${c.name}${c.description ? `: ${c.description.slice(0, 160)}` : ""}${(c.ties || []).length ? ` (${(c.ties || []).map((t) => `${cast.find((x) => x.id === t.withId)?.name}: ${t.tie.replace(/^your\s+/i, "")}`).join(", ")})` : ""}`),
    existing.length ? `Groups already: ${existing.map((f) => f.name).join(", ")}. Suggest different ones.` : "",
    "Suggest up to 3 families or factions among these people: families by blood or marriage, crews, guilds, rival camps. Each needs at least two members; someone can be in more than one.",
    "Answer with one line each, nothing else:",
    "GROUP: <name> | <family or faction> | <member names, comma separated> | <one line on what they're like>",
  ].filter(Boolean).join("\n");

export const parseFactions = (reply: string, cast: Character[]): Faction[] => {
  const byName = (n: string) => {
    const name = n.trim().toLowerCase();
    return cast.find((c) => c.name.toLowerCase() === name) || cast.find((c) => c.name.toLowerCase().split(/\s+/)[0] === name.split(/\s+/)[0]);
  };
  const out: Faction[] = [];
  for (const raw of reply.split("\n")) {
    const m = raw.replace(/[*_]/g, "").match(/^[\s-]*GROUP\s*:\s*(.+)$/i);
    if (!m) continue;
    const [name, kind, members, about] = m[1].split("|").map((s) => s.trim());
    const ids = Array.from(new Set((members || "").split(",").map(byName).filter((c): c is Character => Boolean(c)).map((c) => c.id)));
    if (!name || ids.length < 2) continue;
    out.push({ id: newFactionId() + out.length, name: name.slice(0, 60), kind: /family/i.test(kind || "") ? "family" : "faction", memberIds: ids, ...(about ? { about: about.slice(0, 200) } : {}) });
  }
  return out.slice(0, 3);
};

export const factionsOf = (world: Pick<World, "factions"> | undefined, characterId: number) => (world?.factions || []).filter((f) => f.memberIds.includes(characterId));

// For a member's prompt: who they belong with, and loyalty.
export const buildFactionNote = (character: Character | undefined, world: Pick<World, "factions"> | undefined, characters: Character[]): string | undefined => {
  if (!character) return undefined;
  const mine = factionsOf(world, character.id);
  if (!mine.length) return undefined;
  const others = (world?.factions || []).filter((f) => !f.memberIds.includes(character.id));
  return [
    ...mine.map((f) => `You belong to ${f.kind === "family" ? "the family" : ""} ${f.name}${f.about ? ` (${f.about})` : ""}, with ${f.memberIds.filter((id) => id !== character.id).map((id) => characters.find((c) => c.id === id)?.name).filter(Boolean).join(", ")}. You're loyal to them and take their side.`.replace(/\s+/g, " ")),
    others.length ? `Other groups here: ${others.map((f) => f.name).join(", ")}; you have opinions about them.` : "",
  ].filter(Boolean).join("\n");
};

export const factionScenario = (f: Pick<Faction, "name" | "kind" | "about">, userName: string) =>
  `The ${f.kind === "family" ? "family" : "group"} chat of ${f.name}${f.about ? ` (${f.about})` : ""}. ${userName} is in it too. Inside jokes, old grudges, plans, gossip about the others - the way they really talk among themselves.`;
