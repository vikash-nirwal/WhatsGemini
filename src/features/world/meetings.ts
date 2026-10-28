import { Character, Chat, World } from "../../types";
import { whereIs } from "./places";
import { featureOn } from "./worldPrefs";
import { lifeScaled } from "../life/lifeDial";
import { awakeAt } from "../character/firstTexts";

// Meeting first (#236). On 2026-10-26 everyone in the same made world was
// made to know everyone, so a world with no ties set wasn't silent; but
// then strangers texted each other as if they'd always been friends, never
// introduced by anyone (the user's report, 2026-10-28). Now two people
// talk on their own only once they're acquainted: tied, knowing of each
// other, having met, in a group chat or a family or faction together.
// Strangers in a made world meet first, in person, now and then: one who
// knows them both introduces them, or they find themselves at the same
// place, or they run into each other around town. From then on they've met.

export const MEET_GAP_MS = 24 * 60 * 60 * 1000; // per world, before the life dial

export interface Meeting {
  a: Character;
  b: Character;
  via?: Character; // who introduced them
  place?: string; // where they met
}

export interface Acquaintance {
  chats?: Pick<Chat, "characterIds" | "whatIf" | "theirs">[];
  world?: Pick<World, "factions">;
}

// Whether two people know each other, so they may talk on their own.
export const acquainted = (a: Character, b: Character, { chats = [], world }: Acquaintance = {}): boolean =>
  Boolean(
    a.ties?.some((t) => t.withId === b.id) || b.ties?.some((t) => t.withId === a.id) ||
    a.knowsAbout?.includes(b.id) || b.knowsAbout?.includes(a.id) ||
    a.met?.includes(b.id) || b.met?.includes(a.id) ||
    chats.some((c) => !c.whatIf && (c.characterIds?.length || 0) > 1 && c.characterIds!.includes(a.id) && c.characterIds!.includes(b.id)) ||
    world?.factions?.some((f) => f.memberIds.includes(a.id) && f.memberIds.includes(b.id))
  );

const pick = <T,>(list: T[], rand: () => number): T | undefined => list[Math.floor(rand() * list.length)];

// Who meets next in a world, if anyone: introductions first (a friend of
// both), then two at the same place on the map, then a chance meeting.
// Only in a made world: in My world people stay strangers until you tie
// them, as they always have.
export const pickMeeting = (cast: Character[], world: World | undefined, ctx: Acquaintance, now: number, { awake = (): boolean => true, rand = Math.random }: { awake?: (c: Character) => boolean; rand?: () => number } = {}): Meeting | undefined => {
  if (!world) return undefined;
  const here = cast.filter((c) => c.worldId === world.id && awake(c));
  const strangers: [Character, Character][] = [];
  for (let i = 0; i < here.length; i++) for (let j = i + 1; j < here.length; j++) if (!acquainted(here[i], here[j], ctx)) strangers.push([here[i], here[j]]);
  if (!strangers.length) return undefined;
  const introduced = strangers.flatMap(([a, b]) => {
    const via = here.filter((c) => c.id !== a.id && c.id !== b.id && acquainted(c, a, ctx) && acquainted(c, b, ctx));
    return via.length ? [{ a, b, via: pick(via, rand)! }] : [];
  });
  if (introduced.length) return pick(introduced, rand);
  const pins = world.map?.pins || [];
  if (pins.length && featureOn(world.id, "places")) {
    const together = strangers.flatMap(([a, b]) => {
      const pin = whereIs(a, pins, now);
      return pin && whereIs(b, pins, now)?.id === pin.id ? [{ a, b, place: pin.name }] : [];
    });
    if (together.length) return pick(together, rand);
  }
  const [a, b] = pick(strangers, rand)!;
  return { a, b };
};

// For the talk's prompt: how they meet.
export const meetingLine = (m: Meeting, userName: string) =>
  `${m.a.name} and ${m.b.name} have never met. This is the first time: ${m.via ? `${m.via.name}, who knows them both, introduces them${m.place ? ` at ${m.place}` : ""} (${m.via.name} may say a line or two too, but the talk is theirs)` : m.place ? `they're both at ${m.place} and get talking` : "they run into each other around town and get talking"}. They introduce themselves, polite and a little careful, curious about each other; they know nothing of each other's lives but what's said here or what anyone in town might know. ${userName} isn't in it.`;

// Both remember having met.
export const metWith = (c: Pick<Character, "met">, otherId: number): Pick<Character, "met"> => ({ met: Array.from(new Set([...(c.met || []), otherId])) });

// The meeting due now, if any: in the made world that met longest ago and
// is due again, with both of them awake.
export const dueMeeting = (characters: Character[], worlds: World[], chats: Acquaintance["chats"], now: number, rand: () => number = Math.random): Meeting | undefined => {
  const due = worlds
    .filter((w) => now - (w.lastMeetingAt || 0) >= lifeScaled(MEET_GAP_MS))
    .sort((x, y) => (x.lastMeetingAt || 0) - (y.lastMeetingAt || 0));
  for (const world of due) {
    const m = pickMeeting(characters, world, { chats, world }, now, { awake: (c) => awakeAt(c, now), rand });
    if (m) return m;
  }
  return undefined;
};
