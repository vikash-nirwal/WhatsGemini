import { addAnnouncement, announcementsLine, buildAnnouncementsNote, buildTakesPrompt, MAX_ANNOUNCEMENTS, parseTakes, removeAnnouncement, withTakes } from "./announcements";

const DAY = 24 * 60 * 60 * 1000;
const people = [{ id: 1, name: "Mira Vale" }, { id: 2, name: "Tomas" }, { id: 3, name: "Ines" }];

describe("announcements", () => {
  it("keeps the newest, removes by id and merges takes into the right one", () => {
    let list = Array.from({ length: MAX_ANNOUNCEMENTS + 2 }, (_, i) => ({ id: `a${i}`, text: `n${i}`, at: i })).reduce((l, a) => addAnnouncement(l, a), [] as any[]);
    expect(list).toHaveLength(MAX_ANNOUNCEMENTS);
    expect(list[0].id).toBe("a2");
    list = withTakes(list, "a5", { 1: "You cheer." })!;
    expect(list.find((a) => a.id === "a5")!.takes).toEqual({ 1: "You cheer." });
    expect(list.find((a) => a.id === "a6")!.takes).toBeUndefined();
    expect(removeAnnouncement([{ id: "x", text: "t", at: 0 }], "x")).toBeUndefined();
  });

  it("asks for one line per person", () => {
    const prompt = buildTakesPrompt({ name: "Aster", premise: "A port town." }, "The king is dead.", [{ name: "Mira Vale", description: "A smuggler.", prompt: "" }]);
    expect(prompt).toContain("It has just been announced to everyone in Aster, and it is real: The king is dead.");
    expect(prompt).toContain("- Mira Vale: A smuggler.");
    expect(prompt).toMatch(/^NAME :: how they take it/m);
  });

  it("reads takes and statuses, by full or first name, ignoring junk and repeats", () => {
    const reply = [
      "Here you go:",
      "**Mira Vale** :: You see a chance to sell black-market candles. :: Candles, cheap, ask me 🕯️",
      "- Tomas :: You're scared for your family. :: -",
      "Mira :: You change your mind. :: nope",
      "Nobody :: You exist? :: hi",
    ].join("\n");
    const { takes, statuses } = parseTakes(reply, people);
    expect(takes).toEqual({ 1: "You see a chance to sell black-market candles.", 2: "You're scared for your family." });
    expect(statuses).toEqual({ 1: "Candles, cheap, ask me 🕯️" });
  });

  it("tells a reply the news, how fresh it is and this person's own take", () => {
    const now = 20 * DAY;
    const world = { name: "Aster", announcements: [{ id: "a", text: "The king is dead.", at: now - 2 * DAY, takes: { 1: "You plan to profit." } }, { id: "b", text: "Magic is legal.", at: now - 10 * DAY }] };
    const note = buildAnnouncementsNote(world, 1, now)!;
    expect(note).toContain("Announced to everyone in Aster by the author");
    expect(note).toContain("- The king is dead. (announced 2 days ago, still the news everyone's talking about). How you took it: You plan to profit.");
    expect(note).toContain("- Magic is legal. (announced 10 days ago)");
    expect(buildAnnouncementsNote(world, undefined, now)).not.toContain("How you took it");
    expect(buildAnnouncementsNote({ name: "Aster" }, 1, now)).toBeUndefined();
  });

  it("sums them up in one line, with how the people named took them", () => {
    const world = { announcements: [{ id: "a", text: "The king is dead.", at: 0, takes: { 1: "You plan to profit.", 2: "You mourn." } }] };
    expect(announcementsLine(world)).toBe("Announced to everyone there, and real: The king is dead.");
    expect(announcementsLine(world, [people[0]])).toBe('Announced to everyone there, and real: The king is dead. How they took it: Mira Vale on "The king is dead": they plan to profit.');
    expect(announcementsLine({})).toBe("");
  });
});
