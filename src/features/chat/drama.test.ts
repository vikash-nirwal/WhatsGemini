import { Character, Chat, Message } from "../../types";
import { buildConflictSection, trustAfter, TRUST_DROP, upsetDelayMs } from "./conflicts";
import { addJokes, buildJokesSection, jokeCheckDue, parseJokesReply } from "./insideJokes";
import { jealousyNoteFor, timeElsewhere } from "./jealousy";
import { addLie, buildLiesSection, catchLie, standingLies } from "./lies";
import { buildRumorSection, lastRumorFrom, markRumorRaised, parseRumorReply, pendingRumors, pickListener, rumorDue, rumorListenersFor } from "../character/rumors";

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 21, 12);
const character = (id: number, name: string, extra: Partial<Character> = {}) => ({ id, name, description: "", prompt: "", ...extra } as Character);
const msg = (role: string, at: number, extra: Partial<Message> = {}): Message => ({ role, txt: "hi", timestamp: at, ...extra });
const chat = (id: number, characterIds: number[], content: Message[], extra: Partial<Chat> = {}) => ({ id, title: "", timestamp: 0, characterIds, content, ...extra } as Chat);

describe("fights (#97)", () => {
  it("tells the character how to stay upset and how it mends", () => {
    const section = buildConflictSection("Aria", "Sam", { about: "the joke about her art", since: NOW - 2 * HOUR }, NOW);
    expect(section).toContain("Aria is upset with Sam about: the joke about her art (for 2 hours now)");
    expect(section).toContain("[Made up]");
  });

  it("moves trust down on a fight and up on making up", () => {
    expect(trustAfter({ trust: 50 }, "upset")).toEqual({ trust: 50 - TRUST_DROP });
    expect(trustAfter({ trust: 95 }, "made-up")).toEqual({ trust: 100 });
    expect(trustAfter({ meters: { trust: 10, desire: 5 } }, "upset")).toEqual({ meters: { trust: 0, desire: 5 } });
    expect(trustAfter({ location: "cafe" }, "upset")).toBeUndefined();
    expect(upsetDelayMs(() => 0.5)).toBe(5500);
  });
});

describe("inside jokes (#96)", () => {
  it("checks every 30 messages and keeps only new lines", () => {
    expect(jokeCheckDue(29, undefined)).toBe(false);
    expect(jokeCheckDue(60, 30)).toBe(true);
    const existing = addJokes([], ["Aria calls Sam 'Captain'"], NOW);
    expect(parseJokesReply("- Aria calls Sam 'Captain'\n- The pineapple pizza feud\n- Saying goodnight in French", existing)).toEqual(["The pineapple pizza feud", "Saying goodnight in French"]);
    expect(parseJokesReply("NONE", existing)).toEqual([]);
    expect(buildJokesSection(existing, "Aria", "Sam")).toContain("- Aria calls Sam 'Captain'");
    expect(buildJokesSection([], "Aria", "Sam")).toBeUndefined();
  });
});

describe("jealousy (#99)", () => {
  const aria = character(1, "Aria", { knowsAbout: [2], intimacy: { jealousy: "quietly possessive" } });
  const characters = [aria, character(2, "Kai"), character(3, "Mia")];
  const here = chat(1, [1], [msg("ai", NOW - 5 * HOUR)], { jealousy: true });
  const busy = (n: number, id: number, chatId: number) => chat(chatId, [id], Array.from({ length: n }, (_, i) => msg("you", NOW - 4 * HOUR + i * 60_000)));

  it("notices a lot of time spent elsewhere, naming only who they know of", () => {
    const away = timeElsewhere(aria, here, [here, busy(5, 2, 2), busy(4, 3, 3)], characters, NOW);
    expect(away).toMatchObject({ known: ["Kai"], unknown: 1, messages: 9 });
    const note = jealousyNoteFor(aria, here, [here, busy(5, 2, 2), busy(4, 3, 3)], characters, "Sam", NOW)!;
    expect(note).toContain("busy chatting with Kai and someone else");
    expect(note).toContain("quietly possessive");
  });

  it("stays quiet for a short gap, a little chatting, strangers or with the switch off", () => {
    expect(jealousyNoteFor(aria, here, [here, busy(3, 2, 2)], characters, "Sam", NOW)).toBeUndefined();
    expect(jealousyNoteFor(aria, { ...here, content: [msg("ai", NOW - 10 * 60_000)] }, [here, busy(9, 2, 2)], characters, "Sam", NOW)).toBeUndefined();
    expect(jealousyNoteFor(aria, { ...here, stage: "strangers" }, [here, busy(9, 2, 2)], characters, "Sam", NOW)).toBeUndefined();
    expect(jealousyNoteFor(aria, { ...here, jealousy: undefined }, [here, busy(9, 2, 2)], characters, "Sam", NOW)).toBeUndefined();
  });
});

describe("lies (#100)", () => {
  it("keeps lies with their truth, and catches the n-th standing one", () => {
    let lies = addLie([], "I was home all night, reading.", "she was at the party", NOW);
    lies = addLie(lies, "I love the scarf!", "she hates it", NOW + 1);
    expect(standingLies(lies).map((l) => l.truth)).toEqual(["she was at the party", "she hates it"]);
    const caught = catchLie(lies, 2, NOW + 2)!;
    expect(standingLies(caught).map((l) => l.truth)).toEqual(["she was at the party"]);
    expect(catchLie(lies, 5, NOW)).toBeUndefined();
    const section = buildLiesSection("Aria", "Sam", caught);
    expect(section).toContain("[Lie: the truth, in a few words]");
    expect(section).toContain('1. You said: "I was home all night, reading." (the truth: she was at the party)');
    expect(buildLiesSection("Aria", "Sam", [])).not.toContain("still stand");
  });
});

describe("rumors (#98)", () => {
  const kai = character(2, "Kai", { spreadsRumors: true });
  const aria = character(1, "Aria", { knowsAbout: [2] });
  const mia = character(3, "Mia");
  const room = chat(9, [2, 3], []);
  const kaiChat = chat(2, [2], Array.from({ length: 6 }, (_, i) => msg("you", NOW - HOUR + i)));

  it("reaches characters who know of them or share a group", () => {
    expect(rumorListenersFor(kai, [aria, kai, mia], [room, kaiChat]).map((c) => c.name)).toEqual(["Aria", "Mia"]);
    expect(rumorListenersFor(kai, [aria, kai, mia], [kaiChat]).map((c) => c.name)).toEqual(["Aria"]);
  });

  it("goes out after enough new talk, a day apart", () => {
    expect(rumorDue(kai, kaiChat, [aria, kai], [kaiChat], NOW)).toBe(true);
    expect(rumorDue({ ...kai, spreadsRumors: undefined }, kaiChat, [aria, kai], [kaiChat], NOW)).toBe(false);
    const heard = { ...aria, rumors: [{ id: "r", fromId: 2, heard: "x", truth: "y", at: NOW - 2 * HOUR }] };
    expect(lastRumorFrom(2, [heard, kai])).toBe(NOW - 2 * HOUR);
    expect(rumorDue(kai, kaiChat, [heard, kai], [kaiChat], NOW)).toBe(false);
    expect(rumorDue(kai, chat(2, [2], [msg("you", NOW)]), [aria, kai], [], NOW)).toBe(false);
  });

  it("parses what was heard, and is raised once", () => {
    expect(parseRumorReply("TRUTH: Sam said they might visit Rome\nHEARD: Sam is moving to Rome for good")).toEqual({ truth: "Sam said they might visit Rome", heard: "Sam is moving to Rome for good" });
    expect(parseRumorReply("NONE")).toBeUndefined();
    const rumor = { id: "r", fromId: 2, heard: "Sam is moving to Rome", truth: "a visit", at: NOW };
    const listener = { ...aria, rumors: [rumor] };
    expect(pendingRumors(listener, NOW).map((r) => r.id)).toEqual(["r"]);
    expect(pendingRumors({ rumors: markRumorRaised([rumor], "r", NOW) }, NOW)).toEqual([]);
    expect(pickListener([listener, mia], NOW)?.name).toBe("Mia");
    expect(buildRumorSection("Aria", "Sam", rumor, "Kai")).toContain('heard a rumor about Sam, through Kai: "Sam is moving to Rome"');
  });
});
