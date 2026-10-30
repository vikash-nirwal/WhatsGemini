import { Message } from "../../types";
import { trimToLatestSummary } from "../ai/utils/transcript";
import { MEMORY_EXTRACTION_INTERVAL } from "../../utils/constants";

// Memory when someone is pulled into a chat (the user's request,
// 2026-10-30). Memory used to move only every MEMORY_EXTRACTION_INTERVAL
// messages, so a 1:1's last few messages weren't remembered yet when the
// chat became a group, and a newcomer knew what came before they arrived
// only while it was still on screen. Now, when someone is added, the chat
// they were added from is caught up, and the newcomer keeps the gist of
// what was said before they arrived.

const BRIEF_MESSAGES = MEMORY_EXTRACTION_INTERVAL * 2;
export const BRIEF_FACTS = 6;

// What the newcomer takes away from the conversation so far.
export const buildJoinBriefPrompt = (name: string, userName: string, transcript: string, known: string[]) =>
  [
    `${name} has just been added to an ongoing conversation with ${userName}. This is what was said before ${name} arrived:`,
    transcript,
    "",
    known.length ? `What ${name} already remembers:\n${known.map((f) => `- ${f}`).join("\n")}\n` : "",
    `Write at most ${BRIEF_FACTS} short facts ${name} would now know from reading it and should remember later: what happened, plans made, news about ${userName} or the others, how things stand between them. Leave out small talk and anything ${name} already remembers. Use real names.`,
    `One fact per line, each starting with its category: [user] (about ${userName}), [relationship] (between ${name} and ${userName}) or [story] (events, plans, places, things). If there's nothing worth keeping, write NONE.`,
  ].filter(Boolean).join("\n");

// The messages a newcomer reads: the latest summary and what follows it,
// without notes, up to BRIEF_MESSAGES.
export const briefMessages = (content: Message[]) => {
  const spoken = trimToLatestSummary(content).filter((m) => !m.isSystem && !m.isRoomEvent);
  return spoken.slice(-BRIEF_MESSAGES);
};

// A 1:1's messages its character hasn't taken into memory yet: everything
// after their last memory update ("where things stand" is rewritten with
// each one), or the last interval's worth when there's never been one.
export const unremembered = (content: Message[], standingAt?: number) => {
  const spoken = trimToLatestSummary(content).filter((m) => !m.isSystem && !m.isRoomEvent && !m.isCompressionSummary);
  const fresh = standingAt ? spoken.filter((m) => (m.timestamp || 0) > standingAt) : spoken.slice(-MEMORY_EXTRACTION_INTERVAL);
  return fresh.slice(-BRIEF_MESSAGES);
};
