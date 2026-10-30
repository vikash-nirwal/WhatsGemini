import { Message } from "../../../types";

// Pure helper split out of buildAutoCompressedMessages (chatHistoryUtils.ts)
// purely so it's unit-testable in isolation - that module also imports the
// provider registry (for performChatCompression), which pulls in an ESM
// package this project's default CRA/Jest config can't transform, so nothing
// in that file can be exercised by a test.
//
// compressThresholdMessages is a message COUNT, not a token count - once the
// compressible portion exceeds it, everything except the newest half
// (Math.floor(compressThresholdMessages / 2)) gets folded into a summary,
// returned as the index the caller should slice at.
//
// Collapsing to half - rather than pinning the tail right at the threshold -
// is deliberate: if the tail were sized to just barely fit under the
// threshold, the very next message sent would immediately push the count
// back over it, so compression (and its own LLM call) would fire on almost
// every subsequent turn instead of after a real new batch of conversation
// accumulates. Halving leaves a full threshold/2 worth of headroom before
// the next auto-compression is due.
export const splitForCompression = (compressible: Message[], compressThresholdMessages: number): number => {
  const tailSize = Math.max(1, Math.floor(compressThresholdMessages / 2));
  return Math.max(0, compressible.length - tailSize);
};

// By size (2026-10-30): the newest `keepTokens` of the chat stay word for
// word; once the visible part has grown half as much again past that, the
// rest is folded into the summary. The headroom works as halving does above:
// one summary call per real batch of new conversation, not one per message.
// A long chat summarised for the first time folds at most `maxChunkTokens`
// of its oldest messages per pass, so no single summary call is enormous;
// the next sends fold the rest.
export const SIZE_HEADROOM = 1.5;
export const MAX_CHUNK_TOKENS = 30000;

export const splitForTokens = (compressible: Message[], keepTokens: number, tokensOf: (m: Message) => number, maxChunkTokens = MAX_CHUNK_TOKENS): number => {
  if (keepTokens <= 0) return 0;
  const sizes = compressible.map(tokensOf);
  const total = sizes.reduce((sum, n) => sum + n, 0);
  if (total <= keepTokens * SIZE_HEADROOM) return 0;
  // The newest messages that fit in keepTokens stay; at least one always does.
  let tail = 0;
  let split = compressible.length;
  while (split > 1 && tail + sizes[split - 1] <= keepTokens) {
    tail += sizes[split - 1];
    split--;
  }
  if (split === compressible.length) split = compressible.length - 1;
  // No more than maxChunkTokens folded in one pass.
  let chunk = 0;
  for (let i = 0; i < split; i++) {
    chunk += sizes[i];
    if (chunk > maxChunkTokens) return Math.max(i, 1);
  }
  return split;
};

// Where to fold a chat's visible part (from its latest summary on), by
// either rule: a message count or a size. When both call for it, the one
// that keeps more word for word wins. 0 = nothing to fold. Shared by the
// summary on send and the world's "Summarise" button, so both agree.
export const foldSplit = (compressible: Message[], thresholdMessages: number, keepTokens: number, tokensOf: (m: Message) => number, maxChunkTokens = MAX_CHUNK_TOKENS): number => {
  const byCount = thresholdMessages > 0 && compressible.length > thresholdMessages ? splitForCompression(compressible, thresholdMessages) : 0;
  const bySize = splitForTokens(compressible, keepTokens, tokensOf, maxChunkTokens);
  const split = byCount && bySize ? Math.min(byCount, bySize) : byCount || bySize;
  return split > 1 ? split : 0;
};
