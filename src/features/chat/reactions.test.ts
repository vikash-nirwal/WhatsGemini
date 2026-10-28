import { characterReactionsOf, reactionRows, reactionSummary, reactionTarget, withCharacterReaction } from "./reactions";
import { AI, YOU } from "../../utils/constants";
import { Message } from "../../types";

const m = (role: string, txt: string, speakerId?: number, extra: Partial<Message> = {}): Message => ({ role, txt, id: txt, ...(speakerId != null ? { speakerId } : {}), ...extra } as Message);

describe("reactions", () => {
  it("keeps one per character, folding in the old single one", () => {
    const old = m(YOU, "hi", undefined, { characterReaction: { emoji: "❤️", speakerId: 1 } });
    expect(characterReactionsOf(old)).toEqual([{ emoji: "❤️", by: 1 }]);
    const two = { ...old, ...withCharacterReaction(old, 2, "😂") };
    expect(characterReactionsOf(two)).toEqual([{ emoji: "❤️", by: 1 }, { emoji: "😂", by: 2 }]);
    expect(two.characterReaction).toBeUndefined();
    // A character changing theirs replaces it; none takes it back.
    const changed = { ...two, ...withCharacterReaction(two, 1, "👍") };
    expect(characterReactionsOf(changed)).toEqual([{ emoji: "😂", by: 2 }, { emoji: "👍", by: 1 }]);
    expect(withCharacterReaction({ reactions: [{ emoji: "😂", by: 2 }] }, 2, undefined)).toEqual({ reactions: undefined, characterReaction: undefined });
  });

  it("reacts to your last message in a 1:1, and to anyone else's in a group", () => {
    const chat = [m(YOU, "you said"), m(AI, "Kai said", 2), m(AI, "Aria said", 1), { ...m(YOU, "aside"), isNarration: true }];
    expect(reactionTarget(chat, 1, false)?.txt).toBe("you said");
    expect(reactionTarget(chat, 1, true)?.txt).toBe("Kai said");
    expect(reactionTarget(chat, 2, true)?.txt).toBe("Aria said");
  });

  it("lists who reacted, you first, and sums up the badge", () => {
    const msg = m(AI, "Kai said", 2, { reaction: "😂", reactions: [{ emoji: "😂", by: 1 }, { emoji: "❤️", by: 3 }] });
    const names: Record<number, string> = { 1: "Aria", 3: "Mira" };
    const rows = reactionRows(msg, (id) => names[id!] || "They");
    expect(rows).toEqual([{ emoji: "😂", who: "You", you: true }, { emoji: "😂", who: "Aria" }, { emoji: "❤️", who: "Mira" }]);
    expect(reactionSummary(rows)).toEqual({ emojis: ["😂", "❤️"], total: 3 });
    // Your own reaction on your own message isn't a thing.
    expect(reactionRows(m(YOU, "x", undefined, { reaction: "😂" }), () => "?")).toEqual([]);
  });
});
