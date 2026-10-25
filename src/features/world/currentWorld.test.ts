import { inWorld, loadCurrentWorld, MY_WORLD, saveCurrentWorld, worldName, worldOf } from "./currentWorld";
import { World } from "../../types";

const worlds = [{ id: 4, name: "Harbour Town", premise: "A port" }] as World[];

describe("current world (#143)", () => {
  it("remembers the world on screen, and My world is no id at all", () => {
    saveCurrentWorld(4);
    expect(loadCurrentWorld()).toBe(4);
    saveCurrentWorld(null);
    expect(loadCurrentWorld()).toBeNull();
  });

  it("puts things in their world, and a deleted world's things in My world", () => {
    expect(worldOf({ worldId: 4 }, worlds)).toBe(4);
    expect(worldOf({ worldId: 9 }, worlds)).toBeNull();
    expect(worldOf({}, worlds)).toBeNull();
    expect([{ worldId: 4 }, {}, { worldId: 9 }].filter(inWorld(null, worlds))).toEqual([{}, { worldId: 9 }]);
    expect(worldName(4, worlds)).toBe("Harbour Town");
    expect(worldName(null, worlds)).toBe(MY_WORLD);
  });
});
