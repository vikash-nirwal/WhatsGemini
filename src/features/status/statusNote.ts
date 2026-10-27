import { Character, Chat, MyStatus, StatusComment } from "../../types";
import { liveStatuses } from "../character/statusUpdates";
import { happened, liveMyStatuses } from "./myStatuses";

// Statuses in a 1:1 reply (#233). A character's own statuses and the
// comments under them, and the comments on yours, never reached their
// private chat: they could post "rough day at the docks" and not know it
// when you asked how their day was, or answer your comment and forget it
// by their next text. Now the note says what they posted lately and what
// was said under it, and which of your statuses they've seen and what
// passed between you there.
//
// Kept small and said once: two of their statuses at most, the last few
// comments of each, short texts, and no comment the chat already has word
// for word. A status quoted in the chat still goes in: the history sends
// the messages, not the quotes above them.

const MAX_OWN = 2;
const MAX_COMMENTS = 4;
const clip = (t: string, n = 160) => {
  const s = t.replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n - 3).trimEnd()}...` : s;
};
const hoursAgo = (at: number, now: number) => {
  const h = Math.max(0, Math.round((now - at) / 3_600_000));
  return h === 0 ? "within the hour" : `${h} hour${h === 1 ? "" : "s"} ago`;
};
const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();

// What the chat already has, word for word.
const saidIn = (chat: Pick<Chat, "content"> | undefined) => new Set((chat?.content || []).flatMap((m) => (m.txt ? [norm(m.txt)] : [])));

const commentLines = (comments: StatusComment[] | undefined, now: number, nameOf: (from: StatusComment["from"]) => string, said: Set<string>) =>
  happened(comments, now)
    .filter((c) => c.text?.trim() && !said.has(norm(c.text)))
    .slice(-MAX_COMMENTS)
    .map((c) => `  ${nameOf(c.from)}: "${clip(c.text, 120)}"`);

export const buildStatusesNote = (
  { character, characters, userName, myStatuses, chat, now }: { character: Character | undefined; characters: Pick<Character, "id" | "name">[]; userName: string; myStatuses: MyStatus[]; chat?: Pick<Chat, "content">; now: number }
): string | undefined => {
  if (!character) return undefined;
  const said = saidIn(chat);
  const nameOf = (from: StatusComment["from"]) => (from === "you" ? userName : from === character.id ? "you" : characters.find((c) => c.id === from)?.name || "someone");
  const parts: string[] = [];

  // Their own, newest first.
  const own = liveStatuses(character, now).filter((s) => s.createdAt <= now).sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_OWN);
  for (const s of own) {
    const what = s.text ? `"${clip(s.text)}"${s.image ? " (with a photo)" : ""}` : "a photo";
    const reactions = [s.seen ? `${userName} has seen it` : "", s.likedByYou ? `${userName} liked it` : "", s.likes?.length ? `${s.likes.length} other${s.likes.length === 1 ? "" : "s"} liked it` : ""].filter(Boolean);
    const lines = commentLines(s.comments, now, nameOf, said);
    parts.push([`You posted a status ${hoursAgo(s.createdAt, now)}: ${what}.${reactions.length ? ` ${reactions.join("; ")}.` : ""}`, ...(lines.length ? ["  Comments under it:", ...lines] : [])].join("\n"));
  }

  // Yours they've seen, with what passed between you under it: their
  // comments and the replies in that thread. Others' comments on yours are
  // between them and you.
  const mine = liveMyStatuses(myStatuses, now)
    .filter((s) => happened(s.views, now).some((v) => v.characterId === character.id))
    .pop();
  if (mine) {
    const what = mine.text ? `"${clip(mine.text)}"${mine.image ? " (with a photo)" : ""}` : "a photo";
    const liked = happened(mine.likes, now).some((l) => l.characterId === character.id);
    const theirs = new Set((mine.comments || []).filter((c) => c.from === character.id).map((c) => c.id));
    const thread = (mine.comments || []).filter((c) => c.from === character.id || (c.replyTo && theirs.has(c.replyTo)));
    const lines = commentLines(thread, now, nameOf, said);
    parts.push([`${userName} posted a status ${hoursAgo(mine.createdAt, now)}, and you've seen it: ${what}.${liked ? " You liked it." : ""}`, ...(lines.length ? ["  Between you under it:", ...lines] : [])].join("\n"));
  }

  return parts.length ? `Statuses lately (bring them up only if it fits; you remember what was said under them):\n${parts.join("\n")}` : undefined;
};
