import { Channel, ChannelPost, Character, World } from "../../types";
import { nowLine } from "../character/statusUpdates";

// Channels (#127): follow-only feeds, like WhatsApp Channels. A character's
// channel posts about their life and work; a world's channel is its news
// (a town paper, a guild board). You can react with an emoji, not reply.
// While the app is open, a followed channel posts now and then, one per
// check, on the helper model; following one brings a first post soon.

export const CHANNEL_GAP_MS = 6 * 60 * 60 * 1000;
const KEEP = 30;
export const CHANNEL_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

export const channelId = (kind: Channel["kind"], refId: number) => `${kind}-${refId}`;

export const channelName = (kind: Channel["kind"], subject: Pick<Character, "name"> | Pick<World, "name">): string =>
  kind === "world" ? `${subject.name} News` : `${subject.name}'s channel`;

export const newChannelPostId = () => `cp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const channelPostDue = (channel: Pick<Channel, "lastPostAt">, now: number): boolean => now - (channel.lastPostAt || 0) >= CHANNEL_GAP_MS;

export const addChannelPost = (posts: ChannelPost[], post: ChannelPost): ChannelPost[] => [...posts, post].slice(-KEEP);

export const unreadPosts = (channel: Pick<Channel, "posts" | "lastReadAt">): number => channel.posts.filter((p) => p.at > (channel.lastReadAt || 0)).length;

// Other followers' reactions, made up but steady per post (from its id), so
// a channel feels followed by more people than you.
export const crowdReactions = (postId: string): Record<string, number> => {
  let h = 2166136261;
  for (let i = 0; i < postId.length; i++) {
    h ^= postId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out: Record<string, number> = {};
  CHANNEL_REACTIONS.forEach((emoji, i) => {
    const n = ((h >>> (i * 4)) & 0xff) % (i < 2 ? 120 : 30);
    if (n > 3) out[emoji] = n;
  });
  return out;
};

export const buildCharacterChannelPrompt = (character: Pick<Character, "name" | "description" | "prompt">, recent: string[], context: { dayLog?: string; concerns?: string; now?: number }): string =>
  `${character.name} runs a broadcast channel for followers, like a WhatsApp Channel: short updates about their life, their work or what they make, to many people at once.
${context.now ? `${nowLine(context.now)} Keep to it: what their day says already happened is in the past.\n` : ""}
About ${character.name}: ${[character.description, character.prompt].filter(Boolean).join(" ").slice(0, 600)}
${context.dayLog ? `Their day (keep to it): ${context.dayLog}\n` : ""}${context.concerns ? `On their mind: ${context.concerns}\n` : ""}${recent.length ? `Their last posts (don't repeat them):\n- ${recent.join("\n- ")}\n` : ""}
Write their next channel post: one to three sentences, to followers (not to one person), in their own voice. An emoji or two is fine, no hashtags, no links. Reply with only the post.`;

export const buildWorldChannelPrompt = (world: Pick<World, "name" | "premise" | "tone" | "settingDetails">, places: string[], recent: string[]): string =>
  `${world.name} has a news channel its people follow, like a WhatsApp Channel: a town crier, a local paper, a guild board, whatever fits the setting.

The world: ${world.premise}${world.tone ? ` Tone: ${world.tone}.` : ""}
${world.settingDetails ? `${world.settingDetails.slice(0, 600)}\n` : ""}${places.length ? `Places: ${places.join(", ")}\n` : ""}${recent.length ? `Recent posts (don't repeat them):\n- ${recent.join("\n- ")}\n` : ""}
Write the next post: one short piece of local news, a notice or a rumor, one to three sentences, in the voice of whoever runs the channel. No links, no hashtags. Reply with only the post.`;

export const cleanChannelPost = (reply: string): string | undefined => {
  const text = reply.trim().replace(/^```[a-z]*\s*|```\s*$/gi, "").replace(/^["“]|["”]$/g, "").trim();
  if (text.length < 2) return undefined;
  return text.length > 700 ? `${text.slice(0, 697).trimEnd()}...` : text;
};
