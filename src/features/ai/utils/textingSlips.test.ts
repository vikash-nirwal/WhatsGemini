import { buildSlipsDirective, bubbleDelayMs, DELETED_TEXT, planSlips, SlipPlan } from "./textingSlips";

const PARTS = ["hey, just got back from the station", "the train was packed again", "anyway how was your morning?"];
const plans = (level: 1 | 2, n = 400, burst?: string[]): SlipPlan[] => Array.from({ length: n }, (_, i) => planSlips(PARTS, `msg-${i}`, level, burst));
const kinds = (plan: SlipPlan) => plan.bubbles.map((b) => b.kind).join(",");

describe("texting imperfections (#108)", () => {
  it("leaves a clean texter alone", () => {
    expect(planSlips(PARTS, "a", undefined)).toEqual({ bubbles: PARTS.map((text) => ({ text, kind: "text" })), falseStart: false });
    expect(planSlips(PARTS, "a", 0).bubbles).toHaveLength(3);
    expect(planSlips([], "a", 2)).toEqual({ bubbles: [], falseStart: false });
  });

  it("is the same plan for the same message every time, and differs between messages", () => {
    expect(planSlips(PARTS, "msg-1", 2)).toEqual(planSlips(PARTS, "msg-1", 2));
    const all = plans(2).map(kinds);
    expect(new Set(all).size).toBeGreaterThan(2);
  });

  it("slips about as often as the level says", () => {
    const few = plans(1);
    const many = plans(2);
    const count = (list: SlipPlan[], kind: string) => list.filter((p) => p.bubbles.some((b) => b.kind === kind)).length;
    expect(count(few, "correction")).toBeGreaterThan(30);
    expect(count(few, "correction")).toBeLessThan(count(many, "correction"));
    expect(count(few, "deleted")).toBeGreaterThan(10);
    expect(count(few, "deleted")).toBeLessThan(count(many, "deleted"));
    expect(few.filter((p) => p.falseStart).length).toBeLessThan(many.filter((p) => p.falseStart).length);
    expect(many.filter((p) => p.falseStart).length).toBeGreaterThan(100);
  });

  it("a typo swaps two inner letters of one word and is corrected in the next bubble", () => {
    const plan = plans(2).find((p) => p.bubbles.some((b) => b.kind === "correction"))!;
    const at = plan.bubbles.findIndex((b) => b.kind === "correction");
    const word = plan.bubbles[at].text.slice(1);
    const typed = plan.bubbles[at - 1].text;
    expect(PARTS.some((part) => part.includes(word))).toBe(true);
    expect(typed).not.toContain(word);
    expect(typed.length).toBe(PARTS.find((part) => part.includes(word))!.length);
    expect([...typed].sort().join("")).toBe([...PARTS.find((part) => part.includes(word))!].sort().join(""));
  });

  it("a deleted message sits before the text sent again", () => {
    const plan = plans(2).find((p) => p.bubbles.some((b) => b.kind === "deleted"))!;
    const at = plan.bubbles.findIndex((b) => b.kind === "deleted");
    expect(plan.bubbles[at].text).toBe(DELETED_TEXT);
    expect(plan.bubbles[at + 1]).toBeDefined();
    expect(plan.bubbles.filter((b) => b.kind === "text").map((b) => b.text.length)).toEqual(PARTS.map((p) => p.length));
  });

  it("quotes the message of a burst the reply answers, never the last one", () => {
    const burst = ["did you get the train ok?", "also my morning was chaos", "are you home yet"];
    const quoted = plans(2, 400, burst).filter((p) => p.bubbles[0].quote || p.bubbles[1]?.quote);
    expect(quoted.length).toBeGreaterThan(100);
    // The first bubble talks about the train, so that's the one quoted.
    expect(quoted.every((p) => p.bubbles.find((b) => b.kind === "text")!.quote === "did you get the train ok?")).toBe(true);
    // Nothing in common: the first of the burst.
    const none = plans(2, 400, ["x", "y", "z"]).find((p) => p.bubbles.some((b) => b.quote))!;
    expect(none.bubbles.find((b) => b.quote)!.quote).toBe("x");
    // The reply answers the last one: no quote.
    expect(plans(2, 400, ["did you get the train ok?", "anyway are you back from the station?"]).some((p) => p.bubbles.some((b) => b.quote))).toBe(false);
    // One message isn't a burst.
    expect(plans(2, 100, ["did you get the train ok?"]).some((p) => p.bubbles.some((b) => b.quote))).toBe(false);
  });

  it("times deleted messages and corrections quickly", () => {
    const slow = () => 2500;
    expect(bubbleDelayMs({ text: "x", kind: "text" }, slow)).toBe(2500);
    expect(bubbleDelayMs({ text: DELETED_TEXT, kind: "deleted" }, slow)).toBe(900);
    expect(bubbleDelayMs({ text: "*word", kind: "correction" }, slow)).toBe(600);
  });

  it("tells the model when a word or two will do", () => {
    expect(buildSlipsDirective("Aria", undefined, true)).toBeUndefined();
    expect(buildSlipsDirective("Aria", 1, false)).toBeUndefined();
    expect(buildSlipsDirective("Aria", 1, true)).toContain('a bare "?" or "lol"');
    const loose = buildSlipsDirective("Aria", 2, true)!;
    expect(loose).toContain("fast and loose");
    expect(loose).toContain("middle of something");
    expect(buildSlipsDirective("Aria", 2, false)).not.toContain("middle of something");
  });
});
