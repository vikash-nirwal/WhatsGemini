import { applyStatChanges, buildGameStateDirective, currentGameState, extractStatsBlock, STARTING_GAME_STATE } from "./gameState";
import { Message } from "../../types";

describe("extractStatsBlock", () => {
  it("takes the block out of the narration", () => {
    const { text, lines } = extractStatsBlock("You find a key.\n<<<STATS\n- gain: rusty key\ngold: +5\nSTATS>>>\n<<<CHOICES\n1. Go\nCHOICES>>>");
    expect(text).toBe("You find a key.\n\n<<<CHOICES\n1. Go\nCHOICES>>>");
    expect(lines).toEqual(["gain: rusty key", "gold: +5"]);
    expect(extractStatsBlock("Nothing happens.")).toEqual({ text: "Nothing happens." });
  });
});

describe("applyStatChanges", () => {
  const start = { ...STARTING_GAME_STATE, hp: 8, gold: 3, items: ["Torch"], quests: [{ title: "Find the map" }] };

  it("applies changes within limits and labels them", () => {
    const { state, changes } = applyStatChanges(start, ["hp: +5", "gold: -10", "gain: rusty key", "lose: torch", "quest: Escape the archive", "quest done: find the map"]);
    expect(state).toEqual({ hp: 10, maxHp: 10, gold: 0, items: ["rusty key"], quests: [{ title: "Find the map", done: true }, { title: "Escape the archive" }] });
    expect(changes).toEqual(["+2 HP", "−3 gold", "+ rusty key", "− torch", "New quest: Escape the archive", "Quest done: find the map"]);
  });

  it("can't lose what you don't have, and ignores junk", () => {
    const { state, changes } = applyStatChanges(start, ["lose: laser sword", "mood: happy", "hp: lots"]);
    expect(state).toEqual(start);
    expect(changes).toEqual([]);
  });
});

describe("state over the story", () => {
  it("is the latest narrator turn's, or the starting state", () => {
    const later = { ...STARTING_GAME_STATE, gold: 7 };
    const content: Message[] = [
      { role: "ai", txt: "a", gameState: { ...STARTING_GAME_STATE, gold: 2 } },
      { role: "ai", txt: "b", gameState: later },
      { role: "you", txt: "c" },
    ];
    expect(currentGameState(content)).toBe(later);
    expect(currentGameState([])).toBe(STARTING_GAME_STATE);
  });

  it("tells the narrator the state and the 0 HP rule", () => {
    expect(buildGameStateDirective({ ...STARTING_GAME_STATE, items: ["rope"] })).toContain("HP 10/10\ngold 0\nitems: rope\nactive quests: none");
    expect(buildGameStateDirective({ ...STARTING_GAME_STATE, hp: 0 })).toContain("The player is at 0 HP");
  });
});
