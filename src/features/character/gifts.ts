import { Gift } from "../../types";

// Gifts (#82): you give the character something, from a few ideas or in
// your own words; they react, and remember it. Gifts are kept on the
// character, both ways: on a special date (#47) they may give you one back.

export const GIFT_IDEAS = ["Flowers", "A good book", "Homemade cookies", "A handwritten note", "A small necklace", "Two concert tickets"];

const MAX_IN_PROMPT = 8;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const newGiftId = () => `gift-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// For use mid-sentence: "Two concert tickets" -> "two concert tickets". Only
// common first words are lowercased, so a name ("Paris snow globe") stays.
const COMMON_START = /^(A|An|The|Some|Two|Three|A few|Homemade|Fresh|Flowers)\b/;
export const giftPhrase = (what: string): string => {
  const trimmed = what.trim().replace(/[.!]+$/, "");
  return COMMON_START.test(trimmed) ? trimmed[0].toLowerCase() + trimmed.slice(1) : trimmed;
};

// The action line that goes in the chat as your message.
export const giftMessage = (what: string): string => `*gives you ${giftPhrase(what)}*`;

export const buildGiftReactionDirective = (what: string, userName: string): string =>
  `${userName} just gave you a gift: ${giftPhrase(what)}. React in character, the way you really would: what you feel, what you do with it, and anything it reminds you of. Make it personal to the two of you, not a generic thank-you.`;

const formatDay = (t: number) => {
  const d = new Date(t);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
};

// The prompt note: the latest gifts both ways, so the character remembers
// them and can bring one up now and then.
export const buildGiftsSection = (gifts: Gift[] | undefined, characterName: string, userName: string): string | undefined => {
  const recent = (gifts || []).slice(-MAX_IN_PROMPT);
  if (recent.length === 0) return undefined;
  const lines = recent.map((g) => (g.from === "you" ? `- ${userName} gave you ${giftPhrase(g.what)} (${formatDay(g.at)})` : `- You gave ${userName} ${giftPhrase(g.what)} (${formatDay(g.at)})`));
  return [
    `Gifts between you (${characterName}) and ${userName}:`,
    ...lines,
    "Remember them like real keepsakes: wear, use or mention one now and then when it fits, not in every message.",
  ].join("\n");
};

// On a special date, the helper picks what the character gives back.
export const buildGiftBackPrompt = (characterName: string, userName: string, occasion: string, facts: string[], given: Gift[]): string =>
  `${characterName} wants to give ${userName} a small, personal gift for ${occasion}.${facts.length > 0 ? `\nWhat ${characterName} knows about ${userName}:\n- ${facts.slice(0, 12).join("\n- ")}` : ""}${given.length > 0 ? `\nGifts ${userName} has given ${characterName}: ${given.map((g) => giftPhrase(g.what)).join(", ")}.` : ""}

Reply with only the gift, in a few words (e.g. "a scarf she knitted herself"), nothing else.`;

export const parseGiftBack = (reply: string): string | undefined => {
  const line = reply.trim().split("\n")[0].replace(/^["'*\-\s]+|["'*.\s]+$/g, "").trim();
  return line && line.length <= 80 ? line : undefined;
};

export const giftBackDirective = (what: string): string =>
  `You're also giving them a gift: ${what}. Give it to them in this message, in character, and say why you chose it.`;
