import { Character, CharacterStatus } from "../../types";

// Status updates (#8): like WhatsApp Status, a character with statuses on
// now and then posts a short update about their day (from their routine,
// #7, and what they remember), shown for a day as a ring around their
// avatar. Replying to one opens their chat with the status quoted.

export const STATUS_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const STATUS_GAP_MS = 10 * 60 * 60 * 1000; // at most one every 10 hours
const KEEP = 10;

export const liveStatuses = (character: Pick<Character, "statuses">, now: number): CharacterStatus[] =>
  (character.statuses || []).filter((s) => now - s.createdAt < STATUS_LIFETIME_MS);

export const hasUnseenStatus = (character: Pick<Character, "statuses">, now: number): boolean =>
  liveStatuses(character, now).some((s) => !s.seen);

export const statusDue = (character: Pick<Character, "postsStatuses" | "statuses">, now: number): boolean => {
  if (!character.postsStatuses) return false;
  const latest = (character.statuses || []).reduce((t, s) => Math.max(t, s.createdAt), 0);
  return now - latest >= STATUS_GAP_MS;
};

export const buildStatusPrompt = (character: Pick<Character, "name" | "description" | "prompt">, nowDoing: string | undefined, facts: string[], recent: string[]): string =>
  `Write one short status update that ${character.name} posts for their friends to see, like a WhatsApp Status.

About ${character.name}: ${[character.description, character.prompt].filter(Boolean).join(" ").slice(0, 600)}
${nowDoing ? `Right now they're ${nowDoing}.\n` : ""}${facts.length > 0 ? `Things going on in their life lately:\n- ${facts.slice(0, 8).join("\n- ")}\n` : ""}${recent.length > 0 ? `Their last statuses (don't repeat them):\n- ${recent.join("\n- ")}\n` : ""}
- First person, in ${character.name}'s own voice, about their day, a mood, a small moment or something they're looking forward to.
- At most 140 characters. One emoji is fine. No hashtags, no quotes, no mention of being an AI.
- Reply with only the status text.`;

export const cleanStatus = (reply: string): string | undefined => {
  const text = reply.trim().split("\n").filter(Boolean)[0]?.replace(/^(status|update)\s*:\s*/i, "").replace(/^["“']|["”']$/g, "").trim();
  if (!text) return undefined;
  return text.length > 200 ? `${text.slice(0, 197).trimEnd()}...` : text;
};

export const addStatus = (statuses: CharacterStatus[] | undefined, status: CharacterStatus): CharacterStatus[] => [...(statuses || []), status].slice(-KEEP);

export const markSeen = (statuses: CharacterStatus[] | undefined): CharacterStatus[] | undefined => statuses?.map((s) => (s.seen ? s : { ...s, seen: true }));

// The draft a status reply starts from in the chat.
export const statusReplyDraft = (status: CharacterStatus): string => `(Replying to your status: "${status.text}") `;
