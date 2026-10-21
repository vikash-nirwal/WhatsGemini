import { Character, RoomRelationship } from "../../../types";

// Group chats (#22-#24): who answers a message, a narrator between rounds,
// and what each character privately feels about the others.

// ---- More than one reply per message (#22) ----

export type TurnMode = "round-robin" | "natural" | "everyone";
export const MAX_CHAIN = 3; // replies to one message, at most

// "Everyone": the rest of the active members, after whoever answered first.
export const everyoneAfter = (active: Character[], firstId: number, cap = MAX_CHAIN): Character[] =>
  active.filter((c) => c.id !== firstId).slice(0, Math.max(0, cap - 1));

// "Natural": a cheap helper call reads the exchange and picks who would
// actually answer, in order. It may be two of them, or nobody. The last
// message is the user's, or a member's when they spoke up on their own
// (`lastSpeaker`, who isn't among `names` then).
export const buildWhoRepliesPrompt = (names: string[], userName: string, transcript: string, cap = MAX_CHAIN, lastSpeaker?: string): string =>
  `This is a group chat between ${userName} and ${[...(lastSpeaker ? [lastSpeaker] : []), ...names].join(", ")}. ${lastSpeaker || userName} just sent the last message.${lastSpeaker ? ` Only these others can answer it: ${names.join(", ")}.` : ""}

${transcript}

Who would naturally reply to it, in the order they'd speak? Consider who was addressed, who has something to say, and who would stay quiet. Reply with only their names, comma separated, at most ${cap}, or NONE if nobody would reply.`;

export const parseWhoReplies = (reply: string, active: Character[], cap = MAX_CHAIN): Character[] => {
  const text = reply.trim().split("\n")[0];
  if (/^none\b/i.test(text)) return [];
  const picked: Character[] = [];
  for (const raw of text.split(/,|\band\b/i)) {
    const name = raw.trim().replace(/^["'*]+|["'*.]+$/g, "").toLowerCase();
    const match = active.find((c) => c.name.toLowerCase() === name) || active.find((c) => name && c.name.toLowerCase().split(" ")[0] === name.split(" ")[0]);
    if (match && !picked.includes(match)) picked.push(match);
    if (picked.length >= cap) break;
  }
  return picked;
};

// The one-turn direction for each reply after the first.
export const CHAIN_DIRECTIVE =
  "In this group chat it's your turn to answer: respond to what the user and the others just said, briefly and in character. Don't repeat what someone already said.";

// ---- Built-in narrator (#23) ----

export const buildNarrationPrompt = (names: string[], transcript: string): string =>
  `You are the narrator of a group roleplay with ${names.join(", ")}. Write one to three sentences of third-person narration for what happens around them right now: the setting, small actions, the mood, a detail nobody mentioned. Never write dialogue, never speak or decide for the user, and don't repeat what was just said.

${transcript}

Reply with only the narration.`;

export const cleanNarration = (reply: string): string | undefined => {
  const text = reply.trim().replace(/^(narration|narrator)\s*:\s*/i, "").replace(/^["“]|["”]$/g, "").trim();
  return text || undefined;
};

// ---- Character-to-character relationships (#24) ----

// Only the speaker's own feelings: friction in a group is written in
// because each character sees what they think of the others, not the reverse.
export const buildRelationshipNotes = (speakerId: number, relationships: RoomRelationship[] | undefined, namesById: Record<number, string>): string | undefined => {
  const mine = (relationships || []).filter((r) => r.fromId === speakerId && r.note.trim() && namesById[r.toId]);
  if (mine.length === 0) return undefined;
  return `How you feel about the others here (keep it in mind; don't announce it):\n${mine.map((r) => `- ${namesById[r.toId]}: ${r.note.trim()}`).join("\n")}`;
};
