import { linesFor, settingFormat, settingGapFactor, settingLabel, settingOpening, talkByOf, talkSettingFor } from "./talkMedium";
import { buildWorldTalkPrompt } from "./worldTalk";
import { saveWorldPrefs } from "./worldPrefs";
import { Character, World } from "../../types";

afterEach(() => localStorage.clear());

test("a world talks by letters or texts, from its era unless set by hand", () => {
  expect(talkByOf(undefined)).toBe("texts");
  expect(talkByOf({ era: "Medieval: news travels by letter" })).toBe("letters");
  expect(talkByOf({ era: "Victorian London" })).toBe("letters");
  expect(talkByOf({ era: "Fantasy with no phones" })).toBe("letters");
  expect(talkByOf({ era: "Modern day, everyone has a phone" })).toBe("texts");
  expect(talkByOf({ era: "Space opera, 2450" })).toBe("texts");
  expect(talkByOf({ era: "Medieval", talkBy: "texts" })).toBe("texts");
  expect(talkByOf({ era: "" })).toBe("texts");
});

const pins = [{ id: "docks", name: "the Docks", x: 0.1, y: 0.1 }, { id: "inn", name: "the Inn", x: 0.5, y: 0.5 }];
const world = { id: 5, name: "Harbour Town", premise: "A rainy port.", era: "Medieval", map: { image: "x", pins } } as unknown as World;
const aria = { id: 1, name: "Aria", prompt: "x", worldId: 5, hangout: "docks" } as Character;
const kai = { id: 2, name: "Kai", prompt: "x", worldId: 5, hangout: "docks" } as Character;
const mara = { id: 3, name: "Mara", prompt: "x", worldId: 5, hangout: "inn" } as Character;

test("two people in the same place talk there in person, with places on", () => {
  expect(talkSettingFor(aria, kai, world, 0)).toEqual({ kind: "letters" });
  saveWorldPrefs(5, { places: true });
  expect(talkSettingFor(aria, kai, world, 0)).toEqual({ kind: "in person", place: "the Docks" });
  expect(talkSettingFor(aria, mara, world, 0)).toEqual({ kind: "letters" });
});

test("letters are fewer and slower; being together makes talk sooner", () => {
  expect(settingGapFactor({ kind: "letters" })).toBe(2);
  expect(settingGapFactor({ kind: "in person" })).toBe(0.5);
  expect(settingGapFactor({ kind: "texts" })).toBe(1);
  expect(linesFor({ kind: "letters" }, 10)).toBe(4);
  expect(linesFor({ kind: "texts" }, 10)).toBe(10);
});

test("the prompt asks for letters, talk in person, or the texts it always asked for", () => {
  expect(settingOpening({ kind: "texts" }, "Aria", "Kai")).toBe("Write a text conversation between Aria and Kai");
  expect(settingOpening({ kind: "in person", place: "the Docks" }, "Aria", "Kai")).toBe("Write a conversation in person between Aria and Kai at the Docks");
  expect(settingFormat({ kind: "letters" }, "Aria", 10)).toContain("2 to 4 letters");
  const letters = buildWorldTalkPrompt(aria, kai, { userName: "Sam", maxLines: 4, world, setting: { kind: "letters" } });
  expect(letters).toContain("Write an exchange of letters between Aria and Kai, who know each other and live in Harbour Town");
  expect(letters).not.toContain("short texts");
  expect(letters).toContain("decide anything for Sam.");
  const texts = buildWorldTalkPrompt(aria, kai, { userName: "Sam", maxLines: 6 });
  expect(texts).toContain("Write a text conversation between Aria and Kai");
  expect(texts).toContain("2 to 6 short texts");
});

test("Peek says how a talk happened", () => {
  expect(settingLabel({})).toBeUndefined();
  expect(settingLabel({ medium: "letters" })).toBe("Letters");
  expect(settingLabel({ medium: "in person", place: "the Docks" })).toBe("In person at the Docks");
});
