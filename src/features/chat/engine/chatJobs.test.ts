import { Character, Chat, World } from "../../../types";
import type { RootState } from "../../../store/store";
import { goBetweenCheck, pickGoBetween } from "./goBetweenJob";
import { pickOffscreenTalk } from "./offscreenTalkJob";
import { theirGroupCheck } from "./theirGroupJob";

// The model, the saves and the toast are stood in for, so a job's whole
// check runs without React or IndexedDB (#252).
jest.mock("../../aiSlice", () => ({
  generateAssistText: (args: unknown) => ({ type: "ai/text", args, unwrap: () => Promise.resolve(mockReply) }),
}));
jest.mock("../../chatSlice", () => ({
  updateChatOptions: (args: unknown) => ({ type: "chat/options", args }),
  addChatNotice: (args: unknown) => ({ type: "chat/notice", args }),
  addMessage: (args: unknown) => ({ type: "chat/message", args }),
  fetchChats: () => ({ type: "chat/fetch" }),
}));
jest.mock("../runTheirGroup", () => ({
  runTheirGroup: (chat: { id: number }, characters: { id: number }[], userName: string, now: number) => ({ type: "chat/theirs", chatId: chat.id, cast: characters.map((c) => c.id), userName, now }),
}));
jest.mock("sonner", () => ({ toast: { message: jest.fn() } }));

let mockReply = "";
const HOUR = 60 * 60 * 1000;
const NOW = new Date(2026, 9, 27, 12).getTime();
const worlds = [{ id: 5, name: "Harbour Town", premise: "A rainy port." }] as World[];

const stateWith = (characters: Character[], chats: Chat[]) =>
  ({
    world: { worlds, currentWorldId: 5 },
    character: { characters },
    chat: { chats },
    channels: { channels: [] },
    settings: { personas: [], activePersonaId: undefined, privacy: {} },
  }) as unknown as RootState;

const run = async (thunk: (dispatch: any, getState: () => RootState) => Promise<void>, state: RootState) => {
  const actions: any[] = [];
  const dispatch = (action: any): any => {
    if (typeof action === "function") return action(dispatch, () => state);
    actions.push(action);
    return action;
  };
  await thunk(dispatch, () => state);
  return actions;
};

const aria = { id: 1, name: "Aria", prompt: "x", worldId: 5, knowsAbout: [2] } as Character;
const kai = { id: 2, name: "Kai", prompt: "x", worldId: 5 } as Character;
const ui = { navigate: jest.fn() };

beforeEach(() => {
  localStorage.clear();
  mockReply = "";
});
afterEach(() => jest.restoreAllMocks());

describe("go-between", () => {
  const blockedChat = { id: 20, characterIds: [2], worldId: 5, blocked: { by: "you", at: NOW - 48 * HOUR }, content: [] } as unknown as Chat;
  const ariaChat = { id: 10, characterIds: [1], worldId: 5, content: [] } as unknown as Chat;

  test("picks a blocked chat whose character is living", () => {
    expect(pickGoBetween([blockedChat], [aria, kai], NOW)?.blocked.id).toBe(2);
    expect(pickGoBetween([blockedChat], [aria], NOW)).toBeUndefined();
  });

  test("the nudge is recorded even with no friend to ask", async () => {
    jest.spyOn(Date, "now").mockReturnValue(NOW);
    const actions = await run(goBetweenCheck(ui, () => 0), stateWith([kai], [blockedChat]));
    expect(actions).toEqual([{ type: "chat/options", args: { chatId: 20, patch: { blocked: { by: "you", at: NOW - 48 * HOUR, nudgedAt: NOW } } } }]);
  });

  test("a shared friend brings it up in their own chat", async () => {
    jest.spyOn(Date, "now").mockReturnValue(NOW);
    mockReply = "Hey, Kai asked me to say he's sorry about the other night.";
    const actions = await run(goBetweenCheck(ui, () => 0), stateWith([aria, kai], [blockedChat, ariaChat]));
    expect(actions.map((a) => a.type)).toEqual(["chat/options", "ai/text", "chat/notice", "chat/message", "chat/fetch"]);
    expect(actions[0].args.patch.blocked.nudgedBy).toBe(1);
    expect(actions[2].args).toEqual({ chatId: 10, text: "Aria is talking about Kai" });
    expect(actions[3].args).toMatchObject({ chatId: 10, speakerId: 1, text: mockReply });
  });
});

describe("talk between members", () => {
  test("a group that's been quiet a while has a pair to talk", () => {
    const group = { id: 30, characterIds: [1, 2], worldId: 5, content: [{ role: "you", text: "hi", timestamp: NOW - 8 * HOUR }] } as unknown as Chat;
    const picked = pickOffscreenTalk([group], [aria, kai], NOW);
    expect(picked?.chat.id).toBe(30);
    expect(picked?.pair.map((c) => c.id).sort()).toEqual([1, 2]);
    // Only one member living: no pair, so nothing this check.
    expect(pickOffscreenTalk([group], [aria], NOW)).toBeUndefined();
  });

  test("their own group runs with the living cast and your name", async () => {
    jest.spyOn(Date, "now").mockReturnValue(NOW);
    const theirs = { id: 40, characterIds: [1, 2], worldId: 5, theirs: { lastAt: 0 }, content: [] } as unknown as Chat;
    const actions = await run(theirGroupCheck(NOW), stateWith([aria, kai], [theirs]));
    expect(actions).toEqual([{ type: "chat/theirs", chatId: 40, cast: [1, 2], userName: "the user", now: NOW }]);
  });
});
