import { Character, Chat, MyStatus, StatusComment } from "../../types";
import { statusLifetimeMs } from "../character/statusUpdates";

// Your own statuses (#117): you post a text or photo status, and the
// characters you chat with see it over the next minutes: "Seen by", likes,
// comments, and now and then a private reply in your chat with them.
// Everything a character does is decided once, when you post, and given a
// time a little later; the Updates page shows what has "happened" so far,
// and MyStatusWatcher delivers the private replies when they're due.

export const MY_STATUS_LIFETIME_MS = 24 * 60 * 60 * 1000;
const KEEP = 10;
const MAX_VIEWERS = 6;
const MAX_TEXT = 200;
const MINUTE = 60 * 1000;

export const newMyStatusId = () => `my-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// A day as long as you set it (#140), like the characters' statuses.
export const liveMyStatuses = (statuses: MyStatus[], now: number, lifetime: number = statusLifetimeMs()): MyStatus[] => statuses.filter((s) => now - s.createdAt < lifetime);

export const addMyStatus = (statuses: MyStatus[], status: MyStatus): MyStatus[] => [...statuses, status].slice(-KEEP);

// Who sees your statuses: the characters you have a 1:1 chat with (not a
// what-if), most recently talked to first.
export const statusViewersFor = (characters: Character[], chats: Chat[]): Character[] => {
  const latestWith = new Map<number, number>();
  for (const chat of chats) {
    if (chat.characterIds?.length !== 1 || chat.whatIf) continue;
    const id = chat.characterIds[0];
    latestWith.set(id, Math.max(latestWith.get(id) || 0, chat.timestamp || 0));
  }
  return characters
    .filter((c) => latestWith.has(c.id))
    .sort((a, b) => (latestWith.get(b.id) || 0) - (latestWith.get(a.id) || 0))
    .slice(0, MAX_VIEWERS);
};

const about = (c: Pick<Character, "description" | "prompt" | "relationship">) =>
  [c.relationship ? `(to the user: ${c.relationship})` : "", c.description, c.prompt].filter(Boolean).join(" ").slice(0, 300);

export const buildMyStatusReactionsPrompt = (userName: string, status: Pick<MyStatus, "text" | "image">, viewers: Character[]): string =>
  `${userName} just posted a status${status.image ? " with a photo" : ""}${status.text ? `: "${status.text}"` : "."}

People who have ${userName} in their contacts and may see it:
${viewers.map((c) => `- ${c.name}: ${about(c)}`).join("\n")}

For each person, decide what they do, the way they really would: whether they view it (most people do, some don't get to it), like it, leave a short comment under it, or reply privately to ${userName} about it. Most people only view; a few like; comments and private replies are rare and only when it means something to them. A comment or private reply is one short line in their own voice, at most 120 characters, no hashtags.

Reply with only JSON, no code fence: [{"name": "their name", "view": true or false, "like": true or false, "comment": "or \\"\\"", "reply": "a private message, or \\"\\""}]`;

// Turns the helper's answer into timed reactions: each viewer looks within
// half an hour, and likes, comments and replies come a few minutes after
// they've looked. `rand` is injectable so the timing is testable.
export const parseMyStatusReactions = (
  reply: string,
  viewers: Character[],
  postedAt: number,
  rand: () => number = Math.random
): Pick<MyStatus, "views" | "likes" | "comments" | "replies"> => {
  const out: Required<Pick<MyStatus, "views" | "likes" | "comments" | "replies">> = { views: [], likes: [], comments: [], replies: [] };
  const raw = reply.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return out;
  let data: unknown;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return out;
  }
  if (!Array.isArray(data)) return out;
  const seen = new Set<number>();
  const clean = (v: unknown) => (typeof v === "string" ? v.trim().replace(/^["“]|["”]$/g, "").slice(0, MAX_TEXT) : "");
  data.forEach((item: any, i: number) => {
    const viewer = viewers.find((c) => c.name.toLowerCase() === String(item?.name || "").trim().toLowerCase());
    if (!viewer || seen.has(viewer.id)) return;
    seen.add(viewer.id);
    const comment = clean(item?.comment);
    const privateReply = clean(item?.reply);
    // Liking, commenting or replying means they saw it.
    if (item?.view !== true && item?.like !== true && !comment && !privateReply) return;
    const viewedAt = postedAt + Math.round((1 + rand() * 29) * MINUTE);
    out.views.push({ characterId: viewer.id, at: viewedAt });
    if (item?.like === true) out.likes.push({ characterId: viewer.id, at: viewedAt + Math.round(rand() * MINUTE) });
    if (comment) out.comments.push({ id: `mc-${postedAt.toString(36)}-${i}`, from: viewer.id, text: comment, at: viewedAt + Math.round((1 + rand() * 4) * MINUTE) } as StatusComment);
    if (privateReply) out.replies.push({ characterId: viewer.id, text: privateReply, at: viewedAt + Math.round((2 + rand() * 8) * MINUTE) });
  });
  return out;
};

// What has happened by now: the parts of a status whose time has come.
export const happened = <T extends { at: number }>(items: T[] | undefined, now: number): T[] => (items || []).filter((x) => x.at <= now).sort((a, b) => a.at - b.at);

// Private replies whose time has come and that haven't reached the chat yet.
export const dueReplies = (statuses: MyStatus[], now: number): { status: MyStatus; index: number }[] =>
  statuses.flatMap((status) => (status.replies || []).map((r, index) => ({ status, index, r })).filter(({ r }) => !r.sent && r.at <= now).map(({ status, index }) => ({ status, index })));

// The prompt's side: a character who has seen your latest status knows it.
export const buildMyStatusNote = (userName: string, statuses: MyStatus[], characterId: number | undefined, now: number): string | undefined => {
  if (characterId == null) return undefined;
  const latest = liveMyStatuses(statuses, now).filter((s) => happened(s.views, now).some((v) => v.characterId === characterId)).pop();
  if (!latest) return undefined;
  const hours = Math.max(0, Math.round((now - latest.createdAt) / (60 * MINUTE)));
  const when = hours === 0 ? "within the hour" : `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const what = latest.text ? `"${latest.text}"${latest.image ? " (with a photo)" : ""}` : "a photo";
  return `${userName} posted a status ${when}, and you've seen it: ${what}. Bring it up only if it fits.`;
};
