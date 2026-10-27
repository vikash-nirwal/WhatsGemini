import { Character, Chat } from "../../types";

// Introductions (#167): someone you talk to introduces you to a person in
// their life you haven't met. The newcomer texts you first, knowing who you
// are from what they've been told - and what people say about you.

const DAY = 24 * 60 * 60 * 1000;
export const INTRO_GAP_MS = 2 * DAY;
const MIN_MESSAGES = 6;

export const introductionDue = (lastIntroAt: number | undefined, now: number, gapMs: number = INTRO_GAP_MS, rand: () => number = Math.random) =>
  now - (lastIntroAt || 0) >= gapMs && rand() < 0.5;

const oneToOne = (chats: Chat[], id: number) => chats.filter((c) => c.characterIds?.length === 1 && c.characterIds[0] === id && !c.whatIf);

// Who introduces whom: someone you really talk to, and a person they're
// tied to whom you've never chatted with.
export const pickIntroduction = (cast: Character[], chats: Chat[], rand: () => number = Math.random): { by: Character; to: Character } | undefined => {
  const options = cast.flatMap((by) => {
    if (!oneToOne(chats, by.id).some((c) => (c.content || []).length >= MIN_MESSAGES)) return [];
    return (by.ties || [])
      .map((t) => cast.find((c) => c.id === t.withId))
      .filter((to): to is Character => Boolean(to) && oneToOne(chats, to!.id).length === 0)
      .map((to) => ({ by, to }));
  });
  return options.length ? options[Math.floor(rand() * options.length)] : undefined;
};

const bare = (t: string) => t.replace(/^your\s+/i, "");

export const buildIntroductionPrompt = (by: Character, to: Character, userName: string, heard: string[], reputation?: string) => {
  const tie = to.ties?.find((t) => t.withId === by.id)?.tie;
  return [
    `${to.name}: ${[to.description, to.prompt].filter(Boolean).join(" ").slice(0, 500)}`,
    `${by.name}${tie ? ` (${to.name}'s ${bare(tie)})` : ""} just introduced ${to.name} to ${userName} and passed on their number.`,
    heard.length ? `What ${by.name} has told ${to.name} about ${userName}: ${heard.join("; ")}` : "",
    reputation ? `What people around say about ${userName}: ${reputation}` : "",
    `Write ${to.name}'s first text to ${userName}: one to three short lines, in ${to.name}'s own voice, mentioning ${by.name} and something they've heard. Not too formal. Reply with only the message.`,
  ].filter(Boolean).join("\n");
};

export const introducedFact = (by: string, userName: string) => `${by} introduced you to ${userName} and gave you their number.`;
