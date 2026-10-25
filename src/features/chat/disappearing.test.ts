import { buildDisappearingNote, pruneDisappeared, willDisappear } from "./disappearing";
import { migrateToTree, removeNodes } from "./messageTree";
import { Message } from "../../types";

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 25, 12);
const msg = (id: string, hoursAgo: number, extra: Partial<Message> = {}): Message => ({ id, role: "ai", txt: id, timestamp: NOW - hoursAgo * HOUR, ...extra });

describe("disappearing messages (#136)", () => {
  const on = { after: "day" as const, since: NOW - 48 * HOUR };

  it("vanishes only what was sent after it was turned on, once its time is up", () => {
    const content = [msg("before", 60), msg("old", 30), msg("notice", 30, { isRoomEvent: true }), msg("fresh", 2)];
    expect(willDisappear({ disappearing: on }, content[0])).toBe(false);
    expect(willDisappear({ disappearing: on }, content[2])).toBe(false);
    expect(pruneDisappeared({ disappearing: on, content }, NOW)!.content.map((m) => m.id)).toEqual(["before", "notice", "fresh"]);
    expect(pruneDisappeared({ disappearing: undefined, content }, NOW)).toBeNull();
    expect(pruneDisappeared({ disappearing: { after: "week", since: on.since }, content }, NOW)).toBeNull();
  });

  it("keeps a branched chat's tree whole around what's gone", () => {
    const { tree, activeLeafId, content } = migrateToTree([msg("a", 60), msg("b", 30), msg("c", 2)]);
    const result = pruneDisappeared({ disappearing: on, content, tree, activeLeafId }, NOW)!;
    expect(result.content.map((m) => m.id)).toEqual(["a", "c"]);
    expect(result.tree!.nodes.c.parentId).toBe("a");
    expect(result.tree!.nodes.a.childIds).toEqual(["c"]);
    expect(result.activeLeafId).toBe("c");
  });

  it("removeNodes moves children up to the nearest kept message", () => {
    const { tree } = migrateToTree([msg("a", 3), msg("b", 2), msg("c", 1)]);
    const out = removeNodes(tree, new Set(["a", "b"]));
    expect(out.nodes.c.parentId).toBeNull();
    expect(Object.keys(out.nodes)).toEqual(["c"]);
  });

  it("tells the character", () => {
    expect(buildDisappearingNote("week", "Aria", "Sam")).toContain("vanishes 1 week after it's sent");
  });
});
