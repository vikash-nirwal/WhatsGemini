import { Message } from "../../types";
import { YOU } from "../../utils/constants";

// Quoted replies (#119): you can answer one particular message (swipe it,
// or "Reply" in its menu), and a character can quote one of yours by
// starting their reply with [Re: a few exact words]. The quote is kept on
// the message as `replyTo` and shown above its text, like WhatsApp.

const RE_TAG = /^\s*\[\s*re\s*:\s*([^\]\n]{1,200})\]\s*/i;
const RE_TAG_PARTIAL = /^\s*\[\s*re\s*:[^\]\n]*$/i;

export const extractReplyQuote = (text: string): { text: string; quote?: string } => {
  const match = text.match(RE_TAG);
  return match ? { text: text.slice(match[0].length), quote: match[1].trim().replace(/^["“]|["”]$/g, "") } : { text };
};

// While a reply streams in: hide the tag, even half-typed.
export const stripStreamingReplyQuote = (text: string): string => (RE_TAG_PARTIAL.test(text) ? "" : text.replace(RE_TAG, ""));

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

// The message of yours a character's quote points at: among your recent
// messages, the newest one that contains the quoted words, or failing that
// the one sharing most of them (at least two thirds).
export const findQuotedMessage = (messages: Message[], quote: string): Message | undefined => {
  const q = normalize(quote);
  if (!q) return undefined;
  const yours = messages.filter((m) => m.role === YOU && !m.isSystem && !m.isNarration && m.txt).slice(-20).reverse();
  const exact = yours.find((m) => normalize(m.txt || "").includes(q));
  if (exact) return exact;
  const words = q.split(" ");
  let best: { m: Message; score: number } | undefined;
  for (const m of yours) {
    const have = new Set(normalize(m.txt || "").split(" "));
    const score = words.filter((w) => have.has(w)).length / words.length;
    if (!best || score > best.score) best = { m, score };
  }
  return best && best.score >= 2 / 3 ? best.m : undefined;
};

// What a quote shows: the text, or what kind of message it was.
export const quoteTextOf = (msg: Pick<Message, "txt" | "images" | "isVoiceNote">): string => {
  const text = (msg.txt || "").replace(/\n*\[Image Context:[\s\S]*?\]\s*$/i, "").trim();
  if (msg.isVoiceNote) return "🎤 Voice message";
  if (!text && msg.images?.length) return "📷 Photo";
  return text;
};

// The prompt's side, in texting mode: they may quote an older message.
export const buildQuoteDirective = (charName: string, userName: string): string =>
  `When ${charName} answers one particular earlier message of ${userName}'s rather than the latest one, the reply can quote it the way messaging apps do: start it with [Re: a few exact words from that message]. Only now and then, and never for ${userName}'s latest message.`;
