import { Character, Chat } from "../../types";
import { STAGE_LABELS } from "./relationshipStages";
import { bondWords } from "../world/bonds";

// The relationship map (#138): who knows whom (#74, shared groups), how they
// feel about each other (#24, a group's room feelings), and each bond with
// you - its label, its stage (#70) and how it has changed (#30).

export interface MapNode {
  id: number;
  name: string;
  accent?: [string, string];
  bond?: string; // their relationship with you
  stage?: string;
  was?: string; // what it was before the latest change
  blocked?: "you" | "them";
}

export interface MapLink {
  a: number;
  b: number;
  feelings: string[]; // "Kai about Aria: still jealous"
}

const mainChat = (chats: Chat[], id: number) => chats.find((c) => c.characterIds?.length === 1 && c.characterIds[0] === id && !c.whatIf && c.memoryScope !== "chat");

export const buildRelationshipMap = (characters: Character[], chats: Chat[], now = Date.now()): { nodes: MapNode[]; links: MapLink[] } => {
  // Everyone you talk to: a 1:1 chat or a group.
  const inChats = new Set(chats.flatMap((c) => c.characterIds || []));
  const people = characters.filter((c) => inChats.has(c.id));
  const nodes: MapNode[] = people.map((c) => {
    const chat = mainChat(chats, c.id);
    const last = c.relationshipHistory?.[c.relationshipHistory.length - 1];
    return {
      id: c.id,
      name: c.name,
      accent: c.accent,
      bond: c.relationship,
      stage: chat?.stage ? STAGE_LABELS[chat.stage] : undefined,
      was: last && last.from && last.from !== c.relationship ? last.from : undefined,
      blocked: chat?.blocked?.by,
    };
  });
  const ids = new Set(people.map((p) => p.id));
  const linkKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const links = new Map<string, MapLink>();
  const link = (a: number, b: number) => {
    if (a === b || !ids.has(a) || !ids.has(b)) return undefined;
    const key = linkKey(a, b);
    if (!links.has(key)) links.set(key, { a: Math.min(a, b), b: Math.max(a, b), feelings: [] });
    return links.get(key)!;
  };
  for (const c of people) for (const other of c.knowsAbout || []) link(c.id, other);
  const names = new Map(people.map((p) => [p.id, p.name]));
  // Ties from the world wizard (#144): "Kai is Aria's older brother".
  for (const c of people) {
    for (const t of c.ties || []) {
      const l = link(c.id, t.withId);
      if (l) l.feelings.push(`${names.get(t.withId)}: ${c.name}'s ${t.tie.replace(/^your\s+/i, "")}`);
    }
  }
  for (const group of chats.filter((c) => (c.characterIds?.length || 0) > 1)) {
    const members = group.characterIds!;
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) link(members[i], members[j]);
    for (const r of group.roomRelationships || []) {
      const l = link(r.fromId, r.toId);
      const text = r.note.trim();
      if (l && text) l.feelings.push(`${names.get(r.fromId)} about ${names.get(r.toId)}: ${text}`);
    }
  }
  // How close or tense they are (#211), once their talks have moved it.
  for (const c of people) {
    for (const b of c.bonds || []) {
      const l = link(c.id, b.withId);
      const words = l && bondWords(c, b.withId, now);
      if (l && words) l.feelings.push(`${c.name} about ${names.get(b.withId)}: ${words}`);
    }
  }
  return { nodes, links: Array.from(links.values()) };
};

// Places the people on a circle around you (the centre), clockwise from the top.
export const circleLayout = (count: number, cx: number, cy: number, r: number): { x: number; y: number }[] =>
  Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(count, 1);
    return { x: Math.round(cx + r * Math.cos(angle)), y: Math.round(cy + r * Math.sin(angle)) };
  });
