import { Character, World } from "../../types";
import { announcementsLine } from "./announcements";
import { bondWords, moodOf } from "./bonds";
import { goalLine } from "./goals";
import { MAX_EVENT_DAYS } from "./worldEvents";
import { awakeAt } from "../character/firstTexts";
import { linesFor, TalkSetting } from "./talkMedium";
import { paceFactor } from "./activity";
import type { FoundPerson } from "./extras";
import { knowEachOther, talksBetween } from "./worldTalk";
import type { Acquaintance } from "./meetings";

// One world-turn call (#212). With the switch on, a world's talk, events
// and life events come from one structured call every few hours instead of
// a call each: the model sees the whole world at once, so an event can
// grow out of a talk and a talk can be about what just happened to
// someone. Each part only comes back when the world allows it (events,
// newcomers and life events, drift each keep their own switch).

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
export const WORLD_TURN_GAP_MS = 4 * HOUR;

export const worldTurnDue = (world: Pick<World, "lastTurnAt">, now: number, gapMs = WORLD_TURN_GAP_MS) => now - (world.lastTurnAt || 0) >= gapMs;

// Who may talk this turn: pairs who know each other, are both awake and
// haven't talked for a while, longest-quiet first, a few at most.
// `ctx`: group chats and factions count as knowing each other (#236).
export const dueTalkPairs = (cast: Character[], now: number, gapMs: number, max = 4, ctx?: Acquaintance): [Character, Character][] => {
  const pairs: { pair: [Character, Character]; last: number }[] = [];
  for (let i = 0; i < cast.length; i++) {
    for (let j = i + 1; j < cast.length; j++) {
      const [a, b] = cast[i].id < cast[j].id ? [cast[i], cast[j]] : [cast[j], cast[i]];
      if (!knowEachOther(a, b, ctx) || !awakeAt(a, now) || !awakeAt(b, now)) continue;
      const last = talksBetween(cast, a.id, b.id).reduce((m, t) => Math.max(m, t.at), 0);
      // Each at their own pace (#223).
      if (now - last >= gapMs * paceFactor(a, b, now)) pairs.push({ pair: [a, b], last });
    }
  }
  return pairs.sort((x, y) => x.last - y.last).slice(0, max).map((p) => p.pair);
};

export interface WorldTurnAsk {
  pairs: [Character, Character][]; // who may talk this turn (they know each other and are due)
  settings?: TalkSetting[]; // how each pair talks (#216), by index; unset = texts
  maxLines: number;
  event: boolean; // the world may start one event
  life: boolean; // one person may have a life event
  tie: boolean; // a talk may change a tie
  people?: boolean; // name anyone new who came up (#218)
}

const tieOf = (c: Character, other: Character) => c.ties?.find((t) => t.withId === other.id)?.tie?.replace(/^your\s+/i, "");

// One line per person: who they are, their ties and how they stand, their
// mood, what they want, what happened to them lately.
const personLine = (c: Character, cast: Character[], now: number) => {
  const ties = (c.ties || []).map((t) => {
    const other = cast.find((x) => x.id === t.withId);
    if (!other) return undefined;
    const words = bondWords(c, other.id, now);
    return `${other.name} (${t.tie.replace(/^your\s+/i, "")}${words ? `, ${words}` : ""})`;
  }).filter(Boolean);
  const mood = moodOf(c, now);
  return [
    `- ${c.name}: ${[c.description, c.prompt].filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 220)}`,
    ties.length ? `  Ties: ${ties.join(", ")}` : "",
    mood <= -30 ? "  Has been low lately." : mood >= 30 ? "  In high spirits lately." : "",
    c.goal && goalLine(c) ? `  ${goalLine(c)}${c.goal.against !== undefined && cast.some((x) => x.id === c.goal!.against) ? ` (at odds with ${cast.find((x) => x.id === c.goal!.against)!.name}'s)` : ""}` : "",
    c.lifeEvents?.length ? `  Lately: ${c.lifeEvents.slice(-2).map((e) => e.text).join(" ")}` : "",
  ].filter(Boolean).join("\n");
};

const pairSetting = (ask: WorldTurnAsk, i: number) => {
  const s = ask.settings?.[i];
  return s?.kind === "letters" ? " [letters]" : s?.kind === "in person" ? ` [in person${s.place ? ` at ${s.place}` : ""}]` : "";
};

export const buildWorldTurnPrompt = (
  world: World,
  cast: Character[],
  ask: WorldTurnAsk,
  { userName, recent, happening, storyline, sceneNow, now, context = [] }: { userName: string; recent: string[]; happening?: string; storyline?: string; sceneNow?: string; now: number; context?: string[] }
) => [
  `You move the life of ${world.name} on by a few hours: ${world.premise}${world.era ? ` (${world.era})` : ""}. ${userName} lives here too but isn't part of this; don't decide anything for ${userName}.`,
  ...(world.godTruths?.length ? [`Simply true in this world (never question it): ${world.godTruths.join("; ")}.`] : []),
  ...(announcementsLine(world) ? [announcementsLine(world)] : []),
  ...context,
  ...(sceneNow ? [sceneNow] : []),
  ...(happening ? [`Going on now: ${happening}`] : []),
  ...(storyline ? [`The storyline: ${storyline}`] : []),
  ...(recent.length ? ["", "What happened here lately:", ...recent.map((r) => `- ${r}`)] : []),
  "",
  "The people:",
  ...cast.map((c) => personLine(c, cast, now)),
  "",
  "This turn, write:",
  ...(ask.pairs.length
    ? [`- "talks": up to two short conversations, only between these pairs: ${ask.pairs.map(([a, b], i) => `${a.name} & ${b.name}${tieOf(a, b) ? ` (${tieOf(a, b)})` : ""}${pairSetting(ask, i)}`).join("; ")}. Each 2 to ${ask.maxLines} lines, plain and in character: texts, unless a pair is marked as letters (fewer, longer, in the manner of the time) or in person (spoken, at that place). Let them pick up what's going on in their lives and the world.${ask.tie ? ` Only if a talk really changes how they stand, give it "tie": "<what the second is to the first now> | <what the first is to the second now>".` : ""}`]
    : ['- "talks": [] (nobody is due to talk).']),
  ask.event ? `- "event": something that happens to the whole place in the coming days (a festival, a storm, a scandal, a closing), growing out of what's going on, or null if nothing fits. Fields: "title" (a few words), "what" (one or two sentences), "days" (1 to ${MAX_EVENT_DAYS}).` : '- "event": null.',
  // Uneven, like real life (#223).
  "- Not everything settles in a turn: plans can stay vague and threads can wait.",
  ...(ask.people ? ['- "people": anyone who came up by name for the first time and isn\'t one of the people above, as {"name": "...", "about": "who they are, a few words", "whose": "like Kai\'s landlord, or empty"}; [] if nobody.'] : []),
  ask.life ? '- "life": one thing that happens in one person\'s own life (a new job, a move, an illness, good news), fitting who they are and what they want, or null. Fields: "name", "what" (one sentence, past tense).' : '- "life": null.',
  "",
  "Answer with JSON only, no commentary:",
  `{"talks": [{"between": ["Name", "Name"], "texts": [{"from": "Name", "text": "..."}]${ask.tie ? ', "tie": "..."' : ""}}], "event": ${ask.event ? '{"title": "...", "what": "...", "days": 3}' : "null"}, "life": ${ask.life ? '{"name": "...", "what": "..."}' : "null"}${ask.people ? ', "people": []' : ""}}`,
].join("\n");

export interface WorldTurnResult {
  talks: { a: Character; b: Character; lines: { speakerId: number; text: string }[]; setting?: TalkSetting; tie?: string }[];
  event?: { title: string; text: string; days: number };
  life?: { who: Character; text: string };
  people?: FoundPerson[];
}

// The JSON object in a reply, fenced or not; also what the replay
// harness (#214) checks a saved world-turn reply with.
export const readWorldTurnJson = (reply: string): unknown => {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : reply;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end < start) return undefined;
  try {
    // Models leave trailing commas now and then.
    return JSON.parse(body.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1"));
  } catch {
    return undefined;
  }
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

// What came back, held to what was asked: talks only between the pairs
// offered, lines only from the two in them, an event and a life only when
// allowed. Names are matched loosely (case, first name). Undefined when
// the reply isn't JSON at all.
export const parseWorldTurn = (reply: string, cast: Character[], ask: WorldTurnAsk): WorldTurnResult | undefined => {
  const data = readWorldTurnJson(reply) as Record<string, any> | undefined;
  if (!data || typeof data !== "object") return undefined;
  const find = (name: unknown) => {
    const n = str(name, 80).toLowerCase();
    if (!n) return undefined;
    return cast.find((c) => c.name.toLowerCase() === n) || cast.find((c) => c.name.toLowerCase().split(/\s+/)[0] === n.split(/\s+/)[0]);
  };
  const talks: WorldTurnResult["talks"] = [];
  for (const t of Array.isArray(data.talks) ? data.talks.slice(0, 2) : []) {
    const [x, y] = Array.isArray(t?.between) ? t.between.map(find) : [];
    const pair = x && y && ask.pairs.find(([p, q]) => (p.id === x.id && q.id === y.id) || (p.id === y.id && q.id === x.id));
    if (!pair || talks.some((k) => k.a.id === pair[0].id && k.b.id === pair[1].id)) continue;
    const setting = ask.settings?.[ask.pairs.indexOf(pair)];
    const lines = (Array.isArray(t.texts) ? t.texts : [])
      .map((l: any) => ({ who: find(l?.from), text: str(l?.text, 400) }))
      .filter((l: { who?: Character; text: string }) => l.text && l.who && (l.who.id === pair[0].id || l.who.id === pair[1].id))
      .slice(0, setting ? linesFor(setting, ask.maxLines) : ask.maxLines)
      .map((l: { who: Character; text: string }) => ({ speakerId: l.who.id, text: l.text }));
    if (lines.length < 2) continue;
    // Stored on the lower id of the two (#145); the tie reads from the first named.
    const [a, b] = pair[0].id < pair[1].id ? pair : [pair[1], pair[0]];
    const tie = ask.tie ? str(t.tie, 130) : "";
    const flipped = tie && x!.id !== a.id ? tie.split("|").map((part: string) => part.trim()).reverse().join(" | ") : tie;
    talks.push({ a, b, lines, ...(setting ? { setting } : {}), ...(flipped ? { tie: flipped } : {}) });
  }
  const e = data.event;
  const title = ask.event && e && typeof e === "object" ? str(e.title, 80) : "";
  const what = title ? str(e.what ?? e.text, 400) : "";
  const event = title && what ? { title, text: what, days: Math.min(MAX_EVENT_DAYS, Math.max(1, Math.round(Number(e.days) || 3))) } : undefined;
  const l = data.life;
  const who = ask.life && l && typeof l === "object" ? find(l.name) : undefined;
  const lifeText = who ? str(l.what ?? l.text, 300) : "";
  const people: FoundPerson[] = ask.people && Array.isArray(data.people)
    ? data.people.map((p: any) => ({ name: str(p?.name, 40), about: str(p?.about, 80), whose: str(p?.whose, 60) })).filter((p: FoundPerson) => p.name && p.about).map((p: FoundPerson) => (p.whose ? p : { name: p.name, about: p.about }))
    : [];
  return { talks, ...(event ? { event } : {}), ...(who && lifeText ? { life: { who, text: lifeText } } : {}), ...(people.length ? { people } : {}) };
};

export const eventFromTurn = (event: NonNullable<WorldTurnResult["event"]>, id: string, now: number) => ({ id, title: event.title, text: event.text, at: now, endsAt: now + event.days * DAY });
