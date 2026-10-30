import { settingFormat, settingOpening, TalkSetting } from "./talkMedium";
import { PERSON_ASK } from "./extras";
import { Character, World, WorldTalk } from "../../types";
import { worldOf } from "./currentWorld";
import { SHARE_ASK } from "./knowledge";
import { announcementsLine } from "./announcements";
import { GOAL_ASK, goalLine } from "./goals";
import { Acquaintance, acquainted, Meeting, meetingLine } from "./meetings";
import { worldLanguageLine } from "./worldVoice";

// Life inside a world (#145): characters who know each other text on their
// own, one helper call per exchange. Who talks follows "who knows whom"
// (#74) and the wizard's ties (#144): a big world doesn't mean everyone
// talks to everyone.

export const WORLD_TALK_GAP_MS = 6 * 60 * 60 * 1000; // per pair, before the life dial
const KEEP_TALKS = 6; // per pair
const NOTE_FRESH_MS = 2 * 24 * 60 * 60 * 1000;

const holderOf = (a: number, b: number) => Math.min(a, b);

// Whether two people know each other well enough to talk on their own. Only
// the acquainted do (#236): tied, knowing of each other, having met, in a
// group or a family together. Strangers in a made world meet first
// (meetings.ts), so a world you never set connections for still comes alive.
export const knowEachOther = (a: Character, b: Character, ctx?: Acquaintance) => acquainted(a, b, ctx);

export const talksBetween = (characters: Character[], a: number, b: number): WorldTalk[] => {
  const holder = characters.find((c) => c.id === holderOf(a, b));
  const other = a === holder?.id ? b : a;
  return (holder?.talks || []).filter((t) => t.withId === other);
};

// The pair whose last talk is longest ago, among those due and awake.
export const pickWorldTalk = (
  characters: Character[],
  worlds: World[],
  now: number,
  {
    gapMs = WORLD_TALK_GAP_MS,
    awake = (): boolean => true,
    worldAllowed = (): boolean => true,
    gapFor,
    known = knowEachOther,
  }: { gapMs?: number; awake?: (c: Character) => boolean; worldAllowed?: (worldId: number | null) => boolean; gapFor?: (a: Character, b: Character) => number; known?: (a: Character, b: Character) => boolean } = {}
): [Character, Character] | undefined => {
  let best: { pair: [Character, Character]; last: number } | undefined;
  for (let i = 0; i < characters.length; i++) {
    for (let j = i + 1; j < characters.length; j++) {
      const a = characters[i], b = characters[j];
      const world = worldOf(a, worlds);
      if (world !== worldOf(b, worlds) || !worldAllowed(world) || !known(a, b)) continue;
      const last = talksBetween(characters, a.id, b.id).reduce((m, t) => Math.max(m, t.at), 0);
      if (now - last < (gapFor ? gapFor(a, b) : gapMs) || !awake(a) || !awake(b)) continue;
      if (!best || last < best.last) best = { pair: a.id < b.id ? [a, b] : [b, a], last };
    }
  }
  return best?.pair;
};

const tieOf = (from: Character, to: Character) => from.ties?.find((t) => t.withId === to.id)?.tie;
// How they know each other (#237), from either side.
const storyOf = (from: Character, to: Character) => from.ties?.find((t) => t.withId === to.id)?.story || to.ties?.find((t) => t.withId === from.id)?.story;

// What a talk is about (#159): picked each time so their threads vary, and
// so the user - whom the roleplay is for - comes up now and then.
export type TalkTopic = "user" | "lives" | "tie" | "plan" | "news" | "follow-up" | "groups";

export const pickTalkTopic = (
  { hasTie, hasNews, hasPrevious, hasGroups = false }: { hasTie: boolean; hasNews: boolean; hasPrevious: boolean; hasGroups?: boolean },
  rand: () => number = Math.random
): TalkTopic => {
  const weights: [TalkTopic, number][] = [
    ["user", 0.3],
    ["lives", 0.25],
    ["plan", 0.1],
    ...(hasTie ? ([["tie", 0.15]] as [TalkTopic, number][]) : []),
    ...(hasNews ? ([["news", 0.1]] as [TalkTopic, number][]) : []),
    ...(hasPrevious ? ([["follow-up", 0.15]] as [TalkTopic, number][]) : []),
    // Families and factions drive talk (#185).
    ...(hasGroups ? ([["groups", 0.15]] as [TalkTopic, number][]) : []),
  ];
  const total = weights.reduce((n, [, w]) => n + w, 0);
  let r = rand() * total;
  for (const [topic, w] of weights) if ((r -= w) < 0) return topic;
  return "lives";
};

// What one of them knows about the user, for talk about the user: who the
// user is to them, how recently they talked, and a few things they remember.
export interface UserKnowledge {
  relationship?: string;
  lastTalked?: string; // "today", "3 days ago", "not for weeks"
  facts: string[];
}

export const recencyOf = (lastAt: number | undefined, now: number) => {
  if (!lastAt) return "never one to one";
  const days = Math.floor((now - lastAt) / 86_400_000);
  return days < 1 ? "today" : days === 1 ? "yesterday" : days < 14 ? `${days} days ago` : "not for weeks";
};

const TOPIC_ASK = (t: TalkTopic, a: Character, b: Character, userName: string, worldName?: string, news?: string, groups?: Record<number, string[]>) => {
  const tie = tieOf(a, b)?.replace(/^your\s+/i, "");
  switch (t) {
    case "user":
      return `This time they get onto ${userName}: how ${userName} is, something ${userName} said or did lately, how each of them feels about ${userName}. Ground it in what each actually knows (below) - they haven't read each other's chats, may see ${userName} differently, and can disagree. Curious, fond, teasing or worried as fits them; never a summary of a chat.`;
    case "tie":
      return `Something only ${b.name}'s ${tie || "friend"} would bring up: shared history, an old joke, a sore point between them.`;
    case "plan":
      return "Making a plan, asking a favour, or one of them needs something.";
    case "news":
      return `What's going on in ${worldName || "town"} lately${news ? `: ${news.slice(0, 200)}` : ""} - and what they make of it.`;
    case "groups": {
      const ga = groups?.[a.id] || [], gb = groups?.[b.id] || [];
      const shared = ga.filter((g) => gb.includes(g));
      return shared.length
        ? `Their own ${shared[0]} business: loyalty, a family matter, what the group should do, how they feel about the other groups here.`
        : `The groups they belong to${ga.length ? ` (${a.name}: ${ga.join(", ")})` : ""}${gb.length ? ` (${b.name}: ${gb.join(", ")})` : ""}: rivalry, a grudge, a deal, or what one side says about the other - each loyal to their own.`;
    }
    case "follow-up":
      return "They pick up where they left off last time (below): what happened since, an answer to a question, the plan they made.";
    default:
      return "Their own lives: work, family, money, health, something that happened today.";
  }
};

export const buildWorldTalkPrompt = (
  a: Character,
  b: Character,
  { world, userName, maxLines, previous, topic = "lives", knows, news, askTie, groups, sceneNow, share, goals, standing, setting = { kind: "texts" }, extras, askPeople, canon, meeting }: {
    world?: World;
    userName: string;
    maxLines: number;
    previous?: WorldTalk;
    topic?: TalkTopic;
    knows?: Record<number, UserKnowledge>;
    news?: string;
    askTie?: boolean; // let the talk change their relationship (#163)
    groups?: Record<number, string[]>; // the families and factions each belongs to (#185)
    sceneNow?: string; // the time and where each of them is (#205)
    share?: { text?: string; items: unknown[] }; // what one knows that the other may not (#204, #206)
    goals?: boolean; // what each wants this week leans the talk (#208)
    standing?: string; // how close or tense they are lately, and their moods (#211)
    setting?: TalkSetting; // texts, letters, or in person somewhere (#216)
    extras?: string; // the people around who aren't characters (#218)
    askPeople?: boolean; // ask for a PERSON line when someone new comes up (#218)
    canon?: string; // what's settled in this world (#220)
    meeting?: Meeting; // their first meeting (#236)
  }
) => {
  const who = (c: Character, other: Character) =>
    `${c.name}: ${[c.description, c.prompt].filter(Boolean).join(" ").slice(0, 500)}${tieOf(c, other) ? ` (${other.name} is ${c.name}'s ${tieOf(c, other)!.replace(/^your\s+/i, "")}${storyOf(c, other) ? `: ${storyOf(c, other)}` : ""})` : ""}${c.dayLog?.text ? `\nTheir day so far: ${c.dayLog.text.slice(0, 300)}` : ""}${c.lifeEvents?.length ? `\nLately in their life: ${c.lifeEvents.slice(-2).map((e) => e.text).join(" ")}` : ""}${groups?.[c.id]?.length ? `\nBelongs to: ${groups[c.id].join(", ")} (loyal to their own)` : ""}${goals && goalLine(c) ? `\n${goalLine(c)}` : ""}`;
  const knowing = (c: Character) => {
    const k = knows?.[c.id];
    if (!k) return undefined;
    return `What ${c.name} knows about ${userName}: ${[k.relationship && `${userName} is their ${k.relationship}`, k.lastTalked && `they last talked ${k.lastTalked}`, k.facts.length && `they remember: ${k.facts.join("; ")}`].filter(Boolean).join("; ")}.${c.spreadsRumors ? "" : ` ${c.name} doesn't pass on what ${userName} told them in private.`}`;
  };
  const names = { [a.id]: a.name, [b.id]: b.name };
  const tie = tieOf(a, b)?.replace(/^your\s+/i, "");
  return [
    meeting
      ? `${settingOpening(setting, a.name, b.name)}${world ? `, who both live in ${world.name}: ${world.premise}` : ""}. ${meetingLine(meeting, userName)}`
      : `${settingOpening(setting, a.name, b.name)}, who know each other${world ? ` and live in ${world.name}: ${world.premise}` : ""}. ${userName} isn't in it.`,
    ...(worldLanguageLine(world) ? [worldLanguageLine(world)!] : []),
    // God mode (#160): what the author made true holds here too.
    ...(world?.godTruths?.length ? [`Simply true in this world (never question it): ${world.godTruths.join("; ")}.`] : []),
    // Announcements: news they both heard, each taking it their own way.
    ...(announcementsLine(world, [a, b]) ? [announcementsLine(world, [a, b])] : []),
    ...(canon ? [canon] : []),
    ...(sceneNow ? [sceneNow] : []),
    "",
    who(a, b),
    who(b, a),
    ...(standing ? [standing] : []),
    ...(extras ? [extras] : []),
    ...(topic === "user" ? ["", knowing(a), knowing(b)].filter((x): x is string => x !== undefined) : []),
    ...(previous?.lines.length ? ["", previous.medium === "letters" ? "Their last letters:" : previous.medium === "in person" ? "The last time they talked:" : "The last time they texted:", ...previous.lines.map((l) => `${names[l.speakerId] || "?"}: ${l.text}`)] : []),
    ...(share?.text ? ["", share.text] : []),
    "",
    meeting ? "What it's about: who they are, what they do, how they know the town and the people in it; small talk that may or may not go somewhere." : `What it's about this time: ${TOPIC_ASK(topic, a, b, userName, world?.name, news, groups)}`,
    "",
    settingFormat(setting, a.name, maxLines),
    meeting ? "- Strangers meeting: no shared history, no nicknames, nothing either couldn't know yet."
    : tie || a.knowsAbout?.includes(b.id) || b.knowsAbout?.includes(a.id)
      ? `- ${setting.kind === "texts" ? "Text" : setting.kind === "letters" ? "Write" : "Talk"} the way ${tie ? `a ${tie} and ` : "people "}who know each other this well do: siblings bicker, exes are careful, old friends use shorthand, new acquaintances are polite.`
      // Neighbours in the same world who've never been connected (#181).
      : `- They only know each other a little, as people in the same place do: polite, curious, a bit careful - no shared history unless it comes up here.`,
    topic === "user" ? "" : `- ${userName} can come up in passing if it's natural, but it's not the point.`,
    `- Plain text, in character, ${setting.kind === "in person" ? "no stage directions beyond a brief gesture" : "no stage directions"}. Don't settle big story points or decide anything for ${userName}.`,
    ...(share ? SHARE_ASK(share.items.length > 0) : []),
    // Uneven, like real talk (#223): not everything gets settled.
    "- Not every talk settles something: plans can stay vague, a question can go unanswered, a thread can wait for next time.",
    askPeople ? PERSON_ASK : "",
    goals && (a.goal || b.goal) ? `- What they want this week can steer the talk: asking for help, a favour, a lead. ${GOAL_ASK.slice(2)}` : "",
    askTie ? `- Only if this conversation really changes how they stand with each other (a falling-out, making up, getting together, breaking up, becoming friends), end with one more line: TIE: <what ${b.name} is to ${a.name} now> | <what ${a.name} is to ${b.name} now>. Most conversations change nothing; then leave it out.` : "",
  ].filter(Boolean).join("\n");
};


// Relationships that drift (#163): how often a talk may change a tie. A talk
// about their tie always may; others now and then, so ties move slowly.
export const tieMayChange = (topic: TalkTopic, rand: () => number = Math.random) => topic === "tie" || rand() < 0.3;

// The "TIE: x | y" line a talk ends with when it changed things.
export const parseTieChange = (reply: string): { bToA: string; aToB: string } | undefined => {
  const m = reply.match(/^[\s*_-]*TIE\s*:\s*(.+)$/im);
  if (!m) return undefined;
  const [bToA, aToB] = m[1].split("|").map((s) => s.replace(/[*_]/g, "").trim().replace(/^["']|["']$/g, "").trim());
  if (!bToA || bToA.length > 60 || (aToB && aToB.length > 60)) return undefined;
  return { bToA, aToB: aToB || bToA };
};

// Strangers become friends (#181): after a few talks, two people with no
// tie get one, so neighbours grow into friends even with drift switched off.
export const FRIENDS_AFTER_TALKS = 3;
export const becameFriends = (characters: Character[], a: Character, b: Character) =>
  !a.ties?.some((t) => t.withId === b.id) && !b.ties?.some((t) => t.withId === a.id) && talksBetween(characters, a.id, b.id).filter((t) => t.lines.length).length >= FRIENDS_AFTER_TALKS;

// Kept per pair, not per holder (#224): the lower id of a busy world holds the
// talks with everyone, and a shared cap left them one talk per partner, so
// they never became friends (#181), lost the thread to follow up on, and
// looked like they'd never talked. An empty talk (a failed attempt) only
// marks when it was tried, so it replaces the pair's earlier empty one and
// never pushes out a real talk.
export const addWorldTalk = (holder: Character, talk: WorldTalk): Character => {
  const all = holder.talks || [];
  const others = all.filter((t) => t.withId !== talk.withId);
  const pair = all.filter((t) => t.withId === talk.withId && t.lines.length);
  const kept = talk.lines.length ? [...pair, talk].slice(-KEEP_TALKS) : [...pair, talk];
  return { ...holder, talks: [...others, ...kept].sort((x, y) => x.at - y.at) };
};

export interface TalkThread {
  a: Character;
  b: Character;
  talks: WorldTalk[];
  lastAt: number;
}

// Threads in one world, newest first, for Peek.
export const worldThreads = (characters: Character[], worlds: World[], worldId: number | null): TalkThread[] => {
  const here = characters.filter((c) => worldOf(c, worlds) === worldId);
  const threads: TalkThread[] = [];
  for (const holder of here) {
    const byOther = new Map<number, WorldTalk[]>();
    for (const t of holder.talks || []) byOther.set(t.withId, [...(byOther.get(t.withId) || []), t]);
    byOther.forEach((talks, otherId) => {
      const other = here.find((c) => c.id === otherId);
      if (other && talks.some((t) => t.lines.length)) threads.push({ a: holder, b: other, talks, lastAt: Math.max(...talks.map((t) => t.at)) });
    });
  }
  return threads.sort((x, y) => y.lastAt - x.lastAt);
};

// What the character's next replies are told: their latest talk, if recent.
export const worldTalkNoteFor = (character: Character | undefined, characters: Character[], now = Date.now()): string | undefined => {
  if (!character) return undefined;
  const mine = characters.flatMap((holder) =>
    (holder.talks || [])
      .filter((t) => holder.id === character.id || t.withId === character.id)
      .map((t) => ({ t, otherId: holder.id === character.id ? t.withId : holder.id }))
  );
  const latest = mine.filter(({ t }) => now - t.at < NOTE_FRESH_MS && t.lines.length).sort((x, y) => y.t.at - x.t.at)[0];
  if (!latest) return undefined;
  const other = characters.find((c) => c.id === latest.otherId);
  if (!other) return undefined;
  const names: Record<number, string> = { [character.id]: character.name, [other.id]: other.name };
  const how = latest.t.medium === "letters" ? `you and ${other.name} wrote to each other` : latest.t.medium === "in person" ? `you talked with ${other.name}${latest.t.place ? ` at ${latest.t.place}` : " in person"}` : `you texted ${other.name}`;
  return `Recently ${how}:\n${latest.t.lines.slice(-6).map((l) => `${names[l.speakerId]}: ${l.text}`).join("\n")}\nIt's part of your life; bring it up only if it fits.`;
};
