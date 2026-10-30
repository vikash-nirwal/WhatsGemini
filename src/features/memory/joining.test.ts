import { briefMessages, buildJoinBriefPrompt, BRIEF_FACTS, unremembered } from "./joining";
import { Message } from "../../types";
import { AI, MEMORY_EXTRACTION_INTERVAL, YOU } from "../../utils/constants";

const msg = (i: number, extra: Partial<Message> = {}): Message => ({ id: `m${i}`, role: i % 2 ? AI : YOU, txt: `line ${i}`, timestamp: i * 1000, ...extra } as Message);

describe("memory when someone joins a chat", () => {
  it("the newcomer reads the latest messages without notes", () => {
    const content = [...Array.from({ length: 40 }, (_, i) => msg(i)), msg(40, { isSystem: true, txt: "Ana joined" })];
    const read = briefMessages(content);
    expect(read).toHaveLength(MEMORY_EXTRACTION_INTERVAL * 2);
    expect(read[read.length - 1].id).toBe("m39");
  });

  it("a 1:1 catches up on what came after its last memory update", () => {
    const content = Array.from({ length: 30 }, (_, i) => msg(i));
    expect(unremembered(content, 25_500).map((m) => m.id)).toEqual(["m26", "m27", "m28", "m29"]);
    // Never updated: the last interval's worth.
    expect(unremembered(content)).toHaveLength(MEMORY_EXTRACTION_INTERVAL);
    // Already up to date: nothing.
    expect(unremembered(content, 99_000)).toHaveLength(0);
  });

  it("asks for a few facts the newcomer doesn't already know", () => {
    const prompt = buildJoinBriefPrompt("Ana", "Vik", "Vik: we're going camping", ["Vik likes tea"]);
    expect(prompt).toContain("Ana has just been added");
    expect(prompt).toContain("Vik: we're going camping");
    expect(prompt).toContain("- Vik likes tea");
    expect(prompt).toContain(`at most ${BRIEF_FACTS}`);
    expect(buildJoinBriefPrompt("Ana", "Vik", "x", [])).not.toContain("already remembers:");
  });
});
