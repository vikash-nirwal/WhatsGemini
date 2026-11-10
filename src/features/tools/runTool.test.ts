import { READER_URL, runTool, ToolContext } from "./runTool";
import { parseToolCall } from "./toolTag";

const now = new Date(2026, 10, 10, 10, 0, 0, 0).getTime();
const all: ToolContext["groups"] = ["dice", "facts", "reminders", "web", "links"];
const run = (tag: string, ctx: Partial<ToolContext> = {}) => runTool(parseToolCall(tag)!, { groups: all, now, random: () => 0.5, ...ctx });

// A fetch stand-in answering by URL, so a tool that calls two services works.
const fakeFetch = (routes: Record<string, unknown>, status = 200) =>
  jest.fn(async (url: string) => {
    const key = Object.keys(routes).find((k) => String(url).includes(k));
    const body = key ? routes[key] : undefined;
    return { ok: Boolean(key) && status === 200, status: key ? status : 404, json: async () => body, text: async () => String(body) } as Response;
  }) as unknown as typeof fetch;

const tokyo = { results: [{ name: "Tokyo", country: "Japan", country_code: "jp", latitude: 35.69, longitude: 139.69, timezone: "Asia/Tokyo" }] };

beforeEach(() => localStorage.clear());

describe("dice and chance", () => {
  it("rolls real dice", async () => {
    const outcome = await run("[Use: roll | 2d6+1]");
    expect(outcome.result).toContain("2d6+1 rolled [4, 4] + 1 = 9");
    expect(outcome.use).toEqual({ name: "roll", label: "Rolled 2d6+1: 9" });
  });

  it("flips a coin and picks from a list", async () => {
    expect((await run("[Use: coin]", { random: () => 0.1 })).use?.label).toBe("Coin flip: heads");
    expect((await run("[Use: pick | pizza, sushi, tacos]")).use?.label).toBe("Picked: sushi");
    expect((await run("[Use: pick | pizza]")).use).toBeUndefined();
  });

  it("says so when the dice can't be read", async () => {
    const outcome = await run("[Use: roll | lots]");
    expect(outcome.result).toContain("Couldn't read");
    expect(outcome.use).toBeUndefined();
  });
});

describe("switches", () => {
  it("refuses a tool whose group is off", async () => {
    const outcome = await run("[Use: roll | 1d6]", { groups: ["facts"] });
    expect(outcome.result).toContain("isn't available");
    expect(outcome.use).toBeUndefined();
  });

  it("refuses a tool it doesn't know", async () => {
    expect((await run("[Use: launch | missiles]")).result).toContain("isn't available");
  });
});

describe("real-world facts", () => {
  it("gives the time in a city", async () => {
    const outcome = await run("[Use: time | Tokyo]", { fetchFn: fakeFetch({ "geocoding-api": tokyo }) });
    expect(outcome.result).toContain("In Tokyo, Japan it's");
    expect(outcome.use?.label).toMatch(/^Time in Tokyo: \d\d:\d\d$/);
  });

  it("gives the weather in a city", async () => {
    const fetchFn = fakeFetch({ "geocoding-api": tokyo, "api.open-meteo.com": { current: { temperature_2m: 17.6, weather_code: 61, is_day: 1 } } });
    const outcome = await run("[Use: weather | Tokyo]", { fetchFn });
    expect(outcome.result).toContain("The weather in Tokyo, Japan right now: raining, 18°C.");
    expect(outcome.use?.label).toBe("Weather in Tokyo: raining, 18°C");
  });

  it("gives the next holidays in a country", async () => {
    const fetchFn = fakeFetch({ "PublicHolidays/2026/JP": [{ date: "2026-01-01", name: "New Year" }, { date: "2026-11-23", name: "Labour Thanksgiving Day" }], "PublicHolidays/2027/JP": [{ date: "2027-01-01", name: "New Year" }] });
    const outcome = await run("[Use: holidays | Japan]", { fetchFn });
    expect(outcome.result).toContain("Labour Thanksgiving Day (2026-11-23), New Year (2027-01-01)");
    expect(outcome.use?.label).toBe("Holidays in Japan: next is Labour Thanksgiving Day");
  });

  it("says so when the place isn't found or the service is down", async () => {
    expect((await run("[Use: weather | Nowhereville]", { fetchFn: fakeFetch({ "geocoding-api": { results: [] } }) })).result).toContain("Couldn't find a place");
    const down = jest.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    const outcome = await run("[Use: time | Tokyo]", { fetchFn: down });
    expect(outcome.result).toContain("couldn't be reached");
    expect(outcome.use).toBeUndefined();
  });
});

describe("reminders", () => {
  it("sets a reminder", async () => {
    const outcome = await run("[Use: remind | 20m | take the pasta off]");
    expect(outcome.reminder).toEqual({ at: now + 20 * 60 * 1000, about: "take the pasta off" });
    expect(outcome.use?.label).toBe("Reminder in 20 minutes: take the pasta off");
  });

  it("needs a time it can read and something to remind about", async () => {
    expect((await run("[Use: remind | sometime | pasta]")).reminder).toBeUndefined();
    expect((await run("[Use: remind | 20m]")).reminder).toBeUndefined();
  });
});

describe("web lookup and links", () => {
  it("looks something up and keeps the sources", async () => {
    const lookup = jest.fn(async () => ({ text: "Spain won.", sources: [{ url: "https://example.com/a", title: "A" }] }));
    const outcome = await run("[Use: search | who won]", { lookup });
    expect(lookup).toHaveBeenCalledWith("search", "who won");
    expect(outcome.result).toContain("Spain won.");
    expect(outcome.use).toEqual({ name: "search", label: "Looked up: who won", sources: [{ url: "https://example.com/a", title: "A" }] });
  });

  it("says so with no provider that can look things up, or nothing found", async () => {
    expect((await run("[Use: search | who won]")).result).toContain("isn't available");
    expect((await run("[Use: search | who won]", { lookup: async () => ({ text: "" }) })).use).toBeUndefined();
    const broken = async () => { throw new Error("400"); };
    expect((await run("[Use: search | who won]", { lookup: broken })).result).toContain("couldn't be reached");
  });

  it("reads a link through the provider", async () => {
    const outcome = await run("[Use: open | https://www.example.com/post]", { lookup: async () => ({ text: "A post about cats." }) });
    expect(outcome.result).toContain("A post about cats.");
    expect(outcome.use).toEqual({ name: "open", label: "Read example.com", sources: [{ url: "https://www.example.com/post" }] });
  });

  it("falls back to the reader service only when it's switched on", async () => {
    const fetchFn = fakeFetch({ [READER_URL]: "Title: Cats\nAll about cats." });
    const off = await run("[Use: open | https://example.com/post]", { fetchFn });
    expect(off.result).toContain("isn't available");
    expect(fetchFn).not.toHaveBeenCalled();
    const on = await run("[Use: open | https://example.com/post]", { fetchFn, reader: true, lookup: async () => ({ text: "" }) });
    expect(on.result).toContain("All about cats.");
    expect(fetchFn).toHaveBeenCalledWith(`${READER_URL}https://example.com/post`, expect.anything());
  });

  it("only opens links", async () => {
    expect((await run("[Use: open | the article]", { reader: true })).result).toContain("isn't a link");
  });
});
