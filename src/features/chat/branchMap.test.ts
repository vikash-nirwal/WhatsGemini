import { buildBranchMap, countStorylines, hasBranches, leafForSegment } from "./branchMap";
import { ConversationTree, Message } from "../../types";

// a - b - c - d          (d is the active leaf)
//          \- e - f
const msg = (txt: string, extra: Partial<Message> = {}): Message => ({ role: "ai", txt, ...extra });
const tree: ConversationTree = {
  nodes: {
    a: { id: "a", parentId: null, childIds: ["b"], message: msg("Hello there") },
    b: { id: "b", parentId: "a", childIds: ["c"], message: msg("hidden ack", { isSystem: true }) },
    c: { id: "c", parentId: "b", childIds: ["d", "e"], message: msg("Shall we go?", { role: "you" }) },
    d: { id: "d", parentId: "c", childIds: [], message: msg("To the beach!") },
    e: { id: "e", parentId: "c", childIds: ["f"], message: msg("To the mountains!") },
    f: { id: "f", parentId: "e", childIds: [], message: msg("It's cold up here") },
  },
};

describe("buildBranchMap", () => {
  it("folds unforked runs into one segment and splits at forks", () => {
    const [root] = buildBranchMap(tree, "d");
    expect(root).toMatchObject({ startId: "a", endId: "c", count: 2, first: "Hello there", last: "Shall we go?", onActivePath: true, isActiveLeaf: false });
    expect(root.children.map((c) => [c.startId, c.endId, c.count, c.onActivePath, c.isActiveLeaf])).toEqual([
      ["d", "d", 1, true, true],
      ["e", "f", 2, false, false],
    ]);
    expect(root.children[1].last).toBe("It's cold up here");
  });

  it("counts storylines and finds where a jump lands", () => {
    const segments = buildBranchMap(tree, "d");
    expect(countStorylines(segments)).toBe(2);
    expect(leafForSegment(tree, segments[0].children[1])).toBe("f");
  });
});

describe("hasBranches", () => {
  it("is true only when some message has variants", () => {
    expect(hasBranches(tree)).toBe(true);
    expect(hasBranches({ nodes: { a: { id: "a", parentId: null, childIds: [], message: msg("hi") } } })).toBe(false);
    expect(hasBranches(undefined)).toBe(false);
  });
});
