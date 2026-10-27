import { Character, World } from "../../types";
import { currentBlock } from "../character/schedule";
import { formatStoryDate } from "./storyTime";
import { whereIs } from "./places";

// One time and place (#205): every talk between characters is told the same
// "now" - the world's date and the time of day, and where each of them is
// and what they're doing by their schedule - so a talk at 2am isn't about
// lunch, and two people at the same café don't text as if apart.

const partOfDay = (now: number) => {
  const h = new Date(now).getHours();
  return h < 5 ? "the middle of the night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "late evening";
};

export const buildSceneNow = (world: Pick<World, "storyTime" | "map"> | undefined, people: Character[], now: number): string => {
  const when = world?.storyTime
    ? `${formatStoryDate(world.storyTime, now)}, ${partOfDay(now)}`
    : `${new Date(now).toLocaleDateString("en-US", { weekday: "long" })} ${partOfDay(now)}`;
  const pins = world?.map?.pins || [];
  const places = people.map((c) => ({ c, pin: pins.length ? whereIs(c, pins, now) : undefined, doing: currentBlock(c.schedule, now)?.activity }));
  const where = places
    .filter((p) => p.pin || p.doing)
    .map((p) => `${p.c.name} is ${[p.pin && `at ${p.pin.name}`, p.doing && `(${p.doing.replace(/\s+/g, " ").trim().slice(0, 60)})`].filter(Boolean).join(" ")}`);
  const together = places.filter((p) => p.pin).length === people.length && people.length > 1 && new Set(places.map((p) => p.pin!.id)).size === 1;
  return [
    `Right now it's ${when}.`,
    ...(where.length ? [`${where.join("; ")}.`] : []),
    together ? "They're in the same place, so this can happen face to face or in texts across the room." : "Keep to the hour and where they are.",
  ].join(" ");
};
