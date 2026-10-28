import { Adventure, Channel, Character, Chat, ConversationTree, Message, MyStatus, World } from "../types";

// Relinking a restored library (#235). When a backup restores into a
// library whose ids are taken, every chat, character and world gets a new
// id, and everything nested that names one has to follow: who's tied to
// whom, their talks, who knows whom, kept secrets, rumors, goals against
// someone, likes and comments, a letter's or gift's chat, a group's
// relationships and off-screen talk, an adventure's cast, your statuses'
// viewers and a channel's owner. Before, only a chat's members and each
// message's speaker followed, so a restored world lost its web of people.
//
// The rule is the one remapIdArray set: a reference to someone who wasn't
// in the restore is dropped, never left pointing at whoever has that id here.

export interface IdMaps {
  characters: Map<number, number>;
  chats: Map<number, number>;
  worlds: Map<number, number>;
}

export const remapIds = (ids: number[] | undefined, map: Map<number, number>): number[] | undefined =>
  ids ? ids.map((id) => map.get(id)).filter((id): id is number => id != null) : undefined;

// `field: n` onto its new id, or the field removed.
const one = <T extends object, K extends keyof T>(record: T, key: K, map: Map<number, number>): T => {
  const value = record[key] as unknown;
  if (typeof value !== "number") return record;
  const next = map.get(value);
  if (next != null) return { ...record, [key]: next };
  const { [key]: _gone, ...rest } = record;
  return rest as T;
};

// A character id or "you".
const who = <V extends number | "you">(value: V, map: Map<number, number>): V | undefined => (value === "you" ? value : (map.get(value as number) as V | undefined));

export const remapMessage = (message: Message, ids: Map<number, number>): Message => {
  let m: Message = one(message, "speakerId", ids);
  if (typeof m.quotedStatus?.owner === "number") {
    const owner = ids.get(m.quotedStatus.owner);
    m = owner != null ? { ...m, quotedStatus: { ...m.quotedStatus, owner } } : { ...m, quotedStatus: undefined };
  }
  if (typeof m.replyTo?.from === "number") {
    const from = ids.get(m.replyTo.from);
    m = from != null ? { ...m, replyTo: { ...m.replyTo, from } } : { ...m, replyTo: undefined };
  }
  if (m.poll) m = { ...m, poll: { ...m.poll, votes: m.poll.votes.flatMap((v) => { const voter = who(v.voter, ids); return voter === undefined ? [] : [{ ...v, voter }]; }) } };
  if (m.contactCard?.characterId != null) m = { ...m, contactCard: one(m.contactCard, "characterId", ids) };
  if (m.characterReaction?.speakerId != null) m = { ...m, characterReaction: one(m.characterReaction, "speakerId", ids) };
  if (m.castEmotions) m = { ...m, castEmotions: Object.fromEntries(Object.entries(m.castEmotions).flatMap(([id, mood]) => { const next = ids.get(Number(id)); return next != null ? [[next, mood]] : []; })) };
  return m;
};

export const remapTreeRefs = (tree: ConversationTree | undefined, ids: Map<number, number>): ConversationTree | undefined =>
  tree ? { nodes: Object.fromEntries(Object.entries(tree.nodes).map(([id, node]) => [id, { ...node, message: remapMessage(node.message, ids) }])) } : tree;

const lines = (list: { speakerId: number; text: string }[], ids: Map<number, number>) =>
  list.flatMap((l) => { const speakerId = ids.get(l.speakerId); return speakerId != null ? [{ ...l, speakerId }] : []; });

// Everything a character names. Talks keep their partner here; which of
// the two holds them is put right afterwards by rehomeTalks.
export const remapCharacter = (c: Character, maps: IdMaps): Character => {
  const ids = maps.characters;
  const withId = <T extends { withId: number }>(list: T[] | undefined) => list?.flatMap((x) => { const next = ids.get(x.withId); return next != null ? [{ ...x, withId: next }] : []; });
  let out: Character = {
    ...c,
    ...(c.ties ? { ties: withId(c.ties) } : {}),
    ...(c.bonds ? { bonds: withId(c.bonds) } : {}),
    ...(c.talks ? { talks: withId(c.talks)!.map((t) => ({ ...t, lines: lines(t.lines, ids) })) } : {}),
    ...(c.knowsAbout ? { knowsAbout: remapIds(c.knowsAbout, ids) } : {}),
    ...(c.keptSecrets ? { keptSecrets: c.keptSecrets.flatMap((s) => { const fromId = ids.get(s.fromId); return fromId != null ? [one({ ...s, fromId }, "heardFrom", ids)] : []; }) } : {}),
    ...(c.rumors ? { rumors: c.rumors.flatMap((r) => { const fromId = ids.get(r.fromId); return fromId != null ? [{ ...r, fromId }] : []; }) } : {}),
    ...(c.goal ? { goal: one(c.goal, "against", ids) } : {}),
    ...(c.statuses ? {
      statuses: c.statuses.map((s) => ({
        ...s,
        ...(s.likes ? { likes: remapIds(s.likes, ids) } : {}),
        ...(s.comments ? { comments: s.comments.flatMap((cm) => { const from = who(cm.from, ids); return from === undefined ? [] : [{ ...cm, from }]; }) } : {}),
      })),
    } : {}),
    ...(c.letters ? { letters: c.letters.map((l) => one(l, "chatId", maps.chats)) } : {}),
    ...(c.gifts ? { gifts: c.gifts.map((g) => one(g, "chatId", maps.chats)) } : {}),
    ...(c.diary ? { diary: c.diary.map((d) => one(d, "chatId", maps.chats)) } : {}),
  };
  out = one(out, "cardOf", ids);
  return out;
};

// Talks live on the lower id of the two (#145). New ids can turn the order
// round, which would leave a talk where nobody looks for it.
export const rehomeTalks = (characters: Character[]): Character[] => {
  const moving = new Map<number, NonNullable<Character["talks"]>>();
  const kept = characters.map((c) => {
    const stay = (c.talks || []).filter((t) => c.id < t.withId);
    for (const t of (c.talks || []).filter((t) => c.id > t.withId)) moving.set(t.withId, [...(moving.get(t.withId) || []), { ...t, withId: c.id }]);
    return c.talks ? { ...c, talks: stay } : c;
  });
  return kept.map((c) => (moving.has(c.id) ? { ...c, talks: [...(c.talks || []), ...moving.get(c.id)!].sort((a, b) => a.at - b.at) } : c));
};

// A chat's own references beyond its members and messages' speakers.
export const remapChat = (chat: Chat, maps: IdMaps): Chat => {
  const ids = maps.characters;
  return {
    ...chat,
    ...(chat.characterIds ? { characterIds: remapIds(chat.characterIds, ids) } : {}),
    ...(chat.mutedParticipantIds ? { mutedParticipantIds: remapIds(chat.mutedParticipantIds, ids) } : {}),
    content: (chat.content || []).map((m) => remapMessage(m, ids)),
    ...(chat.tree ? { tree: remapTreeRefs(chat.tree, ids) } : {}),
    ...(chat.roomRelationships ? { roomRelationships: chat.roomRelationships.flatMap((r) => { const fromId = ids.get(r.fromId), toId = ids.get(r.toId); return fromId != null && toId != null ? [{ ...r, fromId, toId }] : []; }) } : {}),
    ...(chat.offscreenTalks ? { offscreenTalks: chat.offscreenTalks.map((t) => ({ ...t, lines: lines(t.lines, ids) })) } : {}),
    ...(chat.groupPlan ? { groupPlan: { ...chat.groupPlan, memberIds: remapIds(chat.groupPlan.memberIds, ids) || [] } } : {}),
    ...(chat.blocked ? { blocked: one(chat.blocked, "nudgedBy", ids) } : {}),
    ...(chat.whatIf ? { whatIf: one(chat.whatIf, "parentChatId", maps.chats) } : {}),
  };
};

// A world's groups and the people around, tied to characters.
export const remapWorld = (world: World, maps: IdMaps): World => ({
  ...world,
  ...(world.factions ? { factions: world.factions.map((f) => ({ ...one(f, "chatId", maps.chats), memberIds: remapIds(f.memberIds, maps.characters) || [] })) } : {}),
  ...(world.extras ? { extras: world.extras.map((e) => one(e, "tiedTo", maps.characters)) } : {}),
  // How each person took an announcement, kept by their id.
  ...(world.announcements ? { announcements: world.announcements.map((a) => (a.takes ? { ...a, takes: Object.fromEntries(Object.entries(a.takes).flatMap(([id, t]) => { const to = maps.characters.get(Number(id)); return to != null ? [[to, t]] : []; })) } : a)) } : {}),
});

// Your statuses: who saw, liked, commented and replied, and the world they
// were posted in (a world that wasn't restored means My world).
export const remapMyStatus = (s: MyStatus, maps: IdMaps): MyStatus => {
  const ids = maps.characters;
  const byCharacter = <T extends { characterId: number }>(list: T[] | undefined) => list?.flatMap((x) => { const characterId = ids.get(x.characterId); return characterId != null ? [{ ...x, characterId }] : []; });
  return {
    ...one(s, "worldId", maps.worlds),
    ...(s.views ? { views: byCharacter(s.views) } : {}),
    ...(s.likes ? { likes: byCharacter(s.likes) } : {}),
    ...(s.replies ? { replies: byCharacter(s.replies) } : {}),
    ...(s.comments ? { comments: s.comments.flatMap((cm) => { const from = who(cm.from, ids); return from === undefined ? [] : [{ ...cm, from }]; }) } : {}),
  };
};

// A channel follows a character or a world; one whose owner wasn't
// restored has nothing to follow.
export const remapChannel = (ch: Channel, maps: IdMaps): Channel | undefined => {
  const refId = (ch.kind === "character" ? maps.characters : maps.worlds).get(ch.refId);
  return refId != null ? { ...ch, refId, id: `${ch.kind}-${refId}` } : undefined;
};

export const remapAdventure = (a: Adventure, maps: IdMaps): Adventure => ({
  ...one(a, "worldId", maps.worlds),
  characterIds: remapIds(a.characterIds, maps.characters) || [],
  content: (a.content || []).map((m) => remapMessage(m, maps.characters)),
  ...(a.tree ? { tree: remapTreeRefs(a.tree, maps.characters) } : {}),
});

// Every `local:` picture a record names, wherever it sits: avatars, albums,
// stickers, mood portraits, outfits, status photos, scene pictures. Walking
// the whole record means a new place for pictures is never left out of a
// backup the way albums and stickers were.
export const localImagesIn = (value: unknown, found: Set<string> = new Set(), depth = 0): Set<string> => {
  if (depth > 12 || value == null) return found;
  if (typeof value === "string") {
    if (value.startsWith("local:")) found.add(value.slice("local:".length));
  } else if (Array.isArray(value)) {
    for (const v of value) localImagesIn(v, found, depth + 1);
  } else if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) localImagesIn(v, found, depth + 1);
  }
  return found;
};
