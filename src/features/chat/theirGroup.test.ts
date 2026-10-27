import { buildTheirGroupPrompt, parseTheirLines, theirTalkDue } from "./theirGroup";
import { Character, Message } from "../../types";

const aria = { id: 1, name: "Aria Vale", ties: [{ withId: 2, tie: "your brother" }] } as Character;
const kai = { id: 2, name: "Kai" } as Character;
const HOUR = 3_600_000;

test("their group talks every couple of hours (#202)", () => {
  expect(theirTalkDue({ theirs: { limit: 8 }, characterIds: [1, 2] }, 3 * HOUR)).toBe(true);
  expect(theirTalkDue({ theirs: { limit: 8, lastAt: 2 * HOUR }, characterIds: [1, 2] }, 3 * HOUR)).toBe(false);
  expect(theirTalkDue({ characterIds: [1, 2] }, 3 * HOUR)).toBe(false);
});

test("the prompt knows who's in it, their ties, the chat so far and the limit", () => {
  const prompt = buildTheirGroupPrompt([aria, kai], "Vale family", [{ role: "ai", txt: "dinner sunday?", speakerId: 2 } as Message], { limit: 6, userName: "Sam" });
  expect(prompt).toContain('"Vale family", a group chat between Aria Vale, Kai. Sam isn\'t in it.');
  expect(prompt).toContain("(Kai is their brother)");
  expect(prompt).toContain("Kai: dinner sunday?");
  expect(prompt).toContain("2 to 6 messages");
});

test("lines from any member, up to the limit", () => {
  const lines = parseTheirLines("Aria: yes!\n**Kai:** cool\nSam: hi\nAria: also bring wine\nKai: ok", [aria, kai], 3);
  expect(lines).toEqual([{ speakerId: 1, text: "yes!" }, { speakerId: 2, text: "cool" }, { speakerId: 1, text: "also bring wine" }]);
});
