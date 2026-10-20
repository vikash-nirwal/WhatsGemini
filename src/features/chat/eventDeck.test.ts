import { buildEventDirective, DEFAULT_EVENTS, drawEvent, loadEventDeck, pickEvent, saveEventDeck } from "./eventDeck";

beforeEach(() => localStorage.clear());

describe("pickEvent", () => {
  it("skips recently drawn events while others are left", () => {
    expect(pickEvent(["a", "b", "c"], ["a", "b"], () => 0.9)).toBe("c");
  });

  it("falls back to the whole deck when every event was recent", () => {
    expect(pickEvent(["a", "b"], ["a", "b"], () => 0.6)).toBe("b");
  });
});

describe("the deck", () => {
  it("is the built-in one until edited", () => {
    expect(loadEventDeck()).toEqual(DEFAULT_EVENTS);
    expect(saveEventDeck("A dragon lands\n\n  The tavern burns  \n")).toEqual(["A dragon lands", "The tavern burns"]);
    expect(loadEventDeck()).toEqual(["A dragon lands", "The tavern burns"]);
  });

  it("goes back to the built-in one when emptied", () => {
    saveEventDeck("A dragon lands");
    expect(saveEventDeck("  \n")).toEqual(DEFAULT_EVENTS);
    expect(loadEventDeck()).toEqual(DEFAULT_EVENTS);
  });
});

describe("drawEvent", () => {
  it("doesn't repeat until the deck runs out", () => {
    saveEventDeck("one\ntwo\nthree");
    const drawn = [drawEvent(), drawEvent(), drawEvent()];
    expect(new Set(drawn).size).toBe(3);
  });
});

describe("buildEventDirective", () => {
  it("quotes the event as a one-turn direction", () => {
    expect(buildEventDirective("The lights go out")).toContain('"The lights go out"');
  });
});
