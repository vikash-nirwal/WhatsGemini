import { parseAdventureChoices, buildAdventureSystemInstruction, ADVENTURE_CHOICES_START, ADVENTURE_CHOICES_END } from "./adventurePrompt";
import { Adventure, Character, World } from "../../../types";

describe("parseAdventureChoices", () => {
  it("returns the whole text with no choices when the block is absent", () => {
    expect(parseAdventureChoices("You step into the hall.")).toEqual({
      text: "You step into the hall.",
      choices: [],
    });
  });

  it("strips the block and parses numbered dot-style choices", () => {
    const raw = `You step into the hall.\n\n${ADVENTURE_CHOICES_START}\n1. Push the door open\n2. Circle around back\n${ADVENTURE_CHOICES_END}`;
    expect(parseAdventureChoices(raw)).toEqual({
      text: "You step into the hall.",
      choices: [
        { id: "c1", label: "Push the door open" },
        { id: "c2", label: "Circle around back" },
      ],
    });
  });

  it("tolerates parenthesis, colon, dash, and bullet numbering styles", () => {
    const raw = `Scene.\n${ADVENTURE_CHOICES_START}\n1) Knock\n2: Wait\n- Leave\n${ADVENTURE_CHOICES_END}`;
    expect(parseAdventureChoices(raw).choices).toEqual([
      { id: "c1", label: "Knock" },
      { id: "c2", label: "Wait" },
      { id: "c3", label: "Leave" },
    ]);
  });

  it("keeps trailing text intact when the block sits mid-reply", () => {
    const raw = `Intro.\n${ADVENTURE_CHOICES_START}\n1. Go left\n${ADVENTURE_CHOICES_END}\nExtra trailing note.`;
    const result = parseAdventureChoices(raw);
    expect(result.text).toBe("Intro.\n\nExtra trailing note.");
    expect(result.choices).toEqual([{ id: "c1", label: "Go left" }]);
  });

  it("treats everything after the opener as the block when the closer is missing", () => {
    const raw = `Scene.\n${ADVENTURE_CHOICES_START}\n1. Run\n2. Hide`;
    const result = parseAdventureChoices(raw);
    expect(result.text).toBe("Scene.");
    expect(result.choices).toEqual([
      { id: "c1", label: "Run" },
      { id: "c2", label: "Hide" },
    ]);
  });

  it("drops blank lines inside the block", () => {
    const raw = `Scene.\n${ADVENTURE_CHOICES_START}\n1. Run\n\n2. Hide\n${ADVENTURE_CHOICES_END}`;
    expect(parseAdventureChoices(raw).choices).toHaveLength(2);
  });
});

describe("buildAdventureSystemInstruction", () => {
  const adventure: Adventure = { id: 1, title: "T", timestamp: 0, characterIds: [], status: "active", content: [] };

  it("always includes the narrator role and the choices-block instruction", () => {
    const text = buildAdventureSystemInstruction(adventure, undefined, [], undefined, []);
    expect(text).toContain("narrator and game master");
    expect(text).toContain(ADVENTURE_CHOICES_START);
    expect(text).toContain(ADVENTURE_CHOICES_END);
  });

  it("folds in the world, its lore when triggered, and the premise", () => {
    const world: World = {
      id: 1,
      name: "The Silver Court",
      premise: "A hidden fae kingdom.",
      loreEntries: [{ id: "l1", keywords: ["queen"], content: "The queen never lies.", enabled: true }],
    };
    const adv: Adventure = { ...adventure, premise: "You arrive at the gate." };
    const text = buildAdventureSystemInstruction(adv, world, [], undefined, [{ role: "you", txt: "I ask about the queen." }]);
    expect(text).toContain("The Silver Court");
    expect(text).toContain("A hidden fae kingdom.");
    expect(text).toContain("The queen never lies.");
    expect(text).toContain("You arrive at the gate.");
  });

  it("omits untriggered lore entries", () => {
    const world: World = {
      id: 1,
      name: "W",
      premise: "P",
      loreEntries: [{ id: "l1", keywords: ["dragon"], content: "Secret dragon lore.", enabled: true }],
    };
    const text = buildAdventureSystemInstruction(adventure, world, [], undefined, [{ role: "you", txt: "I open the door." }]);
    expect(text).not.toContain("Secret dragon lore.");
  });

  it("lists cast members with an instruction never to speak for the player", () => {
    const cast: Character[] = [{ id: 1, name: "Trader", description: "A merchant", prompt: "Shrewd and friendly." }];
    const text = buildAdventureSystemInstruction(adventure, undefined, cast, undefined, []);
    expect(text).toContain("Trader");
    expect(text).toContain("Shrewd and friendly.");
    expect(text).toContain("never let them speak or act for the player");
  });

  it("respects a custom choice count and reply length limit", () => {
    const adv: Adventure = { ...adventure, rules: { choiceCount: 4, replyLengthLimit: 300 } };
    const text = buildAdventureSystemInstruction(adv, undefined, [], undefined, []);
    expect(text).toContain("exactly 4 short suggested next actions");
    expect(text).toContain("300 characters or less");
  });
});
