import { isUnlocked, occasionPhotoDirective, photoForOccasion } from "./album";

describe("private albums (#75)", () => {
  it("unlocks a photo once the chat reaches its stage, and keeps it locked with stages off", () => {
    expect(isUnlocked({}, undefined)).toBe(true);
    expect(isUnlocked({ unlockAt: "dating" }, "flirting")).toBe(false);
    expect(isUnlocked({ unlockAt: "dating" }, "intimate")).toBe(true);
    expect(isUnlocked({ unlockAt: "dating" }, undefined)).toBe(false);
  });

  it("brings an unlocked photo not sent yet on a special date", () => {
    const album = [
      { id: "a", image: "x", sentAt: 1 },
      { id: "b", image: "y", unlockAt: "committed" as const },
      { id: "c", image: "z", caption: "At the lake" },
    ];
    expect(photoForOccasion(album, "dating")?.id).toBe("c");
    expect(occasionPhotoDirective(album[2])).toBe("You're also sending them a photo from your private album: At the lake. Mention it naturally, as a little gift for the day.");
  });
});
