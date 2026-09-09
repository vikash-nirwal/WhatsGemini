// Lightweight client-side token-count heuristic - there's no real tokenizer
// dependency in this project, so this trades exactness for something that
// runs instantly on every keystroke. ~4 characters per token is the commonly
// cited rule of thumb for English text; good enough for a live "how close am
// I to the limit" indicator and for the token-aware history budget below, but
// not for exact accounting (that comes from the provider's own usage metadata
// after a response, shown separately).
const CHARS_PER_TOKEN = 4;

// Small per-message overhead to loosely account for role/formatting tokens
// that don't show up in the raw text length (every chat API charges some
// fixed overhead per message under the hood).
const MESSAGE_OVERHEAD_TOKENS = 4;

export const estimateTokens = (text?: string | null): number => {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
};

export const estimateMessageTokens = (text?: string | null): number =>
  estimateTokens(text) + MESSAGE_OVERHEAD_TOKENS;

// Sum of estimateMessageTokens across a list of message texts - callers map
// their own Message[]/ChatMessage[] down to `.txt`/`.text` first so this
// stays decoupled from either shape.
export const estimateHistoryTokens = (texts: (string | undefined | null)[]): number =>
  texts.reduce((sum: number, t) => sum + estimateMessageTokens(t), 0);
