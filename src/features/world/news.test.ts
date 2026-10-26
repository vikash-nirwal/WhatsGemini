import { buildNewsTextPrompt, pickNewsTellers } from "./news";
import { Character, Chat } from "../../types";

const NOON = new Date(2026, 9, 21, 12).getTime();
const HOUR = 3_600_000;
const ch = (id: number, extra: Partial<Character> = {}) => ({ id, name: `C${id}`, textsFirst: true, ...extra }) as Character;
const chats = [1, 2, 3, 4].map((id) => ({ id, characterIds: [id], content: [{ role: "you", txt: "hi", timestamp: NOON - 5 * HOUR }] })) as unknown as Chat[];

test("the people it's about tell you first, then those tied to them; only texters who are free to", () => {
  const cast = [ch(1), ch(2, { ties: [{ withId: 3, tie: "friend" }] }), ch(3), ch(4, { textsFirst: false }), ch(5)];
  expect(pickNewsTellers(cast, chats, [3], NOON).map((c) => c.id)).toEqual([3, 2]);
  expect(pickNewsTellers([ch(1, { firstTexts: [NOON - HOUR] })], chats, [], NOON)).toEqual([]);
  expect(pickNewsTellers([ch(1)], chats, [], new Date(2026, 9, 21, 3).getTime())).toEqual([]);
});

test("their own news is shared as theirs; the world's as news", () => {
  expect(buildNewsTextPrompt(ch(1), "You got the job.", "Sam", [], true)).toContain("Something just happened in your life: You got the job.");
  expect(buildNewsTextPrompt(ch(1), "Fog Week: fog everywhere", "Sam", ["Sam: hey"], false)).toContain("did they hear");
});
