import { Character, MapPin } from "../../types";
import { ReplyLogEntry } from "./replyLog";
import { parseTieChange } from "../world/worldTalk";
import { cleanFold, parseNewFact, parseShared } from "../world/knowledge";
import { cleanGoal, parseGoalProgress } from "../world/goals";
import { parseEvent } from "../world/worldEvents";
import { readWorldTurnJson } from "../world/worldTurn";
import { cleanCatchUp } from "../world/catchUp";
import { parseAftermath } from "../world/aftermath";
import { parsePeople } from "../world/extras";
import { parseSecret } from "../world/secrets";
import { parseArc } from "../world/worldArcs";
import { parseHangouts } from "../world/places";
import { parseCastSuggestions } from "../world/worldAssist";
import { cleanLifeEvent, parseGapLives } from "../world/worldLife";
import { cleanReputation } from "../world/reputation";
import { parseFactions } from "../world/factions";
import { parseOffscreenTalk } from "../chat/offscreenTalk";
import { parseTheirLines } from "../chat/theirGroup";
import { cleanFirstText } from "../character/firstTexts";
import { parseTakes } from "../world/announcements";

// Prompt replay (#214): saved helper replies run through the same parsers
// the world engine uses, to see how often each tag or line comes back
// missing or malformed. Pure, so the app's "Check them" button, the unit
// tests and scripts/replay-replies.js all read a log the same way.

export type ReplayStatus = "parsed" | "missing" | "malformed";

// The people and places a parser matches names against. A saved reply has
// no cast with it, so they're read back out of the prompt (and, failing
// that, the reply's own "Name:" lines): enough to tell a format slip from a
// good reply, though not whether the model picked the right person.
export interface ReplayContext {
  cast: Character[];
  pins: MapPin[];
}

interface Check {
  id: string;
  label: string;
  // An optional line may be left out ("most talks change nothing"), so a
  // missing one is normal; a malformed one never is.
  optional?: boolean;
  // Not counted when the prompt never asked for it.
  asked?: (instruction: string) => boolean;
  // The tag shows up at all, even in a shape the parser can't read.
  present: (reply: string) => boolean;
  parses: (reply: string, ctx: ReplayContext) => boolean;
}

const asks = (tag: string) => (instruction: string) => instruction.includes(`${tag}:`);
const hasLine = (tag: string) => (reply: string) => new RegExp(`^[\\s*_#>-]*\\**${tag}\\b`, "im").test(reply);
const nonEmpty = (reply: string) => reply.trim().length > 0;

// "Sure! Here's the text:" or a code fence around plain text: the cleaner
// may let it through, but it ends up in the story.
const CHATTER = /^\s*(?:(?:sure|okay|ok|certainly|of course)[!,.]?\s+)?here(?:'s| is| are)\b[^\n]*:\s*$|^\s*```/im;

const plain = (label: string, clean: (reply: string) => string | undefined): Check => ({
  id: "text",
  label,
  present: nonEmpty,
  parses: (reply) => Boolean(clean(reply)) && !CHATTER.test(reply),
});

const talkLines = (label: string, read: (reply: string, ctx: ReplayContext) => unknown[]): Check => ({
  id: "lines",
  label,
  present: (reply) => /^[\s*_-]*[^:\n]{1,40}:\s*\S/m.test(reply),
  parses: (reply, ctx) => read(reply, ctx).length >= 2,
});

const SHARED_CHECK: Check = {
  id: "SHARED",
  label: "SHARED: n, or none",
  asked: asks("SHARED"),
  present: hasLine("SHARED"),
  parses: (reply) => parseShared(reply).length > 0 || /^[\s*_-]*SHARED\s*:\s*\**\s*(?:none|nothing|-|n\/a)\b/im.test(reply),
};

const NEW_CHECK: Check = {
  id: "NEW",
  label: "NEW: one sentence",
  optional: true,
  asked: asks("NEW"),
  // "NEW: none" is the same as leaving it out.
  present: (reply) => hasLine("NEW")(reply) && !/^[\s*_-]*NEW\s*:\s*\**\s*(?:none|nothing|n\/a)\b/im.test(reply),
  parses: (reply) => Boolean(parseNewFact(reply)),
};

const pairOf = (ctx: ReplayContext): [Character, Character] => [ctx.cast[0] || person(1, "?"), ctx.cast[1] || person(2, "?")];

export const REPLAY_CHECKS: Record<string, { label: string; checks: Check[] }> = {
  "world-talk": {
    label: "World talk",
    checks: [
      talkLines("Name: text lines", (reply, ctx) => parseOffscreenTalk(reply, pairOf(ctx), 20)),
      { id: "TIE", label: "TIE: x | y", optional: true, asked: asks("TIE"), present: hasLine("TIE"), parses: (reply) => Boolean(parseTieChange(reply)) },
      { id: "PERSON", label: "PERSON: name | who | whose", optional: true, asked: asks("PERSON"), present: hasLine("PERSON"), parses: (reply) => parsePeople(reply).length > 0 },
      SHARED_CHECK,
      NEW_CHECK,
      { id: "GOAL", label: "GOAL: name: progress", optional: true, asked: asks("GOAL"), present: hasLine("GOAL"), parses: (reply, ctx) => parseGoalProgress(reply, ctx.cast).length > 0 },
    ],
  },
  "offscreen-talk": {
    label: "Group members' private talk",
    checks: [talkLines("Name: text lines", (reply, ctx) => parseOffscreenTalk(reply, pairOf(ctx))), SHARED_CHECK, NEW_CHECK],
  },
  "their-group": {
    label: "A group of theirs",
    checks: [talkLines("Name: text lines", (reply, ctx) => parseTheirLines(reply, ctx.cast, 20)), SHARED_CHECK, NEW_CHECK],
  },
  "memory-fold": { label: "Memory condensing", checks: [plain("One paragraph", cleanFold)] },
  goal: { label: "Goal for the week", checks: [plain("One sentence", cleanGoal)] },
  "world-turn": {
    label: "World turn",
    checks: [
      { id: "json", label: "JSON with talks, event, life", present: (reply) => reply.includes("{"), parses: (reply) => Array.isArray((readWorldTurnJson(reply) as { talks?: unknown } | undefined)?.talks) },
    ],
  },
  aftermath: {
    label: "Event aftermath",
    checks: [
      { id: "TRADITION", label: "TRADITION: yes or no", present: hasLine("TRADITION"), parses: (reply) => /^[\s*_-]*TRADITION\s*:\s*\**\s*(yes|no)\b/im.test(reply) },
      { id: "FACT", label: "FACT: a sentence", optional: true, present: hasLine("FACT"), parses: (reply) => Boolean(parseAftermath(reply, [], [], 0).fact) },
    ],
  },
  announcement: {
    label: "Takes on an announcement",
    checks: [{ id: "TAKES", label: "NAME :: take :: status lines", present: (reply) => reply.includes("::"), parses: (reply, ctx) => Object.keys(parseTakes(reply, ctx.cast as never).takes).length > 0 }],
  },
  "catch-up": { label: "What you missed", checks: [plain("A few sentences", cleanCatchUp)] },
  "world-event": {
    label: "World event",
    checks: [
      { id: "event", label: "TITLE and WHAT", present: (reply) => hasLine("TITLE")(reply) || hasLine("WHAT")(reply), parses: (reply) => Boolean(parseEvent(reply, 0)) },
      { id: "DAYS", label: "DAYS: a number", present: hasLine("DAYS"), parses: (reply) => /^[\s*_-]*DAYS\s*:\s*\**\s*\d+/im.test(reply) },
    ],
  },
  secret: {
    label: "Secret",
    checks: [
      { id: "SECRET", label: "SECRET: sentence", present: hasLine("SECRET"), parses: (reply) => Boolean(parseSecret(reply)) },
      { id: "GOSSIP", label: "GOSSIP: text", asked: asks("GOSSIP"), present: hasLine("GOSSIP"), parses: (reply) => Boolean(parseSecret(reply)?.gossip) },
    ],
  },
  "world-arc": {
    label: "Storyline",
    checks: [{ id: "arc", label: "TITLE and 2+ BEAT", present: (reply) => hasLine("TITLE")(reply) || hasLine("BEAT")(reply), parses: (reply) => Boolean(parseArc(reply, 0)) }],
  },
  hangouts: {
    label: "Usual spots",
    checks: [{ id: "lines", label: "name | place lines", present: (reply) => reply.includes("|"), parses: (reply, ctx) => Object.keys(parseHangouts(reply, ctx.cast, ctx.pins)).length > 0 }],
  },
  "cast-suggestions": {
    label: "New people",
    checks: [{ id: "json", label: "JSON list", present: (reply) => /[[{]/.test(reply), parses: (reply) => parseCastSuggestions(reply, []).length > 0 }],
  },
  "life-event": { label: "Life event", checks: [plain("One sentence", cleanLifeEvent)] },
  "gap-lives": {
    label: "Time passing",
    checks: [
      { id: "LIFE", label: "LIFE: name | sentence", present: hasLine("LIFE"), parses: (reply, ctx) => parseGapLives(reply, ctx.cast).lives.length > 0 },
      { id: "TIE", label: "TIE: a | b | x | y", optional: true, asked: asks("TIE"), present: hasLine("TIE"), parses: (reply, ctx) => parseGapLives(reply, ctx.cast).ties.length > 0 },
    ],
  },
  reputation: { label: "Reputation", checks: [plain("Two or three sentences", cleanReputation)] },
  factions: {
    label: "Families and factions",
    checks: [{ id: "GROUP", label: "GROUP: name | kind | members | about", present: hasLine("GROUP"), parses: (reply, ctx) => parseFactions(reply, ctx.cast).length > 0 }],
  },
  "first-text": { label: "First texts", checks: [plain("Just the text", cleanFirstText)] },
};

function person(id: number, name: string): Character {
  return { id, name } as Character;
}

const TAGS = new Set(["tie", "shared", "new", "goal", "life", "group", "title", "what", "days", "beat", "secret", "gossip"]);

const uniq = (names: string[]) => Array.from(new Set(names.map((n) => n.replace(/[*_"]/g, "").trim()).filter((n) => n && !TAGS.has(n.toLowerCase()))));

const namesInPrompt = (instruction: string): string[] => {
  const between = instruction.match(/conversation between (.+?) and (.+?)(?:,| who\b)/);
  const group = instruction.match(/a group chat between (.+?)\. /)?.[1].split(/,\s*|\s+and\s+/);
  // Lists of people: "- Kai: barista ..." (cast, places, time passing, factions).
  const listed = Array.from(instruction.matchAll(/^- ([A-Z][^:|(),.\n]{0,38}?)\s*(?::|\||\()/gm)).map((m) => m[1]);
  return uniq([...(between ? [between[1], between[2]] : []), ...(group || []), ...listed]);
};

const speakersInReply = (reply: string): string[] => {
  const counts = new Map<string, number>();
  // "Kai: text" talk lines, and "Kai | ..." rows (usual spots, time passing).
  const found = [...Array.from(reply.matchAll(/^[\s*_-]*([^:|\n]{1,40}?)\**\s*:/gm)), ...Array.from(reply.matchAll(/^[\s*_-]*(?:LIFE\s*:\s*)?([^:|\n]{1,40}?)\s*\|/gim))];
  for (const m of found) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  return uniq(Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([n]) => n));
};

export const contextOf = (entry: Pick<ReplyLogEntry, "instruction" | "reply">): ReplayContext => {
  const names = namesInPrompt(entry.instruction || "");
  const all = names.length >= 2 ? names : uniq([...names, ...speakersInReply(entry.reply)]);
  const placeList = (entry.instruction || "").match(/^Places in .+?: (.+)\.$/m)?.[1].split(/,\s*/);
  // Without the prompt, the places are whatever the reply names.
  const places = placeList || entry.reply.split("\n").map((l) => l.split("|")[1]?.replace(/[*_"]/g, "").trim()).filter((p): p is string => Boolean(p));
  return {
    cast: all.map((name, i) => person(i + 1, name)),
    pins: places.map((name, i) => ({ id: `pin-${i}`, name }) as MapPin),
  };
};

export interface CheckResult {
  check: string;
  status: ReplayStatus;
}

// One reply's checks, or undefined for a kind no parser reads.
export const checkReply = (entry: Pick<ReplyLogEntry, "kind" | "instruction" | "reply">): CheckResult[] | undefined => {
  const spec = REPLAY_CHECKS[entry.kind];
  if (!spec) return undefined;
  const ctx = contextOf(entry);
  return spec.checks
    .filter((c) => !c.asked || !entry.instruction || c.asked(entry.instruction))
    .map((c): CheckResult => ({ check: c.id, status: c.parses(entry.reply, ctx) ? "parsed" : c.present(entry.reply) ? "malformed" : "missing" }));
};

export interface ReplayFailure {
  status: Exclude<ReplayStatus, "parsed">;
  at: number;
  model?: string;
  reply: string;
}

export interface CheckReport {
  id: string;
  label: string;
  optional: boolean;
  parsed: number;
  missing: number;
  malformed: number;
  examples: ReplayFailure[]; // a few, malformed first
}

export interface KindReport {
  kind: string;
  label: string;
  replies: number;
  checks: CheckReport[];
}

export interface ReplayReport {
  kinds: KindReport[];
  unchecked: { kind: string; replies: number }[];
}

const EXAMPLES = 3;

export const replayAll = (entries: ReplyLogEntry[]): ReplayReport => {
  const kinds = new Map<string, KindReport>();
  const unchecked = new Map<string, number>();
  for (const entry of entries) {
    const results = checkReply(entry);
    if (!results) {
      unchecked.set(entry.kind, (unchecked.get(entry.kind) || 0) + 1);
      continue;
    }
    const spec = REPLAY_CHECKS[entry.kind];
    let report = kinds.get(entry.kind);
    if (!report) {
      report = { kind: entry.kind, label: spec.label, replies: 0, checks: spec.checks.map((c) => ({ id: c.id, label: c.label, optional: Boolean(c.optional), parsed: 0, missing: 0, malformed: 0, examples: [] })) };
      kinds.set(entry.kind, report);
    }
    report.replies++;
    for (const r of results) {
      const row = report.checks.find((c) => c.id === r.check)!;
      row[r.status]++;
      // A left-out optional line is the expected case, not an example.
      if (r.status === "parsed" || (r.status === "missing" && row.optional)) continue;
      row.examples.push({ status: r.status, at: entry.at, ...(entry.model ? { model: entry.model } : {}), reply: entry.reply.slice(0, 600) });
      row.examples.sort((a, b) => (a.status === b.status ? 0 : a.status === "malformed" ? -1 : 1));
      row.examples.splice(EXAMPLES);
    }
  }
  const order = Object.keys(REPLAY_CHECKS);
  return {
    kinds: Array.from(kinds.values()).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)),
    unchecked: Array.from(unchecked.entries()).map(([kind, replies]) => ({ kind, replies })),
  };
};

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "-");

// A plain-text table, for the script and the console.
export const formatReport = (report: ReplayReport): string => {
  const rows: string[] = [];
  for (const k of report.kinds) {
    rows.push(`${k.label} (${k.kind}), ${k.replies} ${k.replies === 1 ? "reply" : "replies"}`);
    for (const c of k.checks) {
      const total = c.parsed + c.missing + c.malformed;
      if (!total) continue;
      rows.push(`  ${c.label}${c.optional ? " (optional)" : ""}: ${c.parsed} parsed, ${c.missing} missing (${pct(c.missing, total)}), ${c.malformed} malformed (${pct(c.malformed, total)})`);
      for (const ex of c.examples) rows.push(`    ${ex.status}${ex.model ? ` [${ex.model}]` : ""}: ${JSON.stringify(ex.reply.slice(0, 200))}`);
    }
  }
  if (report.unchecked.length) rows.push(`Not checked (no parser): ${report.unchecked.map((u) => `${u.kind} ${u.replies}`).join(", ")}`);
  return rows.join("\n") || "No replies.";
};
