import { buildBackdropPrompt, describeSetting } from "./backdrop";

describe("describeSetting", () => {
  it("prefers the tracked location, then the world, scenario and tags", () => {
    expect(describeSetting({ location: "a rooftop bar", worldName: "Eldoria", worldPremise: "Floating islands.", scenario: "They meet at work.", tags: ["noir"] })).toBe(
      "a rooftop bar; in the world of Eldoria (Floating islands.); mood: noir"
    );
    expect(describeSetting({ scenario: "A rainy night in a small seaside town." })).toBe("A rainy night in a small seaside town.");
    expect(describeSetting({})).toBeUndefined();
  });
});

describe("buildBackdropPrompt", () => {
  it("asks for an empty, calm scene in the art style", () => {
    const prompt = buildBackdropPrompt("a rooftop bar", "anime style");
    expect(prompt).toContain("Wide atmospheric background scene: a rooftop bar.");
    expect(prompt).toContain("No people");
    expect(prompt).toContain("anime style, high quality.");
  });
});
