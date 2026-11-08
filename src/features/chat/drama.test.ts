import { Character, Chat, Message } from "../../types";
import { buildConflictSection, fightChange, groupConflictNoteFor, trustAfter, TRUST_DROP, upsetDelayMs } from "./conflicts";
import { addJokes, buildGroupJokesPrompt, buildGroupJokesSection, buildJokesSection, jokeCheckDue, parseJokesReply } from "./insideJokes";
import { extractStoryTags } from "./storyTags";
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

describe("fights and inside jokes in a group (#250)", () => {
  const members = [{ id: 1, name: "Aria" }, { id: 2, name: "Kai" }];
  const fight = { about: "the burnt toast joke", since: NOW - HOUR, withId: 2 };

  it("gives the fight to the member it's with and a line of tension to the others", () => {
    const room = { conflicts: true, conflict: fight };
    expect(groupConflictNoteFor(room, members[1], members, "Sam", NOW)).toContain("Kai is upset with Sam about: the burnt toast joke (for 1 hour now)");
    const aria = groupConflictNoteFor(room, members[0], members, "Sam", NOW)!;
    expect(aria).toBe("Kai is upset with Sam right now (about: the burnt toast joke). You may notice the tension, in a line at most; it's their fight, not yours.");
    expect(aria).not.toContain("[Made up]");
  });

  it("tells every member how a fight starts while none is on, and nothing when fights are off", () => {
    expect(groupConflictNoteFor({ conflicts: true }, members[0], members, "Sam", NOW)).toContain("add [Upset: what about, in a few words]");
    expect(groupConflictNoteFor({ conflict: fight }, members[1], members, "Sam", NOW)).toBeUndefined();
    // The member it was with has left the group.
    expect(groupConflictNoteFor({ conflicts: true, conflict: { ...fight, withId: 9 } }, members[0], members, "Sam", NOW)).toBeUndefined();
  });

  it("starts a fight from the speaker's [Upset:] tag and only they can make up", () => {
    const upsetTags = extractStoryTags("Wow. Okay.\n[Upset: the burnt toast joke]").tags;
    expect(fightChange({ conflicts: true }, upsetTags, true, 2)).toEqual({ upset: true, madeUp: false });
    expect(fightChange({ conflicts: true, conflict: fight }, upsetTags, true, 1).upset).toBe(false);
    const madeUp = extractStoryTags("Fine, you're forgiven.\n[Made up]").tags;
    expect(fightChange({ conflicts: true, conflict: fight }, madeUp, true, 1).madeUp).toBe(false);
    expect(fightChange({ conflicts: true, conflict: fight }, madeUp, true, 2).madeUp).toBe(true);
  });

  it("keeps a 1:1 chat's fights as they were", () => {
    const tags = { upset: "x" };
    expect(fightChange({ conflicts: true }, tags, false, undefined).upset).toBe(true);
    expect(fightChange({ conflicts: true, conflict: { about: "x", since: 0 } }, { madeUp: true }, false, 5).madeUp).toBe(true);
    expect(fightChange({}, tags, false, 1).upset).toBe(false);
  });

  it("shares the group's inside jokes with every member and asks about the whole group", () => {
    const jokes = addJokes([], ["Everyone calls Sam 'Captain'"], NOW);
    expect(buildGroupJokesSection(jokes, ["Aria", "Kai"], "Sam")).toContain("Things only this group shares (Sam, Aria and Kai)");
    expect(buildGroupJokesSection(jokes, ["Aria", "Kai"], "Sam")).toContain("- Everyone calls Sam 'Captain'");
    expect(buildGroupJokesSection([], ["Aria", "Kai"], "Sam")).toBeUndefined();
    const prompt = buildGroupJokesPrompt(["Aria", "Kai", "Mo"], "Sam", jokes, "Sam: hi");
    expect(prompt).toContain("group roleplay between Sam, Aria, Kai and Mo");
    expect(prompt).toContain("has become this group's own");
    expect(prompt).toContain("- Everyone calls Sam 'Captain'");
  });
});
