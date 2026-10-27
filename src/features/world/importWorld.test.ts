import { importWorld } from "./importWorld";
import { loadWorldPrefs } from "./worldPrefs";
import { WorldFile } from "./worldFile";

// The slices' thunks, stood in for: each resolves to the record with a new id.
jest.mock("../worldSlice", () => ({
  addWorld: (w: object) => ({ result: { ...w, id: 40 } }),
  patchWorld: () => ({ result: undefined }),
}));
let mockNextId = 100;
jest.mock("../characterSlice", () => ({
  addCharacter: (c: object) => ({ result: { ...c, id: mockNextId++ } }),
  updateCharacter: (c: object) => ({ result: c }),
}));
const dispatch = ((action: { result: unknown }) => {
  const done = Promise.resolve(action.result);
  return Object.assign(done, { unwrap: () => done });
}) as any;

const file = (prefs?: object): WorldFile => ({
  kind: "kindred-world",
  version: 1,
  world: { name: "Harbour", premise: "A port." },
  cast: [{ name: "Aria", key: 1 }],
  ties: [],
  ...(prefs ? { prefs } : {}),
}) as WorldFile;

beforeEach(() => localStorage.clear());

test("an imported world gets the switches it came with, on its new id (#215)", async () => {
  await importWorld(file({ events: true, talkLength: 6 }))(dispatch);
  expect(loadWorldPrefs(40)).toEqual({ events: true, talkLength: 6 });
});

test("a file can't set this device's limits, only the switches meant to travel", async () => {
  await importWorld(file({ secrets: true, callCap: 1, quietHours: [0, 24], keepLiving: false, events: "yes" }))(dispatch);
  expect(loadWorldPrefs(40)).toEqual({ secrets: true });
});

test("a file without switches leaves the world's prefs alone", async () => {
  await importWorld(file())(dispatch);
  expect(localStorage.getItem("world_prefs")).toBeNull();
});
