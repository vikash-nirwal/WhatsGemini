import { buildStickerDirective, extractSticker, missingMoods, stickerFor, stripStreamingSticker } from "./stickers";

describe("character stickers (#137)", () => {
  it("reads a sticker tag at the end of a reply", () => {
    expect(extractSticker("Haha stop\n[Sticker: Laughing]")).toEqual({ text: "Haha stop", sticker: "laughing" });
    expect(extractSticker("No sticker")).toEqual({ text: "No sticker" });
    expect(stripStreamingSticker("Ha\n[Sticker: lau")).toBe("Ha");
  });

  it("knows which moods are still to draw, and finds a drawn one", () => {
    const stickers = [{ id: "1", mood: "happy", image: "x" }];
    expect(missingMoods(stickers)).toEqual(["laughing", "love", "sad", "annoyed", "eye roll"]);
    expect(stickerFor({ stickers }, "happy")?.image).toBe("x");
    expect(stickerFor({ stickers }, "sad")).toBeUndefined();
    expect(buildStickerDirective("Aria", ["happy", "sad"])).toContain("[Sticker: mood]");
  });
});
