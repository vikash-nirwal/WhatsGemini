import { Character, MapPin, World, WorldEvent } from "../../types";

// Events with consequences (#219, with world events on). An event used to
// be text with an end date: when the storm was over it was simply gone.
// Now one that ends leaves something behind, in one helper call: a place
// that's different for a while ("closed for repairs"), a lasting fact,
// and something in the life of whoever it hit hardest. It's also asked
// whether people would hold it again every year (#222).

const DAY = 24 * 60 * 60 * 1000;
const MAX_STATE_DAYS = 14;

// The first event that has ended in the last two weeks and hasn't had its
// aftermath yet. Older ones are let go.
export const aftermathDue = (world: Pick<World, "events">, now: number): WorldEvent | undefined =>
  (world.events || []).find((e) => e.endsAt <= now && now - e.endsAt < 14 * DAY && !e.aftermathAt);

export const buildAftermathPrompt = (world: Pick<World, "name" | "premise" | "era">, event: WorldEvent, cast: string[], pins: Pick<MapPin, "name">[], context: string[] = []) =>
  [
    `${world.name}: ${world.premise}${world.era ? ` (${world.era})` : ""}`,
    ...context,
    `"${event.title}" is over: ${event.text}`,
    cast.length ? `People here: ${cast.slice(0, 12).join(", ")}.` : "",
    pins.length ? `Places here: ${pins.map((p) => p.name).join(", ")}.` : "",
    "What did it leave behind? Answer with any of these lines that fit, and nothing else; leave out what doesn't:",
    ...(pins.length ? ["PLACE: <one of the places above> | <how it is now, a few words, like \"closed for repairs\"> | <how many days, 1 to 14>"] : []),
    "FACT: <one lasting change everyone here knows, one sentence>",
    "LIFE: <one person's name> | <what it left them with, one sentence in the past tense>",
    "TRADITION: <yes if people here would hold it again every year, otherwise no>",
  ].filter(Boolean).join("\n");

export interface Aftermath {
  place?: { pinId: string; text: string; until: number };
  fact?: string;
  life?: { who: Character; text: string };
  tradition: boolean;
}

const line = (reply: string, name: string) => reply.match(new RegExp(`^[\\s*_-]*${name}\\s*:\\s*(.+)$`, "im"))?.[1].replace(/[*_]/g, "").trim();
const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase() || a.toLowerCase().split(/\s+/)[0] === b.toLowerCase().split(/\s+/)[0];

export const parseAftermath = (reply: string, cast: Character[], pins: MapPin[], now: number): Aftermath => {
  const out: Aftermath = { tradition: /^yes\b/i.test(line(reply, "TRADITION") || "") };
  const place = line(reply, "PLACE")?.split("|").map((p) => p.trim());
  const pin = place && pins.find((p) => p.name.toLowerCase() === place[0].toLowerCase().replace(/^the\s+/, "") || p.name.toLowerCase() === place[0].toLowerCase());
  if (pin && place![1]) {
    const days = Math.min(MAX_STATE_DAYS, Math.max(1, Math.round(Number(place![2]?.match(/\d+/)?.[0]) || 3)));
    out.place = { pinId: pin.id, text: place![1].slice(0, 80), until: now + days * DAY };
  }
  const fact = line(reply, "FACT");
  if (fact && fact.length >= 8) out.fact = fact.slice(0, 200);
  const life = line(reply, "LIFE")?.split("|").map((p) => p.trim());
  const who = life?.[0] ? cast.find((c) => sameName(c.name, life[0])) : undefined;
  if (who && life![1] && life![1].length >= 8) out.life = { who, text: life![1].slice(0, 240) };
  return out;
};

// Places' states while they last, newest per place.
export const addPlaceState = (list: World["placeStates"], state: NonNullable<World["placeStates"]>[number], now: number) =>
  [...(list || []).filter((s) => s.pinId !== state.pinId && s.until > now), state];

export const activePlaceStates = (world: Pick<World, "placeStates" | "map"> | undefined, now: number): { name: string; text: string }[] =>
  (world?.placeStates || [])
    .filter((s) => s.until > now)
    .map((s) => ({ name: world?.map?.pins.find((p) => p.id === s.pinId)?.name || "", text: s.text }))
    .filter((s) => s.name);
