import { getActiveParticipants, resolveNextSpeaker, parseMention, stripSpeakerPrefix } from "./roomRouting";
import { AI, YOU } from "../../../utils/constants";
import { Character, Message } from "../../../types";

const char = (id: number, name: string): Character => ({ id, name, description: "", prompt: "" });
const msg = (role: string, txt: string, speakerId?: number): Message => ({ role, txt, speakerId });

const aria = char(1, "Aria");
const beck = char(2, "Beck");
const cleo = char(3, "Cleo");

describe("getActiveParticipants", () => {
  it("returns everyone when nothing is muted", () => {
    expect(getActiveParticipants([aria, beck])).toEqual([aria, beck]);
  });

  it("excludes muted participants", () => {
    expect(getActiveParticipants([aria, beck, cleo], [2])).toEqual([aria, cleo]);
  });
});

describe("resolveNextSpeaker", () => {
  it("returns undefined for an empty room", () => {
    expect(resolveNextSpeaker([], [])).toBeUndefined();
  });

  it("returns the sole participant for a 1:1 chat regardless of history", () => {
    expect(resolveNextSpeaker([aria], [msg(AI, "hi", 1)])).toBe(aria);
  });

  it("picks the first active participant when nobody has spoken yet", () => {
    expect(resolveNextSpeaker([aria, beck], [msg(YOU, "hello everyone")])).toBe(aria);
  });

  it("round-robins to the next participant after whoever spoke last", () => {
    const content = [msg(YOU, "hi"), msg(AI, "hey", 1)];
    expect(resolveNextSpeaker([aria, beck, cleo], content)).toBe(beck);
  });

  it("wraps around from the last participant back to the first", () => {
    const content = [msg(YOU, "hi"), msg(AI, "hey", 3)];
    expect(resolveNextSpeaker([aria, beck, cleo], content)).toBe(aria);
  });

  it("skips muted participants in the rotation", () => {
    const content = [msg(YOU, "hi"), msg(AI, "hey", 1)];
    expect(resolveNextSpeaker([aria, beck, cleo], content, [2])).toBe(cleo);
  });

  it("falls back to the first active participant when the last speaker is no longer active (muted since)", () => {
    const content = [msg(YOU, "hi"), msg(AI, "hey", 2)];
    expect(resolveNextSpeaker([aria, beck, cleo], content, [2])).toBe(aria);
  });

  it("ignores user messages when looking for the last speaker", () => {
    const content = [msg(AI, "hey", 1), msg(YOU, "hi again")];
    expect(resolveNextSpeaker([aria, beck], content)).toBe(beck);
  });
});

describe("parseMention", () => {
  it("returns undefined when there's no @mention", () => {
    expect(parseMention("hello everyone", [aria, beck])).toBeUndefined();
  });

  it("matches a simple @Name mention case-insensitively", () => {
    expect(parseMention("@aria how are you?", [aria, beck])).toBe(aria);
  });

  it("matches a multi-word name with the space omitted", () => {
    const elvenMage = char(4, "Elven Mage");
    expect(parseMention("@ElvenMage what do you think?", [elvenMage])).toBe(elvenMage);
  });

  it("prefers the longer/more specific name when one name prefixes another", () => {
    const ariaPrime = char(5, "Aria Prime");
    expect(parseMention("@AriaPrime hello", [aria, ariaPrime])).toBe(ariaPrime);
  });

  it("does not match a muted participant", () => {
    expect(parseMention("@beck hi", [aria, beck], [2])).toBeUndefined();
  });

  it("returns undefined when the mentioned name matches nobody in the room", () => {
    expect(parseMention("@somebodyelse hi", [aria, beck])).toBeUndefined();
  });
});

describe("stripSpeakerPrefix", () => {
  it("strips a leading 'Name: ' the model added on its own", () => {
    expect(stripSpeakerPrefix("Aria: Hey there!", "Aria")).toBe("Hey there!");
  });

  it("is case-insensitive", () => {
    expect(stripSpeakerPrefix("aria: hi", "Aria")).toBe("hi");
  });

  it("tolerates extra whitespace around the colon", () => {
    expect(stripSpeakerPrefix("Aria  :   Hey there!", "Aria")).toBe("Hey there!");
  });

  it("leaves text with no leading name prefix untouched", () => {
    expect(stripSpeakerPrefix("Hey there!", "Aria")).toBe("Hey there!");
  });

  it("does not strip a mention of the name mid-sentence", () => {
    expect(stripSpeakerPrefix("Nice to meet you, Aria: really.", "Aria")).toBe("Nice to meet you, Aria: really.");
  });

  it("does not strip a different character's name", () => {
    expect(stripSpeakerPrefix("Beck: hey", "Aria")).toBe("Beck: hey");
  });

  it("handles a name containing regex special characters safely", () => {
    expect(stripSpeakerPrefix("Dr. Aria (PhD): Hello.", "Dr. Aria (PhD)")).toBe("Hello.");
  });
});
