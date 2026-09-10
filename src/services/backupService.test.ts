import { remapIdArray, remapMessageSpeaker, remapTree } from "./backupService";
import { Message, ConversationTree } from "../types";
import { YOU, AI } from "../utils/constants";

const msg = (role: string, txt: string, speakerId?: number): Message => ({ role, txt, speakerId });

describe("remapIdArray", () => {
  it("returns undefined for undefined input", () => {
    expect(remapIdArray(undefined, new Map())).toBeUndefined();
  });

  it("remaps every id through the map", () => {
    const idMap = new Map([[1, 101], [2, 102]]);
    expect(remapIdArray([1, 2], idMap)).toEqual([101, 102]);
  });

  it("drops an id with no entry in the map (its character wasn't part of the restore)", () => {
    const idMap = new Map([[1, 101]]);
    expect(remapIdArray([1, 999], idMap)).toEqual([101]);
  });

  it("returns an empty array (not undefined) for an empty input array", () => {
    expect(remapIdArray([], new Map())).toEqual([]);
  });
});

describe("remapMessageSpeaker", () => {
  it("leaves a message with no speakerId untouched", () => {
    const message = msg(YOU, "hi");
    expect(remapMessageSpeaker(message, new Map())).toEqual(message);
  });

  it("remaps a message's speakerId through the map", () => {
    const idMap = new Map([[1, 101]]);
    const result = remapMessageSpeaker(msg(AI, "hello", 1), idMap);
    expect(result.speakerId).toBe(101);
    expect(result.txt).toBe("hello");
  });

  it("drops speakerId to undefined when its character wasn't part of the restore", () => {
    const idMap = new Map([[1, 101]]);
    const result = remapMessageSpeaker(msg(AI, "hello", 999), idMap);
    expect(result.speakerId).toBeUndefined();
  });

  it("does not mutate the original message object", () => {
    const idMap = new Map([[1, 101]]);
    const original = msg(AI, "hello", 1);
    remapMessageSpeaker(original, idMap);
    expect(original.speakerId).toBe(1);
  });
});

describe("remapTree", () => {
  it("returns undefined for undefined input", () => {
    expect(remapTree(undefined, new Map())).toBeUndefined();
  });

  it("remaps every node's message speakerId, preserving tree structure", () => {
    const idMap = new Map([[1, 101], [2, 102]]);
    const tree: ConversationTree = {
      nodes: {
        root: { id: "root", message: msg(YOU, "hi"), parentId: null, childIds: ["a"] },
        a: { id: "a", message: msg(AI, "hey", 1), parentId: "root", childIds: ["b"] },
        b: { id: "b", message: msg(AI, "hey again", 2), parentId: "a", childIds: [] },
      },
    };

    const result = remapTree(tree, idMap);

    expect(result?.nodes.root.message.speakerId).toBeUndefined();
    expect(result?.nodes.a.message.speakerId).toBe(101);
    expect(result?.nodes.a.parentId).toBe("root");
    expect(result?.nodes.a.childIds).toEqual(["b"]);
    expect(result?.nodes.b.message.speakerId).toBe(102);
  });
});
