import { describeRoll, matchSlashCommands, parseSlashCommand, rollDice } from "./slashCommands";

// A fixed sequence of "random" numbers in [0, 1).
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("rollDice", () => {
  it("rolls NdM+K", () => {
    const roll = rollDice("2d6+1", seq(0, 0.99))!;
    expect(roll.rolls).toEqual([1, 6]);
    expect(roll.total).toBe(8);
    expect(describeRoll(roll)).toBe("2d6+1 rolled [1, 6] + 1 = 8");
  });

  it("defaults to one die and handles minus modifiers", () => {
    const roll = rollDice("d20-2", seq(0.5))!;
    expect(roll.spec).toBe("1d20-2");
    expect(describeRoll(roll)).toBe("1d20-2 rolled 11 - 2 = 9");
  });

  it("rejects nonsense and absurd dice", () => {
    expect(rollDice("abc")).toBeNull();
    expect(rollDice("0d6")).toBeNull();
    expect(rollDice("500d6")).toBeNull();
    expect(rollDice("2d1")).toBeNull();
  });
});

describe("parseSlashCommand", () => {
  it("leaves ordinary messages alone", () => {
    expect(parseSlashCommand("hello /roll")).toBeNull();
  });

  it("rolls with an action and tells the AI to respect it", () => {
    const action = parseSlashCommand("/roll 1d20 I try to pick the lock", seq(0.65));
    expect(action).toEqual({ kind: "send", text: "I try to pick the lock\n\n(OOC: 1d20 rolled 14 = 14. Use this result for how it turns out - don't reroll or change it.)" });
  });

  it("defaults to a d20 when no dice are given", () => {
    const action = parseSlashCommand("/roll I jump the gap", seq(0));
    expect(action).toMatchObject({ kind: "send", text: expect.stringContaining("I jump the gap\n\n(OOC: 1d20 rolled 1 = 1.") });
  });

  it("turns timeskip, scene and ooc into directions", () => {
    expect(parseSlashCommand("/timeskip 3 hours")).toEqual({ kind: "send", text: expect.stringContaining("Time skip - 3 hours pass") });
    expect(parseSlashCommand("/scene the rooftop at night")).toEqual({ kind: "send", text: expect.stringContaining("moves to the rooftop at night") });
    expect(parseSlashCommand("/OOC be playful")).toEqual({ kind: "send", text: "(OOC: be playful)" });
  });

  it("handles narrate, image, summarize and help", () => {
    expect(parseSlashCommand("/narrate The rain stops.")).toEqual({ kind: "narrate", text: "The rain stops." });
    expect(parseSlashCommand("/image us at the beach")).toEqual({ kind: "send", text: "us at the beach", isImageRequest: true });
    expect(parseSlashCommand("/summarize")).toEqual({ kind: "summarize" });
    expect(parseSlashCommand("/help")).toEqual({ kind: "help" });
  });

  it("explains a missing argument or an unknown command", () => {
    expect(parseSlashCommand("/timeskip")).toMatchObject({ kind: "error" });
    expect(parseSlashCommand("/dance")).toEqual({ kind: "error", message: "Unknown command /dance. Type /help for the list." });
  });
});

describe("matchSlashCommands", () => {
  it("lists commands while the first word is typed", () => {
    expect(matchSlashCommands("/").length).toBeGreaterThan(5);
    expect(matchSlashCommands("/ti").map((c) => c.name)).toEqual(["timeskip"]);
    expect(matchSlashCommands("/roll 2d6")).toEqual([]);
    expect(matchSlashCommands("hi")).toEqual([]);
  });
});
