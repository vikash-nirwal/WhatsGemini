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
