import { buildPollVotesPrompt, castYourVote, extractGroupName, extractPoll, parsePollVotes, pollPromptText, stripStreamingGroupTags, voteCounts } from "./groupLife";
import { Character, Poll } from "../../types";

const ARIA = { id: 1, name: "Aria", description: "Mechanic." } as Character;
const KAI = { id: 2, name: "Kai", description: "Pilot." } as Character;

describe("group events and polls (#124)", () => {
  it("reads a new group name at the end of a reply", () => {
    expect(extractGroupName("Fine, fine.\n[Group name: Garage Gremlins]")).toEqual({ text: "Fine, fine.", groupName: "Garage Gremlins" });
    expect(extractGroupName("No rename")).toEqual({ text: "No rename" });
  });

  it("reads a poll anywhere in a reply", () => {
    expect(extractPoll("Let's settle it. [Poll: Pizza or tacos? | Pizza | Tacos]")).toEqual({ text: "Let's settle it.", poll: { question: "Pizza or tacos?", options: ["Pizza", "Tacos"] } });
    expect(extractPoll("[Poll: only a question | one]").poll).toBeUndefined();
    expect(stripStreamingGroupTags("ok [Poll: Pizza or ta")).toBe("ok");
    expect(stripStreamingGroupTags("ok\n[Group na")).toBe("ok");
  });

  it("asks how each member votes, and times the votes after the post", () => {
    const poll = { question: "Pizza or tacos?", options: ["Pizza", "Tacos"] };
    expect(buildPollVotesPrompt(poll, [ARIA, KAI], "Kai: hungry")).toContain("1. Pizza\n2. Tacos");
    const votes = parsePollVotes('[{"name": "Aria", "option": 2}, {"name": "Kai", "option": 0}, {"name": "aria", "option": 1}]', [ARIA, KAI], 2, 1000, () => 0.5);
    expect(votes).toEqual([{ voter: 1, name: "Aria", option: 1, at: 1000 + 47_500 }]);
    expect(parsePollVotes("nope", [ARIA], 2, 0)).toEqual([]);
  });

  it("counts what has happened, and your vote toggles", () => {
    const poll: Poll = { question: "Q", options: ["A", "B"], votes: [{ voter: 1, option: 0, at: 10 }, { voter: 2, option: 1, at: 50 }] };
    expect(voteCounts(poll, 20)).toEqual([1, 0]);
    const voted = castYourVote(poll, 1, 30);
    expect(voteCounts(voted, 60)).toEqual([1, 2]);
    expect(castYourVote(voted, 1, 40).votes.some((v) => v.voter === "you")).toBe(false);
    expect(pollPromptText({ role: "you", poll: voted }, { 1: "Aria", 2: "Kai" })).toBe('(a poll: "Q" — A (Aria); B (Kai, the user))');
    expect(pollPromptText({ role: "ai", poll }, {})).toBe("[Poll: Q | A | B]");
  });
});
