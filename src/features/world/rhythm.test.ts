import { Character } from "../../types";
import { buildPlaceSection, placeLine } from "../character/realWorld";
import { buildWorldNowNote } from "./worldNow";
import { defaultHemisphere, seasonAtHome, seasonOf } from "./rhythm";

const at = (month: number, day: number) => new Date(2026, month, day, 12).getTime();
const sydney = { city: "Sydney", country: "Australia", countryCode: "AU", lat: -33.87, lon: 151.21, timeZone: "Australia/Sydney" };
const lisbon = { city: "Lisbon", country: "Portugal", countryCode: "PT", lat: 38.72, lon: -9.14, timeZone: "Europe/Lisbon" };

describe("seasons by hemisphere (#243)", () => {
  it("a southern world has its seasons the other way round on the real calendar", () => {
    expect(seasonOf({ hemisphere: "south" }, at(0, 15))).toBe("summer");
    expect(seasonOf({ hemisphere: "south" }, at(6, 15))).toBe("winter");
    expect(seasonOf({ hemisphere: "south" }, at(9, 27))).toBe("spring");
    expect(seasonOf({ hemisphere: "north" }, at(9, 27))).toBe("autumn");
    expect(seasonOf({}, at(6, 15))).toBe("summer");
  });

  it("a world's own calendar keeps its seasons whatever the hemisphere", () => {
    const storyTime = { year: 300, months: ["Thaw", "Bloom", "Sun", "Harvest"], daysPerMonth: 10, day: 0, anchorAt: at(0, 1), moves: false };
    expect(seasonOf({ storyTime, hemisphere: "south" }, at(0, 1))).toBe(seasonOf({ storyTime }, at(0, 1)));
  });

  it("reaches replies through the world's now line", () => {
    const world = { id: 4, name: "Harbour", premise: "", hemisphere: "south" as const };
    expect(buildWorldNowNote(world, at(0, 15))).toContain("it's summer");
  });

  it("a home's season follows its latitude, and none near the equator", () => {
    expect(seasonAtHome(sydney, at(0, 15))).toBe("summer");
    expect(seasonAtHome(lisbon, at(0, 15))).toBe("winter");
    expect(seasonAtHome({ lat: 1.35 }, at(0, 15))).toBeUndefined();
    expect(seasonAtHome(undefined, at(0, 15))).toBeUndefined();
  });

  it("their place lines name their own season", () => {
    expect(buildPlaceSection("Mia", sydney, undefined, [], at(0, 15))).toContain("there, in summer.");
    expect(placeLine(sydney, at(0, 15))).toContain("summer");
    expect(placeLine(lisbon, at(0, 15))).toContain("winter");
  });

  it("the editor starts southern when most people here live in the south", () => {
    const home = (h?: typeof sydney) => ({ home: h }) as Pick<Character, "home">;
    expect(defaultHemisphere([home(sydney), home(sydney), home(lisbon), home()])).toBe("south");
    expect(defaultHemisphere([home(sydney), home(lisbon)])).toBe("north");
    expect(defaultHemisphere([])).toBe("north");
  });
});
