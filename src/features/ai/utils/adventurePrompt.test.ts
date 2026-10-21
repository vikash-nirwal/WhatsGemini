import { parseAdventureChoices, buildAdventureSystemInstruction, adventureContentRating, streamingNarrationForDisplay, findCastInNarration, buildAdventureSceneImageInstruction, extractAdventureEmotions, buildAdventureEmotionDirective, ADVENTURE_CHOICES_START, ADVENTURE_CHOICES_END } from "./adventurePrompt";
import { Adventure, Character, World } from "../../../types";
import { resolveImagePromptTarget } from "./imagePromptGuide";

const PROSE = resolveImagePromptTarget({ providerId: "openai" });
const SD = resolveImagePromptTarget({ providerId: "sdwebui" });

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

describe("findCastInNarration", () => {
  const cast: Character[] = [
    { id: 1, name: "Mira", description: "A thief", prompt: "" },
    { id: 2, name: "Old Tom", description: "A ferryman", prompt: "" },
    { id: 3, name: "Al", description: "A guard", prompt: "" },
  ];

  it("matches names case-insensitively as whole words only", () => {
    const found = findCastInNarration("MIRA grins while old tom rows. The alley is quiet.", cast);
    expect(found.map((c) => c.name)).toEqual(["Mira", "Old Tom"]);
  });

  it("returns nothing when no one is named", () => {
    expect(findCastInNarration("The wind howls.", cast)).toEqual([]);
  });
});

describe("buildAdventureSceneImageInstruction", () => {
  const world: World = { id: 1, name: "Ashfall", premise: "A city under a volcano", tone: "Grim" };
  const cast: Character[] = [{ id: 1, name: "Mira", description: "A thief", prompt: "", appearance: "red cloak, silver hair" }];

  it("includes the narration, setting, present cast and style", () => {
    const text = buildAdventureSceneImageInstruction("Mira leaps the rooftop.", world, cast, { id: "p", name: "Kai", bio: "", appearance: "tall" }, "Anime style", "High quality.", PROSE);
    expect(text).toContain("Mira leaps the rooftop.");
    expect(text).toContain("Ashfall");
    expect(text).toContain("red cloak, silver hair");
    expect(text).toContain("Kai (the player");
    expect(text).toContain("Anime style");
    expect(text).toContain("High quality.");
  });

  it("writes for the image model in use: tags for SD WebUI, prose for OpenAI", () => {
    const sd = buildAdventureSceneImageInstruction("Scene.", undefined, [], undefined, "s", "b", SD);
    expect(sd).toContain("writing for Stable Diffusion WebUI");
    expect(sd).toContain("comma-separated tags");
    expect(buildAdventureSceneImageInstruction("Scene.", undefined, [], undefined, "s", "b", PROSE)).toContain("natural-language paragraph");
  });
});

describe("extractAdventureEmotions", () => {
  const cast: Character[] = [
    { id: 1, name: "Mira", description: "", prompt: "", emotionPortraits: { enabled: true, images: {}, customEmotions: ["wistful"] } },
    { id: 2, name: "Old Tom", description: "", prompt: "" },
  ];

  it("maps names to ids and strips the tag from the narration", () => {
    const raw = `Mira smirks.

[Emotions: mira=Wistful; Old Tom=scared]
${ADVENTURE_CHOICES_START}
1. Run
${ADVENTURE_CHOICES_END}`;
    const { text, castEmotions } = extractAdventureEmotions(raw, cast);
    expect(castEmotions).toEqual({ 1: "wistful", 2: "scared" });
    expect(text).not.toContain("Emotions");
    expect(parseAdventureChoices(text)).toEqual({ text: "Mira smirks.", choices: [{ id: "c1", label: "Run" }] });
  });

  it("drops unknown names and off-list words but still strips the tag", () => {
    const { text, castEmotions } = extractAdventureEmotions("The door creaks. [Emotions: Ghost=happy, Old Tom=wistful]", cast);
    expect(castEmotions).toBeUndefined();
    expect(text).toBe("The door creaks.");
  });

  it("leaves text without a tag untouched", () => {
    expect(extractAdventureEmotions("Quiet night.", cast)).toEqual({ text: "Quiet night." });
  });

  it("offers custom emotions only to their own character", () => {
    const directive = buildAdventureEmotionDirective(cast);
    expect(directive).toContain("Mira may also use: wistful.");
    expect(directive).not.toContain("Old Tom may also use");
  });
});

describe("buildAdventureSceneImageInstruction requested focus", () => {
  it("makes the player's requested subject the focus only when asked", () => {
    expect(buildAdventureSceneImageInstruction("You unroll the map.", undefined, [], undefined, "s", "b", PROSE, { requestedFocus: "I study the map" })).toContain('"I study the map"');
    expect(buildAdventureSceneImageInstruction("You unroll the map.", undefined, [], undefined, "s", "b", PROSE)).not.toContain("explicitly asked");
  });
});

describe("buildAdventureSceneImageInstruction full cast", () => {
  const cast: Character[] = [
    { id: 1, name: "Mira", description: "A thief", prompt: "" },
    { id: 2, name: "Old Tom", description: "A ferryman", prompt: "" },
  ];

  it("requires every cast member to be depicted when asked", () => {
    const text = buildAdventureSceneImageInstruction("Mira waits.", undefined, cast, undefined, "s", "b", PROSE, { includeFullCast: true });
    expect(text).toContain("whole cast in this picture: Mira, Old Tom");
    expect(text).not.toContain("Characters who may appear");
  });

  it("leaves casting to the narration otherwise", () => {
    expect(buildAdventureSceneImageInstruction("Mira waits.", undefined, cast, undefined, "s", "b", PROSE)).not.toContain("whole cast");
  });
});

describe("adventure content rules", () => {
  const adventure: Adventure = { id: 1, title: "T", timestamp: 0, characterIds: [], status: "active", content: [] };
  const npc = (id: number, extra: Partial<Character> = {}): Character => ({ id, name: `NPC${id}`, description: "An adult ranger.", prompt: "", ...extra });
  const adult = (id: number) => npc(id, { contentRating: "nsfw", adultsConfirmed: true });

  it("is explicit only when every cast member is effectively NSFW", () => {
    expect(adventureContentRating([adult(1), adult(2)])).toBe("nsfw");
    expect(adventureContentRating([adult(1), npc(2, { contentRating: "sfw" })])).toBe("sfw");
    expect(adventureContentRating([adult(1), npc(2)])).toBe("sfw");
  });

  it("sends no content rule for an unrated or empty cast", () => {
    expect(adventureContentRating([npc(1)])).toBeUndefined();
    expect(adventureContentRating([])).toBeUndefined();
  });

  it("puts the content rule and roleplay style into the narrator prompt", () => {
    const text = buildAdventureSystemInstruction(adventure, undefined, [npc(1, { contentRating: "sfw" })], { id: "p", name: "Arin", bio: "" }, [], {
      roleplayStyle: { pov: "first", actionsInAsterisks: true, neverSpeakForUser: true, timeAwareness: false, customInstructions: "Keep it witty." },
    });
    expect(text).toContain("keep this story non-explicit");
    expect(text).toContain("*asterisks*");
    expect(text).toContain("(OOC: ...)");
    expect(text).toContain("Keep it witty.");
    expect(text).not.toContain("first person");
  });
});

describe("streamingNarrationForDisplay", () => {
  it("hides the emotions tag and choices block", () => {
    expect(streamingNarrationForDisplay(`You enter.\n[Emotions: Mira=happy]\n${ADVENTURE_CHOICES_START}\n1. Go`)).toBe("You enter.");
  });

  it("hides a tag or block that has only partly arrived", () => {
    expect(streamingNarrationForDisplay("You enter.\n[Emo")).toBe("You enter.");
    expect(streamingNarrationForDisplay("You enter.\n<<")).toBe("You enter.");
  });

  it("leaves ordinary narration alone", () => {
    expect(streamingNarrationForDisplay("The door creaks open.")).toBe("The door creaks open.");
  });
});
