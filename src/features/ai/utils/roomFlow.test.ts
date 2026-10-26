import { addressedIn, buildReactDirective, pickLively } from "./roomFlow";
import { Character, Message } from "../../../types";

const aria = { id: 1, name: "Aria Vale" } as Character;
const kai = { id: 2, name: "Kai", ties: [{ withId: 1, tie: "your sister" }] } as Character;
const mo = { id: 3, name: "Mo", personalityTraits: ["shy"] } as Character;
const said = (speakerId: number) => ({ role: "ai", txt: "x", speakerId }) as Message;

test("someone named in the message answers, in the order named", () => {
  expect(addressedIn("Kai, and you aria?", [aria, kai, mo]).map((c) => c.id)).toEqual([2, 1]);
  expect(addressedIn("what do you think, Mo?", [aria, kai, mo]).map((c) => c.id)).toEqual([3]);
  expect(addressedIn("where's Kai?", [aria, kai, mo])).toEqual([]);
  expect(addressedIn("mocha anyone?", [aria, kai, mo])).toEqual([]);
  const { speaker, followers } = pickLively([aria, kai, mo], [], "kai, what about you aria", () => 0.99);
  expect(speaker?.id).toBe(2);
  expect(followers.map((c) => c.id)).toEqual([1]);
});

test("otherwise not the one who just spoke, and now and then someone reacts", () => {
  const { speaker } = pickLively([aria, kai, mo], [said(1)], "hello", () => 0);
  expect(speaker?.id).not.toBe(1);
  expect(pickLively([aria, kai, mo], [said(1)], "hello", () => 0.99).followers).toEqual([]);
  const lively = pickLively([aria, kai], [said(2)], "hello", () => 0.1);
  expect(lively.speaker?.id).toBe(1);
  expect(lively.followers.map((c) => c.id)).toEqual([2]);
});

test("a follower reacts to the one before them", () => {
  expect(buildReactDirective("Aria")).toContain("react to what Aria just said as well as to the user");
});
