import React, { useState } from "react";
import { FaBookOpen, FaMagic } from "react-icons/fa";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { TextArea } from "src/components/molecules/form-controls";
import { Button } from "src/components/atoms/button";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { generateAssistText } from "src/features/aiSlice";
import { selectActivePersona } from "src/features/settingsSlice";
import { arcActive, buildArcPrompt, parseArc } from "src/features/world/worldArcs";
import { endWorldArc, moveArcOn, startWorldArc } from "src/features/world/startEvent";
import { useWorldCharacters } from "src/hooks/useWorld";
import { outputsSet, runningTask, runTask } from "src/features/tasks/tasksSlice";
import { World, WorldArc } from "src/types";
import { cn } from "src/utils/cn";

// A storyline across the world (#169): start one from an idea (or none),
// see where it stands, move it on or end it. Beats also move on by
// themselves every couple of story days.
export const WorldArcSection = ({ world }: { world: World }) => {
  const dispatch = useAppDispatch();
  const cast = useWorldCharacters();
  const persona = useAppSelector(selectActivePersona);
  const [open, setOpen] = useState(false);
  const [idea, setIdea] = useState("");
  // Writing it is a task (tasksSlice): leave while it's written, and the
  // draft waits here for you.
  const outKey = `arc-${world.id}`;
  const draft = (useAppSelector((state) => state.tasks.outputs[outKey]) as WorldArc[] | undefined)?.[0];
  const setDraft = (d: WorldArc | undefined) => dispatch(outputsSet({ key: outKey, items: d ? [d] : [] }));
  const busy = useAppSelector((state) => Boolean(runningTask(state, "arc", String(world.id))));
  const arc = arcActive(world);

  const write = () => {
    void dispatch(runTask({ kind: "arc", key: String(world.id), label: `Writing a storyline for ${world.name}`, quiet: true }, async () => {
      const reply = await dispatch(generateAssistText({ instruction: buildArcPrompt(world, cast.map((c) => c.name), persona?.name?.trim() || "the user", idea) })).unwrap();
      const made = parseArc(reply, Date.now());
      if (!made) throw new Error("unreadable");
      setDraft(made);
    })).catch(() => toast.error("No storyline came back. Try again."));
  };
  const begin = async () => {
    if (!draft) return;
    const now = Date.now();
    await dispatch(startWorldArc(world, { ...draft, startedAt: now, stepAt: now }));
    setOpen(false);
    setDraft(undefined);
    setIdea("");
  };

  return (
    <section aria-label="Storyline" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <h3 className="text-[17px] font-bold text-foreground">Storyline</h3>
        {!arc && <button type="button" onClick={() => setOpen(true)} className="text-[13.5px] font-bold text-primary-text hover:underline">{busy ? "Writing one..." : draft ? "Your storyline is ready" : "Start a storyline"}</button>}
      </div>
      {!arc ? (
        <p className="text-[13.5px] text-muted-foreground">{world.arc?.doneAt ? `"${world.arc.title}" has ended.` : "None yet. A storyline unfolds across the world over a few weeks, with you in it."}</p>
      ) : (
        <div className="flex flex-col gap-2 rounded-card bg-sunken p-3">
          <div className="flex items-center gap-2 text-[14px] font-bold text-foreground"><FaBookOpen size={12} aria-hidden className="text-primary-text" />{arc.title}</div>
          <ol className="flex flex-col gap-1.5">
            {arc.beats.slice(0, arc.step + 1).map((b, i) => (
              <li key={i} className={cn("text-[13px] leading-[18px]", i === arc.step ? "font-semibold text-foreground" : "text-subtle")}>{i === arc.step ? "Now: " : ""}{b}</li>
            ))}
          </ol>
          <span className="text-[12px] text-subtle">Chapter {arc.step + 1} of {arc.beats.length}</span>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void dispatch(moveArcOn(world, Date.now()))}>{arc.step + 1 >= arc.beats.length ? "Finish it" : "Next chapter"}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => void dispatch(endWorldArc(world, Date.now()))}>End storyline</Button>
          </div>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sheet" className="px-4">
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pb-2">
            <DialogTitle className="pt-1">Start a storyline</DialogTitle>
            <DialogDescription>A story that runs across {world.name} for a few weeks, in chapters: in their chats, statuses, the news and their talk. You're in it.</DialogDescription>
            <TextArea aria-label="Storyline idea" value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="An idea (optional), e.g. someone is stealing from the boats" className="min-h-[60px] resize-none" />
            <Button type="button" variant="outline" disabled={busy} onClick={write}><FaMagic size={12} /> {busy ? "Writing..." : draft ? "Write another" : "Write it"}</Button>
            {draft && (
              <div className="flex flex-col gap-1.5 rounded-card bg-sunken p-3">
                <div className="text-[14px] font-bold text-foreground">{draft.title}</div>
                <ol aria-label="Chapters" className="list-decimal pl-5 text-[13px] leading-[18px] text-muted-foreground">
                  {draft.beats.map((b, i) => <li key={i}>{b}</li>)}
                </ol>
              </div>
            )}
            <Button type="button" disabled={!draft} onClick={() => void begin()}>Begin</Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default WorldArcSection;
