import { Chat } from "../../types";
import { AppDispatch } from "../../store/store";
import { generateAssistText } from "../aiSlice";
import { patchCharacter } from "../characterSlice";
import { updateChatMemory } from "../chatSlice";
import { dbService } from "../../services/dbService";
import { applyCondensed, buildCondensePrompt, CONDENSE_COUNT, condenseDue, Memoryful, parseCondensed } from "./condense";

// Running a condensing pass (#232); what it does is in condense.ts.
// Whose memory: a character's own, or a chat's that keeps its own.
export type MemoryOwner = { kind: "character"; id: number; name: string } | { kind: "chat"; id: number; name: string };

const running = new Set<string>();

// One condensing pass when it's due. Best-effort and silent: a failed call
// leaves the memory as it was, and the cap still holds it. `passes` runs more
// while it's still due, for a list that's long now (tidying by hand, or the
// lower threshold catching up with an old one).
export const condenseMemoryIfDue = (owner: MemoryOwner, userName: string, passes = 1) => async (dispatch: AppDispatch) => {
  const key = `${owner.kind}-${owner.id}`;
  if (running.has(key)) return;
  running.add(key);
  try {
    for (let pass = 0; pass < passes; pass++) {
      if (!(await condenseOnce(owner, userName, dispatch))) break;
    }
  } finally {
    running.delete(key);
  }
};

// One pass; true when it folded something.
const condenseOnce = async (owner: MemoryOwner, userName: string, dispatch: AppDispatch): Promise<boolean> => {
  try {
    const read = async (): Promise<Memoryful> => (owner.kind === "character" ? dbService.getCharacterById(owner.id) : dbService.getChatById(owner.id));
    const before = await read();
    if (!condenseDue(before)) return false;
    const folded = (before.memory || []).slice(0, CONDENSE_COUNT);
    const reply = await dispatch(generateAssistText({ purpose: "memory",
      instruction: buildCondensePrompt(owner.name, userName, folded, before.memoryCategories),
      background: true,
      activity: { at: Date.now(), kind: "other", text: `${owner.name} sorted through old memories`, ...(owner.kind === "character" ? { characterId: owner.id } : {}), name: owner.name },
    })).unwrap();
    const condensed = parseCondensed(reply, folded.length);
    if (!condensed) return false;
    // Applied only if those facts are still the oldest: an update that
    // landed meanwhile may have touched one, and then it's next time.
    const still = (m: Memoryful) => folded.every((f, i) => (m.memory || [])[i] === f);
    if (owner.kind === "character") {
      const fresh: Memoryful = await dbService.getCharacterById(owner.id);
      if (!still(fresh)) return false;
      await dispatch(patchCharacter(owner.id, (latest) => (still(latest) ? applyCondensed(latest, folded.length, condensed) : {})));
    } else {
      const fresh: Chat = await dbService.getChatById(owner.id);
      if (!still(fresh)) return false;
      const next = applyCondensed(fresh, folded.length, condensed);
      await dispatch(updateChatMemory({ chatId: owner.id, memory: next.memory, memoryCategories: next.memoryCategories ?? null, memoryDates: next.memoryDates ?? null }));
    }
    return true;
  } catch (err) {
    console.warn("Memory condensing failed (non-fatal):", err);
    return false;
  }
};
