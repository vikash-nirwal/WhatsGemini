import { dbService } from "../../services/dbService";

// Helper replies (#214): the background world engine reads its helpers'
// replies with tag and line parsers (TIE:, SHARED:, GOAL:, TITLE:, ...), and
// nobody knows how often real models keep to those formats. With this
// switched on (off by default, on this device only) the last replies of
// each kind are kept, so they can be exported and run through the parsers
// again (replay.ts).

export const LS_REPLY_LOG_ON = "reply_log_on";
export const REPLY_LOG_KEY = "reply_log";
export const KEEP_PER_KIND = 30;
// Prompts run to a few thousand characters; the start is enough to see what
// was asked and to find the names the parsers match against.
export const INSTRUCTION_MAX = 4000;
const REPLY_MAX = 8000;

// One stable name per helper prompt. Callers of generateAssistText can pass
// one as `replyKind`; until they do, guessReplyKind recognises the prompt.
export const REPLY_KINDS = [
  "world-talk", // WorldTalker: text lines, then TIE / SHARED / NEW / GOAL
  "offscreen-talk", // OffscreenTalker: text lines, SHARED / NEW
  "their-group", // runTheirGroup: text lines, SHARED / NEW
  "memory-fold", // WorldTalker: cleanFold
  "goal", // WorldTalker: cleanGoal
  "world-event", // WorldEventWatcher, WorldEventsSection: TITLE / WHAT / DAYS
  "secret", // WorldEventWatcher: SECRET / GOSSIP
  "world-arc", // WorldArcSection: TITLE / BEAT
  "hangouts", // WorldEventWatcher: "name | place" lines
  "cast-suggestions", // WorldEventWatcher (newcomers), world assist: JSON list
  "life-event", // WorldEventWatcher: cleanLifeEvent
  "gap-lives", // passWorldTime: LIFE / TIE lines
  "reputation", // WorldEventWatcher: cleanReputation
  "factions", // FactionsSection: GROUP lines
  "first-text", // FirstTexter, GoBetween, news and plan texts: cleanFirstText
  "world-turn", // worldTurnJob (#212): one JSON object with talks, event, life
  "catch-up", // catchUpJob (#213): a few sentences of what you missed
  "aftermath", // writeAftermath (#219): PLACE / FACT / LIFE / TRADITION lines
] as const;
export type ReplyKind = (typeof REPLY_KINDS)[number];

// Each prompt has a line no other prompt has; these find it, so replies are
// sorted by prompt even while callers only name a coarse activity kind
// ("talk", "other"). The order matters only where a prompt quotes another.
const FINGERPRINTS: [ReplyKind, RegExp][] = [
  ["world-talk", /^Write a text conversation between /m],
  ["offscreen-talk", /^Write a short private conversation between /m],
  ["their-group", /", a group chat between /],
  ["memory-fold", /^Fold what .+ knows into one short paragraph/m],
  ["goal", /^What does .+ want this week\?/m],
  ["world-event", /^TITLE: <a short name, at most 6 words>/m],
  ["world-arc", /^BEAT: <first beat>/m],
  ["secret", /^SECRET: </m],
  ["hangouts", /^<name> \| <place>$/m],
  ["cast-suggestions", /"tieWith"/],
  ["gap-lives", /^LIFE: <name> \| <sentence>/m],
  ["life-event", /^Something just happened in .+'s life/m],
  ["reputation", /^Write .+'s reputation in /m],
  ["factions", /^GROUP: <name> \|/m],
];

export const guessReplyKind = (instruction: string): ReplyKind | undefined => FINGERPRINTS.find(([, re]) => re.test(instruction))?.[0];

export interface ReplyLogEntry {
  at: number;
  kind: string; // a ReplyKind, or a coarse activity kind for prompts not listed
  instruction: string;
  reply: string;
  model?: string;
}

export const replyLogOn = (): boolean => {
  try {
    return localStorage.getItem(LS_REPLY_LOG_ON) === "true";
  } catch {
    return false;
  }
};

export const setReplyLogOn = (on: boolean): void => {
  try {
    if (on) localStorage.setItem(LS_REPLY_LOG_ON, "true");
    else localStorage.removeItem(LS_REPLY_LOG_ON);
  } catch {
    // Only a convenience.
  }
};

// The newest KEEP_PER_KIND of each kind, oldest first.
export const addToReplyLog = (entries: ReplyLogEntry[], entry: ReplyLogEntry, keep = KEEP_PER_KIND): ReplyLogEntry[] => {
  const next = [...entries, entry];
  const sameKind = next.filter((e) => e.kind === entry.kind);
  if (sameKind.length <= keep) return next;
  const drop = new Set(sameKind.slice(0, sameKind.length - keep));
  return next.filter((e) => !drop.has(e));
};

const listeners = new Set<() => void>();
export const onReplyLog = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const loadReplyLog = async (): Promise<ReplyLogEntry[]> => {
  try {
    const value = await dbService.getSetting(REPLY_LOG_KEY);
    return Array.isArray(value) ? (value as ReplyLogEntry[]) : [];
  } catch {
    return [];
  }
};

// Background jobs finish close together; one write at a time, so two
// replies landing at once don't each overwrite the other's read.
let writing: Promise<void> = Promise.resolve();
const queue = (job: () => Promise<void>) => {
  writing = writing.then(job, job).catch(() => undefined);
  return writing;
};

export const clearReplyLog = () =>
  queue(async () => {
    await dbService.setSetting(REPLY_LOG_KEY, []);
    listeners.forEach((l) => l());
  });

// Called by generateAssistText with every reply. Does nothing while the
// switch is off, or for a prompt it can't name (the editor's assist buttons).
export const recordReply = ({ instruction, reply, model, kind, fallbackKind }: { instruction: string; reply: string; model?: string; kind?: string; fallbackKind?: string }, now = Date.now()): Promise<void> => {
  if (!replyLogOn()) return Promise.resolve();
  const named = kind || guessReplyKind(instruction) || fallbackKind;
  if (!named) return Promise.resolve();
  const entry: ReplyLogEntry = { at: now, kind: named, instruction: instruction.slice(0, INSTRUCTION_MAX), reply: reply.slice(0, REPLY_MAX), ...(model ? { model } : {}) };
  return queue(async () => {
    await dbService.setSetting(REPLY_LOG_KEY, addToReplyLog(await loadReplyLog(), entry));
    listeners.forEach((l) => l());
  });
};

// An exported log is { exportedAt, entries }; a bare array is read too.
export const exportReplyLog = (entries: ReplyLogEntry[], now = Date.now()) => JSON.stringify({ exportedAt: new Date(now).toISOString(), entries }, null, 2);

export const readReplyExport = (json: string): ReplyLogEntry[] => {
  const data = JSON.parse(json) as unknown;
  const list = Array.isArray(data) ? data : (data as { entries?: unknown })?.entries;
  if (!Array.isArray(list)) return [];
  return list.filter((e): e is ReplyLogEntry => Boolean(e) && typeof e.kind === "string" && typeof e.reply === "string").map((e) => ({ ...e, instruction: typeof e.instruction === "string" ? e.instruction : "" }));
};
