import { Character, World } from "../../types";
import { AppDispatch } from "../../store/store";
import { addWorld, patchWorld } from "../worldSlice";
import { addCharacter, updateCharacter } from "../characterSlice";
import { relink, WorldFile } from "./worldFile";
import { saveWorldPrefs, travellingPrefs } from "./worldPrefs";

// Imports a world file (#172) as a new world: the world, then its people
// in it, then their ties and groups on their new ids, then its switches
// (#215). Resolves to the world.
export const importWorld = (file: WorldFile) => async (dispatch: AppDispatch) => {
  const { factions: _f, announcements: _a, ...worldOnly } = file.world;
  const world = await dispatch(addWorld(worldOnly as World)).unwrap();
  const idOf: Record<number, number> = {};
  const made: Character[] = [];
  for (const { key, ...card } of file.cast) {
    const c = await dispatch(addCharacter({ ...card, worldId: world.id } as Omit<Character, "id">)).unwrap();
    idOf[key] = c.id;
    made.push(c);
  }
  const { ties, factions, announcements } = relink(file, idOf);
  for (const c of made) {
    if (!ties[c.id]) continue;
    await dispatch(updateCharacter({ ...c, ties: ties[c.id], knowsAbout: ties[c.id].map((t) => t.withId) }));
  }
  if (factions.length || announcements.length) await dispatch(patchWorld(world.id, { ...(factions.length ? { factions } : {}), ...(announcements.length ? { announcements } : {}) }));
  // Filtered again here: a file can come from anyone, and only the switches
  // that are meant to travel should change how this device runs the world.
  const prefs = travellingPrefs(file.prefs);
  if (Object.keys(prefs).length) saveWorldPrefs(world.id, prefs);
  return world;
};
