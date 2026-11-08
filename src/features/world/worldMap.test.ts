import { buildMapPrompt, clampPercent, FACTION_COLORS, factionColor, factionOfPin, factionsOnMap, latestPinIn, pinForLocation, pinsShown } from "./worldMap";

const pins = [
  { id: "a", name: "Saltmere", x: 10, y: 20 },
  { id: "b", name: "Old Saltmere", x: 30, y: 40 },
  { id: "c", name: "The Spire", x: 50, y: 50 },
];

describe("world map", () => {
  it("finds the pin a location means, longest name first", () => {
    expect(pinForLocation("the docks at Saltmere", pins)?.id).toBe("a");
    expect(pinForLocation("ruins of old Saltmere, at dusk", pins)?.id).toBe("b");
    expect(pinForLocation("somewhere else", pins)).toBeUndefined();
    expect(pinForLocation(undefined, pins)).toBeUndefined();
  });

  it("for an adventure, uses the newest text that names a place", () => {
    expect(latestPinIn(["You reach Saltmere.", "You climb toward the Spire.", "Wind howls."], pins)?.id).toBe("c");
  });

  it("asks for a map without labels and keeps pins on the picture", () => {
    expect(buildMapPrompt({ name: "Eldoria", premise: "Floating islands." }, ["Saltmere"], "watercolor")).toContain("Show these places as distinct landmarks spread across the map: Saltmere.");
    expect(clampPercent(120)).toBe(100);
    expect(clampPercent(-3)).toBe(0);
  });
});

describe("factions on the map (#246)", () => {
  const factions = [
    { id: "f1", name: "The Tide Guild", kind: "faction" as const, memberIds: [] },
    { id: "f2", name: "The Vales", kind: "family" as const, memberIds: [] },
    { id: "f3", name: "Nobody's", kind: "faction" as const, memberIds: [] },
  ];
  const held = [
    { id: "a", name: "Docks", x: 1, y: 1, factionId: "f1" },
    { id: "b", name: "Manor", x: 2, y: 2, factionId: "f2" },
    { id: "c", name: "Market", x: 3, y: 3 },
    { id: "d", name: "Ruin", x: 4, y: 4, factionId: "gone" },
  ];

  it("colours a pin by its faction, the same colour each time", () => {
    expect(factionColor("f1", factions)).toBe(FACTION_COLORS[0]);
    expect(factionColor("f2", factions)).toBe(FACTION_COLORS[1]);
    expect(factionColor("gone", factions)).toBeUndefined();
    expect(factionColor(undefined, factions)).toBeUndefined();
    expect(factionOfPin(held[0], factions)?.name).toBe("The Tide Guild");
  });

  it("the legend lists the factions that hold a place, in the world's order", () => {
    expect(factionsOnMap(held, factions).map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(factionsOnMap(held, [])).toEqual([]);
  });

  it("filters to one faction's places, or the places nobody holds", () => {
    expect(pinsShown(held, undefined, factions)).toHaveLength(4);
    expect(pinsShown(held, "f2", factions).map((p) => p.id)).toEqual(["b"]);
    expect(pinsShown(held, "none", factions).map((p) => p.id)).toEqual(["c", "d"]);
  });
});
