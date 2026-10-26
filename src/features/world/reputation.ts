import { Character, World } from "../../types";

// Your reputation (#166): how the people of a world see you, pieced
// together from what each of them knows about you, how they stand with you
// and what they've said about you to each other. Rewritten every few days;
// strangers there go by it when they meet you.

const DAY = 24 * 60 * 60 * 1000;
export const REPUTATION_GAP_MS = 3 * DAY;

export const reputationDue = (world: Pick<World, "reputation">, now: number, gapMs: number = REPUTATION_GAP_MS) => now - (world.reputation?.at || 0) >= gapMs;

export const buildReputationPrompt = (world: Pick<World, "name" | "premise">, userName: string, cast: Character[], talk: string[]) => {
  const known = cast
    .map((c) => {
      const facts = (c.memory || []).slice(-4);
      return c.relationship || facts.length ? `- ${c.name}${c.relationship ? ` (${userName} is their ${c.relationship})` : ""}${facts.length ? `: knows ${facts.join("; ")}` : ""}` : "";
    })
    .filter(Boolean);
  return [
    `${world.name}: ${world.premise}`,
    `What the people here know about ${userName}:\n${known.length ? known.join("\n") : "- Nobody here knows much about them yet."}`,
    talk.length ? `What they've said about ${userName} to each other:\n${talk.slice(-8).map((l) => `- ${l}`).join("\n")}` : "",
    `Write ${userName}'s reputation in ${world.name}: two or three sentences on how people there see them and what's said about them, the way word gets around - partly fair, partly rumor. If nobody knows them, say they're a stranger people are curious about.`,
    "Reply with only the text.",
  ].filter(Boolean).join("\n\n");
};

export const cleanReputation = (reply: string): string | undefined => {
  const text = reply.trim().replace(/^```[a-z]*\s*|```\s*$/gi, "").replace(/^["“]|["”]$/g, "").trim();
  if (text.length < 10) return undefined;
  return text.length > 600 ? `${text.slice(0, 597).trimEnd()}...` : text;
};

// For chats in the world. Someone who has never talked with you goes by it;
// people who know you weigh it against what they know.
export const buildReputationNote = (world: Pick<World, "name" | "reputation"> | undefined, userName: string, strangers: boolean): string | undefined => {
  const text = world?.reputation?.text;
  if (!text) return undefined;
  return strangers
    ? `What people in ${world!.name} say about ${userName} (you've never really talked, so this is all you have to go on; let it color how you greet them): ${text}`
    : `What people in ${world!.name} say about ${userName} (you know them yourself; agree or not, you've heard it): ${text}`;
};
