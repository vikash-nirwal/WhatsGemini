import { applyCastRenames, beatRange, beatStamp, beatStarts, buildBeatCheckPrompt, buildScriptDraftPrompt, buildStoryScriptSection, cleanScript, emptyScript, extractBeatTag, makeBeat, makeCastMember, moveBeat, parseBeatCheckReply, parseScriptDraft, renameInText, stripStreamingBeatTag } from "./storyScript";
import { StoryScript } from "../../types";

const script = (overrides: Partial<StoryScript> = {}): StoryScript => ({
  ...emptyScript(),
  premise: "Two strangers share a train compartment.",
  beats: [makeBeat("They meet."), makeBeat("A storm stops the train."), makeBeat("They confess.")],
  directions: "Slow burn. No violence.",
  ending: "They get off at the same stop.",
  ...overrides,
});

describe("buildStoryScriptSection", () => {
  it("gives the current beat only, with the premise, directions and mode", () => {
    const text = buildStoryScriptSection(script({ currentBeat: 1 }));
    expect(text).toContain("Premise: Two strangers share a train compartment.");
    expect(text).toContain("always follow them): Slow burn. No violence.");
    expect(text).toContain("you're on beat 2. Current beat: A storm stops the train.");
    expect(text).not.toContain("They confess.");
    expect(text).toContain("[Beat done]");
    expect(text).toContain("Stay strictly inside this story.");
  });

  it("heads for the ending once every beat is done", () => {
    const text = buildStoryScriptSection(script({ currentBeat: 3, mode: "loose" }));
    expect(text).toContain("Every planned beat has happened. Bring the story to this ending: They get off at the same stop.");
    expect(text).not.toContain("[Beat done]");
    expect(text).toContain("improvise freely");
  });
});

describe("beat tag", () => {
  it("is stripped from the end and reported", () => {
    expect(extractBeatTag("The lights flicker out.\n[Beat done]")).toEqual({ text: "The lights flicker out.", beatDone: true });
    expect(extractBeatTag("Hi. [beat: complete]").beatDone).toBe(true);
    expect(extractBeatTag("No tag here.")).toEqual({ text: "No tag here.", beatDone: false });
  });

  it("is hidden while streaming, even half-typed", () => {
    expect(stripStreamingBeatTag("The train stops.\n[Beat do")).toBe("The train stops.");
    expect(stripStreamingBeatTag("The train stops.\n[Beat done]")).toBe("The train stops.");
    expect(stripStreamingBeatTag("Look [at this]")).toBe("Look [at this]");
  });
});

describe("moving between beats", () => {
  it("stays in range", () => {
    expect(moveBeat(script(), -1).currentBeat).toBe(0);
    expect(moveBeat(script({ currentBeat: 2 }), 1).currentBeat).toBe(3);
    expect(moveBeat(script({ currentBeat: 3 }), 1).currentBeat).toBe(3);
  });
});

describe("cleanScript", () => {
  it("drops blank beats and an empty script", () => {
    expect(cleanScript(script({ beats: [makeBeat("  "), makeBeat("They meet.")] }))?.beats.map((b) => b.text)).toEqual(["They meet."]);
    expect(cleanScript(emptyScript())).toBeUndefined();
  });
});

describe("parseScriptDraft", () => {
  it("reads the JSON, tolerating a code fence", () => {
    const draft = parseScriptDraft('```json\n{"premise": "A heist.", "beats": ["Plan it", "", "Pull it off"], "directions": "Fast", "ending": "They escape"}\n```');
    expect(draft?.premise).toBe("A heist.");
    expect(draft?.beats.map((b) => b.text)).toEqual(["Plan it", "Pull it off"]);
    expect(draft?.ending).toBe("They escape");
  });

  it("returns nothing for a reply that isn't a plan", () => {
    expect(parseScriptDraft("Sure! Here's your story.")).toBeUndefined();
    expect(parseScriptDraft('{"premise": "", "beats": []}')).toBeUndefined();
  });
});

describe("beats on messages", () => {
  const script: StoryScript = { ...emptyScript(), beats: [makeBeat("Meet"), makeBeat("Storm")], currentBeat: 1 };

  it("stamps a reply with the current beat, and nothing once all are done", () => {
    expect(beatStamp(script)).toEqual({ beat: 2 });
    expect(beatStamp({ ...script, currentBeat: 2 })).toEqual({});
    expect(beatStamp(undefined)).toEqual({});
  });

  it("finds where each beat starts", () => {
    expect([...beatStarts([{}, { beat: 1 }, {}, { beat: 1 }, { beat: 2 }, { beat: 2 }])]).toEqual([1, 4]);
  });

  it("puts the beat tag before an adventure's choices block", () => {
    expect(buildStoryScriptSection({ ...script, currentBeat: 0 }, { beforeChoices: true })).toContain("put the tag [Beat done] on its own line just before the choices block");
  });
});

describe("beat check", () => {
  it("asks about the current beat, naming the next one as not due yet", () => {
    const text = buildBeatCheckPrompt(script({ currentBeat: 1 }), "Mira: The train shudders to a halt.");
    expect(text).toContain('The current beat is: "A storm stops the train."');
    expect(text).toContain('(not due yet): "They confess."');
    expect(text).not.toContain("They meet.");
    expect(text).toContain("Mira: The train shudders to a halt.");
  });

  it("leaves out the next beat on the last one", () => {
    expect(buildBeatCheckPrompt(script({ currentBeat: 2 }), "")).not.toContain("not due yet");
  });

  it("reads only a clear yes", () => {
    expect(parseBeatCheckReply("yes")).toBe(true);
    expect(parseBeatCheckReply('**Yes.** The storm hit.')).toBe(true);
    expect(parseBeatCheckReply("no")).toBe(false);
    expect(parseBeatCheckReply("Not yet, yes it's close")).toBe(false);
    expect(parseBeatCheckReply("yesterday")).toBe(false);
  });
});

describe("beats for long stories", () => {
  const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

  it("keeps 3 to 10 for a short story and grows with a long one", () => {
    expect(beatRange(words(300))).toEqual({ min: 3, max: 10 });
    expect(beatRange(words(6000))).toEqual({ min: 20, max: 50 });
    expect(beatRange(words(50000)).max).toBe(60);
  });

  it("asks for that many beats and the story's people", () => {
    const prompt = buildScriptDraftPrompt(words(6000));
    expect(prompt).toContain("20 to 50 beats");
    expect(prompt).toContain('"cast"');
  });

  it("reads more than ten beats and the cast", () => {
    const beats = Array.from({ length: 25 }, (_, i) => `Event ${i + 1}`);
    const draft = parseScriptDraft(JSON.stringify({ premise: "P", beats, cast: [{ name: "Mira", about: "A thief." }, "Tom", { name: "mira" }] }));
    expect(draft?.beats).toHaveLength(25);
    expect(draft?.cast?.map((c) => [c.name, c.about])).toEqual([["Mira", "A thief."], ["Tom", ""]]);
  });
});

describe("renaming the story's people", () => {
  it("replaces whole names only, and the first name on its own", () => {
    expect(renameInText("Elizabeth Bennet meets Darcy. Elizabeth laughs. Elizabethan dress.", "Elizabeth Bennet", "Lily Bennet")).toBe("Lily Bennet meets Darcy. Lily laughs. Elizabethan dress.");
    expect(renameInText("Tom's hat; Tommy's too.", "Tom", "Sam")).toBe("Sam's hat; Tommy's too.");
  });

  it("rewrites the script for every changed name", () => {
    const mira = makeCastMember("Mira", "Mira is a thief.");
    const s = script({ premise: "Mira robs a train.", beats: [makeBeat("Mira hides.")], cast: [mira] });
    const renamed = applyCastRenames({ ...s, cast: [{ ...mira, name: "Nadia" }] }, [mira]);
    expect(renamed.premise).toBe("Nadia robs a train.");
    expect(renamed.beats[0].text).toBe("Nadia hides.");
    expect(renamed.cast?.[0]).toMatchObject({ name: "Nadia", about: "Nadia is a thief." });
  });
});

describe("the story's people in the prompt", () => {
  const cast = [{ ...makeCastMember("Darcy", "Proud."), playedBy: "character" as const }, { ...makeCastMember("Lizzy", "Witty."), playedBy: "user" as const }, makeCastMember("Jane", "Kind.")];

  it("lets the chat's character voice the others, by name", () => {
    const text = buildStoryScriptSection(script({ cast }), { characterName: "Ari" });
    expect(text).toContain("- Darcy (you, Ari, play them): Proud.");
    expect(text).toContain("- Lizzy (the user plays them): Witty.");
    expect(text).toContain("you voice the story's other characters (Jane)");
    expect(text).toContain("**Jane:**");
    expect(text).toContain("Never speak or act for Lizzy");
  });

  it("only lists them for a narrator", () => {
    const text = buildStoryScriptSection(script({ cast }), { beforeChoices: true });
    expect(text).toContain("- Jane: Kind.");
    expect(text).not.toContain("**Jane:**");
  });

  it("keeps the cast through cleaning, dropping blank names", () => {
    expect(cleanScript(script({ cast: [makeCastMember(" Jane "), makeCastMember(" ")] }))?.cast?.map((c) => c.name)).toEqual(["Jane"]);
  });
});
