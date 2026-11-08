import { GetState, PersonalDispatch, personalState } from "../../character/engine/state";
import { runTheirGroup } from "../runTheirGroup";
import { theirTalkDue } from "../theirGroup";

// A check still under way when another starts is left alone, as the
// component's own flag did.
let busy = false;

// Groups of theirs (#202): one that's due talks - one group per check, on
// the background model. `at`: a catch-up turn back in your absence.
export const theirGroupCheck = (at?: number) => async (dispatch: PersonalDispatch, getState: GetState) => {
  if (busy) return;
  const now = at ?? Date.now();
  const { livingChats, characters, persona } = personalState(getState);
  const chat = livingChats.find((c) => theirTalkDue(c, now));
  if (!chat) return;
  busy = true;
  try {
    await dispatch(runTheirGroup(chat, characters, persona?.name?.trim() || "the user", now));
  } catch (err) {
    console.warn("Their group's talk failed (non-fatal):", err);
  } finally {
    busy = false;
  }
};
