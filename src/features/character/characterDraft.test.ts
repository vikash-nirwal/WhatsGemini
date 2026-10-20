import { buildCharacterDraftPrompt, parseCharacterDraft, draftAllowsNsfw, CharacterDraftError } from "./characterDraft";

const FULL_DRAFT = {
  name: "Barnaby Salt",
  description: "A grumpy ship's cook who hides a book of poems.",
  personalityTraits: ["grumpy", "secretly tender", "proud"],
  prompt: "You are Barnaby Salt, the cook aboard the Gull.",
  scenario: "The galley, after a storm.",
  firstMessage: "*slams a pot down* You're late for supper.",
  alternateGreetings: ["*hides a notebook* Didn't hear you come in.", "Out of my galley!"],
  exampleDialogue: "User: What's for dinner?\nBarnaby: *grunts* Fish. Again.",
  relationship: "Grumpy crewmate",
  appearance: "A broad man in his fifties with a salt-and-pepper beard.",
  visualTags: "fifties, broad build, weathered tan skin, salt-and-pepper beard, stained apron",
};

describe("buildCharacterDraftPrompt", () => {
  it("includes the idea and asks for the JSON shape", () => {
    const prompt = buildCharacterDraftPrompt({ idea: "  grumpy pirate cook who secretly writes poetry " });
    expect(prompt).toContain("Idea: grumpy pirate cook who secretly writes poetry\n");
    expect(prompt).toContain('"firstMessage"');
    expect(prompt).toContain('"visualTags"');
    expect(prompt).toContain('"alternateGreetings"');
  });

  it("keeps the draft safe for work unless NSFW is picked and confirmed", () => {
    const sfw = /Keep everything safe for work/;
    expect(buildCharacterDraftPrompt({ idea: "a bard" })).toMatch(sfw);
    expect(buildCharacterDraftPrompt({ idea: "a bard", contentRating: "sfw" })).toMatch(sfw);
    expect(buildCharacterDraftPrompt({ idea: "a bard", contentRating: "nsfw" })).toMatch(sfw);
    expect(buildCharacterDraftPrompt({ idea: "a bard", contentRating: "nsfw", adultsConfirmed: false })).toMatch(sfw);
    const adult = buildCharacterDraftPrompt({ idea: "a bard", contentRating: "nsfw", adultsConfirmed: true });
    expect(adult).not.toMatch(sfw);
    expect(adult).toContain("clearly an adult (18 or older)");
  });

  it("never allows NSFW when the idea suggests a minor", () => {
    const request = { idea: "a 16 year old bard", contentRating: "nsfw" as const, adultsConfirmed: true };
    expect(draftAllowsNsfw(request)).toBe(false);
    expect(buildCharacterDraftPrompt(request)).toMatch(/Keep everything safe for work/);
  });

  it("mentions the art style and the previous draft when given", () => {
    const prompt = buildCharacterDraftPrompt({ idea: "a bard", artStyle: "realistic", avoidName: "Barnaby Salt" });
    expect(prompt).toContain("realistic style");
    expect(prompt).toContain("different from the previous draft, Barnaby Salt");
    expect(buildCharacterDraftPrompt({ idea: "a bard" })).not.toContain("previous draft");
  });
});

describe("parseCharacterDraft", () => {
  it("parses a complete draft", () => {
    const draft = parseCharacterDraft(JSON.stringify(FULL_DRAFT));
    expect(draft).toEqual({
      name: "Barnaby Salt",
      description: FULL_DRAFT.description,
      personalityTraits: ["grumpy", "secretly tender", "proud"],
      prompt: FULL_DRAFT.prompt,
      scenario: FULL_DRAFT.scenario,
      first_mes: FULL_DRAFT.firstMessage,
      alternateGreetings: FULL_DRAFT.alternateGreetings,
      mes_example: FULL_DRAFT.exampleDialogue,
      relationship: "Grumpy crewmate",
      appearance: FULL_DRAFT.appearance,
      visualTags: FULL_DRAFT.visualTags,
    });
  });

  it("tolerates a code fence and chatter around the JSON", () => {
    const reply = `Here's your character!\n\`\`\`json\n${JSON.stringify(FULL_DRAFT, null, 2)}\n\`\`\`\nEnjoy {and have fun}.`;
    expect(parseCharacterDraft(reply).name).toBe("Barnaby Salt");
  });

  it("repairs trailing commas and raw newlines inside strings", () => {
    const reply = `{"name": "Barnaby", "prompt": "You are Barnaby.\nYou cook.", "personalityTraits": ["grumpy",],}`;
    const draft = parseCharacterDraft(reply);
    expect(draft.prompt).toBe("You are Barnaby.\nYou cook.");
    expect(draft.personalityTraits).toEqual(["grumpy"]);
  });

  it("fills missing fields with empty values", () => {
    const draft = parseCharacterDraft(JSON.stringify({ name: "Barnaby", prompt: "You are Barnaby." }));
    expect(draft.scenario).toBe("");
    expect(draft.first_mes).toBe("");
    expect(draft.alternateGreetings).toEqual([]);
    expect(draft.personalityTraits).toEqual([]);
    expect(draft.visualTags).toBe("");
  });

  it("ignores values of the wrong type", () => {
    const draft = parseCharacterDraft(JSON.stringify({
      name: "Barnaby",
      prompt: "You are Barnaby.",
      scenario: 42,
      description: { text: "nope" },
      alternateGreetings: ["Ahoy!", 7, null, "  "],
      personalityTraits: [true, "grumpy"],
    }));
    expect(draft.scenario).toBe("");
    expect(draft.description).toBe("");
    expect(draft.alternateGreetings).toEqual(["Ahoy!"]);
    expect(draft.personalityTraits).toEqual(["grumpy"]);
  });

  it("accepts other key spellings and list fields given as strings", () => {
    const draft = parseCharacterDraft(JSON.stringify({
      Name: "Barnaby",
      personality: "You are Barnaby.",
      traits: "grumpy, proud\n- poetic",
      first_message: "Ahoy.",
      alternate_greetings: "Out of my galley!",
      example_dialogue: ["User: Hi\nBarnaby: Hmph.", "User: Bye\nBarnaby: Good."],
      visual_tags: ["fifties", "grey beard"],
    }));
    expect(draft.prompt).toBe("You are Barnaby.");
    expect(draft.personalityTraits).toEqual(["grumpy", "proud", "poetic"]);
    expect(draft.first_mes).toBe("Ahoy.");
    expect(draft.alternateGreetings).toEqual(["Out of my galley!"]);
    expect(draft.mes_example).toBe("User: Hi\nBarnaby: Hmph.\n\nUser: Bye\nBarnaby: Good.");
    expect(draft.visualTags).toBe("fifties, grey beard");
  });

  it("takes traits from a personality array when the prompt has another key", () => {
    const draft = parseCharacterDraft(JSON.stringify({ name: "B", persona: "You are B.", personality: ["grumpy", "Grumpy", "kind"] }));
    expect(draft.prompt).toBe("You are B.");
    expect(draft.personalityTraits).toEqual(["grumpy", "kind"]);
  });

  it("caps the lists and drops an alternate greeting that repeats the first message", () => {
    const draft = parseCharacterDraft(JSON.stringify({
      name: "B",
      prompt: "You are B.",
      firstMessage: "Hi.",
      alternateGreetings: ["Hi.", "One", "Two", "Three"],
      personalityTraits: ["a", "b", "c", "d", "e", "f", "g", "h"],
    }));
    expect(draft.alternateGreetings).toEqual(["One", "Two"]);
    expect(draft.personalityTraits).toHaveLength(6);
  });

  it.each([
    ["no JSON at all", "Sorry, I can't help with that."],
    ["broken JSON", '{"name": "B", "prompt": '],
    ["unquoted keys", '{ name: "B", prompt: "You are B." }'],
  ])("throws a readable error for %s", (_label, reply) => {
    expect(() => parseCharacterDraft(reply)).toThrow(CharacterDraftError);
    expect(() => parseCharacterDraft(reply)).toThrow(/wasn't a character draft/);
  });

  it("salvages a single draft wrapped in an array", () => {
    expect(parseCharacterDraft('[{"name": "B", "prompt": "You are B."}]').name).toBe("B");
  });

  it("throws when the name or the personality is missing", () => {
    expect(() => parseCharacterDraft(JSON.stringify({ name: "B" }))).toThrow(/missing a name or a personality/);
    expect(() => parseCharacterDraft(JSON.stringify({ prompt: "You are B." }))).toThrow(/missing a name or a personality/);
  });
});
