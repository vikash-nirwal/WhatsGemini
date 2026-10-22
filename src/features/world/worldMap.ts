import { MapPin, World } from "../../types";

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
