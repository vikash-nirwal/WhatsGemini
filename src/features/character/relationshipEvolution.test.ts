import { buildRelationshipPrompt, parseRelationshipReply, relationshipCheckDue } from "./relationshipEvolution";

describe("relationshipCheckDue", () => {
  it("checks every 20 messages", () => {
    expect(relationshipCheckDue(19, undefined)).toBe(false);
    expect(relationshipCheckDue(20, undefined)).toBe(true);
    expect(relationshipCheckDue(30, 20)).toBe(false);
    expect(relationshipCheckDue(40, 20)).toBe(true);
  });
});

describe("parseRelationshipReply", () => {
  it("reads a new description", () => {
    expect(parseRelationshipReply('"reluctant allies"', "Strangers")).toBe("Reluctant allies");
    expect(parseRelationshipReply("New description: Falling for each other.", "Friends")).toBe("Falling for each other");
  });

  it("ignores SAME, the current label and rambling", () => {
    expect(parseRelationshipReply("SAME", "Friends")).toBeUndefined();
    expect(parseRelationshipReply("friends", "Friends")).toBeUndefined();
    expect(parseRelationshipReply("They have grown much closer over the last few weeks of talking every single night", "Friends")).toBeUndefined();
  });
});

describe("buildRelationshipPrompt", () => {
  it("includes the current label and the summary when there is one", () => {
    const prompt = buildRelationshipPrompt("Aria", "Vik", "New Friend", "Vik: hi", "They met at a cafe.");
    expect(prompt).toContain('currently described as: "New Friend"');
    expect(prompt).toContain("The story so far:\nThey met at a cafe.");
  });
});
