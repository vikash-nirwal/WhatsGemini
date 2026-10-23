import { Character } from "../../types";

// Bad days (#95): with the switch on, some days (about one in six, the same
// all day) a character is off - under the weather, tired, irritable, low or
// stressed - and it colours their replies, statuses (#8) and first texts
// (#93). The day is picked from the character and the date, so nothing is
// stored unless you pick today's mood by hand (Character.dayMood).

export interface DayMood {
  id: string;
  label: string; // "under the weather"
  how: string; // what it does to them, for the prompt
}

export const DAY_MOODS: DayMood[] = [
  { id: "sick", label: "under the weather", how: "a cold or a headache: low energy, a bit sorry for themselves, keen on comfort" },
  { id: "tired", label: "tired", how: "a bad night's sleep: slower, shorter replies, easily distracted, maybe a yawn" },
  { id: "irritable", label: "irritable", how: "everything's going wrong today: shorter fuse, a little snappy, then sorry for it" },
  { id: "low", label: "feeling low", how: "quiet and a bit sad without a clear reason, needs a little warmth" },
  { id: "stressed", label: "stressed", how: "too much on their plate: distracted, worrying, talking about what's piling up" },
  { id: "hungover", label: "hungover", how: "a late night out: groggy, light-sensitive, swearing off drinking (again)" },
];

const ONE_IN = 6;

export const dayKey = (now: number): string => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// A small stable string hash, so the same character has the same day all day.
const hash = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

// Today's mood, or undefined on a good day (or with the switch off). A mood
// picked by hand for today wins; "" means you picked a good day.
export const dayMoodFor = (character: Pick<Character, "id" | "badDays" | "dayMood"> | undefined, now: number): DayMood | undefined => {
  if (!character?.badDays) return undefined;
  const key = dayKey(now);
  if (character.dayMood?.date === key) return DAY_MOODS.find((m) => m.id === character.dayMood!.mood);
  const h = hash(`${character.id}-${key}`);
  if (h % ONE_IN !== 0) return undefined;
  return DAY_MOODS[Math.floor(h / ONE_IN) % DAY_MOODS.length];
};

export const buildDayMoodSection = (name: string, mood: DayMood, userName: string): string =>
  `Today ${name} is having an off day: ${mood.label} (${mood.how}). Let it colour every reply today - tone, energy, length - without making it the topic unless ${userName} asks or notices. Kindness from ${userName} can lift it a little; it doesn't vanish all at once.`;
