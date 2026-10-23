import { Character, Chat, Message } from "../../types";
import { buildPovPrompt, cleanPov, thoughtsIn } from "./pointOfView";
import { addPastEvent, buildPastSection, buildWhatIfChat, buildWhatIfSection, cleanPastEvent, UNIVERSES } from "./whatIf";
import { buildHookSection, parseTeaser } from "./episodes";
import { buildSwapDirective, characterAsPersona, personaAsCharacter, swapStartLine } from "./roleSwap";

const aria = { id: 1, name: "Aria", description: "Warm.", prompt: "You are Aria.", appearance: "red hair", memory: ["Sam loves the sea"] } as Character;

describe("their point of view (#101)", () => {
  it("retells the scene with the thoughts they had", () => {
    const messages: Message[] = [{ role: "ai", txt: "Sure.", thoughts: "I hope they stay." }, { role: "you", txt: "Okay." }];
    expect(thoughtsIn(messages)).toEqual(["I hope they stay."]);
    const prompt = buildPovPrompt("Aria", "Sam", "Warm.", "Aria: Sure.\nSam: Okay.", thoughtsIn(messages));
    expect(prompt).toContain("Retell this scene from Aria's side");
    expect(prompt).toContain("- I hope they stay.");
    expect(cleanPov("Too short")).toBeUndefined();
  });
});

describe("flashbacks and what-if worlds (#102, #104)", () => {
  it("builds a chat with its own memory that opens on the setting", () => {
    const parent = { id: 4, title: "Aria", timestamp: 0, content: [], personaId: "p2", hardLimits: ["gore"] } as Chat;
    const made = buildWhatIfChat({ kind: "universe", title: "Noir", setting: UNIVERSES[2].setting }, aria, parent);
    expect(made).toMatchObject({ title: "Aria · Noir", characterIds: [1], memoryScope: "chat", memory: [], personaId: "p2", hardLimits: ["gore"], whatIf: { kind: "universe", parentChatId: 4 } });
    expect(made.content[0]).toMatchObject({ isNarration: true, txt: expect.stringContaining("What if… Noir.") });
  });

  it("tells the character which world or which past it is", () => {
    expect(buildWhatIfSection({ kind: "universe", title: "Noir", setting: "A rainy city." }, "Aria", "Sam")).toContain("alternate universe: A rainy city. You are still Aria");
    const flashback = buildWhatIfSection({ kind: "flashback", title: "Childhood", setting: "Her tenth birthday.", userRole: "her older brother" }, "Aria", "Sam");
    expect(flashback).toContain("before Aria ever met Sam: Her tenth birthday.");
    expect(flashback).toContain("Sam plays her older brother");
    expect(buildWhatIfSection({ kind: "flashback", title: "x", setting: "y." }, "Aria", "Sam")).toContain("director's notes");
  });

  it("keeps what a flashback added to their past", () => {
    expect(cleanPastEvent('"She broke her arm falling from the old oak and never climbed again."')).toBe("She broke her arm falling from the old oak and never climbed again.");
    expect(addPastEvent(Array.from({ length: 8 }, (_, i) => `e${i}`), "new")).toEqual(["e1", "e2", "e3", "e4", "e5", "e6", "e7", "new"]);
    expect(buildPastSection("Aria", ["She broke her arm."])).toContain("Aria's past");
    expect(buildPastSection("Aria", [])).toBeUndefined();
  });
});

describe("episodes (#103)", () => {
  it("parses the teaser and the hook", () => {
    expect(parseTeaser("TEASER: Next time on…: A stranger at the door.\nSecrets come out.\nHOOK: Someone knocks at midnight.")).toEqual({
      teaser: "A stranger at the door.\nSecrets come out.",
      hook: "Someone knocks at midnight.",
    });
    expect(parseTeaser("nothing")).toEqual({});
    expect(buildHookSection("Someone knocks at midnight")).toContain("cliffhanger: Someone knocks at midnight.");
  });
});

describe("role reversal (#105)", () => {
  it("swaps who is who", () => {
    const persona = { id: "p", name: "Sam", bio: "A sailor.", backstory: "Grew up by the sea.", appearanceImages: ["local:sam"] };
    expect(personaAsCharacter(persona, aria)).toMatchObject({ id: 1, name: "Sam", prompt: "A sailor.\n\nGrew up by the sea.", appearanceImages: ["local:sam"] });
    expect(personaAsCharacter(persona, aria).memory).toBeUndefined();
    expect(characterAsPersona(aria)).toMatchObject({ name: "Aria", bio: "Warm. You are Aria.", appearance: "red hair" });
    expect(buildSwapDirective("Aria", "Sam")).toContain("you play Sam, and the person writing to you is playing Aria");
    expect(buildSwapDirective("Aria", "Sam", true)).toContain("each other's bodies");
    expect(swapStartLine("Aria", "Sam")).toBe("Roles swapped: you're writing as Aria, and Aria's side plays Sam.");
  });
});
