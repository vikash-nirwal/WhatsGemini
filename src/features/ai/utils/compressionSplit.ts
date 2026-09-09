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
