import { Character, Chat } from "../../types";
import { awakeAt, firstTextLimitOf, unansweredFirstTexts } from "../character/firstTexts";

// Characters text you the news (#178): when something notable happens in a
// world - an event, a storyline chapter, something in someone's life - one or
// two people close to it text you about it, as people do. Only people who
// text first anyway (their own switch), who are awake, and who haven't
// texted you first in the last few hours or been left unanswered too often.

const NEWS_GAP_MS = 3 * 60 * 60 * 1000;

export const ownChat = (chats: Chat[], id: number) => chats.find((c) => c.characterIds?.length === 1 && c.characterIds[0] === id && !c.whatIf && !c.archived);

export const pickNewsTellers = (cast: Character[], chats: Chat[], about: number[], now: number, max = 2): Character[] => {
  const ok = cast.filter((c) => {
    const chat = ownChat(chats, c.id);
    const last = Math.max(0, ...(c.firstTexts || []));
    return c.textsFirst && chat && awakeAt(c, now) && now - last >= NEWS_GAP_MS && unansweredFirstTexts(chat.content) < firstTextLimitOf(c);
  });
  // Closest to it first: the people it's about, then those tied to them.
  const closeness = (c: Character) => (about.includes(c.id) ? 2 : (c.ties || []).some((t) => about.includes(t.withId)) ? 1 : 0);
  return ok.sort((a, b) => closeness(b) - closeness(a)).slice(0, max);
};

export const buildNewsTextPrompt = (c: Character, news: string, userName: string, lastLines: string[], aboutThem: boolean) =>
  [
    `You are ${c.name}. ${[c.description, c.prompt].filter(Boolean).join(" ").slice(0, 600)}`,
    c.relationship ? `${userName} is your ${c.relationship}.` : "",
    lastLines.length ? `The end of your last conversation with ${userName}:\n${lastLines.join("\n")}` : "",
    aboutThem ? `Something just happened in your life: ${news}` : `Just now, where you live: ${news}`,
    `You text ${userName} about it first, the way you would${aboutThem ? " - sharing your news" : " - did they hear, what you make of it, how it touches you"}. One to three short lines, in your own voice. Reply with only the message.`,
  ].filter(Boolean).join("\n\n");

