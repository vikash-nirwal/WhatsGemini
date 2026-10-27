import type { AppDispatch, RootState } from "../../../store/store";
import { selectActivePersona } from "../../settingsSlice";
import { worldOf } from "../currentWorld";
import { livingIn } from "../worldPrefs";

// What the world engine's jobs (#209) work from. They're thunks, so they
// read the store when they need it: after a model call has taken a few
// seconds, `engineState(getState)` gives what's true now, not what was
// true when the job started.
export type EngineDispatch = AppDispatch;
export type GetState = () => RootState;

export const engineState = (getState: GetState) => {
  const state = getState();
  const worlds = state.world.worlds;
  const currentWorldId = worlds.some((w) => w.id === state.world.currentWorldId) ? state.world.currentWorldId : null;
  // Background life (#146) sees the people of every world that's still
  // living: the one on screen, and others unless switched off.
  const characters = state.character.characters.filter((c) => livingIn(worldOf(c, worlds), currentWorldId));
  const persona = selectActivePersona(state);
  return {
    worlds,
    characters,
    chats: state.chat.chats,
    channels: state.channels.channels,
    persona,
    userName: persona?.name?.trim() || "the user",
  };
};

export type EngineState = ReturnType<typeof engineState>;
