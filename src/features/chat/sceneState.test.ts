import { buildStateDirective, extractStateBlock, formatState, mergeState, parseState, stripStreamingState } from "./sceneState";

describe("parseState", () => {
  it("reads every field and clamps the meters", () => {
    expect(parseState("location: the rooftop bar; time: late evening; outfit: red dress; affection: 72; trust: 140")).toEqual({
      location: "the rooftop bar",
      time: "late evening",
      outfit: "red dress",
      affection: 72,
      trust: 100,
    });
  });

  it("accepts newlines, = and synonyms, and skips junk", () => {
    expect(parseState("place = kitchen\nclothes: apron\nmood: happy\naffection: about 40")).toEqual({ location: "kitchen", outfit: "apron", affection: 40 });
  });

  it("splits comma-separated pairs without breaking commas inside values", () => {
    expect(parseState("location: a small, cosy cafe, time: noon")).toEqual({ location: "a small, cosy cafe", time: "noon" });
  });
});

describe("extractStateBlock", () => {
  it("strips the block and returns the state", () => {
    expect(extractStateBlock("Sure, let's go.\n<state>location: park; affection: 55</state>")).toEqual({ text: "Sure, let's go.", state: { location: "park", affection: 55 } });
  });

  it("handles a cut-off block and replies without one", () => {
    expect(extractStateBlock("Okay.\n<state>location: car; time: ni").state).toEqual({ location: "car", time: "ni" });
    expect(extractStateBlock("No state here.")).toEqual({ text: "No state here." });
  });
});

describe("streaming and prompts", () => {
  it("hides the block while it's written", () => {
    expect(stripStreamingState("Hi!\n<state>location: pa")).toBe("Hi!");
    expect(stripStreamingState("Hi!\n<sta")).toBe("Hi!");
  });

  it("feeds the current state back", () => {
    const text = buildStateDirective({ location: "park", affection: 60 }, "Aria");
    expect(text).toContain("The state right now: location: park; affection: 60.");
    expect(text).toContain("<state>location: ...; time: ...; outfit: ...; affection: N; trust: N</state>");
    expect(buildStateDirective(undefined, "Aria")).not.toContain("The state right now");
  });

  it("merges updates and formats them", () => {
    const merged = mergeState({ location: "park", affection: 60 }, { affection: 64, time: "dusk" });
    expect(formatState(merged)).toBe("location: park; time: dusk; affection: 64");
  });
});
