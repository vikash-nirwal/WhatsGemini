import { Character, Chat, Message } from "../../types";
import { buildDayMoodSection, DAY_MOODS, dayKey, dayMoodFor } from "./badDays";
import { buildDreamDirective, dreamDue, dreamIngredients, DREAM_GAP_MS } from "./dreams";
import { addFirstText, awakeAt, buildFirstTextPrompt, cleanFirstText, firstTextDue, FIRST_TEXT_GAP_MS } from "./firstTexts";

const HOUR = 60 * 60 * 1000;
// A Wednesday, 9 am local time.
const MORNING = new Date(2026, 9, 21, 9, 0, 0).getTime();
const aria = (extra: Partial<Character> = {}) => ({ id: 1, name: "Aria", description: "Warm.", prompt: "You are Aria.", ...extra } as Character);
const msg = (role: string, at: number, extra: Partial<Message> = {}): Message => ({ role, txt: "hi", timestamp: at, ...extra });
const chat = (content: Message[], extra: Partial<Chat> = {}) => ({ id: 1, title: "Aria", timestamp: 0, content, ...extra } as Chat);

describe("bad days (#95)", () => {
  it("is off unless switched on, and the same all day", () => {
    expect(dayMoodFor(aria(), MORNING)).toBeUndefined();
    const on = aria({ badDays: true });
    expect(dayMoodFor(on, MORNING)).toEqual(dayMoodFor(on, MORNING + 5 * HOUR));
  });

  it("comes now and then: about one day in six", () => {
    const on = aria({ badDays: true });
    const days = Array.from({ length: 600 }, (_, i) => dayMoodFor(on, MORNING + i * 24 * HOUR)).filter(Boolean).length;
    expect(days).toBeGreaterThan(60);
    expect(days).toBeLessThan(140);
  });

  it("follows a mood picked by hand for today, or a good day", () => {
    expect(dayMoodFor(aria({ badDays: true, dayMood: { date: dayKey(MORNING), mood: "tired" } }), MORNING)?.id).toBe("tired");
    expect(dayMoodFor(aria({ badDays: true, dayMood: { date: dayKey(MORNING), mood: "" } }), MORNING)).toBeUndefined();
    expect(buildDayMoodSection("Aria", DAY_MOODS[0], "Sam")).toContain("Today Aria is having an off day: under the weather");
  });
});

describe("dreams (#94)", () => {
  it("is due on a morning's first reply, every few days at most", () => {
    const on = aria({ dreams: true });
    const yesterday = chat([msg("ai", MORNING - 20 * HOUR)]);
    expect(dreamDue(on, yesterday, MORNING)).toBe(true);
    expect(dreamDue(aria(), yesterday, MORNING)).toBe(false);
    expect(dreamDue(on, yesterday, MORNING + 6 * HOUR)).toBe(false); // afternoon
    expect(dreamDue(on, chat([msg("ai", MORNING - HOUR)]), MORNING)).toBe(false); // already replied today
    expect(dreamDue(aria({ dreams: true, lastDreamAt: MORNING - DREAM_GAP_MS + HOUR }), yesterday, MORNING)).toBe(false);
  });

  it("is made of memories, plans and a secret still kept", () => {
    const character = aria({ memory: ["Sam loves the sea"], secrets: [{ id: "s", text: "She can't swim", reveal: "stage", stage: "committed" }] });
    const ingredients = dreamIngredients(character, chat([], { plans: [{ id: "p", what: "Go sailing", createdAt: 0 }] }));
    expect(ingredients).toEqual({ memories: ["Sam loves the sea"], plans: ["Go sailing"], secret: "She can't swim" });
    const directive = buildDreamDirective("Aria", "Sam", ingredients);
    expect(directive).toContain("telling Sam about it");
    expect(directive).toContain("- Sam loves the sea");
    expect(directive).toContain("never say it outright) She can't swim");
  });
});

describe("they text first (#93)", () => {
  const quiet = chat([msg("you", MORNING - 5 * HOUR)]);

  it("is due after a few quiet hours, while they're awake", () => {
    expect(firstTextDue(aria({ textsFirst: true }), quiet, MORNING)).toBe(true);
    expect(firstTextDue(aria(), quiet, MORNING)).toBe(false);
    expect(firstTextDue(aria({ textsFirst: true }), chat([msg("you", MORNING - HOUR)]), MORNING)).toBe(false);
    // Without a routine, not at night.
    expect(awakeAt(aria(), new Date(2026, 9, 21, 3).getTime())).toBe(false);
    expect(awakeAt(aria({ schedule: { blocks: [{ start: 0, end: 24, activity: "asleep", status: "asleep" }] } }), MORNING)).toBe(false);
  });

  it("never sends two unanswered, and keeps to two a day, hours apart", () => {
    const unanswered = chat([msg("you", MORNING - 12 * HOUR), msg("ai", MORNING - 8 * HOUR, { notes: ["texted-first"] })]);
    expect(firstTextDue(aria({ textsFirst: true }), unanswered, MORNING)).toBe(false);
    expect(firstTextDue(aria({ textsFirst: true, firstTexts: [MORNING - FIRST_TEXT_GAP_MS + HOUR] }), quiet, MORNING)).toBe(false);
    expect(firstTextDue(aria({ textsFirst: true, firstTexts: [MORNING - 20 * HOUR, MORNING - 10 * HOUR] }), quiet, MORNING)).toBe(false);
    expect(addFirstText(Array.from({ length: 10 }, (_, i) => i), 99)).toHaveLength(10);
  });

  it("leaves a long absence to a letter", () => {
    const longAgo = chat([msg("you", MORNING - 4 * 24 * HOUR)]);
    expect(firstTextDue(aria({ textsFirst: true }), longAgo, MORNING)).toBe(true);
    expect(firstTextDue(aria({ textsFirst: true, writesLetters: true }), longAgo, MORNING)).toBe(false);
  });

  it("asks for a short casual text, or the dream", () => {
    const prompt = buildFirstTextPrompt(aria(), "Sam", { hoursQuiet: 5, plans: ["Go sailing"], facts: [], transcript: "Sam: night!", dayMood: "tired" });
    expect(prompt).toContain("You last talked 5 hours ago");
    expect(prompt).toContain("Today you're tired.");
    expect(prompt).toContain("- Go sailing");
    expect(buildFirstTextPrompt(aria(), "Sam", { hoursQuiet: 5, plans: [], facts: [], transcript: "", dream: "DREAM" })).toContain("DREAM\nWrite it as a text message");
    expect(cleanFirstText('"saw a dog that looks like you"')).toBe("saw a dog that looks like you");
    expect(cleanFirstText(" ")).toBeUndefined();
  });
});
