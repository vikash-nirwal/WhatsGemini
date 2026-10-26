// Pass the time (the user's ask, 2026-10-26): hours, days, months or years
// go by in the story since the last conversation, and the characters act
// like it - catching up, what changed, how a long silence feels. Unlike a
// scene jump (#80), this is time passing for them, not a cut.

export type TimeUnit = "hours" | "days" | "weeks" | "months" | "years";
export const TIME_UNITS: TimeUnit[] = ["hours", "days", "weeks", "months", "years"];
const DAYS_PER: Record<TimeUnit, number> = { hours: 1 / 24, days: 1, weeks: 7, months: 30, years: 365 };

export interface TimePassed {
  gap: string; // "3 years"
  days: number; // for story time
  note?: string; // what happened meanwhile, if you said
  at: number;
  fromMessage: number; // content length when it passed; the note fades after a few exchanges
}

// "1 day", "3 years", "a few hours" stays as typed.
export const describeGap = (amount: number, unit: TimeUnit) => {
  const n = Math.max(1, Math.round(amount));
  return `${n} ${n === 1 ? unit.replace(/s$/, "") : unit}`;
};

export const gapDays = (amount: number, unit: TimeUnit) => Math.max(0, amount) * DAYS_PER[unit];

// How a gap feels, so a few hours doesn't read like a reunion.
const feel = (days: number) =>
  days < 1 ? "Only a little while: pick up where you left off, maybe mention what you did since."
  : days < 14 ? "A noticeable break: you've each had days of your own; mention what happened, and that it's been a bit."
  : days < 180 ? "A long silence: things have happened in your life, you may have wondered about them or felt hurt or relieved; that shows."
  : "A very long time: you've changed - job, home, relationships, looks, maybe age - and so might they. Reconnecting feels strange, warm or awkward, as it would for you.";

// For the replies right after it passed.
export const buildTimePassedNote = (passed: TimePassed, userName: string) =>
  `${passed.gap} have passed in the story since you and ${userName} last talked.${passed.note ? ` Meanwhile: ${passed.note}.` : ""} ${feel(passed.days)} Don't recap the old conversation as if it were minutes ago; let time show.`;

// For the character who texts first after the gap.
export const buildTimePassedOpener = (passed: TimePassed, userName: string) =>
  `${passed.gap} have passed since your last conversation with ${userName}${passed.note ? ` (meanwhile: ${passed.note})` : ""}. You reach out first now, the way you would after that long - in your own voice, with what's new or what's on your mind.`;

export const timePassedNotice = (passed: Pick<TimePassed, "gap">) => `⏳ ${passed.gap} later`;

// The note stays for the next few exchanges, then the story has caught up.
export const NOTE_FOR_MESSAGES = 6;
export const timePassedInScope = (passed: TimePassed | undefined, contentLength: number) =>
  Boolean(passed) && contentLength - passed!.fromMessage <= NOTE_FOR_MESSAGES;

// Passing the time for a whole world (the user's ask, 2026-10-26): every
// chat there gets the gap, and the people you talk to most text first. This
// is the text for one of them, written outside their chat.
export const buildWorldTimeTextPrompt = (
  character: { name: string; description?: string; prompt?: string; relationship?: string },
  passed: Pick<TimePassed, "gap" | "days" | "note">,
  userName: string,
  lastLines: string[]
) =>
  [
    `You are ${character.name}. ${[character.description, character.prompt].filter(Boolean).join(" ").slice(0, 600)}`,
    character.relationship ? `${userName} is your ${character.relationship}.` : "",
    lastLines.length ? `The end of your last conversation with ${userName}:\n${lastLines.join("\n")}` : "",
    buildTimePassedOpener(passed as TimePassed, userName),
    feel(passed.days),
    "Write that first text: one to three short lines, in your own voice. Reply with only the message.",
  ].filter(Boolean).join("\n\n");

// Who texts first after a world-wide gap: the people you talk to most
// recently, a few at most.
export const firstAfterGap = <C extends { id: number }>(characters: C[], chats: { characterIds?: number[]; whatIf?: unknown; content?: { timestamp?: number }[]; archived?: boolean }[], max = 3): C[] => {
  const lastWith = new Map<number, number>();
  for (const chat of chats) {
    if (chat.characterIds?.length !== 1 || chat.whatIf || chat.archived) continue;
    const at = chat.content?.[chat.content.length - 1]?.timestamp || 0;
    if (at) lastWith.set(chat.characterIds[0], Math.max(at, lastWith.get(chat.characterIds[0]) || 0));
  }
  return characters.filter((c) => lastWith.has(c.id)).sort((a, b) => lastWith.get(b.id)! - lastWith.get(a.id)!).slice(0, max);
};
