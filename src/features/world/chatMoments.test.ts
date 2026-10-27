import { chatMomentInScope, logChatMoment } from "./chatMoments";
import * as timeline from "./timeline";

describe("big moments in a private chat reach the world's timeline", () => {
  it("only from the main story of a 1:1 chat", () => {
    expect(chatMomentInScope({ characterIds: [1] })).toBe(true);
    expect(chatMomentInScope({ characterIds: [1, 2] })).toBe(false);
    expect(chatMomentInScope({ characterIds: [1], memoryScope: "chat" })).toBe(false);
    expect(chatMomentInScope({ characterIds: [1], whatIf: { kind: "flashback", title: "x", setting: "y" } })).toBe(false);
    expect(chatMomentInScope({ characterIds: [1], disappearing: { after: 1, since: 0 } as never })).toBe(false);
  });

  it("logs a private entry the character knows first-hand, in the chat's world", () => {
    const log = jest.spyOn(timeline, "logToTimeline").mockResolvedValue(undefined);
    const worlds = [{ id: 3, name: "Harbor", premise: "" }];
    logChatMoment({ characterIds: [1], worldId: 3 }, { id: 1 }, "Aria and you: dating now")(undefined, () => ({ world: { worlds } }));
    expect(log).toHaveBeenCalledWith(3, { kind: "you", text: "Aria and you: dating now", characterIds: [1], audience: "private" }, undefined);
    log.mockClear();
    logChatMoment({ characterIds: [1], memoryScope: "chat" }, { id: 1 }, "x")(undefined, () => ({ world: { worlds } }));
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
