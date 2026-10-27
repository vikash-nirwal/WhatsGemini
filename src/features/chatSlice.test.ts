import { configureStore } from "@reduxjs/toolkit";
import chatReducer, { fetchChats, updateChatOptions } from "./chatSlice";
import { dbService } from "../services/dbService";
import { Chat } from "../types";

jest.mock("../services/dbService", () => {
  // The real lock (withChatLock), with the database faked.
  const locks = new Map<number, Promise<void>>();
  const service: any = {
    getAllChats: jest.fn(),
    patchChat: jest.fn(),
    async withChatLock(id: number, run: () => Promise<unknown>) {
      const before = locks.get(id) || Promise.resolve();
      let release!: () => void;
      const mine = new Promise<void>((r) => (release = r));
      const queue = before.then(() => mine);
      locks.set(id, queue);
      await before;
      try {
        return await run();
      } finally {
        release();
        if (locks.get(id) === queue) locks.delete(id);
      }
    },
  };
  return { dbService: service };
});

const makeStore = () => configureStore({ reducer: { chat: chatReducer } });
const chat = (content: string[]): Chat => ({ id: 1, title: "Aria", timestamp: 0, characterIds: [1], content: content.map((txt) => ({ role: "ai", txt })) }) as unknown as Chat;

// The user's report, 2026-10-27: a background job's refresh, read before
// your reply was saved, put the old chat back on screen.
test("a refresh read before a chat changed doesn't put the older copy back", async () => {
  const store = makeStore();
  (dbService.getAllChats as jest.Mock).mockResolvedValueOnce([chat(["hi"])]);
  await store.dispatch(fetchChats());
  // A refresh starts reading...
  let finishRead!: (c: Chat[]) => void;
  (dbService.getAllChats as jest.Mock).mockReturnValueOnce(new Promise<Chat[]>((r) => (finishRead = r)));
  const refresh = store.dispatch(fetchChats());
  // ...the chat changes on screen meanwhile...
  (dbService.patchChat as jest.Mock).mockResolvedValueOnce(undefined);
  await new Promise((r) => setTimeout(r, 5));
  await store.dispatch(updateChatOptions({ chatId: 1, patch: { muted: true } }));
  // ...and the refresh lands with what it read before.
  finishRead([chat(["hi"])]);
  await refresh;
  expect(store.getState().chat.chats[0].muted).toBe(true);
  // A later refresh, read after the change, is taken as it is.
  await new Promise((r) => setTimeout(r, 5));
  (dbService.getAllChats as jest.Mock).mockResolvedValueOnce([chat(["hi", "new"])]);
  await store.dispatch(fetchChats());
  expect(store.getState().chat.chats[0].content).toHaveLength(2);
});

