import { createAsyncThunk } from "@reduxjs/toolkit";
import { generateAssistText } from "../aiSlice";
import { changeMyStatuses } from "../myStatusSlice";
import { worldOf } from "../world/currentWorld";
import { buildMyStatusReactionsPrompt, fallbackReactions, MAX_REACTION_TRIES, parseMyStatusReactions, statusViewersFor } from "./myStatuses";
import { Character, Chat, MyStatus, UserProfile, World } from "../../types";

type State = {
  myStatus: { statuses: MyStatus[] };
  character: { characters: Character[] };
  chat: { chats: Chat[] };
  world: { worlds: World[] };
  settings: { personas: UserProfile[]; activePersonaId: string };
};

// Decides who sees one of your statuses and what they do (#117), on the
// helper model, and saves it. Called when you post and again by
// MyStatusWatcher for any status still undecided - so a failed call, or the
// app closing straight after posting, no longer leaves a status unseen. After
// MAX_REACTION_TRIES failures it falls back to plain views.
export const decideMyStatusReactions = createAsyncThunk("myStatus/decide", async (statusId: string, { getState, dispatch }) => {
  const state = getState() as State;
  const status = state.myStatus.statuses.find((s) => s.id === statusId);
  if (!status || status.decidedAt) return;
  const worlds = state.world.worlds;
  const home = worldOf(status, worlds);
  const viewers = statusViewersFor(
    state.character.characters.filter((c) => worldOf(c, worlds) === home),
    state.chat.chats.filter((c) => worldOf(c, worlds) === home)
  );
  const save = (patch: Partial<MyStatus>) => dispatch(changeMyStatuses((list) => list.map((s) => (s.id === statusId ? { ...s, ...patch } : s))));
  if (viewers.length === 0) {
    await save({ decidedAt: Date.now(), views: [], likes: [], comments: [], replies: [] });
    return;
  }
  const persona = state.settings.personas.find((p) => p.id === state.settings.activePersonaId) || state.settings.personas[0];
  const tries = (status.tries || 0) + 1;
  let reactions: ReturnType<typeof parseMyStatusReactions> | undefined;
  try {
    const reply = await dispatch(generateAssistText({
      instruction: buildMyStatusReactionsPrompt(persona?.name?.trim() || "the user", status, viewers),
      background: true,
      activity: { kind: "status", text: "Who sees your status was decided" },
    })).unwrap();
    const parsed = parseMyStatusReactions(reply, viewers, status.createdAt);
    // An answer that names nobody we know is as good as none.
    if (parsed.views!.length > 0) reactions = parsed;
    else console.warn("Status reactions: the helper's answer named nobody it could match:", reply.slice(0, 300));
  } catch (err) {
    console.warn("Status reactions failed (will retry):", err);
  }
  if (reactions) await save({ ...reactions, decidedAt: Date.now(), tries });
  else if (tries >= MAX_REACTION_TRIES) await save({ ...fallbackReactions(viewers, status.createdAt), decidedAt: Date.now(), tries });
  else await save({ tries });
});
