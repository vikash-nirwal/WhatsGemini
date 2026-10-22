import { absentMemberIds, buildStateDirective, extractStateBlock, formatState, mergeState, parseState, stripStreamingState } from "./sceneState";

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

describe("who's present in a group chat (#69)", () => {
  it("reads the present list, nobody included", () => {
    expect(parseState("location: the garage; present: Aria, Kai and Lin").present).toEqual(["Aria", "Kai", "Lin"]);
    expect(parseState("present: nobody").present).toEqual([]);
  });

  it("asks for it only in a group chat", () => {
    expect(buildStateDirective(undefined, "Aria", ["Aria", "Kai"])).toContain('"present" lists which of Aria, Kai are in the scene');
    expect(buildStateDirective(undefined, "Aria")).not.toContain("present");
  });

  it("finds who's away, by full or first name", () => {
    const members = [{ id: 1, name: "Aria" }, { id: 2, name: "Kai Moreno" }, { id: 3, name: "Lin" }];
    expect(absentMemberIds({ present: ["aria", "Kai"] }, members)).toEqual([3]);
    expect(absentMemberIds({}, members)).toEqual([]);
  });
});

describe("custom meters (#71)", () => {
  it("asks for the chat's own meters and reads them back", () => {
    const d = buildStateDirective(undefined, "Aria", undefined, ["tension", "desire"]);
    expect(d).toContain("affection: N".replace("affection", "tension"));
    expect(d).toContain('"tension", "desire" are measures of the scene from Aria\'s side');
    expect(parseState("location: the bar; tension: 72; desire: 40/100").meters).toEqual({ tension: 72, desire: 40 });
  });

  it("merges meters and formats them for the next turn", () => {
    const merged = mergeState({ meters: { tension: 70, desire: 30 } }, { meters: { desire: 45 } });
    expect(merged.meters).toEqual({ tension: 70, desire: 45 });
    expect(formatState(merged, ["tension", "desire"])).toBe("tension: 70; desire: 45");
  });
});
