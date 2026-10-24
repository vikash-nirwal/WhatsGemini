import { Character, Message, Poll, PollVote } from "../../types";

// Group events and polls (#124): a group chat's own small happenings, as in
// WhatsApp. Members can rename the group ([Group name: ...] at the end of a
// reply) and start a poll ([Poll: question | option | option]); you can do
// both too. When a poll goes up, one helper call decides how each member
// votes, with times a little later, so votes come in over a minute or two.

const MAX_OPTIONS = 6;
const MAX_NAME = 40;
const SECOND = 1000;

const GROUP_NAME_TAG = /\n*\[\s*group\s*name\s*:\s*([^\]\n]{1,80})\]\s*$/i;
const POLL_TAG = /\[\s*poll\s*:\s*([^\]\n]{3,400})\]/i;

export const extractGroupName = (text: string): { text: string; groupName?: string } => {
  const match = text.match(GROUP_NAME_TAG);
  if (!match) return { text };
  const name = match[1].trim().replace(/^["“]|["”]$/g, "").slice(0, MAX_NAME);
  return { text: text.slice(0, match.index).trimEnd(), groupName: name || undefined };
};

export const parsePollSpec = (spec: string): Pick<Poll, "question" | "options"> | undefined => {
  const parts = spec.split("|").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return undefined;
  const [question, ...options] = parts;
  return { question: question.slice(0, 200), options: options.slice(0, MAX_OPTIONS).map((o) => o.slice(0, 80)) };
};

export const extractPoll = (text: string): { text: string; poll?: Pick<Poll, "question" | "options"> } => {
  const match = text.match(POLL_TAG);
  if (!match) return { text };
  const poll = parsePollSpec(match[1]);
  return poll ? { text: (text.slice(0, match.index) + text.slice(match.index! + match[0].length)).trim(), poll } : { text };
};

// While a reply streams in: hide either tag, even half-typed.
// A tag word still being typed at the very end: "[gr", "[Group na", "[Po".
const partialOf = (word: string) => Array.from({ length: word.length }, (_, i) => word.slice(0, i + 1).replace(/ /g, "\\s+")).join("|");
const PARTIAL_TAG = new RegExp(`\\n*\\[\\s*(?:${partialOf("group name")}|${partialOf("poll")})(?:\\s*:[^\\]\\n]*)?$`, "i");

export const stripStreamingGroupTags = (text: string): string =>
  text.replace(GROUP_NAME_TAG, "").replace(POLL_TAG, "").replace(PARTIAL_TAG, "").trimEnd();

export const buildGroupDirective = (userName: string): string =>
  `This is a group chat with ${userName}. Very rarely, when it fits a moment or a running joke, whoever is speaking can rename the group: end the reply with [Group name: the new name]. Just as rarely, they can start a poll for the group: put [Poll: question | option | option] (two to four options) in the reply.`;

export const voteCounts = (poll: Poll, now: number): number[] =>
  poll.options.map((_, i) => happenedVotes(poll, now).filter((v) => v.option === i).length);

export const happenedVotes = (poll: Poll, now: number): PollVote[] => poll.votes.filter((v) => v.at <= now);

// Your vote: one option, tapping it again takes it back.
export const castYourVote = (poll: Poll, option: number, now: number): Poll => {
  const mine = poll.votes.find((v) => v.voter === "you");
  const others = poll.votes.filter((v) => v.voter !== "you");
  return { ...poll, votes: mine?.option === option ? others : [...others, { voter: "you", option, at: now }] };
};

const about = (c: Pick<Character, "description" | "prompt">) => [c.description, c.prompt].filter(Boolean).join(" ").slice(0, 240);

export const buildPollVotesPrompt = (poll: Pick<Poll, "question" | "options">, voters: Character[], transcript: string): string =>
  `A poll was posted in a group chat: "${poll.question}"
Options:
${poll.options.map((o, i) => `${i + 1}. ${o}`).join("\n")}

The members who can vote:
${voters.map((c) => `- ${c.name}: ${about(c)}`).join("\n")}

The chat just before it:
${transcript}

For each member, decide which option they'd pick, the way they really would (someone might not vote at all).
Reply with only JSON, no code fence: [{"name": "member's name", "option": the option's number, or 0 to skip}]`;

export const parsePollVotes = (reply: string, voters: Character[], optionCount: number, postedAt: number, rand: () => number = Math.random): PollVote[] => {
  const raw = reply.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const data = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(data)) return [];
    const seen = new Set<number>();
    const votes: PollVote[] = [];
    for (const item of data) {
      const voter = voters.find((c) => c.name.toLowerCase() === String(item?.name || "").trim().toLowerCase());
      const n = Number(item?.option);
      if (!voter || seen.has(voter.id) || !Number.isInteger(n) || n < 1 || n > optionCount) continue;
      seen.add(voter.id);
      votes.push({ voter: voter.id, name: voter.name, option: n - 1, at: postedAt + Math.round((5 + rand() * 85) * SECOND) });
    }
    return votes;
  } catch {
    return [];
  }
};

// How a poll reads in the transcript the model sees.
export const pollPromptText = (msg: Pick<Message, "role" | "poll">, names: Record<number, string>): string => {
  const poll = msg.poll!;
  if (msg.role !== "you") return `[Poll: ${[poll.question, ...poll.options].join(" | ")}]`;
  const tally = poll.options
    .map((o, i) => {
      const who = poll.votes.filter((v) => v.option === i).map((v) => (v.voter === "you" ? "the user" : names[v.voter] || v.name || "someone"));
      return `${o}${who.length ? ` (${who.join(", ")})` : ""}`;
    })
    .join("; ");
  return `(a poll: "${poll.question}" — ${tally})`;
};
