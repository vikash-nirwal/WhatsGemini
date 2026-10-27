import { Character } from "../../types";
import { buildKnowsNote, echoesOwnNotes, knowsNoteEntryIds } from "./knowledge";
import { buildHistoryNote, TimelineEntry } from "./timeline";
import { buildLifeNote, recentLifeEvents } from "./worldLife";
import { buildCanonNote } from "./worldNow";

// One fact, one place (#231): what a reply already says once isn't said again.
const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const aria: Character = { id: 1, name: "Aria", description: "", prompt: "", worldId: 4, lifeEvents: [{ text: "Aria got married to Bram.", at: NOW - 3 * DAY }] };
const kai: Character = { id: 2, name: "Kai", description: "", prompt: "", worldId: 4 };
const world = { id: 4, name: "Harbor", premise: "" };
const entries: TimelineEntry[] = [
  { id: "life", at: NOW - 3 * DAY, kind: "event", text: "Aria got married to Bram.", characterIds: [1], audience: "private" },
  { id: "mine", at: NOW - 2 * DAY, kind: "you", text: "You gave Aria a scarf", characterIds: [1], audience: "private" },
  { id: "heard", at: NOW - 2 * DAY, kind: "you", text: "Kai and you fell out", characterIds: [2], audience: "private", heard: [{ id: 1, from: 2, at: NOW - DAY }] },
  { id: "storm", at: NOW - 5 * DAY, kind: "event", text: "A storm hit the harbor", audience: "public" },
];

it("says each fact once across the life, knows, history and canon notes", () => {
  const lifeShown = recentLifeEvents(aria, NOW);
  const own = entries.filter((e) => !echoesOwnNotes(e, aria, lifeShown));
  const heard = buildKnowsNote(aria, own, [aria, kai], NOW)!;
  const inHeard = knowsNoteEntryIds(aria, own, NOW);
  const history = buildHistoryNote(own.filter((e) => !inHeard.has(e.id)), NOW, 8, aria.id)!;
  const canon = buildCanonNote(world, [aria, kai], entries, lifeShown.map((e) => e.text));
  const all = [buildLifeNote(aria, NOW), heard, history, canon].filter(Boolean).join("\n");
  expect(all.match(/married to Bram/g)).toHaveLength(1);
  expect(all).not.toContain("gave Aria a scarf");
  expect(all.match(/Kai and you fell out/g)).toHaveLength(1);
  expect(history).toContain("A storm hit the harbor");
  expect(canon).toBeUndefined();
});

it("still gives canon to someone whose life note doesn't carry it", () => {
  expect(buildCanonNote(world, [aria, kai], entries)).toContain("Aria got married to Bram");
});
