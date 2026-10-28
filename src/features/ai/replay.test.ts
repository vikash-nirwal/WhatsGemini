import { checkReply, contextOf, formatReport, REPLAY_CHECKS, replayAll } from "./replay";
import { guessReplyKind, REPLY_KINDS, ReplyLogEntry } from "./replyLog";
import talks from "./__replies__/talks.json";
import world from "./__replies__/world.json";
import plain from "./__replies__/plain.json";
import { buildWorldTalkPrompt } from "../world/worldTalk";
import { buildEventIdeaPrompt } from "../world/worldEvents";
import { buildFoldPrompt } from "../world/knowledge";
import { buildHangoutsPrompt } from "../world/places";
import { buildGapLivesPrompt, buildLifeEventPrompt } from "../world/worldLife";
import { buildFactionsPrompt } from "../world/factions";
import { buildSecretPrompt } from "../world/secrets";
import { buildArcPrompt } from "../world/worldArcs";
import { buildGoalPrompt } from "../world/goals";
import { buildReputationPrompt } from "../world/reputation";
import { buildCastSuggestionsPrompt } from "../world/worldAssist";
import { buildOffscreenTalkPrompt } from "../chat/offscreenTalk";
import { buildTheirGroupPrompt } from "../chat/theirGroup";
import { buildTakesPrompt } from "../world/announcements";
import { Character } from "../../types";

type Fixture = ReplyLogEntry & { note: string; expect: Record<string, string> | null };
const fixtures = [...talks, ...world, ...plain] as Fixture[];

describe("hand-written replies", () => {
  it.each(fixtures.map((f) => [`${f.kind}: ${f.note}`, f] as const))("%s", (_, f) => {
    // A kind no parser reads comes back undefined, written as null.
    const results = checkReply(f);
    expect(results ? Object.fromEntries(results.map((r) => [r.check, r.status])) : null).toEqual(f.expect);
  });

  it("every kind the log names has a checker and a good example", () => {
    for (const kind of REPLY_KINDS) {
      expect(REPLAY_CHECKS[kind]).toBeDefined();
      expect(fixtures.some((f) => f.kind === kind && f.expect && Object.values(f.expect).every((s) => s === "parsed" || s === "missing"))).toBe(true);
    }
  });
});

describe("replayAll", () => {
  it("counts each check and keeps examples of failures, malformed first", () => {
    const report = replayAll(fixtures);
    const talk = report.kinds.find((k) => k.kind === "world-talk")!;
    expect(talk.replies).toBe(4);
    const tie = talk.checks.find((c) => c.id === "TIE")!;
    expect([tie.parsed, tie.missing, tie.malformed]).toEqual([1, 1, 1]);
    // Left-out optional lines aren't examples; malformed ones are.
    expect(tie.examples.map((e) => e.status)).toEqual(["malformed"]);
    const shared = talk.checks.find((c) => c.id === "SHARED")!;
    expect(shared.examples.map((e) => e.status)).toEqual(["malformed", "missing"]);
    expect(report.unchecked).toEqual([{ kind: "status", replies: 1 }]);
    // In registry order, so the table reads the same every time.
    expect(report.kinds.map((k) => k.kind)).toEqual(Object.keys(REPLAY_CHECKS).filter((k) => report.kinds.some((r) => r.kind === k)));
  });

  it("formats a readable table", () => {
    const text = formatReport(replayAll(fixtures));
    expect(text).toMatch(/World talk \(world-talk\), 4 replies/);
    expect(text).toMatch(/TIE: x \| y \(optional\): 1 parsed, 1 missing \(33%\), 1 malformed \(33%\)/);
    expect(text).toMatch(/Not checked \(no parser\): status 1/);
    expect(formatReport(replayAll([]))).toBe("No replies.");
  });
});

describe("contextOf", () => {
  it("reads names from the reply when the prompt has none", () => {
    const ctx = contextOf({ instruction: "", reply: "Kai: hi\nMira: hey\nKai: you up?\nSHARED: none" });
    expect(ctx.cast.map((c) => c.name)).toEqual(["Kai", "Mira"]);
  });
});

// The fingerprints must match the prompts as the app builds them, so a
// change to a prompt that breaks the guess shows up here.
describe("guessReplyKind", () => {
  const c = (id: number, name: string, extra: Partial<Character> = {}) => ({ id, name, description: `${name} lives here`, prompt: "", ...extra }) as Character;
  const kai = c(1, "Kai", { ties: [{ withId: 2, tie: "friend" }] } as Partial<Character>);
  const mira = c(2, "Mira");
  const world = { id: 1, name: "Harbor Bay", premise: "a foggy fishing town" } as never;

  it.each([
    ["world-talk", buildWorldTalkPrompt(kai, mira, { userName: "Sam", maxLines: 6, askTie: true })],
    ["offscreen-talk", buildOffscreenTalkPrompt(kai, mira, "Sam", [], "Kai: hi")],
    ["their-group", buildTheirGroupPrompt([kai, mira], "Night shift", [], { limit: 6, userName: "Sam" })],
    ["memory-fold", buildFoldPrompt(kai, [], [kai, mira])],
    ["goal", buildGoalPrompt(kai, "Harbor Bay")],
    ["world-event", buildEventIdeaPrompt(world, ["Kai"], [])],
    ["secret", buildSecretPrompt(kai, mira, undefined, "Sam")],
    ["world-arc", buildArcPrompt(world, ["Kai"], "Sam")],
    ["hangouts", buildHangoutsPrompt("Harbor Bay", [{ id: "p1", name: "Docks" } as never], [kai])],
    ["cast-suggestions", buildCastSuggestionsPrompt({ name: "Harbor Bay" } as never, [{ name: "Kai" }])],
    ["life-event", buildLifeEventPrompt(kai, world, [])],
    ["gap-lives", buildGapLivesPrompt(world, "2 weeks", undefined, [kai, mira], true)],
    ["reputation", buildReputationPrompt(world, "Sam", [kai], [])],
    ["factions", buildFactionsPrompt(world, [kai, mira], [])],
    ["announcement", buildTakesPrompt(world, "The harbor is closed.", [kai, mira])],
  ])("%s", (kind, prompt) => {
    expect(guessReplyKind(prompt)).toBe(kind);
  });

  it("leaves other prompts unnamed", () => {
    expect(guessReplyKind("Expand this personality idea: a grumpy baker")).toBeUndefined();
  });
});
