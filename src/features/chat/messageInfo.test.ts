import { messageInfoFor } from "./messageInfo";
import { Message } from "../../types";

const m = (role: "you" | "ai", timestamp: number, extra: Partial<Message> = {}): Message => ({ role, txt: "x", timestamp, ...extra } as Message);

describe("message info (#121)", () => {
  it("reads when the character first answered after it", () => {
    const messages = [m("you", 10), m("ai", 20), m("you", 30)];
    expect(messageInfoFor(messages, 0, [1])).toEqual({ sentAt: 10, deliveredAt: 10, reads: [{ speakerId: 1, readAt: 20 }] });
    expect(messageInfoFor(messages, 2, [1])?.reads[0].readAt).toBeUndefined();
    expect(messageInfoFor(messages, 1, [1])).toBeUndefined();
  });

  it("in a group, each member reads it when they reply", () => {
    const messages = [m("you", 10), m("ai", 20, { speakerId: 2 }), m("ai", 25, { speakerId: 1 })];
    expect(messageInfoFor(messages, 0, [1, 2, 3])?.reads).toEqual([{ speakerId: 1, readAt: 25 }, { speakerId: 2, readAt: 20 }, { speakerId: 3, readAt: undefined }]);
  });
});
