import { Character, World } from "../../types";
import { AppDispatch } from "../../store/store";
import { addWorld, updateWorld } from "../worldSlice";
import { addCharacter, updateCharacter } from "../characterSlice";
import { relink, WorldFile } from "./worldFile";

// Imports a world file (#172) as a new world: the world, then its people
// in it, then their ties and groups on their new ids. Resolves to the world.
export const importWorld = (file: WorldFile) => async (dispatch: AppDispatch) => {
  const { factions: _f, ...worldOnly } = file.world;
  const world = await dispatch(addWorld(worldOnly as World)).unwrap();
  const idOf: Record<number, number> = {};
  const made: Character[] = [];
  for (const { key, ...card } of file.cast) {
    const c = await dispatch(addCharacter({ ...card, worldId: world.id } as Omit<Character, "id">)).unwrap();
    idOf[key] = c.id;
    made.push(c);
  }
  const { ties, factions } = relink(file, idOf);
  for (const c of made) {
    if (!ties[c.id]) continue;
    await dispatch(updateCharacter({ ...c, ties: ties[c.id], knowsAbout: ties[c.id].map((t) => t.withId) }));
  }
  if (factions.length) await dispatch(updateWorld({ ...world, factions }));
  return world;
};
