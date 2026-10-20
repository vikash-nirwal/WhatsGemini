import {
  generateNodeId,
  migrateToTree,
  flattenPath,
  getPathToNode,
  addChildNode,
  updateNodeMessage,
  getSiblingInfo,
  findDefaultLeafFrom,
  deleteBranch,
  insertAfterNode,
  spliceSummaryIntoConversation,
} from "./messageTree";
import { Message, ConversationTree } from "../../types";

const msg = (role: Message["role"], txt: string, id?: string): Message => ({
  role,
  txt,
  ...(id ? { id } : {}),
});

describe("generateNodeId", () => {
  it("produces unique ids", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateNodeId()));
    expect(ids.size).toBe(50);
  });
});

describe("migrateToTree", () => {
  it("builds a linear tree from a flat array, assigning ids", () => {
    const content = [msg("user", "hi"), msg("model", "hello")];
    const { tree, activeLeafId, content: newContent } = migrateToTree(content);

    expect(newContent).toHaveLength(2);
    expect(newContent[0].id).toBeDefined();
    expect(newContent[1].id).toBeDefined();
    expect(Object.keys(tree.nodes)).toHaveLength(2);
    expect(activeLeafId).toBe(newContent[1].id);

    const root = tree.nodes[newContent[0].id!];
    expect(root.parentId).toBeNull();
    expect(root.childIds).toEqual([newContent[1].id]);

    const leaf = tree.nodes[newContent[1].id!];
    expect(leaf.parentId).toBe(newContent[0].id);
    expect(leaf.childIds).toEqual([]);
  });

  it("preserves ids that already exist instead of overwriting them", () => {
    const content = [msg("user", "hi", "existing-1"), msg("model", "hello")];
    const { content: newContent } = migrateToTree(content);
    expect(newContent[0].id).toBe("existing-1");
  });

  it("handles an empty array", () => {
    const { tree, activeLeafId, content } = migrateToTree([]);
    expect(tree.nodes).toEqual({});
    expect(activeLeafId).toBeNull();
    expect(content).toEqual([]);
  });
});

describe("flattenPath", () => {
  it("walks leaf to root and reverses into chronological order", () => {
    const { tree, activeLeafId } = migrateToTree([msg("user", "a"), msg("model", "b"), msg("user", "c")]);
    const path = flattenPath(tree, activeLeafId);
    expect(path.map((m) => m.txt)).toEqual(["a", "b", "c"]);
  });

  it("returns an empty array for a null/undefined leaf", () => {
    const { tree } = migrateToTree([msg("user", "a")]);
    expect(flattenPath(tree, null)).toEqual([]);
    expect(flattenPath(tree, undefined)).toEqual([]);
  });

  it("stops gracefully if a node references a missing parent", () => {
    const tree: ConversationTree = {
      nodes: {
        a: { id: "a", message: msg("user", "a", "a"), parentId: "missing", childIds: [] },
      },
    };
    expect(flattenPath(tree, "a").map((m) => m.txt)).toEqual(["a"]);
  });
});

describe("getPathToNode", () => {
  it("returns history strictly before the given node", () => {
    const { tree, activeLeafId } = migrateToTree([msg("user", "a"), msg("model", "b"), msg("user", "c")]);
    const path = getPathToNode(tree, activeLeafId);
    expect(path.map((m) => m.txt)).toEqual(["a", "b"]);
  });

  it("returns an empty array for the root node", () => {
    const { tree, content } = migrateToTree([msg("user", "a"), msg("model", "b")]);
    expect(getPathToNode(tree, content[0].id!)).toEqual([]);
  });

  it("returns an empty array for a null nodeId", () => {
    const { tree } = migrateToTree([msg("user", "a")]);
    expect(getPathToNode(tree, null)).toEqual([]);
  });
});

describe("addChildNode", () => {
  it("adds a new leaf under the given parent and registers it as a child", () => {
    const { tree, activeLeafId } = migrateToTree([msg("user", "a"), msg("model", "b")]);
    const { tree: tree2, nodeId } = addChildNode(tree, activeLeafId, msg("user", "c"));

    expect(tree2.nodes[nodeId].parentId).toBe(activeLeafId);
    expect(tree2.nodes[activeLeafId!].childIds).toContain(nodeId);
    // original tree object is untouched (new tree returned)
    expect(tree.nodes[activeLeafId!].childIds).not.toContain(nodeId);
  });

  it("creates a second root when parentId is null", () => {
    const { tree } = migrateToTree([msg("user", "a")]);
    const { tree: tree2, nodeId } = addChildNode(tree, null, msg("user", "b"));
    expect(tree2.nodes[nodeId].parentId).toBeNull();
  });

  it("creating a sibling branch produces two children under the same parent", () => {
    const { tree, activeLeafId } = migrateToTree([msg("user", "a"), msg("model", "b")]);
    const parentId = tree.nodes[activeLeafId!].parentId;
    const { tree: tree2, nodeId: branchA } = addChildNode(tree, parentId, msg("model", "b-alt"));
    expect(tree2.nodes[parentId!].childIds).toEqual([activeLeafId, branchA]);
  });
});

describe("updateNodeMessage", () => {
  it("replaces a node's message content in place, keeping its position", () => {
    const { tree, activeLeafId } = migrateToTree([msg("user", "a"), msg("model", "b")]);
    const parentId = tree.nodes[activeLeafId!].parentId!;
    const tree2 = updateNodeMessage(tree, parentId, msg("user", "a-edited"));

    expect(tree2.nodes[parentId].message.txt).toBe("a-edited");
    expect(tree2.nodes[parentId].message.id).toBe(parentId);
    expect(tree2.nodes[parentId].parentId).toBe(tree.nodes[parentId].parentId);
    expect(tree2.nodes[parentId].childIds).toEqual(tree.nodes[parentId].childIds);
  });

  it("is a no-op (returns the same tree) for an unknown nodeId", () => {
    const { tree } = migrateToTree([msg("user", "a")]);
    expect(updateNodeMessage(tree, "does-not-exist", msg("user", "x"))).toBe(tree);
  });
});

describe("getSiblingInfo", () => {
  it("reports a single node as 1/1", () => {
    const { tree, activeLeafId } = migrateToTree([msg("user", "a")]);
    expect(getSiblingInfo(tree, activeLeafId!)).toEqual({ index: 0, total: 1, siblingIds: [activeLeafId] });
  });

  it("indexes correctly among multiple children of the same parent", () => {
    const { tree, activeLeafId } = migrateToTree([msg("user", "a"), msg("model", "b")]);
    const parentId = tree.nodes[activeLeafId!].parentId;
    const { tree: tree2, nodeId: branchA } = addChildNode(tree, parentId, msg("model", "b-alt"));
    const { tree: tree3, nodeId: branchB } = addChildNode(tree2, parentId, msg("model", "b-alt-2"));

    expect(getSiblingInfo(tree3, activeLeafId!)).toEqual({ index: 0, total: 3, siblingIds: [activeLeafId, branchA, branchB] });
    expect(getSiblingInfo(tree3, branchB)).toEqual({ index: 2, total: 3, siblingIds: [activeLeafId, branchA, branchB] });
  });

  it("compares root nodes against each other when parentId is null", () => {
    const { tree } = migrateToTree([msg("user", "a")]);
    const { tree: tree2, nodeId: root2 } = addChildNode(tree, null, msg("user", "a-alt"));
    const info = getSiblingInfo(tree2, root2);
    expect(info.total).toBe(2);
    expect(info.siblingIds).toContain(root2);
  });

  it("falls back gracefully for an unknown nodeId", () => {
    const { tree } = migrateToTree([msg("user", "a")]);
    expect(getSiblingInfo(tree, "missing")).toEqual({ index: 0, total: 1, siblingIds: ["missing"] });
  });
});

describe("deleteBranch", () => {
  it("removes a leaf sibling and detaches it from the parent's childIds", () => {
    const { tree, activeLeafId } = migrateToTree([msg("user", "a"), msg("model", "b")]);
    const parentId = tree.nodes[activeLeafId!].parentId!;
    const { tree: tree2, nodeId: branchA } = addChildNode(tree, parentId, msg("model", "b-alt"));

    const { tree: tree3, parentId: reportedParentId } = deleteBranch(tree2, branchA);

    expect(reportedParentId).toBe(parentId);
    expect(tree3.nodes[branchA]).toBeUndefined();
    expect(tree3.nodes[parentId].childIds).toEqual([activeLeafId]);
    expect(tree3.nodes[activeLeafId!]).toBeDefined();
  });

  it("removes the entire descendant subtree, not just the node itself", () => {
    const { tree, activeLeafId } = migrateToTree([msg("user", "a")]);
    const { tree: t2, nodeId: child } = addChildNode(tree, activeLeafId, msg("model", "b"));
    const { tree: t3, nodeId: grandchild } = addChildNode(t2, child, msg("user", "c"));

    const { tree: t4 } = deleteBranch(t3, child);

    expect(t4.nodes[child]).toBeUndefined();
    expect(t4.nodes[grandchild]).toBeUndefined();
    expect(t4.nodes[activeLeafId!].childIds).toEqual([]);
  });

  it("leaves unrelated branches untouched", () => {
    const { tree, activeLeafId } = migrateToTree([msg("user", "a")]);
    const { tree: t2, nodeId: branchA } = addChildNode(tree, activeLeafId, msg("model", "b1"));
    const { tree: t3, nodeId: branchB } = addChildNode(t2, activeLeafId, msg("model", "b2"));

    const { tree: t4 } = deleteBranch(t3, branchA);

    expect(t4.nodes[branchA]).toBeUndefined();
    expect(t4.nodes[branchB]).toBeDefined();
    expect(t4.nodes[activeLeafId!].childIds).toEqual([branchB]);
  });

  it("is a no-op (returns the same tree, null parentId) for an unknown nodeId", () => {
    const { tree } = migrateToTree([msg("user", "a")]);
    const result = deleteBranch(tree, "missing");
    expect(result.tree).toBe(tree);
    expect(result.parentId).toBeNull();
  });

  it("reports a null parentId when deleting a root node", () => {
    const { tree, activeLeafId } = migrateToTree([msg("user", "a")]);
    const { parentId } = deleteBranch(tree, activeLeafId!);
    expect(parentId).toBeNull();
  });

  it("does not mutate the original tree object", () => {
    const { tree, activeLeafId } = migrateToTree([msg("user", "a"), msg("model", "b")]);
    const parentId = tree.nodes[activeLeafId!].parentId!;
    const { tree: tree2, nodeId: branchA } = addChildNode(tree, parentId, msg("model", "b-alt"));

    deleteBranch(tree2, branchA);

    expect(tree2.nodes[branchA]).toBeDefined();
    expect(tree2.nodes[parentId].childIds).toContain(branchA);
  });
});

describe("findDefaultLeafFrom", () => {
  it("returns the node itself when it has no children", () => {
    const { tree, activeLeafId } = migrateToTree([msg("user", "a"), msg("model", "b")]);
    expect(findDefaultLeafFrom(tree, activeLeafId!)).toBe(activeLeafId);
  });

  it("descends to the most-recently-added child at each level", () => {
    const { tree, activeLeafId } = migrateToTree([msg("user", "a")]);
    const { tree: t2, nodeId: child1 } = addChildNode(tree, activeLeafId, msg("model", "b1"));
    const { tree: t3, nodeId: child2 } = addChildNode(t2, activeLeafId, msg("model", "b2"));
    const { tree: t4, nodeId: grandchild } = addChildNode(t3, child2, msg("user", "c"));

    expect(findDefaultLeafFrom(t4, activeLeafId!)).toBe(grandchild);
    // the older sibling branch (child1) still resolves to itself, it has no descendants
    expect(findDefaultLeafFrom(t4, child1)).toBe(child1);
  });
});

describe("insertAfterNode", () => {
  const msg = (txt: string, extra: Partial<Message> = {}): Message => ({ role: "you", txt, ...extra });

  it("splices messages in after a node and keeps everything that followed", () => {
    const { tree, activeLeafId, content } = migrateToTree([msg("a"), msg("b"), msg("c"), msg("d")]);
    const { tree: next, insertedIds } = insertAfterNode(tree, content[1].id!, [msg("summary"), msg("ack")]);
    expect(insertedIds).toHaveLength(2);
    expect(flattenPath(next, activeLeafId).map((m) => m.txt)).toEqual(["a", "b", "summary", "ack", "c", "d"]);
  });

  it("moves alternate variants of the following message under the inserted chain", () => {
    const base = migrateToTree([msg("a"), msg("b"), msg("c")]);
    const bId = base.content[1].id!;
    const { tree: withVariant, nodeId: variantId } = addChildNode(base.tree, bId, msg("c2"));
    const { tree: next, insertedIds } = insertAfterNode(withVariant, bId, [msg("summary"), msg("ack")]);
    const ackId = insertedIds[1];
    expect(next.nodes[bId].childIds).toEqual([insertedIds[0]]);
    expect(next.nodes[ackId].childIds).toEqual([base.content[2].id, variantId]);
    expect(next.nodes[variantId].parentId).toBe(ackId);
    expect(flattenPath(next, variantId).map((m) => m.txt)).toEqual(["a", "b", "summary", "ack", "c2"]);
  });

  it("leaves the tree unchanged for an unknown node", () => {
    const { tree } = migrateToTree([msg("a")]);
    expect(insertAfterNode(tree, "nope", [msg("x")]).tree).toBe(tree);
  });

  it("does not mutate the input tree", () => {
    const { tree, content } = migrateToTree([msg("a"), msg("b")]);
    const before = JSON.stringify(tree);
    insertAfterNode(tree, content[0].id!, [msg("x")]);
    expect(JSON.stringify(tree)).toBe(before);
  });
});

describe("spliceSummaryIntoConversation", () => {
  const msg = (txt: string): Message => ({ role: "you", txt });

  it("migrates a flat conversation and places the summary by index", () => {
    const result = spliceSummaryIntoConversation({ content: [msg("a"), msg("b"), msg("c")] }, undefined, 1, [msg("summary")]);
    expect(result!.content.map((m) => m.txt)).toEqual(["a", "b", "summary", "c"]);
    expect(Object.keys(result!.tree.nodes)).toHaveLength(4);
  });

  it("prefers the message id when the conversation is already a tree", () => {
    const { tree, activeLeafId, content } = migrateToTree([msg("a"), msg("b"), msg("c")]);
    const result = spliceSummaryIntoConversation({ content, tree, activeLeafId }, content[0].id, 99, [msg("s")]);
    expect(result!.content.map((m) => m.txt)).toEqual(["a", "s", "b", "c"]);
  });

  it("returns null when the anchor doesn't exist", () => {
    expect(spliceSummaryIntoConversation({ content: [msg("a")] }, "nope", 5, [msg("s")])).toBeNull();
  });
});
