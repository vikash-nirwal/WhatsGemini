import { CharacterHome } from "../../types";
import { buildPlaceSection, cachedWeather, describePlace, describeWeather, ensureHolidays, ensureWeather, geocodeCity, holidaysNear, localTime, weatherLine, WEATHER_TTL_MS } from "./realWorld";

const NOW = Date.UTC(2026, 9, 21, 9, 30); // 09:30 UTC, a Wednesday
const lisbon: CharacterHome = { city: "Lisbon", country: "Portugal", countryCode: "PT", lat: 38.72, lon: -9.14, timeZone: "Europe/Lisbon" };
const json = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body }) as unknown as Response;

describe("real-world grounding (#112)", () => {
  beforeEach(() => localStorage.clear());

  it("finds places and keeps only usable results", async () => {
    const fetchFn = jest.fn(async () => json({ results: [
      { name: "Lisbon", country: "Portugal", country_code: "pt", admin1: "Lisboa", latitude: 38.72, longitude: -9.14, timezone: "Europe/Lisbon" },
      { name: "Nowhere", latitude: 1, longitude: 2 },
    ] }));
    const places = await geocodeCity(" Lisbon ", fetchFn as unknown as typeof fetch);
    expect(places).toEqual([{ city: "Lisbon", country: "Portugal", countryCode: "PT", region: "Lisboa", lat: 38.72, lon: -9.14, timeZone: "Europe/Lisbon" }]);
    expect((fetchFn.mock.calls[0] as unknown as string[])[0]).toContain("name=Lisbon&count=5");
    expect(await geocodeCity("  ", fetchFn as unknown as typeof fetch)).toEqual([]);
    expect(describePlace(places[0])).toBe("Lisbon, Portugal");
  });

  it("puts the weather in words", () => {
    expect(describeWeather(0)).toBe("clear");
    expect(describeWeather(2)).toBe("partly cloudy");
    expect(describeWeather(45)).toBe("foggy");
    expect(describeWeather(63)).toBe("raining");
    expect(describeWeather(73)).toBe("snowing");
    expect(describeWeather(95)).toBe("a thunderstorm");
    expect(weatherLine({ temperature: 14, code: 61, isDay: true, fetchedAt: NOW })).toBe("raining, 14°C");
    expect(weatherLine(undefined)).toBeUndefined();
  });

  it("fetches the weather once an hour and caches it", async () => {
    const fetchFn = jest.fn(async () => json({ current: { temperature_2m: 17.6, weather_code: 61, is_day: 1 } }));
    const first = await ensureWeather(lisbon, NOW, fetchFn as unknown as typeof fetch);
    expect(first).toEqual({ temperature: 18, code: 61, isDay: true, fetchedAt: NOW });
    expect(cachedWeather(lisbon, NOW + 1000)).toEqual(first);
    await ensureWeather(lisbon, NOW + WEATHER_TTL_MS / 2, fetchFn as unknown as typeof fetch);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await ensureWeather(lisbon, NOW + WEATHER_TTL_MS, fetchFn as unknown as typeof fetch);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    // A failed refresh keeps the old reading; a stale cache is dropped after a while.
    const failing = jest.fn(async () => json({}, false));
    expect(await ensureWeather(lisbon, NOW + 2 * WEATHER_TTL_MS, failing as unknown as typeof fetch)).toMatchObject({ temperature: 18 });
    expect(cachedWeather(lisbon, NOW + 5 * WEATHER_TTL_MS)).toBeUndefined();
    expect(cachedWeather(undefined, NOW)).toBeUndefined();
  });

  it("fetches a year's holidays once and finds the ones near today", async () => {
    const fetchFn = jest.fn(async () => json([{ date: "2026-10-21", localName: "Dia de Teste" }, { date: "2026-10-24", name: "Soon" }, { date: "2026-12-25", localName: "Natal" }]));
    const holidays = await ensureHolidays("PT", 2026, fetchFn as unknown as typeof fetch);
    expect(holidays).toHaveLength(3);
    await ensureHolidays("PT", 2026, fetchFn as unknown as typeof fetch);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(holidaysNear(holidays, NOW, "Europe/Lisbon")).toEqual([{ name: "Dia de Teste", inDays: 0 }, { name: "Soon", inDays: 3 }]);
    expect(holidaysNear(undefined, NOW, "Europe/Lisbon")).toEqual([]);
    expect(await ensureHolidays(undefined, 2026, fetchFn as unknown as typeof fetch)).toBeUndefined();
  });

  it("tells the local time and writes the note", () => {
    expect(localTime(NOW, "Europe/Lisbon")).toBe("Wednesday 10:30");
    expect(localTime(NOW, "Asia/Kolkata")).toBe("Wednesday 15:00");
    const note = buildPlaceSection("Aria", lisbon, { temperature: 18, code: 61, isDay: true, fetchedAt: NOW }, [{ name: "Natal", inDays: 1 }], NOW);
    expect(note).toContain("Aria lives in Lisbon, Portugal. It's Wednesday 10:30 there.");
    expect(note).toContain("The weather there right now: raining, 18°C.");
    expect(note).toContain("Public holidays where Aria lives: Natal (tomorrow).");
    expect(note).toContain("never as a report");
    expect(buildPlaceSection("Aria", lisbon, undefined, [], NOW)).not.toContain("The weather there right now");
    expect(buildPlaceSection("Aria", lisbon, { temperature: 9, code: 0, isDay: false, fetchedAt: NOW }, [], NOW)).toContain("clear, 9°C, after dark.");
  });
});
