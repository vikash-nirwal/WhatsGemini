import { beatStamp, beatStarts, buildStoryScriptSection, cleanScript, emptyScript, extractBeatTag, makeBeat, moveBeat, parseScriptDraft, stripStreamingBeatTag } from "./storyScript";
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
