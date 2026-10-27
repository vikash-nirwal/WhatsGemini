import { Character } from "../../types";
import { lifeEventTone } from "./bonds";

// Uneven activity (#223). Every pair used to talk at the same pace, so a
// shy loner was as chatty as the town gossip and nobody ever went quiet
// after bad news. Now how often someone talks follows who they are and
// what they're going through: a chatty person talks more, a reserved one
// less; a hard week makes people withdraw, good news makes them reach
// out. It averages out to the old pace, so a world isn't busier overall.

const DAY = 24 * 60 * 60 * 1000;
const CHATTY = /\b(chatty|talkative|outgoing|sociable|social butterfly|gossip\w*|extrovert\w*|bubbly|loud|life of the party|flirt\w*)\b/i;
const QUIET = /\b(shy|quiet|reserved|introvert\w*|loner|withdrawn|stoic|taciturn|aloof|private person|solitary|recluse|reclusive)\b/i;

// 0.4 (barely reaches out) .. 2 (always on the phone); 1 is the old pace.
export const talkativeness = (c: Partial<Pick<Character, "description" | "prompt" | "tags" | "lifeEvents">>, now: number): number => {
  const who = [c.description, c.prompt, ...(c.tags || [])].filter(Boolean).join(" ");
  let pace = CHATTY.test(who) ? 1.5 : QUIET.test(who) ? 0.65 : 1;
  const recent = (c.lifeEvents || []).filter((e) => now - e.at < 7 * DAY).slice(-1)[0];
  const tone = recent ? lifeEventTone(recent.text) : 0;
  if (tone < 0) pace *= 0.6;
  else if (tone > 0) pace *= 1.3;
  return Math.min(2, Math.max(0.4, pace));
};

// A pair's gap at their pace: two chatty people talk sooner, two quiet
// ones later.
export const paceFactor = (a: Parameters<typeof talkativeness>[0], b: Parameters<typeof talkativeness>[0], now: number) => 2 / (talkativeness(a, now) + talkativeness(b, now));
