import { Character, CharacterStatus, Chat, StatusComment } from "../../types";

// Character feed (#85): statuses (#8) become a small feed. When a character
// posts, the others who know them (they share a group chat, or one knows of
// the other, #74) like it and comment in their own voice, shaped by how they
// feel about the poster in a shared room (#24). You can like a status and
// comment on it, and the poster answers your comment.

const MAX_PEERS = 3;
const MAX_COMMENT = 200;

export const newCommentId = () => `cm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export interface FeedPeer {
  character: Character;
  feeling?: string; // how they feel about the poster, from a shared room (#24)
}

// Who would see the poster's status: room-mates and characters who know of
// them, either way round.
export const feedPeersFor = (poster: Character, characters: Character[], chats: Chat[]): FeedPeer[] => {
  const rooms = chats.filter((c) => (c.characterIds?.length || 0) > 1 && c.characterIds!.includes(poster.id));
  return characters
    .filter((c) => c.id !== poster.id)
    .filter((c) => rooms.some((r) => r.characterIds!.includes(c.id)) || c.knowsAbout?.includes(poster.id) || poster.knowsAbout?.includes(c.id))
    .slice(0, MAX_PEERS)
    .map((c) => ({
      character: c,
      feeling: rooms.flatMap((r) => r.roomRelationships || []).find((rel) => rel.fromId === c.id && rel.toId === poster.id)?.note,
    }));
};

const about = (c: Pick<Character, "description" | "prompt">) => [c.description, c.prompt].filter(Boolean).join(" ").slice(0, 300);

export const buildFeedReactionsPrompt = (poster: Character, status: CharacterStatus, peers: FeedPeer[]): string =>
  `${poster.name} just posted a status for their friends: "${status.text}"

Their friends who see it:
${peers.map((p) => `- ${p.character.name}: ${about(p.character)}${p.feeling ? ` How ${p.character.name} feels about ${poster.name}: ${p.feeling}.` : ""}`).join("\n")}

For each friend, decide whether they like the status and whether they comment, the way that friend really would (not everyone comments; someone who doesn't get along with ${poster.name} might tease, or stay quiet). A comment is one short line in their own voice, at most 120 characters, no hashtags.

Reply with only JSON, no code fence: [{"name": "friend's name", "like": true or false, "comment": "their comment, or \\"\\""}]`;

export const parseFeedReactions = (reply: string, peers: FeedPeer[], now: number): { likes: number[]; comments: StatusComment[] } => {
  const raw = reply.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  const likes: number[] = [];
  const comments: StatusComment[] = [];
  if (start < 0 || end <= start) return { likes, comments };
  try {
    const data = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(data)) return { likes, comments };
    const seen = new Set<number>();
    data.forEach((item: any, i: number) => {
      const peer = peers.find((p) => p.character.name.toLowerCase() === String(item?.name || "").trim().toLowerCase());
      if (!peer || seen.has(peer.character.id)) return;
      seen.add(peer.character.id);
      if (item?.like === true) likes.push(peer.character.id);
      const text = typeof item?.comment === "string" ? item.comment.trim().replace(/^["“]|["”]$/g, "") : "";
      if (text) comments.push({ id: `${newCommentId()}-${i}`, from: peer.character.id, text: text.slice(0, MAX_COMMENT), at: now + i });
    });
  } catch {
    // Nothing usable: no reactions this time.
  }
  return { likes, comments };
};

// The poster answers your comment, in their own voice.
export const buildCommentReplyPrompt = (poster: Character, status: CharacterStatus, comment: string, userName: string): string =>
  `${poster.name} posted a status: "${status.text}"
${status.comments?.filter((c) => c.from !== "you").length ? `Friends commented:\n${status.comments.filter((c) => c.from !== "you").map((c) => `- ${c.text}`).join("\n")}\n` : ""}${userName} commented: "${comment}"

About ${poster.name}: ${about(poster)}

Write ${poster.name}'s reply to ${userName}'s comment: one short, warm line in their own voice, at most 120 characters, like a reply under a post. Reply with only the text.`;

export const cleanCommentReply = (reply: string): string | undefined => {
  const text = reply.trim().split("\n").filter(Boolean)[0]?.replace(/^["“']|["”']$/g, "").trim();
  return text ? text.slice(0, MAX_COMMENT) : undefined;
};

export const toggleLike = (status: CharacterStatus): CharacterStatus => ({ ...status, likedByYou: !status.likedByYou || undefined });

export const withComment = (status: CharacterStatus, comment: StatusComment): CharacterStatus => ({ ...status, comments: [...(status.comments || []), comment] });

export const updateStatus = (statuses: CharacterStatus[] | undefined, id: string, change: (s: CharacterStatus) => CharacterStatus): CharacterStatus[] | undefined =>
  statuses?.map((s) => (s.id === id ? change(s) : s));

// Every kept status, newest first, with who posted it: the feed.
export const feedItems = (characters: Character[]): { character: Character; status: CharacterStatus }[] =>
  characters
    .flatMap((character) => (character.statuses || []).map((status) => ({ character, status })))
    .sort((a, b) => b.status.createdAt - a.status.createdAt);
