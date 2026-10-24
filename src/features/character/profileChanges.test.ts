import { avatarOf, buildAboutPrompt, buildProfileNote, cleanAbout, photoChangeDue, profileChangeDue, PROFILE_GAP_MS } from "./profileChanges";

describe("profile changes (#125)", () => {
  it("shows a changed photo as the avatar", () => {
    expect(avatarOf({ appearanceImages: ["a", "b"] })).toBe("a");
    expect(avatarOf({ appearanceImages: ["a"], profilePhoto: "p" })).toBe("p");
    expect(avatarOf(undefined)).toBeUndefined();
  });

  it("comes every three days, with a photo every other time", () => {
    expect(profileChangeDue({ profileChanges: true }, 1000)).toBe(true);
    expect(profileChangeDue({ profileChanges: true, profileChangedAt: 1000 }, 1000 + PROFILE_GAP_MS - 1)).toBe(false);
    expect(profileChangeDue({}, 1000)).toBe(false);
    expect(photoChangeDue({ profileChangeCount: 1, appearanceImages: ["a"] })).toBe(true);
    expect(photoChangeDue({ profileChangeCount: 2, appearanceImages: ["a"] })).toBe(false);
    expect(photoChangeDue({ profileChangeCount: 1 })).toBe(false);
  });

  it("asks for a new About line and keeps it short", () => {
    const prompt = buildAboutPrompt({ name: "Aria", description: "Mechanic.", prompt: "", about: "Grease and coffee" }, { dayMood: "tired" });
    expect(prompt).toContain('Their current About: "Grease and coffee" (write a different one).');
    expect(prompt).toContain("Lately they're tired.");
    expect(cleanAbout('"About: Fixing things, mostly myself 🔧"')).toBe("Fixing things, mostly myself 🔧");
    expect(cleanAbout(" ")).toBeUndefined();
    expect(buildProfileNote("Aria", "Busy")).toBe('Aria\'s About line on their messaging profile right now: "Busy".');
  });
});
