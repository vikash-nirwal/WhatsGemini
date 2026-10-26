import { configureStore } from "@reduxjs/toolkit";
import worldReducer, { patchWorld } from "./worldSlice";
import { dbService } from "../services/dbService";
import { World } from "../types";

jest.mock("../services/dbService", () => ({
  dbService: { getWorldById: jest.fn(), updateWorld: jest.fn() },
}));

const makeStore = () => configureStore({ reducer: { world: worldReducer } });

describe("patchWorld (#173)", () => {
  // What's in the database now has a newer chapter than the copy the caller
  // read earlier; a patch must keep it.
  const latest = { id: 3, name: "Harbour", premise: "A port.", arc: { title: "Bell", beats: ["a", "b"], step: 1, startedAt: 0, stepAt: 5 } } as World;
  beforeEach(() => {
    (dbService.getWorldById as jest.Mock).mockResolvedValue(latest);
    (dbService.updateWorld as jest.Mock).mockResolvedValue(3);
  });

  it("changes only the named fields of the latest world", async () => {
    await makeStore().dispatch(patchWorld(3, { lastEventCheckAt: 9 }) as any);
    expect(dbService.updateWorld).toHaveBeenCalledWith({ ...latest, lastEventCheckAt: 9 });
  });

  it("can work the change out from the latest world", async () => {
    await makeStore().dispatch(patchWorld(3, (w) => ({ godTruths: [...(w.godTruths || []), "It rains"] })) as any);
    expect(dbService.updateWorld).toHaveBeenCalledWith({ ...latest, godTruths: ["It rains"] });
  });
});
