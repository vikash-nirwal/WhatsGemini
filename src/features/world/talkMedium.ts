import { Character, World } from "../../types";
import { whereIs } from "./places";
import { featureOn } from "./worldPrefs";

// Talk that fits the era and the place (#216). World talk always asked for
// "a text conversation", even in a world whose era says news travels by
// letter, and any two people could talk whenever, wherever they were. Now
// a world talks by texts or by letters - from its era, unless set by hand
// - and two people at the same place on the map talk there in person.

export type TalkBy = "texts" | "letters";

export interface TalkSetting {
  kind: TalkBy | "in person";
  place?: string; // where they are, in person
}

// Said outright first ("no phones", "letters"), then the age of things.
const LETTERS = /\b(letters?|no phones?|no (?:modern )?technology|medieval|feudal|ancient|antiquity|bronze age|iron age|renaissance|regency|victorian|edwardian|georgian|pre-?modern|1[0-8]\d\d|roman|viking|samurai|wild west|frontier)\b/i;
const TEXTS = /\b(phones?|smartphones?|texts?|texting|messag\w*|modern|contemporary|present[- ]day|today|20\d\d|19[6-9]\d|future|sci-?fi|cyber\w*|space)\b/i;

export const talkByOf = (world: Pick<World, "era" | "talkBy"> | undefined): TalkBy => {
  if (world?.talkBy) return world.talkBy;
  const era = world?.era || "";
  if (/\bno (?:phones?|texting)\b/i.test(era)) return "letters";
  if (TEXTS.test(era)) return "texts";
  return LETTERS.test(era) ? "letters" : "texts";
};

// How these two talk right now: in person when the map puts them in the
// same place (with places on), otherwise the world's way.
export const talkSettingFor = (a: Character, b: Character, world: World | undefined, now: number): TalkSetting => {
  const pins = world?.map?.pins || [];
  if (world && pins.length && featureOn(world.id, "places")) {
    const here = whereIs(a, pins, now);
    if (here && whereIs(b, pins, now)?.id === here.id) return { kind: "in person", place: here.name };
  }
  return { kind: talkByOf(world) };
};

// Letters take time to go back and forth, so they come half as often; two
// people in the same room talk sooner.
export const settingGapFactor = (setting: TalkSetting) => (setting.kind === "in person" ? 0.5 : setting.kind === "letters" ? 2 : 1);

// Letters are few and long.
export const linesFor = (setting: TalkSetting, maxLines: number) => (setting.kind === "letters" ? Math.min(4, maxLines) : maxLines);

// For a talk's prompt: the opening, and how its lines are written. The
// texts wording is the one prompts have always used.
export const settingOpening = (setting: TalkSetting, a: string, b: string) =>
  setting.kind === "letters" ? `Write an exchange of letters between ${a} and ${b}`
    : setting.kind === "in person" ? `Write a conversation in person between ${a} and ${b}${setting.place ? ` at ${setting.place}` : ""}`
    : `Write a text conversation between ${a} and ${b}`;

export const settingFormat = (setting: TalkSetting, a: string, maxLines: number) =>
  setting.kind === "letters"
    ? `- 2 to ${linesFor(setting, maxLines)} letters, each starting with the writer's name and a colon, like "${a}: ...". Each is a short paragraph in the manner of the time, answering the one before; no greeting lines or signatures on their own lines.`
    : setting.kind === "in person"
      ? `- 2 to ${maxLines} things said aloud, each starting with the speaker's name and a colon, like "${a}: ...". Spoken, not typed: people interrupt and trail off, and a brief gesture between asterisks is fine.`
      : `- 2 to ${maxLines} short texts, each starting with the sender's name and a colon, like "${a}: ...". Not strictly alternating: people double-text, trail off, reply late.`;

// For Peek, and anywhere a talk is labelled.
export const settingLabel = (talk: { medium?: "letters" | "in person"; place?: string }) =>
  talk.medium === "letters" ? "Letters" : talk.medium === "in person" ? `In person${talk.place ? ` at ${talk.place}` : ""}` : undefined;
