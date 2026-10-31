import { buildLookPrompt, LookReadError, parseLookReply } from "./lookReader";

// Reading the look from a picture and steering it (the user's request,
// 2026-10-31).

describe("buildLookPrompt", () => {
  it("reads from the picture without naming anyone, keeping the user's notes", () => {
    const prompt = buildLookPrompt({ fromPicture: true, appearance: "Always wears a red scarf.", adult: false });
    expect(prompt).toContain("attached picture");
    expect(prompt).toContain("Never identify or name a real person");
    expect(prompt).toContain("if they could be under 18, say so plainly");
    expect(prompt).toContain("Always wears a red scarf.");
    expect(prompt).toContain('"visualTags"');
    expect(prompt).toContain("Keep the descriptions non-sexual.");
    expect(prompt).not.toContain("Steer the look");
  });

  it("steers towards what's asked and never below 18", () => {
    const prompt = buildLookPrompt({ fromPicture: false, appearance: "Slim, short brown hair.", steer: "more athletic, longer hair", adult: true });
    expect(prompt).toContain("Rewrite this character's look:\nSlim, short brown hair.");
    expect(prompt).toContain("Steer the look towards this, changing what it asks for and keeping everything else: more athletic, longer hair");
    expect(prompt).toContain("under 18 or childlike, ignore that part");
    expect(prompt).toContain("adults-only character");
    expect(prompt).not.toContain("attached picture");
  });
});

describe("parseLookReply", () => {
  it("reads both fields, through fences and chatter", () => {
    const reply = 'Here:\n```json\n{"appearance": "A tall woman in her thirties.", "visualTags": "Visual traits: thirties, tall, athletic build, auburn hair"}\n```';
    expect(parseLookReply(reply)).toEqual({ appearance: "A tall woman in her thirties.", visualTags: "thirties, tall, athletic build, auburn hair" });
  });

  it("accepts tags given as a list", () => {
    expect(parseLookReply('{"appearance": "", "visualTags": ["thirties", "tall"]}').visualTags).toBe("thirties, tall");
  });

  it("throws on a reply with no look in it", () => {
    expect(() => parseLookReply("I can't see the picture.")).toThrow(LookReadError);
    expect(() => parseLookReply('{"mood": "happy"}')).toThrow(LookReadError);
  });
});
