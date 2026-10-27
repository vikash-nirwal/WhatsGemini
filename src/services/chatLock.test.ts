import { dbService } from "./dbService";

// The user's report, 2026-10-27: your reply and a background change to the
// same chat each wrote back their own copy, and one erased the other.
test("changes to one chat wait their turn; other chats don't wait", async () => {
  const order: string[] = [];
  const slow = (name: string, ms: number) => () => new Promise<void>((r) => setTimeout(() => { order.push(name); r(); }, ms));
  await Promise.all([
    dbService.withChatLock(1, slow("reply", 30)),
    dbService.withChatLock(1, slow("notice", 1)),
    dbService.withChatLock(2, slow("other chat", 1)),
  ]);
  expect(order).toEqual(["other chat", "reply", "notice"]);
});

test("a failed change doesn't hold the chat", async () => {
  await expect(dbService.withChatLock(3, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
  await expect(dbService.withChatLock(3, async () => "next")).resolves.toBe("next");
});
