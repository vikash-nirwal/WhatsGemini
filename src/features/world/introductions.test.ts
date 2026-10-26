import { buildIntroductionPrompt, introductionDue, pickIntroduction } from "./introductions";
import { Character, Chat } from "../../types";

const DAY = 24 * 60 * 60 * 1000;
const msgs = (n: number) => Array.from({ length: n }, (_, i) => ({ role: "user", text: `m${i}` }));
const aria = { id: 1, name: "Aria", ties: [{ withId: 2, tie: "your brother" }, { withId: 3, tie: "your friend" }] } as Character;
const bram = { id: 2, name: "Bram", description: "A fisherman.", ties: [{ withId: 1, tie: "your sister" }] } as Character;
const cleo = { id: 3, name: "Cleo" } as Character;

test("someone you talk to introduces a person tied to them you've never chatted with", () => {
  const chats = [{ id: 1, characterIds: [1], content: msgs(8) }, { id: 2, characterIds: [3], content: msgs(1) }] as unknown as Chat[];
  expect(pickIntroduction([aria, bram, cleo], chats, () => 0)).toEqual({ by: aria, to: bram });
  const short = [{ id: 1, characterIds: [1], content: msgs(2) }] as unknown as Chat[];
  expect(pickIntroduction([aria, bram, cleo], short, () => 0)).toBeUndefined();
});

test("introductions wait a few days, and the newcomer's text knows what they heard", () => {
  expect(introductionDue(0, 5 * DAY, 4 * DAY, () => 0)).toBe(true);
  expect(introductionDue(2 * DAY, 5 * DAY, 4 * DAY, () => 0)).toBe(false);
  const prompt = buildIntroductionPrompt(aria, bram, "Sam", ["Sam fixed her boat"], "The outsider who fixes boats.");
  expect(prompt).toContain("Aria (Bram's sister) just introduced Bram to Sam");
  expect(prompt).toContain("What Aria has told Bram about Sam: Sam fixed her boat");
  expect(prompt).toContain("What people around say about Sam: The outsider who fixes boats.");
});
