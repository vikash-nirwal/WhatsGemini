import { buildWorldTurnPrompt, dueTalkPairs, eventFromTurn, parseWorldTurn, worldTurnDue, WorldTurnAsk } from "./worldTurn";
import { addWorldTalk } from "./worldTalk";
import { Character, World } from "../../types";

const HOUR = 3_600_000;
// Noon, when everyone without a schedule is awake.
const NOW = new Date(2026, 9, 27, 12).getTime();
const world = { id: 5, name: "Harbour Town", premise: "A rainy port." } as World;
const aria = { id: 1, name: "Aria Vale", prompt: "A sailor.", worldId: 5, ties: [{ withId: 2, tie: "your sister" }] } as Character;
const kai = { id: 2, name: "Kai", prompt: "A baker.", worldId: 5, ties: [{ withId: 1, tie: "your sister" }] } as Character;
const mara = { id: 3, name: "Mara", prompt: "A clerk.", worldId: 5 } as Character;
const cast = [aria, kai, mara];
const ask: WorldTurnAsk = { pairs: [[aria, kai]], maxLines: 6, event: true, life: true, tie: true };

test("a turn is due every few hours", () => {
  expect(worldTurnDue({}, NOW)).toBe(true);
  expect(worldTurnDue({ lastTurnAt: NOW - HOUR }, NOW)).toBe(false);
  expect(worldTurnDue({ lastTurnAt: NOW - 5 * HOUR }, NOW)).toBe(true);
});

test("pairs due to talk: they know each other, longest quiet first", () => {
  const talked = addWorldTalk(aria, { id: "t", withId: 2, at: NOW - HOUR, lines: [] });
  // Everyone in one world knows each other (#181), so all three pairs.
  expect(dueTalkPairs(cast, NOW, 6 * HOUR).map(([a, b]) => [a.id, b.id])).toEqual([[1, 2], [1, 3], [2, 3]]);
  expect(dueTalkPairs([talked, kai, mara], NOW, 6 * HOUR).map(([a, b]) => [a.id, b.id])).toEqual([[1, 3], [2, 3]]);
});

test("the prompt names the pairs and asks only for what's allowed", () => {
  const prompt = buildWorldTurnPrompt(world, cast, ask, { userName: "Sam", recent: ["The ferry broke down"], now: NOW });
  expect(prompt).toContain("only between these pairs: Aria Vale & Kai (sister)");
  expect(prompt).toContain("- The ferry broke down");
  expect(prompt).toContain('"tie"');
  const quiet = buildWorldTurnPrompt(world, cast, { ...ask, event: false, life: false, tie: false }, { userName: "Sam", recent: [], now: NOW });
  expect(quiet).toContain('- "event": null.');
  expect(quiet).not.toContain('"tie"');
});

test("what comes back is held to what was asked", () => {
  const reply = "Sure!\n```json\n" + JSON.stringify({
    talks: [
      { between: ["Kai", "Aria"], texts: [{ from: "Kai", text: "You coming by the bakery?" }, { from: "aria", text: "After my shift." }, { from: "Mara", text: "(not in this talk)" }], tie: "closer sister | closer sister" },
      { between: ["Mara", "Kai"], texts: [{ from: "Mara", text: "hi" }, { from: "Kai", text: "hey" }] },
    ],
    event: { title: "Storm warning", what: "A big storm is coming in.", days: 40 },
    life: { name: "Mara", what: "Mara got a promotion." },
  }, null, 1).replace(/}\s*]/, "},]") + "\n```";
  const turn = parseWorldTurn(reply, cast, ask)!;
  expect(turn.talks).toHaveLength(1);
  expect(turn.talks[0].a.id).toBe(1);
  expect(turn.talks[0].lines).toEqual([{ speakerId: 2, text: "You coming by the bakery?" }, { speakerId: 1, text: "After my shift." }]);
  expect(turn.talks[0].tie).toBe("closer sister | closer sister");
  expect(turn.event).toEqual({ title: "Storm warning", text: "A big storm is coming in.", days: 14 });
  expect(turn.life?.who.id).toBe(3);
  expect(eventFromTurn(turn.event!, "ev-1", NOW)).toMatchObject({ id: "ev-1", at: NOW, endsAt: NOW + 14 * 24 * HOUR });
});

test("an event or life that wasn't allowed is dropped; non-JSON is nothing", () => {
  const reply = JSON.stringify({ talks: [], event: { title: "X", what: "Y", days: 2 }, life: { name: "Kai", what: "Kai moved." } });
  expect(parseWorldTurn(reply, cast, { ...ask, event: false, life: false })).toEqual({ talks: [] });
  expect(parseWorldTurn("Nothing much happened.", cast, ask)).toBeUndefined();
});
