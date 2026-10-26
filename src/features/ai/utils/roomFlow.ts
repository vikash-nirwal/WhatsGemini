import { Character, Message } from "../../../types";
import { AI } from "../../../utils/constants";
import { MAX_CHAIN } from "./roomTurns";

// Group chat flow (#188), the default way a group answers now ("Lively"):
// someone addressed by name answers; otherwise whoever fits, not always the
// next in line and rarely the one who just spoke; and now and then a second
// member reacts to the first, so they talk to each other and not only to
// you. Talkative members speak more, quiet ones less. No helper call.

const QUIET = /\b(shy|quiet|reserved|introvert|aloof|stoic|taciturn)/i;
const CHATTY = /\b(talkative|chatty|outgoing|extrovert|bubbly|loud|social)/i;

const chattiness = (c: Character) => {
  const traits = [...(c.personalityTraits || []), c.description || ""].join(" ");
  return QUIET.test(traits) ? 0.6 : CHATTY.test(traits) ? 1.5 : 1;
};

// Members spoken to in the message, in the order named: "Kai, what do you
// think?", "what do you think, Kai?", "hey Kai". Just mentioning someone
// ("where's Kai?") doesn't count.
export const addressedIn = (text: string, active: Character[]): Character[] => {
  const t = text.toLowerCase();
  return active
    .map((c) => {
      const n = c.name.split(/\s+/)[0].toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const m = t.match(new RegExp(`^\\s*${n}\\b|,\\s*${n}\\s*[?!.]*\\s*$|\\b(?:hey|hi|ok|okay|so|and|you)\\s+${n}\\b`));
      return { c, at: m ? m.index ?? 0 : -1 };
    })
    .filter(({ at }) => at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(({ c }) => c);
};

const weightedPick = <T,>(items: { item: T; w: number }[], rand: () => number): T | undefined => {
  const total = items.reduce((n, x) => n + x.w, 0);
  let r = rand() * total;
  for (const x of items) if ((r -= x.w) < 0) return x.item;
  return items[items.length - 1]?.item;
};

export const REACT_CHANCE = 0.35;

export const pickLively = (active: Character[], content: Message[], text: string, rand: () => number = Math.random): { speaker?: Character; followers: Character[] } => {
  if (!active.length) return { followers: [] };
  const named = addressedIn(text, active);
  const recent = content.slice(-6).filter((m) => m.role === AI && m.speakerId != null).map((m) => m.speakerId);
  const lastSpeaker = recent[recent.length - 1];
  const speaker = named[0] || weightedPick(
    active.filter((c) => active.length === 1 || c.id !== lastSpeaker).map((c) => ({ item: c, w: chattiness(c) * (recent.includes(c.id) ? 1 : 1.5) })),
    rand
  );
  if (!speaker) return { followers: [] };
  const followers = named.slice(1, MAX_CHAIN);
  if (followers.length === 0 && active.length > 1 && rand() < REACT_CHANCE) {
    const reactor = weightedPick(
      active.filter((c) => c.id !== speaker.id).map((c) => ({ item: c, w: chattiness(c) * ((c.ties || []).some((t) => t.withId === speaker.id) ? 2 : 1) })),
      rand
    );
    if (reactor) followers.push(reactor);
  }
  return { speaker, followers };
};

// For a member answering after another: react to them too.
export const buildReactDirective = (previous: string | undefined) =>
  previous
    ? `In this group chat it's your turn: react to what ${previous} just said as well as to the user - agree, tease, push back, add to it - briefly and in character. Don't repeat what someone already said.`
    : "In this group chat it's your turn to answer: respond to what the user and the others just said, briefly and in character. Don't repeat what someone already said.";
