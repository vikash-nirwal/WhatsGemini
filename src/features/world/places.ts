import { Character, MapPin } from "../../types";
import { currentBlock } from "../character/schedule";
import { pinForLocation } from "./worldMap";

// Places with presence (#165): who is where on a world's map right now. A
// character is where their schedule says they are, when it names a place
// on the map; otherwise at their usual spot, if they have one.

export const whereIs = (character: Character, pins: MapPin[], now: number): MapPin | undefined =>
  pinForLocation(currentBlock(character.schedule, now)?.activity, pins) || pins.find((p) => p.id === character.hangout);

export const whoIsWhere = (cast: Character[], pins: MapPin[], now: number): Record<string, Character[]> => {
  const out: Record<string, Character[]> = {};
  for (const c of cast) {
    const pin = whereIs(c, pins, now);
    if (pin) (out[pin.id] = out[pin.id] || []).push(c);
  }
  return out;
};

// A chat that starts at a place, with whoever you meet there.
export const placeScenario = (place: string, present: string[], userName: string) =>
  `${userName} comes by ${place}.${present.length ? ` ${present.join(", ")} ${present.length === 1 ? "is" : "are"} there.` : ""} The scene starts there and then.`;

// For their prompt: where on the map they are now.
export const buildWhereNote = (pin: MapPin | undefined) => (pin ? `Where you are right now: ${pin.name}.` : undefined);

// Places fill up (#177): schedules are written by hand and rarely name the
// map's places, so with the places switch on, everyone without a usual spot
// gets one that fits them, picked once by the helper model.
const DAY = 24 * 60 * 60 * 1000;
export const HANGOUT_GAP_MS = DAY;

export const hangoutsDue = (world: { lastHangoutsAt?: number; map?: { pins: MapPin[] } }, cast: Character[], now: number) =>
  Boolean(world.map?.pins?.length) && cast.some((c) => !c.hangout || !world.map!.pins.some((p) => p.id === c.hangout)) && now - (world.lastHangoutsAt || 0) >= HANGOUT_GAP_MS;

export const buildHangoutsPrompt = (worldName: string, pins: MapPin[], people: Character[]) =>
  [
    `Places in ${worldName}: ${pins.map((p) => p.name).join(", ")}.`,
    "People who need a usual spot, where they spend most of their free time or work:",
    ...people.map((c) => `- ${c.name}: ${[c.description, c.prompt].filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 200)}`),
    "Give each one the place that fits them best, using only the places listed. Answer with one line each, nothing else:",
    "<name> | <place>",
  ].join("\n");

export const parseHangouts = (reply: string, people: Character[], pins: MapPin[]): Record<number, string> => {
  const out: Record<number, string> = {};
  const norm = (s: string) => s.replace(/[*_"]/g, "").trim().toLowerCase();
  for (const line of reply.split("\n")) {
    const [who, where] = line.replace(/^[\s-]+/, "").split("|").map((x) => x && norm(x));
    if (!who || !where) continue;
    const person = people.find((c) => c.name.toLowerCase() === who || c.name.toLowerCase().split(/\s+/)[0] === who.split(/\s+/)[0]);
    const pin = pins.find((p) => p.name.toLowerCase() === where) || pins.find((p) => where.includes(p.name.toLowerCase()));
    if (person && pin) out[person.id] = pin.id;
  }
  return out;
};
