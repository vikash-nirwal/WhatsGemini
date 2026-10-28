import { Character, World } from "../../types";
import { buildWorldTalkPrompt } from "./worldTalk";
import { dueMeeting, meetingLine, metWith, pickMeeting } from "./meetings";
import { saveWorldPrefs } from "./worldPrefs";

// Meeting first (#236).
const NOW = new Date(2026, 9, 28, 12).getTime();
const DAY = 86_400_000;
const char = (id: number, name: string, extra: Partial<Character> = {}): Character => ({ id, name, description: "", prompt: "", worldId: 3, ...extra });
const world: World = { id: 3, name: "Harbour", premise: "A port.", map: { image: "", pins: [{ id: "cafe", name: "the café", x: 0, y: 0 }] } };

beforeEach(() => localStorage.clear());

it("introduces strangers through someone who knows them both first", () => {
  const lena = char(1, "Lena", { ties: [{ withId: 2, tie: "your sister" }, { withId: 3, tie: "your friend" }] });
  const m = pickMeeting([lena, char(2, "Kai"), char(3, "Mara")], world, {}, NOW, { rand: () => 0 })!;
  expect([m.a.name, m.b.name, m.via?.name]).toEqual(["Kai", "Mara", "Lena"]);
  expect(meetingLine(m, "Sam")).toContain("Lena, who knows them both, introduces them");
});

it("otherwise at the same place on the map, or by chance", () => {
  saveWorldPrefs(3, { places: true });
  const cast = [char(1, "Kai", { hangout: "cafe" }), char(2, "Mara", { hangout: "cafe" })];
  expect(pickMeeting(cast, world, {}, NOW, { rand: () => 0 })).toMatchObject({ place: "the café" });
  saveWorldPrefs(3, { places: false });
  const chance = pickMeeting(cast, world, {}, NOW, { rand: () => 0 })!;
  expect(chance.place).toBeUndefined();
  expect(meetingLine(chance, "Sam")).toContain("run into each other around town");
});

it("only between strangers, only in a made world, once a day", () => {
  const met = [char(1, "Kai", { met: [2] }), char(2, "Mara")];
  expect(pickMeeting(met, world, {}, NOW)).toBeUndefined();
  expect(pickMeeting([char(1, "Kai", { worldId: undefined }), char(2, "Mara", { worldId: undefined })], undefined, {}, NOW)).toBeUndefined();
  const cast = [char(1, "Kai"), char(2, "Mara")];
  expect(dueMeeting(cast, [{ ...world, lastMeetingAt: NOW - DAY / 2 }], [], NOW)).toBeUndefined();
  expect(dueMeeting(cast, [{ ...world, lastMeetingAt: NOW - 2 * DAY }], [], NOW)).toBeDefined();
  expect(metWith({ met: [5] }, 2)).toEqual({ met: [5, 2] });
});

it("tells the talk they're meeting for the first time", () => {
  const kai = char(1, "Kai"), mara = char(2, "Mara");
  const prompt = buildWorldTalkPrompt(kai, mara, { world, userName: "Sam", maxLines: 6, setting: { kind: "in person", place: "the café" }, meeting: { a: kai, b: mara, place: "the café" } });
  expect(prompt).toContain("Write a conversation in person between Kai and Mara at the café");
  expect(prompt).toContain("have never met");
  expect(prompt).toContain("Strangers meeting: no shared history");
  expect(prompt).not.toContain("who know each other");
});
