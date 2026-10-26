import React from "react";
import { FaCrown, FaTimes } from "react-icons/fa";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { updateChatOptions } from "src/features/chatSlice";
import { patchWorld } from "src/features/worldSlice";
import { removeTruth } from "src/features/chat/godMode";
import { Chat } from "src/types";

// What you made true in god mode (#160): this chat's world's truths (or, out
// of a world, this chat's), each removable. Turn god mode on in the composer
// to add more.
export const GodTruthsSection = ({ chat }: { chat: Chat }) => {
  const dispatch = useAppDispatch();
  const world = useAppSelector((state) => state.world.worlds.find((w) => w.id === chat.worldId));
  const truths = world ? world.godTruths || [] : chat.godTruths || [];
  if (truths.length === 0) return null;
  const remove = (t: string) =>
    world ? dispatch(patchWorld(world.id, (w) => ({ godTruths: removeTruth(w.godTruths, t) }))) : chat.id && dispatch(updateChatOptions({ chatId: chat.id, patch: { godTruths: removeTruth(chat.godTruths, t) } }));
  return (
    <section aria-label="God mode truths" className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold text-foreground"><FaCrown size={12} className="text-amber-600" /> True {world ? `in ${world.name}` : "in this chat"}</h3>
      <p className="text-[12.5px] text-subtle">What you made true in god mode. Everyone here accepts it.</p>
      <ul className="flex flex-col gap-1">
        {truths.map((t) => (
          <li key={t} className="flex items-start gap-2 rounded-xl bg-raised px-3 py-2 text-[13.5px] text-foreground ring-1 ring-inset ring-border">
            <span className="flex-1">{t}</span>
            <button type="button" aria-label={`Remove: ${t}`} onClick={() => void remove(t)} className="grid h-7 w-7 flex-none place-items-center rounded-md text-subtle hover:text-destructive"><FaTimes size={10} /></button>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default GodTruthsSection;
