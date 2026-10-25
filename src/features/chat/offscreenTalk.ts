import { lifeScaled } from "../life/lifeDial";
import { Character, Chat, OffscreenTalk, RoomRelationship } from "../../types";

// Characters talk while you're away (#58): in a group chat with this on, two
// members have a short conversation of their own between your visits,
// shaped by how they feel about each other (#24). You can read it, and the
// next replies know it happened.

export const IDLE_BEFORE_TALK_MS = 3 * 60 * 60 * 1000; // you've been away 3 hours
export const TALK_GAP_MS = 20 * 60 * 60 * 1000; // at most one talk a day or so
const KEEP = 5;

const lastActivity = (chat: Pick<Chat, "content" | "timestamp">): number =>
  chat.content?.length ? chat.content[chat.content.length - 1].timestamp || chat.timestamp || 0 : chat.timestamp || 0;

export const talkDue = (chat: Pick<Chat, "offscreenTalk" | "offscreenTalks" | "content" | "timestamp" | "characterIds">, now: number): boolean => {
  if (!chat.offscreenTalk || (chat.characterIds || []).length < 2) return false;
  if (now - lastActivity(chat) < IDLE_BEFORE_TALK_MS) return false;
  const latest = (chat.offscreenTalks || []).reduce((t, x) => Math.max(t, x.at), 0);
  // One per stretch away: nothing new until you've been back since the last one.
  if (latest > lastActivity(chat)) return false;
  return now - latest >= lifeScaled(TALK_GAP_MS);
};

// Who talks: a pair with feelings about each other if there is one, so the
// conversation has something to it; otherwise the first two members.
export const pickPair = (members: Character[], relationships: RoomRelationship[] | undefined, random: () => number = Math.random): [Character, Character] | undefined => {
  if (members.length < 2) return undefined;
  const withNotes = (relationships || []).filter((r) => r.note.trim() && members.some((m) => m.id === r.fromId) && members.some((m) => m.id === r.toId) && r.fromId !== r.toId);
  if (withNotes.length > 0) {
    const r = withNotes[Math.floor(random() * withNotes.length)];
    return [members.find((m) => m.id === r.fromId)!, members.find((m) => m.id === r.toId)!];
  }
  const i = Math.floor(random() * members.length);
  const j = (i + 1 + Math.floor(random() * (members.length - 1))) % members.length;
  return [members[i], members[j]];
};

export const buildOffscreenTalkPrompt = (
  a: Pick<Character, "name" | "description" | "prompt">,
  b: Pick<Character, "name" | "description" | "prompt">,
  userName: string,
  feelings: string[],
  transcript: string,
  scenario?: string
): string => `Write a short private conversation between ${a.name} and ${b.name}, two characters from a group chat with ${userName}, that happens while ${userName} is away.

${a.name}: ${[a.description, a.prompt].filter(Boolean).join(" ").slice(0, 500)}
${b.name}: ${[b.description, b.prompt].filter(Boolean).join(" ").slice(0, 500)}
${scenario ? `\nThe setting: ${scenario}\n` : ""}${feelings.length > 0 ? `\nHow they feel about each other:\n- ${feelings.join("\n- ")}\n` : ""}
What happened in the group chat most recently:
${transcript}

- 4 to 8 lines, alternating, each starting with the speaker's name and a colon, like "${a.name}: ...".
- Natural and in character: they might talk about ${userName}, about what just happened, or about something of their own. Let their feelings show.
- Don't resolve big plot points or decide anything for ${userName}. Plain text, no stage directions in brackets.`;

// "Name: line" rows, kept only for the two who talk.
export const parseOffscreenTalk = (reply: string, pair: [Character, Character]): { speakerId: number; text: string }[] => {
  const lines: { speakerId: number; text: string }[] = [];
  for (const raw of reply.split("\n")) {
    const m = raw.replace(/^[\s*_-]+/, "").match(/^([^:]{1,40}):\s*(.+)$/);
    if (!m) continue;
    const name = m[1].replace(/[*_]/g, "").trim().toLowerCase();
    const who = pair.find((c) => c.name.toLowerCase() === name || c.name.toLowerCase().split(" ")[0] === name.split(" ")[0]);
    // "**Kai:** text" leaves the closing asterisks on the line.
    const text = m[2].replace(/^[*_\s]+/, "").trim().replace(/^["“]|["”]$/g, "");
    if (who && text) lines.push({ speakerId: who.id, text: text.slice(0, 400) });
    if (lines.length >= 10) break;
  }
  return lines;
};

export const addTalk = (talks: OffscreenTalk[] | undefined, talk: OffscreenTalk): OffscreenTalk[] => [...(talks || []), talk].slice(-KEEP);

// What the next replies are told, so the members can bring it up. Only the
// latest talk, and only until something new happened in the chat after it.
export const buildOffscreenTalkSection = (talk: OffscreenTalk | undefined, namesById: Record<number, string>): string | undefined => {
  if (!talk || talk.lines.length === 0) return undefined;
  const names = [...new Set(talk.lines.map((l) => namesById[l.speakerId]).filter(Boolean))];
  return `While the user was away, ${names.join(" and ")} talked privately:\n${talk.lines.map((l) => `${namesById[l.speakerId] || "?"}: ${l.text}`).join("\n")}\nThey remember it and can bring it up naturally; the user may have read it too.`;
};
