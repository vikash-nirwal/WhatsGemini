import { AppDispatch } from "../../store/store";
import { dbService } from "../../services/dbService";
import { deleteCharacter, patchCharacter } from "../characterSlice";
import { fetchChats } from "../chatSlice";
import { deleteWorld } from "../worldSlice";
import { planWorldDeletion } from "./deleteWorldPlan";

// Deleting a world with its people, keeping the ones ticked; what goes and
// what stays is in deleteWorldPlan.ts.
export const deleteWorldWithPeople = (worldId: number, keepIds: number[]) => async (dispatch: AppDispatch) => {
  const [world, characters, chats] = await Promise.all([dbService.getWorldById(worldId), dbService.getAllCharacters(), dbService.getAllChats()]);
  const plan = planWorldDeletion(worldId, world.name, characters, chats, new Set(keepIds));
  // Chats first, while their people are all still there to read.
  for (const c of plan.chats) await dbService.patchChat(c.id, c.patch);
  for (const k of plan.keep) await dispatch(patchCharacter(k.id, k.patch));
  for (const id of plan.remove) await dispatch(deleteCharacter(id)).unwrap();
  await dispatch(deleteWorld(worldId)).unwrap();
  await dispatch(fetchChats());
};
