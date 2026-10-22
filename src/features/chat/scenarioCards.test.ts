import { BUILT_IN_CARDS, buildOpeningDirective, buildTimeSkipPrompt, loadCustomCards, parseTimeSkip, saveCustomCards } from "./scenarioCards";

afterEach(() => localStorage.clear());

describe("scenario cards (#79)", () => {
  it("opens a new scene from a card", () => {
    const d = buildOpeningDirective(BUILT_IN_CARDS[0]);
    expect(d).toContain("A new scene starts now. A small candlelit restaurant");
    expect(d).toContain("You're wearing your nicest dinner clothes.");
    expect(d).toContain("Open the scene: Arrive at the table");
  });

  it("keeps your own cards, ignoring broken ones", () => {
    saveCustomCards([{ id: "c1", title: "Picnic", setting: "A park.", opening: "Spread the blanket." }]);
    localStorage.setItem("scenario_cards", JSON.stringify([...loadCustomCards(), { id: "bad" }]));
    expect(loadCustomCards().map((c) => c.id)).toEqual(["c1"]);
  });
});

describe("time skips (#80)", () => {
  it("asks for a transition and the new time and place", () => {
    const p = buildTimeSkipPrompt("The next morning", "Vik: goodnight", { location: "the cabin" });
    expect(p).toContain('a time skip: "The next morning"');
    expect(p).toContain("Until now: place: the cabin");
  });

  it("reads the transition back, with a fallback", () => {
    expect(parseTimeSkip("NARRATION: Dawn creeps over the lake.\nTIME: early morning\nPLACE: the cabin porch", "The next morning")).toEqual({ narration: "Dawn creeps over the lake.", time: "early morning", place: "the cabin porch" });
    expect(parseTimeSkip("hmm", "A week later").narration).toBe("A week later...");
  });
});
