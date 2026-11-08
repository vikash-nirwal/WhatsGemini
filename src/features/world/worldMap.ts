import { Faction, MapPin, World } from "../../types";

// World map (#66): a picture of a World with its places pinned on it. The
// scene tracker's location (#9), or the place an adventure's narrator last
// named, shows as "you are here".

export const makePinId = (): string => `pin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

// Pins are stored in percent of the picture, so they stay put at any size.
export const clampPercent = (n: number): number => Math.max(0, Math.min(100, Math.round(n * 10) / 10));

export const buildMapPrompt = (world: Pick<World, "name" | "premise" | "tone">, places: string[], styleClause: string): string =>
  [
    `An illustrated top-down map of ${world.name}, the setting of a story: ${world.premise}`,
    world.tone ? `Mood: ${world.tone}.` : "",
    places.length > 0 ? `Show these places as distinct landmarks spread across the map: ${places.slice(0, 12).join(", ")}.` : "",
    `Hand-drawn cartography in ${styleClause}: terrain, coastlines, roads and rivers, a compass rose. No text labels, no legend, no people.`,
  ]
    .filter(Boolean)
    .join(" ");

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();

// The pin a free-text location means: an exact name, or a name contained in
// it ("the docks at Saltmere" -> Saltmere). The longest match wins, so "Old
// Saltmere" beats "Saltmere".
export const pinForLocation = (location: string | undefined, pins: MapPin[]): MapPin | undefined => {
  if (!location?.trim()) return undefined;
  const where = ` ${norm(location)} `;
  return pins
    .filter((p) => p.name.trim() && where.includes(` ${norm(p.name)} `))
    .sort((a, b) => b.name.length - a.name.length)[0];
};

// For an adventure: the place the newest text names, searching back.
export const latestPinIn = (texts: string[], pins: MapPin[]): MapPin | undefined => {
  for (let i = texts.length - 1; i >= 0; i--) {
    const pin = pinForLocation(texts[i], pins);
    if (pin) return pin;
  }
  return undefined;
};

// Factions on the map (#246): a pin can belong to a family or faction
// (#171), shown in that faction's colour with a small legend, and the map
// can show one faction's places alone. Colours go by the faction's place in
// the world's list, so they stay the same between visits; rose (no faction),
// amber (selected) and the theme's own colour (you are here) are left out.
export const FACTION_COLORS = ["#2563eb", "#16a34a", "#9333ea", "#0891b2", "#ea580c", "#4f46e5", "#0d9488", "#a16207"];

export const factionOfPin = (pin: Pick<MapPin, "factionId">, factions: Faction[] = []): Faction | undefined =>
  pin.factionId ? factions.find((f) => f.id === pin.factionId) : undefined;

export const factionColor = (factionId: string | undefined, factions: Faction[] = []): string | undefined => {
  const i = factionId ? factions.findIndex((f) => f.id === factionId) : -1;
  return i < 0 ? undefined : FACTION_COLORS[i % FACTION_COLORS.length];
};

// The factions that hold a place on the map, in the world's order, for the legend.
export const factionsOnMap = (pins: MapPin[], factions: Faction[] = []): Faction[] =>
  factions.filter((f) => pins.some((p) => p.factionId === f.id));

// The pins the filter shows: all, or one faction's ("none" = places no
// faction holds, a faction since deleted included).
export const pinsShown = (pins: MapPin[], filter: string | undefined, factions: Faction[] = []): MapPin[] =>
  !filter ? pins : filter === "none" ? pins.filter((p) => !factionOfPin(p, factions)) : pins.filter((p) => p.factionId === filter);
