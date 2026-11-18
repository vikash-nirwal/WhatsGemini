import { Chat, ConversationTree, Message } from "../../types";

// Pictures and videos kept apart from chats (the out-of-memory crash of
// 2026-11-18). A picture the save folder couldn't take, a generated video,
// a gift or a photo you sent used to stay inside its message as a data:
// URL. Every chat is held in memory and copied whole on each send, so one
// chat with 200 MB of pictures ran the tab out of memory. They now live in
// their own table (dbService's `media`), and a message keeps a short
// "media:<id>" reference, the way a picture in the save folder keeps
// "local:<file name>".

export const MEDIA_PREFIX = "media:";

export const isMediaRef = (src: string | undefined): boolean => typeof src === "string" && src.startsWith(MEDIA_PREFIX);

export const mediaIdOf = (ref: string): string => ref.slice(MEDIA_PREFIX.length);

// A tiny inline picture costs less than a lookup, so only real pictures and
// videos are moved.
const MIN_MOVED_LENGTH = 4096;

export const shouldMove = (src: unknown): src is string =>
  typeof src === "string" && src.length >= MIN_MOVED_LENGTH && /^data:(image|video)\//.test(src);

export const dataUrlToBlob = (dataUrl: string): Blob => {
  const comma = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, comma);
  const type = header.match(/^data:([^;,]+)/)?.[1] || "application/octet-stream";
  const body = dataUrl.slice(comma + 1);
  if (!/;base64/i.test(header)) return new Blob([decodeURIComponent(body)], { type });
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
};

export const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error("Couldn't read the picture."));
    reader.readAsDataURL(blob);
  });

// The id is a fingerprint of the picture itself, so the same picture saved
// twice (in the chat and in its branch, or by two writes) is stored once.
// Without the browser's hashing, a random id still keeps every picture.
export const mediaIdFor = async (dataUrl: string): Promise<string> => {
  const subtle = typeof crypto !== "undefined" ? crypto.subtle : undefined;
  if (subtle) {
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(dataUrl));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

type Move = (src: string) => Promise<string>;
type ChatPart = Partial<Pick<Chat, "content" | "tree">>;

const messageHas = (m: Message | undefined, pick: (src: string) => boolean): boolean => Boolean(m && (m.images?.some(pick) || m.videos?.some(pick)));

const chatHas = (chat: ChatPart, pick: (src: string) => boolean): boolean =>
  Boolean(chat.content?.some((m) => messageHas(m, pick)) || Object.values(chat.tree?.nodes || {}).some((node) => messageHas(node?.message, pick)));

// Whether a chat (or part of one) still carries a picture inside it.
export const chatHasInlineMedia = (chat: ChatPart): boolean => chatHas(chat, shouldMove);

// The chat with every picture and video `pick` chooses, in its messages and
// in its branches, replaced by what `move` gives. Each one is handled once,
// however many messages share it. A chat with none comes back as it was.
const mapChatMedia = async <T extends ChatPart>(chat: T, pick: (src: string) => boolean, move: Move): Promise<T> => {
  if (!chatHas(chat, pick)) return chat;
  const done = new Map<string, Promise<string>>();
  const once: Move = (src) => {
    if (!done.has(src)) done.set(src, move(src));
    return done.get(src)!;
  };
  const mapList = async (list: string[] | undefined) => (list && list.some(pick) ? Promise.all(list.map((src) => (pick(src) ? once(src) : src))) : list);
  const mapMessage = async (message: Message): Promise<Message> => {
    const images = await mapList(message.images);
    const videos = await mapList(message.videos);
    return images === message.images && videos === message.videos ? message : { ...message, images, videos };
  };
  const content = chat.content ? await Promise.all(chat.content.map(mapMessage)) : chat.content;
  let tree: ConversationTree | undefined = chat.tree;
  if (chat.tree?.nodes) {
    const nodes: ConversationTree["nodes"] = {};
    for (const [id, node] of Object.entries(chat.tree.nodes)) {
      nodes[id] = node?.message ? { ...node, message: await mapMessage(node.message) } : node;
    }
    tree = { ...chat.tree, nodes };
  }
  return { ...chat, ...(chat.content ? { content } : {}), ...(chat.tree ? { tree } : {}) };
};

// Pictures inside the chat, moved out by `move` (which stores them).
export const moveChatMedia = <T extends ChatPart>(chat: T, move: Move): Promise<T> => mapChatMedia(chat, shouldMove, move);

// Stored pictures put back inside the chat by `read`, for a file that
// leaves the app (Export chat), where a reference would mean nothing.
export const inlineChatMedia = <T extends ChatPart>(chat: T, read: Move): Promise<T> => mapChatMedia(chat, isMediaRef, read);

// Every media ref a record names, wherever it sits, for backups.
export const mediaRefsIn = (value: unknown, found: Set<string> = new Set(), depth = 0): Set<string> => {
  if (depth > 12 || value == null) return found;
  if (typeof value === "string") {
    if (isMediaRef(value)) found.add(mediaIdOf(value));
  } else if (Array.isArray(value)) {
    for (const v of value) mediaRefsIn(v, found, depth + 1);
  } else if (typeof value === "object" && !(value instanceof Blob)) {
    for (const v of Object.values(value as Record<string, unknown>)) mediaRefsIn(v, found, depth + 1);
  }
  return found;
};
