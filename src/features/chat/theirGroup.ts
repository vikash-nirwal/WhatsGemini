import { Character, Chat, Message } from "../../types";
import { lifeScaled } from "../life/lifeDial";
import { AI } from "../../utils/constants";
import { SHARE_ASK } from "../world/knowledge";

// A group of theirs (#202): a group chat between characters that you're not
// in. You can read it - they don't know - and they talk on their own every
// couple of hours while the app is open, or when you ask, each time up to
// the group's message limit.

export const THEIR_GAP_MS = 2 * 60 * 60 * 1000;
export const DEFAULT_LIMIT = 8;
export const LIMITS = [4, 6, 8, 12, 16, 20];

export const theirTalkDue = (chat: Pick<Chat, "theirs" | "characterIds">, now: number) =>
  Boolean(chat.theirs) && (chat.characterIds || []).length >= 2 && now - (chat.theirs!.lastAt || 0) >= lifeScaled(THEIR_GAP_MS);

const bare = (t: string) => t.replace(/^your\s+/i, "");

export const buildTheirGroupPrompt = (
  members: Character[],
  title: string,
  recent: Message[],
  { limit, scenario, userName, sceneNow, share }: {
    limit: number;
    scenario?: string;
    userName: string;
    sceneNow?: string; // the time and where each of them is (#205)
    share?: { text?: string; items: unknown[] }; // what one knows that others may not (#204, #206)
  }
) => {
  const nameOf = (id?: number) => members.find((m) => m.id === id)?.name || "?";
  return [
    `This is "${title}", a group chat between ${members.map((m) => m.name).join(", ")}. ${userName} isn't in it.`,
    scenario ? `What the group is about: ${scenario}` : "",
    sceneNow || "",
    "",
    ...members.map((m) => {
      const ties = (m.ties || []).filter((t) => members.some((o) => o.id === t.withId)).map((t) => `${nameOf(t.withId)} is their ${bare(t.tie)}`);
      return `${m.name}: ${[m.description, m.prompt].filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 300)}${ties.length ? ` (${ties.join("; ")})` : ""}`;
    }),
    "",
    recent.length ? `The chat so far (latest last):\n${recent.map((m) => `${nameOf(m.speakerId)}: ${(m.txt || "").replace(/\s+/g, " ").slice(0, 300)}`).join("\n")}` : "Nobody has written yet: someone starts it.",
    ...(share?.text ? ["", share.text] : []),
    "",
    `Write what they say next: 2 to ${limit} messages, each starting with the sender's name and a colon, like "${members[0].name}: ...". Pick up from where it left off, or start something new if it went quiet - plans, gossip, teasing, news, ${userName} now and then. Not strictly in turn; short texts, in character, no stage directions.`,
    ...(share ? SHARE_ASK(share.items.length > 0) : []),
  ].filter((l) => l !== null).join("\n");
};

// "Name: text" lines from any member, up to the limit.
export const parseTheirLines = (reply: string, members: Character[], limit: number): { speakerId: number; text: string }[] => {
  const out: { speakerId: number; text: string }[] = [];
  for (const raw of reply.split("\n")) {
    const m = raw.replace(/^[\s*_-]+/, "").match(/^([^:]{1,40}):\s*(.+)$/);
    if (!m) continue;
    const name = m[1].replace(/[*_]/g, "").trim().toLowerCase();
    const who = members.find((c) => c.name.toLowerCase() === name || c.name.toLowerCase().split(/\s+/)[0] === name.split(/\s+/)[0]);
    const text = m[2].replace(/^[*_\s]+/, "").trim().replace(/^["“]|["”]$/g, "");
    if (who && text) out.push({ speakerId: who.id, text: text.slice(0, 500) });
    if (out.length >= limit) break;
  }
  return out;
};

export const lastLines = (chat: Pick<Chat, "content">, n = 16) => (chat.content || []).filter((m) => m.role === AI && m.txt).slice(-n);
