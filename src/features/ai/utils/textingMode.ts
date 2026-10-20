// Texting mode (#6): a reply is shown as several short bubbles, the way
// people text, and a new one is revealed bubble by bubble with typing pauses
// in between. Display only - the stored message stays whole, so editing,
// regenerating, memory and the prompt all see the same single message.

// More bubbles than this reads as spam; the rest stays in the last one.
const MAX_BUBBLES = 6;

// A list or a code block is one thought, so it stays in one bubble.
const isStructured = (block: string) => /^\s*([-*+]\s|\d+[.)]\s|```|>|\|)/m.test(block);

export const splitIntoTexts = (text: string): string[] => {
  const trimmed = text.trim();
  if (!trimmed) return [];
  let parts = trimmed.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  // One block written line by line ("hey\nhow are you\nmiss you") splits on
  // its lines instead, unless it's a list or code.
  if (parts.length === 1 && !isStructured(parts[0])) {
    const lines = parts[0].split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1) parts = lines;
  }
  if (parts.length > MAX_BUBBLES) {
    parts = [...parts.slice(0, MAX_BUBBLES - 1), parts.slice(MAX_BUBBLES - 1).join("\n\n")];
  }
  return parts;
};

// How long "typing..." shows before a bubble appears: roughly typing speed,
// kept between a beat and a few seconds so long bubbles don't stall.
export const revealDelayMs = (bubble: string): number => Math.min(2800, Math.max(700, 400 + bubble.length * 28));

// Read receipts for your own messages: read once the character has replied
// to them (or is replying right now), otherwise just sent.
export const receiptFor = (index: number, lastReplyIndex: number, lastIndex: number, replying: boolean): "sent" | "read" =>
  index < lastReplyIndex || (replying && index === lastIndex) ? "read" : "sent";
