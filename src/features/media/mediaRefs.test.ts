import { chatHasInlineMedia, dataUrlToBlob, inlineChatMedia, isMediaRef, mediaRefsIn, moveChatMedia, shouldMove } from "./mediaRefs";
import { Chat, Message } from "../../types";

// A picture big enough to be moved, and a different one.
const picture = (fill: string) => `data:image/jpeg;base64,${fill.repeat(5000)}`;
const A = picture("QUFB");
const B = picture("QkJC");
const VIDEO = `data:video/mp4;base64,${"AAAA".repeat(5000)}`;

const chatWith = (messages: Message[]): Pick<Chat, "content" | "tree"> => ({
  content: messages,
  tree: { nodes: Object.fromEntries(messages.map((m, i) => [m.id!, { id: m.id!, parentId: i ? messages[i - 1].id! : null, childIds: [], message: m }])) },
});

describe("which pictures move", () => {
  it("moves real pictures and videos, not small ones or references", () => {
    expect(shouldMove(A)).toBe(true);
    expect(shouldMove(VIDEO)).toBe(true);
    expect(shouldMove("data:image/png;base64,AAAA")).toBe(false);
    expect(shouldMove("local:gemini_img_1.png")).toBe(false);
    expect(shouldMove("media:abc")).toBe(false);
    expect(shouldMove("https://example.com/a.png")).toBe(false);
    expect(isMediaRef("media:abc")).toBe(true);
    expect(isMediaRef(undefined)).toBe(false);
  });
});

describe("moveChatMedia", () => {
  it("moves every picture in the messages and the branches, each once", async () => {
    const chat = chatWith([
      { id: "1", role: "you", txt: "look", images: [A] },
      { id: "2", role: "ai", txt: "nice", images: [A, B], videos: [VIDEO] },
      { id: "3", role: "you", txt: "plain" },
    ]);
    expect(chatHasInlineMedia(chat)).toBe(true);
    const stored: string[] = [];
    const moved = await moveChatMedia(chat, async (src) => {
      stored.push(src);
      return `media:${stored.length}`;
    });
    // A, B and the video, each stored once though A is in four places.
    expect(stored).toEqual([A, B, VIDEO]);
    expect(moved.content![1]).toMatchObject({ images: ["media:1", "media:2"], videos: ["media:3"], txt: "nice" });
    expect(moved.tree!.nodes["1"].message.images).toEqual(["media:1"]);
    expect(chatHasInlineMedia(moved)).toBe(false);
    // The original chat is untouched.
    expect(chat.content![0].images).toEqual([A]);
    // A message with nothing to move stays the same object.
    expect(moved.content![2]).toBe(chat.content![2]);
  });

  it("leaves a chat with nothing to move as it was", async () => {
    const chat = chatWith([{ id: "1", role: "you", txt: "hi", images: ["local:a.png", "media:x"] }]);
    const move = jest.fn();
    expect(await moveChatMedia(chat, move)).toBe(chat);
    expect(move).not.toHaveBeenCalled();
  });

  it("moves pictures in a patch that has only some of a chat", async () => {
    const moved = await moveChatMedia({ content: [{ id: "1", role: "ai", images: [A] }] }, async () => "media:1");
    expect(moved).toEqual({ content: [{ id: "1", role: "ai", images: ["media:1"] }] });
    expect("tree" in moved).toBe(false);
  });
});

describe("inlineChatMedia", () => {
  it("puts stored pictures back, for a file that leaves the app", async () => {
    const chat = chatWith([{ id: "1", role: "ai", images: ["media:1", "local:a.png"] }]);
    const inlined = await inlineChatMedia(chat, async (ref) => (ref === "media:1" ? A : ref));
    expect(inlined.content![0].images).toEqual([A, "local:a.png"]);
    expect(inlined.tree!.nodes["1"].message.images).toEqual([A, "local:a.png"]);
  });
});

describe("mediaRefsIn", () => {
  it("finds every stored picture a record names, wherever it sits", () => {
    const found = mediaRefsIn([{ content: [{ images: ["media:a", "local:x.png"] }], tree: { nodes: { n: { message: { videos: ["media:b"] } } } } }, { avatar: "media:a" }]);
    expect(Array.from(found).sort()).toEqual(["a", "b"]);
  });
});

describe("dataUrlToBlob", () => {
  it("keeps the type and the bytes", async () => {
    const blob = dataUrlToBlob("data:image/png;base64,iVBORw0K");
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBe(6);
  });
});
