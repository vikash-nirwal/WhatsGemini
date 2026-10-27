import type { AppDispatch, RootState } from "../../../store/store";
import { selectActivePersona } from "../../settingsSlice";
import { worldOf } from "../currentWorld";
import { livingIn } from "../worldPrefs";
import { isGone } from "../canon";

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
  // Someone who has died takes no further part in it (#220).
  const characters = state.character.characters.filter((c) => livingIn(worldOf(c, worlds), currentWorldId) && !isGone(c));
  const persona = selectActivePersona(state);
  return {
    worlds,
    characters,
    // Everyone, the dead included, for the canon check (#220).
    everyone: state.character.characters,
    chats: state.chat.chats,
    channels: state.channels.channels,
    persona,
    userName: persona?.name?.trim() || "the user",
  };
};

export type EngineState = ReturnType<typeof engineState>;
