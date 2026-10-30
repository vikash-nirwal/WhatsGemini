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
// leaves the memory as it was, and the cap still holds it.
export const condenseMemoryIfDue = (owner: MemoryOwner, userName: string) => async (dispatch: AppDispatch) => {
  const key = `${owner.kind}-${owner.id}`;
  if (running.has(key)) return;
  running.add(key);
  try {
    const read = async (): Promise<Memoryful> => (owner.kind === "character" ? dbService.getCharacterById(owner.id) : dbService.getChatById(owner.id));
    const before = await read();
    if (!condenseDue(before)) return;
    const folded = (before.memory || []).slice(0, CONDENSE_COUNT);
    const reply = await dispatch(generateAssistText({ purpose: "memory",
      instruction: buildCondensePrompt(owner.name, userName, folded, before.memoryCategories),
      background: true,
      activity: { at: Date.now(), kind: "other", text: `${owner.name} sorted through old memories`, ...(owner.kind === "character" ? { characterId: owner.id } : {}), name: owner.name },
    })).unwrap();
    const condensed = parseCondensed(reply, folded.length);
    if (!condensed) return;
    // Applied only if those facts are still the oldest: an update that
    // landed meanwhile may have touched one, and then it's next time.
    const still = (m: Memoryful) => folded.every((f, i) => (m.memory || [])[i] === f);
    if (owner.kind === "character") {
      await dispatch(patchCharacter(owner.id, (fresh) => (still(fresh) ? applyCondensed(fresh, folded.length, condensed) : {})));
    } else {
      const fresh: Chat = await dbService.getChatById(owner.id);
      if (!still(fresh)) return;
      const next = applyCondensed(fresh, folded.length, condensed);
      await dispatch(updateChatMemory({ chatId: owner.id, memory: next.memory, memoryCategories: next.memoryCategories ?? null, memoryDates: next.memoryDates ?? null }));
    }
  } catch (err) {
    console.warn("Memory condensing failed (non-fatal):", err);
  } finally {
    running.delete(key);
  }
};
