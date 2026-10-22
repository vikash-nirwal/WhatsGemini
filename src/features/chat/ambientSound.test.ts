import { Chat } from "../../types";
import { ambientFor, ambientSceneTexts, soundForScene } from "./ambientSound";

describe("ambient sound", () => {
  it("hears the scene in its words", () => {
    expect(soundForScene("a quiet beach at dusk")).toBe("sea");
    expect(soundForScene("the corner café")).toBe("cafe");
    expect(soundForScene("a log cabin in the snow")).toBe("fireplace");
    expect(soundForScene("a rooftop downtown")).toBe("city");
    expect(soundForScene("the beach, in a storm")).toBe("rain");
    expect(soundForScene("her bedroom")).toBeUndefined();
    expect(soundForScene(undefined, "")).toBeUndefined();
  });

  it("lets the tracked place speak before the opening scenario", () => {
    const chat = { id: 1, content: [], sceneState: { location: "the pier" }, scenario: "They meet in a coffee shop." } as unknown as Chat;
    expect(soundForScene(...ambientSceneTexts(chat))).toBe("sea");
    expect(soundForScene(...ambientSceneTexts({ ...chat, sceneState: undefined }))).toBe("cafe");
  });

  it("plays nothing while off, a pick when chosen, else the scene's", () => {
    expect(ambientFor(undefined, "the beach")).toBeUndefined();
    expect(ambientFor({ on: true }, "the beach")).toBe("sea");
    expect(ambientFor({ on: true, sound: "auto" }, "nowhere")).toBeUndefined();
    expect(ambientFor({ on: true, sound: "rain" }, "the beach")).toBe("rain");
  });
});
