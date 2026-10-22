import { buildMapPrompt, clampPercent, latestPinIn, pinForLocation } from "./worldMap";

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
