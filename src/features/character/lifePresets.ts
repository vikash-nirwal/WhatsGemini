import { Character } from "../../types";

// "Their life" (#154): what a character does between your messages and
// inside, as switches and a few presets to start from.

export type LifeValues = Pick<Character,
  "textsFirst" | "leavesOnRead" | "postsStatuses" | "profileChanges" | "writesLetters" | "spreadsRumors" | "dayLogs" | "textingSlips" |
  "innerThoughts" | "diaryEnabled" | "dreams" | "badDays" | "misremembers" | "preoccupations">;

export interface LifeSwitch {
  key: keyof LifeValues;
  title: string;
  hint: string;
  cost: boolean; // makes background calls on your key
  on: Partial<LifeValues>; // what turning it on sets
}

export const BETWEEN_MESSAGES: LifeSwitch[] = [
  { key: "textsFirst", title: "Texts first", hint: "After a few quiet hours", cost: true, on: { textsFirst: true } },
  { key: "leavesOnRead", title: "Leaves you on read", hint: "Sometimes answers later", cost: false, on: { leavesOnRead: 1 } },
  { key: "postsStatuses", title: "Posts statuses", hint: "Now and then, in Updates", cost: true, on: { postsStatuses: true } },
  { key: "profileChanges", title: "Changes their profile", hint: "About line and photo, every few days", cost: true, on: { profileChanges: true } },
  { key: "writesLetters", title: "Writes letters", hint: "After a few days apart", cost: true, on: { writesLetters: true } },
  { key: "dayLogs", title: "Has a day of their own", hint: "One account of their day, daily", cost: true, on: { dayLogs: true } },
  { key: "textingSlips", title: "Texting slips", hint: "Typos and autocorrect", cost: false, on: { textingSlips: 1 } },
  { key: "spreadsRumors", title: "Talks about you", hint: "What you tell them can get around", cost: true, on: { spreadsRumors: true } },
];

export const INNER_LIFE: LifeSwitch[] = [
  { key: "innerThoughts", title: "Inner thoughts", hint: "A hidden thought with each reply", cost: false, on: { innerThoughts: true } },
  { key: "diaryEnabled", title: "Keeps a diary", hint: "Every few dozen messages", cost: true, on: { diaryEnabled: true } },
  { key: "dreams", title: "Dreams", hint: "Tells you one some mornings", cost: true, on: { dreams: true } },
  { key: "badDays", title: "Off days", hint: "Some days they're not themselves", cost: false, on: { badDays: true } },
  { key: "preoccupations", title: "Things on their mind", hint: "Their own worries, weekly", cost: true, on: { preoccupations: true } },
  { key: "misremembers", title: "Sometimes misremembers", hint: "Gets a small detail wrong", cost: false, on: { misremembers: true } },
];

export const ALL_SWITCHES = [...BETWEEN_MESSAGES, ...INNER_LIFE];

const allOff = (): LifeValues => Object.fromEntries(ALL_SWITCHES.map((s) => [s.key, undefined])) as LifeValues;
const withOn = (...keys: (keyof LifeValues)[]): LifeValues =>
  keys.reduce((v, k) => ({ ...v, ...ALL_SWITCHES.find((s) => s.key === k)!.on }), allOff());

export const LIFE_PRESETS: { id: string; name: string; desc: string; values: LifeValues }[] = [
  { id: "low-key", name: "Low-key", desc: "Nothing in the background", values: allOff() },
  { id: "texter", name: "Realistic texter", desc: "Texts first, on read sometimes, typos, statuses", values: withOn("textsFirst", "leavesOnRead", "postsStatuses", "profileChanges", "textingSlips", "dayLogs") },
  { id: "drama", name: "Drama", desc: "Off days, things on their mind, talk gets around", values: withOn("textsFirst", "leavesOnRead", "postsStatuses", "badDays", "preoccupations", "spreadsRumors", "misremembers") },
  { id: "storyteller", name: "Storyteller", desc: "Inner thoughts, a diary, dreams, letters", values: withOn("innerThoughts", "diaryEnabled", "dreams", "writesLetters", "dayLogs") },
];

export const isOn = (values: LifeValues, key: keyof LifeValues) => Boolean(values[key]);

// The preset these switches match exactly, if any.
export const presetOf = (values: LifeValues) =>
  LIFE_PRESETS.find((p) => ALL_SWITCHES.every((s) => isOn(p.values, s.key) === isOn(values, s.key)))?.id;

export const lifeOf = (c: Partial<Character>): LifeValues =>
  Object.fromEntries(ALL_SWITCHES.map((s) => [s.key, c[s.key]])) as LifeValues;

// A rough count of background calls a day, for the cost note.
export const backgroundCallsPerDay = (values: LifeValues) =>
  ALL_SWITCHES.filter((s) => s.cost && isOn(values, s.key)).length * 5;

// People made inside a world (the wizard, "Someone new", suggestions,
// newcomers) used to start with every switch off, so a new world sat silent
// while My world - made with Quick create's "Realistic texter" - was alive
// (the user's report, 2026-10-26). They now start the same way, unless the
// card already says how they live.
export const DEFAULT_LIFE_PRESET = "texter";
export const withDefaultLife = <T extends Partial<Character>>(card: T): T =>
  ALL_SWITCHES.some((s) => card[s.key]) ? card : { ...card, ...LIFE_PRESETS.find((p) => p.id === DEFAULT_LIFE_PRESET)!.values };
