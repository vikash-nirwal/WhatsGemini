import { foldForSearch, searchChat, startingMatch, stepMatch } from "./chatSearch";
import { ConversationTree, Message } from "../../types";

// a - b - c - d          (d is the showing leaf)
//          \- e - f
const msg = (id: string, txt: string, extra: Partial<Message> = {}): Message => ({ id, role: "ai", txt, ...extra });
const tree: ConversationTree = {
  nodes: {
    a: { id: "a", parentId: null, childIds: ["b"], message: msg("a", "Hello there, beach lover") },
    b: { id: "b", parentId: "a", childIds: ["c"], message: msg("b", "the beach setup", { isSystem: true }) },
    c: { id: "c", parentId: "b", childIds: ["d", "e"], message: msg("c", "Shall we go?", { role: "you" }) },
    d: { id: "d", parentId: "c", childIds: [], message: msg("d", "To the BEACH!") },
    e: { id: "e", parentId: "c", childIds: ["f"], message: msg("e", "To the mountains!") },
    f: { id: "f", parentId: "e", childIds: [], message: msg("f", "Cold up here, I miss the beach") },
  },
};
const showing = [tree.nodes.a.message, tree.nodes.b.message, tree.nodes.c.message, tree.nodes.d.message];

describe("searchChat", () => {
  it("finds words on every branch in tree order, ignoring case and hidden messages", () => {
    const matches = searchChat(showing, tree, "beach");
    expect(matches.map((m) => m.id)).toEqual(["a", "d", "f"]);
    expect(matches.map((m) => m.active)).toEqual([true, true, false]);
  });

  it("keeps the same order whichever branch shows", () => {
    const other = [tree.nodes.a.message, tree.nodes.b.message, tree.nodes.c.message, tree.nodes.e.message, tree.nodes.f.message];
    const matches = searchChat(other, tree, "beach");
    expect(matches.map((m) => m.id)).toEqual(["a", "d", "f"]);
    expect(matches.map((m) => m.active)).toEqual([true, false, true]);
  });

  it("searches the messages alone when the chat has no tree", () => {
    expect(searchChat(showing, undefined, "go").map((m) => m.id)).toEqual(["c"]);
  });

  it("ignores accents, extra spaces and the picture tag", () => {
    const content = [msg("x", "A café   au lait\n[Image Context: a beach at dawn]")];
    expect(searchChat(content, undefined, "Cafe au")).toHaveLength(1);
    expect(searchChat(content, undefined, "dawn")).toHaveLength(0);
    expect(searchChat(content, undefined, "   ")).toHaveLength(0);
  });

  it("shows the words around the match", () => {
    const long = `${"word ".repeat(20)}the hidden treasure is here ${"more ".repeat(20)}`;
    const [match] = searchChat([msg("x", long)], undefined, "treasure");
    expect(match.snippet).toContain("the hidden treasure is here");
    expect(match.snippet.startsWith("...")).toBe(true);
    expect(match.snippet.endsWith("...")).toBe(true);
  });
});

describe("stepping through matches", () => {
  const matches = searchChat(showing, tree, "beach");
  it("starts at the newest match on the showing branch", () => {
    expect(startingMatch(matches)).toBe(1);
    expect(startingMatch([])).toBe(-1);
    expect(startingMatch([{ id: "f", active: false, snippet: "" }])).toBe(-1);
  });

  it("wraps round at both ends", () => {
    expect(stepMatch(matches, 2, 1)).toBe(0);
    expect(stepMatch(matches, 0, -1)).toBe(2);
    expect(stepMatch(matches, 1, -1)).toBe(0);
    expect(stepMatch([], 0, 1)).toBe(-1);
    expect(stepMatch(matches, -1, -1)).toBe(2);
    expect(stepMatch(matches, -1, 1)).toBe(0);
  });
});

it("folds accents and case", () => {
  expect(foldForSearch("Ünïcödé")).toBe("unicode");
});
