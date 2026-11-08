import { Character, CharacterStatus, World } from "../../types";
import { buildLetterPrompt } from "../character/letters";
import { buildCommentReplyPrompt, buildFeedReactionsPrompt } from "../character/statusFeed";
import { buildStatusPrompt } from "../character/statusUpdates";
import { buildCharacterChannelPrompt, buildWorldChannelPrompt } from "../channels/channels";
import { worldOfCharacter, worldTruthsLine } from "./worldTruths";

const NOW = new Date(2026, 10, 8, 12).getTime();
const world: World = {
  id: 4,
  name: "Harbor Town",
  premise: "A fishing town.",
  godTruths: ["The lighthouse keeper is a ghost."],
  announcements: [{ id: "a1", text: "The mayor resigned!", at: NOW, takes: { 1: "You were relieved." } }],
  arc: { title: "The Drowned Bell", beats: ["A bell rings under the sea", "Divers go down"], step: 0, startedAt: NOW, stepAt: NOW },
};
const aria: Character = { id: 1, name: "Aria", description: "A sailor.", prompt: "", worldId: 4 };
const kai: Character = { id: 2, name: "Kai", description: "A cook.", prompt: "" };
const status: CharacterStatus = { id: "s1", text: "Windy out", createdAt: NOW };

describe("what's true reaches letters and the feed (#245)", () => {
  const line = worldTruthsLine(world, [aria])!;

  it("one line with god mode's truths, announcements (and how they took it) and the storyline", () => {
    expect(line).toBe(
      "What's true in Harbor Town (keep to it; bring it up only if it fits): Simply true there (never question it): The lighthouse keeper is a ghost. Announced to everyone there, and real: The mayor resigned. How they took it: Aria on \"The mayor resigned\": they were relieved. The story under way there: The Drowned Bell: A bell rings under the sea."
    );
    expect(worldTruthsLine({ name: "Quiet" })).toBeUndefined();
    expect(worldTruthsLine({ ...world, arc: { ...world.arc!, doneAt: NOW }, godTruths: [], announcements: [] })).toBeUndefined();
  });

  it("only for characters in that world", () => {
    expect(worldOfCharacter(aria, [world])).toBe(world);
    expect(worldOfCharacter(kai, [world])).toBeUndefined();
    expect(worldTruthsLine(worldOfCharacter(kai, [world]))).toBeUndefined();
  });

  it("reaches letters, statuses, channel posts and the feed", () => {
    expect(buildLetterPrompt(aria, "Sam", 4, [], "", undefined, undefined, line)).toContain("The lighthouse keeper is a ghost");
    expect(buildLetterPrompt(aria, "Sam", 4, [], "")).not.toContain("What's true in");
    expect(buildStatusPrompt(aria, undefined, [], [], undefined, undefined, undefined, undefined, undefined, { worldTruths: line })).toContain("The mayor resigned");
    expect(buildStatusPrompt(aria, undefined, [], [])).not.toContain("What's true in");
    expect(buildFeedReactionsPrompt(aria, status, [{ character: kai }], line)).toContain("The Drowned Bell");
    expect(buildFeedReactionsPrompt(aria, status, [{ character: kai }])).not.toContain("What's true in");
    expect(buildCommentReplyPrompt(aria, status, "nice", "Sam", line)).toContain("The lighthouse keeper is a ghost");
    expect(buildCharacterChannelPrompt(aria, [], { worldTruths: line })).toContain("The mayor resigned");
    expect(buildWorldChannelPrompt(world, [], [], undefined, worldTruthsLine(world))).toContain("The Drowned Bell: A bell rings under the sea");
  });
});
