import React, { useState } from "react";
import { FaBullhorn, FaCrown, FaTimes } from "react-icons/fa";
import { TextArea } from "src/components/molecules/form-controls";
import { Button } from "src/components/atoms/button";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { selectActivePersona } from "src/features/settingsSlice";
import { patchWorld } from "src/features/worldSlice";
import { removeTruth } from "src/features/chat/godMode";
import { removeAnnouncement } from "src/features/world/announcements";
import { announceToWorld } from "src/features/world/announce";
import { runningTask, runTask } from "src/features/tasks/tasksSlice";
import { useWorldCharacters } from "src/hooks/useWorld";
import { World } from "src/types";

// God mode for a whole world (announcements.ts): you announce something,
// everyone there hears it and takes it their own way. Below it, what's been
// announced (with each person's take) and the truths set quietly in chats.
export const WorldAnnouncementsSection = ({ world }: { world: World }) => {
  const dispatch = useAppDispatch();
  const cast = useWorldCharacters();
  const chats = useAppSelector((state) => state.chat.chats);
  const persona = useAppSelector(selectActivePersona);
  const [text, setText] = useState("");
  // A task, not this screen's: it goes on if you leave, and shows as
  // running when you come back.
  const busy = useAppSelector((state) => Boolean(runningTask(state, "announce", String(world.id))));
  const [openId, setOpenId] = useState<string | null>(null);
  const list = [...(world.announcements || [])].reverse();
  const truths = world.godTruths || [];
  const nameOf = (id: string) => cast.find((c) => String(c.id) === id)?.name;

  const announce = () => {
    const said = text;
    setText("");
    void dispatch(runTask({
      kind: "announce",
      key: String(world.id),
      label: `Announcing to ${world.name}`,
      path: "/worlds",
      done: ({ heard }) => ({ title: `Everyone in ${world.name} heard it`, description: heard ? `${heard} of them took it their own way.` : "Their own takes didn't come back; they still know it." }),
      failed: "The announcement wasn't made. Try again.",
    }, () => dispatch(announceToWorld({ world, cast, chats, userName: persona?.name?.trim() || "the user", text: said })))).catch(() => setText((t) => t || said));
  };

  return (
    <section aria-label="Announcements" className="flex flex-col gap-2.5">
      <h3 className="flex items-center gap-2 text-[17px] font-bold text-foreground"><FaBullhorn size={14} className="text-amber-600" aria-hidden /> Announce to everyone</h3>
      <p className="text-[13px] leading-[18px] text-muted-foreground">It becomes true in {world.name}, everyone hears it, and each of them takes it their own way.</p>
      <TextArea aria-label="Announcement" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Magic is now outlawed in the capital" className="min-h-[64px] resize-none" />
      <Button type="button" disabled={!text.trim() || busy} onClick={announce}>{busy ? "Telling everyone..." : "Announce"}</Button>
      {list.length > 0 && (
        <ul className="flex flex-col gap-2">
          {list.map((a) => {
            const takes = Object.entries(a.takes || {}).filter(([id]) => nameOf(id));
            return (
              <li key={a.id} className="rounded-card bg-sunken p-3">
                <div className="flex items-start gap-2">
                  <span className="flex-1 text-[13.5px] font-semibold text-foreground">{a.text}</span>
                  <button type="button" aria-label={`Take back: ${a.text}`} onClick={() => void dispatch(patchWorld(world.id, (w) => ({ announcements: removeAnnouncement(w.announcements, a.id) })))} className="grid h-7 w-7 flex-none place-items-center rounded-md text-subtle hover:text-destructive"><FaTimes size={10} /></button>
                </div>
                {takes.length > 0 && (
                  <button type="button" aria-expanded={openId === a.id} onClick={() => setOpenId(openId === a.id ? null : a.id)} className="text-[12.5px] font-semibold text-primary-text hover:underline">
                    {openId === a.id ? "Hide how they took it" : `How they took it · ${takes.length}`}
                  </button>
                )}
                {openId === a.id && (
                  <ul className="mt-1.5 flex flex-col gap-1.5">
                    {takes.map(([id, take]) => (
                      <li key={id} className="text-[13px] leading-[18px] text-muted-foreground"><span className="font-semibold text-foreground">{nameOf(id)}:</span> {take.replace(/^You\b/, "They")}</li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {truths.length > 0 && (
        <>
          <h4 className="mt-1 flex items-center gap-2 text-[14px] font-semibold text-foreground"><FaCrown size={11} className="text-amber-600" aria-hidden /> Set quietly in chats</h4>
          <ul className="flex flex-col gap-1">
            {truths.map((t) => (
              <li key={t} className="flex items-start gap-2 rounded-xl bg-raised px-3 py-2 text-[13px] text-foreground ring-1 ring-inset ring-border">
                <span className="flex-1">{t}</span>
                <button type="button" aria-label={`Remove: ${t}`} onClick={() => void dispatch(patchWorld(world.id, (w) => ({ godTruths: removeTruth(w.godTruths, t) })))} className="grid h-7 w-7 flex-none place-items-center rounded-md text-subtle hover:text-destructive"><FaTimes size={10} /></button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
};

export default WorldAnnouncementsSection;
