import { buildRelationshipNotes, buildWhoRepliesPrompt, cleanNarration, everyoneAfter, parseWhoReplies } from "./roomTurns";
import { Character } from "../../../types";

const char = (id: number, name: string): Character => ({ id, name, description: "", prompt: "" });
const aria = char(1, "Aria");
const kai = char(2, "Kai Moreno");
const lin = char(3, "Lin");

describe("everyoneAfter", () => {
  it("is the others, up to the cap", () => {
    expect(everyoneAfter([aria, kai, lin], 2).map((c) => c.name)).toEqual(["Aria", "Lin"]);
    expect(everyoneAfter([aria, kai, lin], 1, 2).map((c) => c.name)).toEqual(["Kai Moreno"]);
  });
});

describe("who replies naturally", () => {
  it("reads names in order, by first name too, and stops at the cap", () => {
    expect(parseWhoReplies("Kai, Aria", [aria, kai, lin]).map((c) => c.id)).toEqual([2, 1]);
    expect(parseWhoReplies("kai and lin.", [aria, kai, lin]).map((c) => c.id)).toEqual([2, 3]);
    expect(parseWhoReplies("Aria, Kai, Lin, Aria", [aria, kai, lin], 2).map((c) => c.id)).toEqual([1, 2]);
  });

  it("can be nobody, and ignores names not in the room", () => {
    expect(parseWhoReplies("NONE", [aria, kai])).toEqual([]);
    expect(parseWhoReplies("Bob", [aria, kai])).toEqual([]);
  });

  it("asks with every name and the cap", () => {
    expect(buildWhoRepliesPrompt(["Aria", "Kai"], "Vik", "Vik: hey all")).toContain("between Vik and Aria, Kai");
  });
});

describe("narration", () => {
  it("strips a label and quotes", () => {
    expect(cleanNarration('Narration: "Rain taps on the garage roof."')).toBe("Rain taps on the garage roof.");
    expect(cleanNarration(" ")).toBeUndefined();
  });
});

describe("buildRelationshipNotes", () => {
  const rels = [
    { fromId: 1, toId: 2, note: "Resents him for the crash" },
    { fromId: 2, toId: 1, note: "Secretly admires her" },
    { fromId: 1, toId: 3, note: " " },
  ];
  it("gives a speaker only their own feelings about others", () => {
    expect(buildRelationshipNotes(1, rels, { 1: "Aria", 2: "Kai", 3: "Lin" })).toBe(
      "How you feel about the others here (keep it in mind; don't announce it):\n- Kai: Resents him for the crash"
    );
    expect(buildRelationshipNotes(3, rels, { 1: "Aria", 2: "Kai", 3: "Lin" })).toBeUndefined();
  });
});
