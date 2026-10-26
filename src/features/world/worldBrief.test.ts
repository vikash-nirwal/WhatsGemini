import { buildWorldBrief, withWorldBrief } from "./worldBrief";
import { World } from "../../types";

const DAY = 86_400_000;
const world = {
  id: 1, name: "Harbour Town", premise: "A port.",
  godTruths: ["Aria owns the lighthouse"],
  events: [{ id: "e", title: "Storm", text: "Boats stay in.", at: 0, endsAt: 3 * DAY }],
  arc: { title: "Bell", beats: ["A bell rings.", "A rope is cut."], step: 1, startedAt: 0, stepAt: 0 },
} as World;

test("the brief carries truths, events (when on) and the storyline", () => {
  const brief = buildWorldBrief(world, DAY, { events: true })!;
  expect(brief).toContain("Simply true there (never question it): Aria owns the lighthouse.");
  expect(brief).toContain("Going on: Storm (Boats stay in.).");
  expect(brief).toContain("The story there right now: A rope is cut.");
  expect(buildWorldBrief(world, DAY, { events: false })).not.toContain("Storm");
  expect(buildWorldBrief({ id: 2, name: "X", premise: "y" } as World, 0, { events: true })).toBeUndefined();
});

test("it goes first, and not twice", () => {
  expect(withWorldBrief("Write a status.", "Context: X.")).toBe("Context: X.\n\nWrite a status.");
  expect(withWorldBrief("Simply true in this world: y. Write.", "Context: X.")).toBe("Simply true in this world: y. Write.");
  expect(withWorldBrief("Write.", undefined)).toBe("Write.");
});
