import { buildToolResultNote, buildToolSection, commandsFor, parseToolCall, stripStreamingToolTag, stripToolTags } from "./toolTag";

describe("buildToolSection", () => {
  it("offers only the tools switched on", () => {
    const section = buildToolSection(commandsFor(["dice", "reminders"]));
    expect(section).toContain("[Use: roll | 2d6+1]");
    expect(section).toContain("[Use: remind |");
    expect(section).not.toContain("[Use: search");
    expect(section).not.toContain("[Use: weather");
  });

  it("is empty with nothing on", () => {
    expect(buildToolSection(commandsFor([]))).toBe("");
  });
});

describe("parseToolCall", () => {
  it("reads the tool and its parts", () => {
    expect(parseToolCall("[Use: roll | 2d6+1]")).toEqual({ name: "roll", raw: "2d6+1", args: ["2d6+1"] });
    expect(parseToolCall("[use: remind | 20m | take the pasta off]")).toEqual({ name: "remind", raw: "20m | take the pasta off", args: ["20m", "take the pasta off"] });
    expect(parseToolCall("Let me check. [Use: coin]")).toEqual({ name: "coin", raw: "", args: [] });
  });

  it("leaves a reply with no tag alone", () => {
    expect(parseToolCall("I used to roll dice [a lot].")).toBeNull();
  });
});

describe("hiding the tag", () => {
  it("strips tags that were never run", () => {
    expect(stripToolTags("Sure!\n[Use: roll | 1d20]")).toBe("Sure!");
    expect(stripToolTags("No tags here.")).toBe("No tags here.");
  });

  it("hides the tag while it's being typed", () => {
    expect(stripStreamingToolTag("Hold on\n[Us")).toBe("Hold on");
    expect(stripStreamingToolTag("[Use: search | who won")).toBe("");
    expect(stripStreamingToolTag("[Use: coin]")).toBe("");
    expect(stripStreamingToolTag("Plain text")).toBe("Plain text");
  });
});

describe("buildToolResultNote", () => {
  it("gives the result and says whether another tool is allowed", () => {
    const call = parseToolCall("[Use: roll | 2d6]")!;
    expect(buildToolResultNote(call, "2d6 rolled [3, 4] = 7", true)).toContain("Tool result for roll (2d6): 2d6 rolled [3, 4] = 7");
    expect(buildToolResultNote(call, "x", true)).not.toContain("Don't use another tool");
    expect(buildToolResultNote(call, "x", false)).toContain("Don't use another tool");
  });
});
