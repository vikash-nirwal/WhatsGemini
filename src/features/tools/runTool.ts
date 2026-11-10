import { ToolUse } from "../../types";
import { describeRoll, rollDice } from "../chat/slashCommands";
import { describePlace, describeWeather, ensureHolidays, ensureWeather, geocodeCity, PlaceCandidate } from "../character/realWorld";
import { describeWhen, parseWhen } from "./reminders";
import { ToolGroup } from "./toolSettings";
import { TOOL_COMMANDS, ToolCall } from "./toolTag";

// Runs one tool call (#266-#271) and says what came of it, in words for the
// character (`result`) and for the chip under the reply (`use`). A tool
// never throws: a failure is a result too ("couldn't reach the weather
// service"), so the character can say so instead of the reply failing.

export interface WebLookup {
  text: string;
  sources?: { title?: string; url: string }[];
}

export interface ToolContext {
  groups: ToolGroup[]; // the groups switched on
  now: number;
  random?: () => number;
  fetchFn?: typeof fetch;
  // Web lookup and link reading, when a provider that can do them is set up.
  lookup?: (kind: "search" | "open", query: string) => Promise<WebLookup>;
  reader?: boolean; // the reader service may be used for links
}

export interface ToolOutcome {
  result: string;
  use?: ToolUse; // unset when nothing real happened (unknown tool, bad input)
  reminder?: { at: number; about: string };
}

const fail = (result: string): ToolOutcome => ({ result });

export const READER_URL = "https://r.jina.ai/";
const PAGE_CHARS = 6000;
const HOLIDAYS_SHOWN = 4;

const findPlace = async (name: string, fetchFn: typeof fetch): Promise<PlaceCandidate | undefined> => (name.trim() ? (await geocodeCity(name, fetchFn))[0] : undefined);

const dateTimeIn = (now: number, timeZone: string): string =>
  new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(now));

const isLink = (text: string): boolean => /^https?:\/\/[^\s]+$/i.test(text);

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

// Country names for the holidays tool, so "Japan" works as well as "Tokyo".
const countryCodeOf = (name: string): string | undefined => {
  const wanted = name.trim().toLowerCase();
  if (/^[a-z]{2}$/.test(wanted)) return wanted.toUpperCase();
  try {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        const label = names.of(code);
        if (label && label !== code && label.toLowerCase() === wanted) return code;
      }
    }
  } catch {
    // No list of countries here: the place lookup below still works.
  }
  return undefined;
};

export const runTool = async (call: ToolCall, ctx: ToolContext): Promise<ToolOutcome> => {
  const command = TOOL_COMMANDS.find((c) => c.name === call.name);
  if (!command || !ctx.groups.includes(command.group)) return fail("That tool isn't available. Reply without it.");
  const random = ctx.random || Math.random;
  const fetchFn = ctx.fetchFn || fetch;
  const [first = "", ...others] = call.args;

  try {
    switch (call.name) {
      case "roll": {
        const roll = rollDice(first || "1d20", random);
        if (!roll) return fail(`Couldn't read "${first}" as dice. Use a form like 2d6+1.`);
        return { result: `${describeRoll(roll)}. Use this result for how it turns out; don't reroll or change it.`, use: { name: "roll", label: `Rolled ${roll.spec}: ${roll.total}` } };
      }
      case "coin": {
        const side = random() < 0.5 ? "heads" : "tails";
        return { result: `The coin landed on ${side}.`, use: { name: "coin", label: `Coin flip: ${side}` } };
      }
      case "pick": {
        // "a, b, c" or "a | b | c": both read as a list.
        const options = call.raw.split(/[|,]/).map((o) => o.trim()).filter(Boolean);
        if (options.length < 2) return fail("Give at least two options to pick from, separated by commas.");
        const picked = options[Math.floor(random() * options.length)];
        return { result: `Picked at random from ${options.length} options: ${picked}.`, use: { name: "pick", label: `Picked: ${picked}` } };
      }
      case "time": {
        const place = await findPlace(first, fetchFn);
        if (!place) return fail(`Couldn't find a place called "${first}".`);
        const clock = new Intl.DateTimeFormat("en-GB", { timeZone: place.timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ctx.now));
        return { result: `In ${describePlace(place)} it's ${dateTimeIn(ctx.now, place.timeZone)} right now.`, use: { name: "time", label: `Time in ${place.city}: ${clock}` } };
      }
      case "weather": {
        const place = await findPlace(first, fetchFn);
        if (!place) return fail(`Couldn't find a place called "${first}".`);
        const weather = await ensureWeather(place, ctx.now, fetchFn);
        if (!weather) return fail(`Couldn't reach the weather service for ${describePlace(place)}.`);
        const words = `${describeWeather(weather.code)}, ${weather.temperature}°C`;
        return { result: `The weather in ${describePlace(place)} right now: ${words}${weather.isDay ? "" : ", after dark"}.`, use: { name: "weather", label: `Weather in ${place.city}: ${words}` } };
      }
      case "holidays": {
        const place = countryCodeOf(first) ? undefined : await findPlace(first, fetchFn);
        const code = countryCodeOf(first) || place?.countryCode;
        const where = place?.country || first;
        if (!code) return fail(`Couldn't tell which country "${first}" is.`);
        const year = new Date(ctx.now).getFullYear();
        const today = new Date(ctx.now).toISOString().slice(0, 10);
        // Near the end of a year the next holidays are in the next one.
        const all = [...((await ensureHolidays(code, year, fetchFn)) || []), ...((await ensureHolidays(code, year + 1, fetchFn)) || [])];
        const next = all.filter((h) => h.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, HOLIDAYS_SHOWN);
        if (next.length === 0) return fail(`Couldn't get the public holidays for ${where}.`);
        return { result: `Today is ${today}. The next public holidays in ${where}: ${next.map((h) => `${h.name} (${h.date})`).join(", ")}.`, use: { name: "holidays", label: `Holidays in ${where}: next is ${next[0].name}` } };
      }
      case "remind": {
        const about = others.join(" | ").trim();
        const at = parseWhen(first, ctx.now);
        if (!at) return fail(`Couldn't read "${first}" as a time. Use a wait like 20m or 1h30m (5 seconds to 30 days), or a clock time like 18:30.`);
        if (!about) return fail("Say what the reminder is for, after the time.");
        const when = describeWhen(at, ctx.now);
        return {
          result: `Reminder set: you'll text the user about "${about}" ${when}. It only reaches them while they have the app open, or the next time they open it. Tell them it's set.`,
          use: { name: "remind", label: `Reminder ${when}: ${about}` },
          reminder: { at, about },
        };
      }
      case "search": {
        if (!call.raw) return fail("Say what to look up.");
        if (!ctx.lookup) return fail("Web lookup isn't available with the current model. Say you can't look it up right now.");
        const found = await ctx.lookup("search", call.raw);
        if (!found.text.trim()) return fail("The lookup came back empty. Say you couldn't find it.");
        return { result: `What the web lookup found for "${call.raw}":\n${found.text.trim().slice(0, PAGE_CHARS)}\nUse only what's here; don't add facts it doesn't give.`, use: { name: "search", label: `Looked up: ${call.raw}`, sources: found.sources?.slice(0, 5) } };
      }
      case "open": {
        if (!isLink(first)) return fail(`"${first}" isn't a link. A link starts with http:// or https://.`);
        const label = `Read ${hostOf(first)}`;
        if (ctx.lookup) {
          const found = await ctx.lookup("open", first);
          if (found.text.trim()) return { result: `What the page at ${first} says:\n${found.text.trim().slice(0, PAGE_CHARS)}\nUse only what's here.`, use: { name: "open", label, sources: [{ url: first }] } };
        }
        if (ctx.reader) {
          const res = await fetchFn(`${READER_URL}${first}`, { headers: { Accept: "text/plain" } });
          if (!res.ok) return fail(`Couldn't open the page (${res.status}). Say you couldn't read it.`);
          const page = (await res.text()).trim();
          if (!page) return fail("The page came back empty. Say you couldn't read it.");
          return { result: `What the page at ${first} says:\n${page.slice(0, PAGE_CHARS)}\nUse only what's here.`, use: { name: "open", label, sources: [{ url: first }] } };
        }
        return fail("Reading links isn't available with the current model. Say you can't open it, and ask what it says.");
      }
      default:
        return fail("That tool isn't available. Reply without it.");
    }
  } catch (err) {
    console.warn(`Tool "${call.name}" failed (non-fatal):`, err);
    return fail(`The ${call.name} tool couldn't be reached just now. Say so naturally, and don't make up a result.`);
  }
};
