import type { AppDispatch, RootState } from "../../../store/store";
import { selectActivePersona } from "../../settingsSlice";
import { worldName, worldOf } from "../../world/currentWorld";
import { livingIn } from "../../world/worldPrefs";

// What the personal background jobs (#252) work from, as the world engine's
// `engineState` (#209) is for world jobs. These jobs used to read the store
// through hooks in their components; as thunks they read it when they need
// it, so after a model call `personalState(getState)` gives what's true now.
export type PersonalDispatch = AppDispatch;
export type GetState = () => RootState;

export const personalState = (getState: GetState) => {
  const state = getState();
  const worlds = state.world.worlds;
  const currentWorldId = worlds.some((w) => w.id === state.world.currentWorldId) ? state.world.currentWorldId : null;
  // The people and chats of every world that's still living (#146), as
  // useLivingCharacters and useLivingChats gave the components. Unlike the
  // world engine, the dead aren't left out here: the components never did.
  const living = (item: { worldId?: number }) => livingIn(worldOf(item, worlds), currentWorldId);
  const persona = selectActivePersona(state);
  return {
    worlds,
    characters: state.character.characters.filter(living),
    // Every chat, for the jobs that look across worlds as they always did.
    chats: state.chat.chats,
    livingChats: state.chat.chats.filter(living),
    channels: state.channels.channels,
    persona,
    privacy: state.settings.privacy,
    // The name of a world you're not in, for notifications and toasts (#146).
    elsewhere: (item: { worldId?: number }) => {
      const id = worldOf(item, worlds);
      return id === currentWorldId ? undefined : worldName(id, worlds);
    },
  };
};

export type PersonalState = ReturnType<typeof personalState>;

// What a job that shows a toast needs from the screen: a way to open what
// it's about, and where you are now (no toast for the chat you're reading).
export interface JobUi {
  navigate: (to: string) => void;
  path?: () => string;
}
