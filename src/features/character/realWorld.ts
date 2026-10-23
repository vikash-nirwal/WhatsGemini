import { CharacterHome } from "../../types";

// Real-world grounding (#112): a character with a home city gets the local
// time there, the weather right now (Open-Meteo, no key) and the public
// holidays near today (Nager.Date, no key) in every prompt, mentioned only
// when they'd naturally come up. The city name goes to Open-Meteo's geocoder
// once, when it's picked in the editor; after that only the coordinates
// (weather) and the country code (holidays) leave the browser. Results are
// cached in localStorage so a prompt can be built without waiting.

export const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
export const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
export const HOLIDAYS_URL = "https://date.nager.at/api/v3/PublicHolidays";

export const WEATHER_TTL_MS = 60 * 60 * 1000;
const WEATHER_KEY = "weather_cache";
const HOLIDAYS_KEY = "holidays_cache";
const HOLIDAYS_WINDOW_DAYS = 3;

type Fetch = typeof fetch;

export interface PlaceCandidate extends CharacterHome {
  region?: string; // "Lisboa", "California"
}

export const geocodeCity = async (name: string, fetchFn: Fetch = fetch): Promise<PlaceCandidate[]> => {
  const query = name.trim();
  if (!query) return [];
  const res = await fetchFn(`${GEOCODE_URL}?name=${encodeURIComponent(query)}&count=5&language=en&format=json`);
  if (!res.ok) throw new Error(`Place lookup failed (${res.status})`);
  const data = (await res.json()) as { results?: { name: string; country?: string; country_code?: string; admin1?: string; latitude: number; longitude: number; timezone?: string }[] };
  return (data.results || [])
    .filter((r) => typeof r.latitude === "number" && typeof r.longitude === "number" && r.timezone)
    .map((r) => ({ city: r.name, country: r.country, countryCode: r.country_code?.toUpperCase(), region: r.admin1, lat: r.latitude, lon: r.longitude, timeZone: r.timezone! }));
};

export const describePlace = (home: Pick<CharacterHome, "city" | "country">): string => (home.country ? `${home.city}, ${home.country}` : home.city);

// WMO weather codes, in words a person would use.
export const describeWeather = (code: number): string => {
  if (code === 0) return "clear";
  if (code <= 2) return "partly cloudy";
  if (code === 3) return "overcast";
  if (code <= 48) return "foggy";
  if (code <= 57) return "drizzling";
  if (code <= 67) return "raining";
  if (code <= 77) return "snowing";
  if (code <= 82) return "rain showers";
  if (code <= 86) return "snow showers";
  return "a thunderstorm";
};

export interface Weather {
  temperature: number; // °C
  code: number;
  isDay: boolean;
  fetchedAt: number;
}

const placeKey = (home: Pick<CharacterHome, "lat" | "lon">) => `${home.lat.toFixed(2)},${home.lon.toFixed(2)}`;

const readCache = <T,>(key: string): Record<string, T> => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, T>) : {};
  } catch {
    return {};
  }
};
const writeCache = <T,>(key: string, value: Record<string, T>) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the next prompt just goes without.
  }
};

export const cachedWeather = (home: Pick<CharacterHome, "lat" | "lon"> | undefined, now: number): Weather | undefined => {
  if (!home) return undefined;
  const entry = readCache<Weather>(WEATHER_KEY)[placeKey(home)];
  return entry && now - entry.fetchedAt < WEATHER_TTL_MS * 3 ? entry : undefined;
};

const inFlight = new Map<string, Promise<Weather | undefined>>();

// Fetches the weather when the cached one is older than an hour, once at a
// time per place. Returns the fresh (or still good) reading.
export const ensureWeather = async (home: CharacterHome, now: number, fetchFn: Fetch = fetch): Promise<Weather | undefined> => {
  const key = placeKey(home);
  const cached = readCache<Weather>(WEATHER_KEY)[key];
  if (cached && now - cached.fetchedAt < WEATHER_TTL_MS) return cached;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const task = (async () => {
    try {
      const res = await fetchFn(`${WEATHER_URL}?latitude=${home.lat}&longitude=${home.lon}&current=temperature_2m,weather_code,is_day&timezone=${encodeURIComponent(home.timeZone)}`);
      if (!res.ok) return cached;
      const data = (await res.json()) as { current?: { temperature_2m?: number; weather_code?: number; is_day?: number } };
      if (!data.current || typeof data.current.temperature_2m !== "number") return cached;
      const weather: Weather = { temperature: Math.round(data.current.temperature_2m), code: data.current.weather_code ?? 0, isDay: data.current.is_day !== 0, fetchedAt: now };
      writeCache(WEATHER_KEY, { ...readCache<Weather>(WEATHER_KEY), [key]: weather });
      return weather;
    } catch {
      return cached;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, task);
  return task;
};

export interface Holiday {
  date: string; // "2026-12-25"
  name: string;
}

export const cachedHolidays = (countryCode: string | undefined, year: number): Holiday[] | undefined =>
  countryCode ? readCache<Holiday[]>(HOLIDAYS_KEY)[`${countryCode}-${year}`] : undefined;

export const ensureHolidays = async (countryCode: string | undefined, year: number, fetchFn: Fetch = fetch): Promise<Holiday[] | undefined> => {
  if (!countryCode) return undefined;
  const cached = cachedHolidays(countryCode, year);
  if (cached) return cached;
  try {
    const res = await fetchFn(`${HOLIDAYS_URL}/${year}/${countryCode}`);
    if (!res.ok) return undefined;
    const data = (await res.json()) as { date: string; localName?: string; name?: string }[];
    const holidays = data.filter((h) => h.date && (h.localName || h.name)).map((h) => ({ date: h.date, name: h.localName || h.name! }));
    writeCache(HOLIDAYS_KEY, { ...readCache<Holiday[]>(HOLIDAYS_KEY), [`${countryCode}-${year}`]: holidays });
    return holidays;
  } catch {
    return undefined;
  }
};

// The date where the character lives, as "YYYY-MM-DD".
const localDate = (now: number, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  return parts; // en-CA gives ISO order
};

const dayDiff = (from: string, to: string): number => Math.round((Date.parse(to) - Date.parse(from)) / (24 * 60 * 60 * 1000));

// Holidays today and in the next few days, where they live.
export const holidaysNear = (holidays: Holiday[] | undefined, now: number, timeZone: string): { name: string; inDays: number }[] => {
  if (!holidays) return [];
  const today = localDate(now, timeZone);
  return holidays
    .map((h) => ({ name: h.name, inDays: dayDiff(today, h.date) }))
    .filter((h) => h.inDays >= 0 && h.inDays <= HOLIDAYS_WINDOW_DAYS)
    .sort((a, b) => a.inDays - b.inDays);
};

export const localTime = (now: number, timeZone: string): string => {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(now)).replace(",", "");
  } catch {
    return "";
  }
};

const whenHoliday = (inDays: number): string => (inDays === 0 ? "today" : inDays === 1 ? "tomorrow" : `in ${inDays} days`);

// The one-liner first texts and statuses get: "raining, 14°C".
export const weatherLine = (weather: Weather | undefined): string | undefined => (weather ? `${describeWeather(weather.code)}, ${weather.temperature}°C` : undefined);

// "Lisbon, Portugal, Wednesday 10:30, raining, 18°C" for statuses and first texts.
export const placeLine = (home: CharacterHome | undefined, now: number): string | undefined => {
  if (!home) return undefined;
  const weather = weatherLine(cachedWeather(home, now));
  return [describePlace(home), localTime(now, home.timeZone), weather].filter(Boolean).join(", ");
};

export const buildPlaceSection = (name: string, home: CharacterHome, weather: Weather | undefined, holidays: { name: string; inDays: number }[], now: number): string => {
  const time = localTime(now, home.timeZone);
  const lines = [
    `${name} lives in ${describePlace(home)}.${time ? ` It's ${time} there.` : ""}`,
    ...(weather ? [`The weather there right now: ${describeWeather(weather.code)}, ${weather.temperature}°C${weather.isDay ? "" : ", after dark"}.`] : []),
    ...(holidays.length > 0 ? [`Public holidays where ${name} lives: ${holidays.map((h) => `${h.name} (${whenHoliday(h.inDays)})`).join(", ")}.`] : []),
    `Mention these only when they'd naturally come up - the weather when going out or looking out of the window, the hour when it's late or early, a holiday when it's near - never as a report.`,
  ];
  return lines.join(" ");
};
