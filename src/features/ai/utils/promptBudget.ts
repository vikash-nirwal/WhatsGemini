// The prompt budget (#187): a chat's prompt can carry dozens of notes -
// memories, ties, world history, events, the storyline, groups, secrets,
// group chats. On a small or cheap model they drown out what matters, or
// get cut off at random. Each note has a priority; when they're over the
// budget, the lowest go first, and each one is capped in size. Behaviour
// rules (how to quote, stickers, invites...) are never dropped: they're
// short and change what the reply may do.

export type NotePriority = 1 | 2 | 3 | 4 | 5;

export interface PromptNote {
  key: string;
  text: string;
  priority: NotePriority; // 5 never dropped
}

// Smaller since 2026-10-29 (the user's report: the system prompt alone was
// 25 KB in a chat of 50-60 messages). A large window let the notes take up
// to 24,000 characters, sent again with every reply, when the few that
// matter most fit in a third of that; a note past 1,200 characters is
// detail the reply rarely uses.
const MAX_NOTE_CHARS = 1200;
// Rules and what's true are never dropped, but still bounded, so a long
// list of them can't crowd out everything else.
const MAX_RULE_CHARS = 2400;

// Roughly 15% of the model's window for notes, in characters (about 4 per
// token), within sensible bounds.
export const noteBudgetFor = (contextTokens: number | undefined) =>
  Math.round(Math.min(8_000, Math.max(3_000, (contextTokens || 32_000) * 0.15 * 4)));

const capped = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 3).trimEnd()}...` : text);

// Keeps notes in their original order; drops the lowest priority (and,
// within one, the latest listed) until the rest fit.
export const fitNotes = (notes: PromptNote[], budget: number | undefined): { kept: PromptNote[]; dropped: string[] } => {
  const sized = notes.map((n) => ({ ...n, text: capped(n.text, n.priority === 5 ? MAX_RULE_CHARS : MAX_NOTE_CHARS) }));
  if (!budget) return { kept: sized, dropped: [] };
  let total = sized.reduce((sum, n) => sum + n.text.length, 0);
  const order = sized.map((n, i) => ({ n, i })).filter(({ n }) => n.priority < 5).sort((a, b) => a.n.priority - b.n.priority || b.i - a.i);
  const drop = new Set<number>();
  for (const { n, i } of order) {
    if (total <= budget) break;
    drop.add(i);
    total -= n.text.length;
  }
  return { kept: sized.filter((_, i) => !drop.has(i)), dropped: sized.filter((_, i) => drop.has(i)).map((n) => n.key) };
};

// What the last prompt left out, for the prompt inspector.
let lastDropped: { at: number; keys: string[] } = { at: 0, keys: [] };
export const recordDropped = (keys: string[]) => {
  lastDropped = { at: Date.now(), keys };
};
export const lastDroppedNotes = () => lastDropped;

// Friendly names for the inspector.
export const NOTE_NAMES: Record<string, string> = {
  knowsNote: "who else you're close to", tiesNote: "their ties", worldTalkNote: "their latest talk", groupsNote: "group chats lately",
  letterNote: "their letter", onThisDayNote: "an anniversary", giftsNote: "gifts", plansNote: "plans", secretsNote: "their secrets",
  eventNote: "world events", arcNote: "the storyline", historyNote: "world history", heardNote: "what they know and heard", goalNote: "what they want this week", youAtNote: "where you are", keptNote: "secrets they keep",
  factionNote: "their family or faction", lifeNote: "their life events", reputationNote: "your reputation", dayNote: "their day",
  dayMoodNote: "their mood today", moodNote: "a lingering mood", jokesNote: "inside jokes", liesNote: "lies", jealousyNote: "jealousy",
  dreamNote: "a dream", callbackNote: "an old memory", concernsNote: "what's on their mind", placeNote: "where they are", statusNote: "statuses",
  profileNote: "their About line", canonNote: "what's settled", worldNowNote: "the season and places", innerNote: "their mood and bonds", pointsNote: "their points",
};
