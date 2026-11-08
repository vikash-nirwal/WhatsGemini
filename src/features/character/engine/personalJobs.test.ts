import { Channel, Character, Chat, World } from "../../../types";
import type { RootState } from "../../../store/store";
import { personalState } from "./state";
import { pickLetterWriter } from "./letterJob";
import { pickFirstTexter } from "./firstTextJob";
import { pickProfileChanger } from "./profileJob";
import { dayLogCheck } from "./dayLogJob";
import { concernsCheck } from "./concernsJob";
import { pickChannel } from "../../channels/engine/channelJob";

// The model and the saves are stood in for, so a job's whole check runs
// without React or IndexedDB (#252).
jest.mock("../../aiSlice", () => ({
  generateAssistText: (args: unknown) => ({ type: "ai/text", args, unwrap: () => Promise.resolve(mockReply) }),
}));
jest.mock("../../characterSlice", () => ({
  patchCharacter: (id: number, change: unknown) => ({ type: "character/patch", id, change }),
}));

let mockReply = "";
const DAY = 24 * 60 * 60 * 1000;
// Noon, when everyone without a schedule is awake and a day log is due.
const NOON = new Date(2026, 9, 27, 12).getTime();
const worlds = [{ id: 5, name: "Harbour Town", premise: "A rainy port." }] as World[];

const stateWith = (characters: Character[], chats: Chat[] = [], extra: { currentWorldId?: number | null; channels?: Channel[] } = {}) =>
  ({
    world: { worlds, currentWorldId: "currentWorldId" in extra ? extra.currentWorldId : 5 },
    character: { characters },
    chat: { chats },
    channels: { channels: extra.channels || [] },
    settings: { personas: [{ id: "me", name: " Sam " }], activePersonaId: "me", privacy: {} },
  }) as unknown as RootState;

// Runs a job's thunk against a fixed store, keeping every plain action.
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

const said = (at: number, text = "hi") => ({ role: "you", text, timestamp: at });

beforeEach(() => {
  localStorage.clear();
  mockReply = "";
});
afterEach(() => jest.restoreAllMocks());

describe("personalState", () => {
  test("sees the people of living worlds only, the dead included, as the components did", () => {
    const home = { id: 1, name: "Aria", prompt: "x" } as Character; // Default: Auto replies off
    const bram = { id: 2, name: "Bram", prompt: "x", worldId: 5 } as Character;
    const gone = { id: 3, name: "Tess", prompt: "x", worldId: 5, lifeEvents: [{ at: 1, text: "Tess died in the storm." }] } as unknown as Character;
    const state = personalState(() => stateWith([home, bram, gone]));
    expect(state.characters.map((c) => c.id)).toEqual([2, 3]);
    expect(state.persona?.name).toBe(" Sam ");
  });

  test("names the world of someone you're not looking at", () => {
    const bram = { id: 2, name: "Bram", prompt: "x", worldId: 5 } as Character;
    expect(personalState(() => stateWith([bram], [], { currentWorldId: 5 })).elsewhere(bram)).toBeUndefined();
    expect(personalState(() => stateWith([bram], [], { currentWorldId: null })).elsewhere(bram)).toBe("Harbour Town");
  });
});

describe("pickers", () => {
  test("a letter comes from a character whose main chat has gone quiet for days", () => {
    const aria = { id: 1, name: "Aria", prompt: "x", writesLetters: true } as Character;
    const kai = { id: 2, name: "Kai", prompt: "x", writesLetters: true } as Character;
    const chats = [
      // Kai's only chat keeps its own memory, so it isn't the main one.
      { id: 11, characterIds: [2], memoryScope: "chat", content: [said(NOON - 10 * DAY)] },
      { id: 10, characterIds: [1], content: [said(NOON - 10 * DAY)] },
    ] as unknown as Chat[];
    const picked = pickLetterWriter([kai, aria], chats, NOON);
    expect(picked?.writer.id).toBe(1);
    expect(picked?.chat.id).toBe(10);
    expect(pickLetterWriter([aria], [{ id: 10, characterIds: [1], content: [said(NOON - DAY)] }] as unknown as Chat[], NOON)).toBeUndefined();
  });

  test("first texts: a stranger may open a chat, a blocked or what-if-only character may not", () => {
    const stranger = { id: 1, name: "Aria", prompt: "x", textsFirst: true } as Character;
    const blocked = { id: 2, name: "Kai", prompt: "x", textsFirst: true } as Character;
    const whatIf = { id: 3, name: "Bram", prompt: "x", textsFirst: true } as Character;
    const chats = [
      { id: 20, characterIds: [2], blocked: { by: "you", at: 1 }, content: [] },
      { id: 30, characterIds: [3], whatIf: true, content: [] },
    ] as unknown as Chat[];
    expect(pickFirstTexter([blocked, whatIf, stranger], chats, NOON)?.id).toBe(1);
    expect(pickFirstTexter([blocked, whatIf], chats, NOON)).toBeUndefined();
  });

  test("a profile change needs a 1:1 chat for its notice", () => {
    const aria = { id: 1, name: "Aria", prompt: "x", profileChanges: true } as Character;
    expect(pickProfileChanger([aria], [], NOON)).toBeUndefined();
    expect(pickProfileChanger([aria], [{ id: 10, characterIds: [1] }] as Chat[], NOON)?.id).toBe(1);
  });

  test("a channel whose character isn't living is skipped", () => {
    const channels = [
      { id: "a", kind: "character", refId: 9, posts: [] },
      { id: "b", kind: "world", refId: 5, posts: [] },
    ] as unknown as Channel[];
    expect(pickChannel(channels, [], worlds, NOON)?.id).toBe("b");
  });
});

describe("checks", () => {
  test("the day log check writes today's account for the first one due", async () => {
    jest.spyOn(Date, "now").mockReturnValue(NOON);
    mockReply = "Slept in, then a long walk by the harbour and coffee with Kai.";
    const bram = { id: 2, name: "Bram", prompt: "x", worldId: 5, dayLogs: true } as Character;
    const actions = await run(dayLogCheck(), stateWith([bram]));
    expect(actions.find((a) => a.type === "ai/text")?.args.activity).toEqual({ kind: "day-log", text: "Bram's day was planned", characterId: 2, name: "Bram" });
    const saved = actions.find((a) => a.type === "character/patch");
    expect(saved.id).toBe(2);
    expect(saved.change.dayLog).toMatchObject({ text: mockReply, writtenAt: NOON });
  });

  test("the concerns check records the time even when the reply is unusable", async () => {
    jest.spyOn(Date, "now").mockReturnValue(NOON);
    mockReply = "";
    const bram = { id: 2, name: "Bram", prompt: "x", worldId: 5, preoccupations: true } as Character;
    const actions = await run(concernsCheck(), stateWith([bram]));
    expect(actions.find((a) => a.type === "character/patch")).toMatchObject({ id: 2, change: { concernsWrittenAt: NOON } });
  });

  test("nobody due, no call", async () => {
    jest.spyOn(Date, "now").mockReturnValue(NOON);
    const bram = { id: 2, name: "Bram", prompt: "x", worldId: 5 } as Character;
    expect(await run(dayLogCheck(), stateWith([bram]))).toEqual([]);
  });
});
