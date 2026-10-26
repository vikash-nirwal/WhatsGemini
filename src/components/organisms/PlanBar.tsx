import React, { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { TextArea } from "src/components/molecules/form-controls";
import { Button } from "src/components/atoms/button";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { addChatNotice, updateChatOptions } from "src/features/chatSlice";
import { updateCharacter } from "src/features/characterSlice";
import { generateAssistText } from "src/features/aiSlice";
import { selectActivePersona } from "src/features/settingsSlice";
import { buildPlanOutcomePrompt, cleanOutcome, planMemory, withPlanMemory } from "src/features/world/groupPlans";
import { logToTimeline } from "src/features/world/timeline";
import { YOU } from "src/utils/constants";
import { Chat } from "src/types";

// A group plan's chat (#168): the plan on top, and "It happened" to write
// up how it went - from your line or the chat - for everyone in it to keep.
export const PlanBar = ({ chat }: { chat: Chat }) => {
  const dispatch = useAppDispatch();
  const characters = useAppSelector((state) => state.character.characters);
  const worlds = useAppSelector((state) => state.world.worlds);
  const persona = useAppSelector(selectActivePersona);
  const [open, setOpen] = useState(false);
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState(false);
  const plan = chat.groupPlan;
  if (!plan || !chat.id) return null;
  const userName = persona?.name?.trim() || "You";
  const members = characters.filter((c) => plan.memberIds.includes(c.id));
  const happened = async () => {
    setBusy(true);
    try {
      const transcript = (chat.content || []).slice(-30).map((m) => `${m.role === YOU ? userName : characters.find((c) => c.id === m.speakerId)?.name || "?"}: ${m.txt}`).join("\n");
      const outcome = cleanOutcome(await dispatch(generateAssistText({ instruction: buildPlanOutcomePrompt(plan, members.map((c) => c.name), userName, transcript, idea) })).unwrap());
      if (!outcome) throw new Error("empty");
      const fact = planMemory(plan, outcome, userName);
      for (const m of members) await dispatch(updateCharacter(withPlanMemory(m, fact)));
      await dispatch(updateChatOptions({ chatId: chat.id!, patch: { groupPlan: { ...plan, outcome, doneAt: Date.now() } } }));
      await dispatch(addChatNotice({ chatId: chat.id!, text: `How it went: ${outcome}` }));
      const world = worlds.find((w) => w.id === chat.worldId);
      void logToTimeline(world ? world.id : null, { kind: "you", text: `${plan.title}: ${outcome}`, characterIds: plan.memberIds }, world?.storyTime);
      setOpen(false);
      setIdea("");
    } catch {
      toast.error("Couldn't write it up. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div role="region" aria-label="Group plan" className="flex items-center gap-3 border-b border-border bg-raised px-4 py-2 text-[13px]">
      <span aria-hidden>📅</span>
      <span className="min-w-0 flex-1 truncate text-foreground"><b>{plan.title}</b>{plan.when && <span className="text-muted-foreground"> · {plan.when}</span>}{plan.outcome && <span className="text-muted-foreground"> · done</span>}</span>
      {!plan.outcome && <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>It happened</Button>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sheet" className="px-4">
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pb-2">
            <DialogTitle className="pt-1">How did {plan.title} go?</DialogTitle>
            <DialogDescription>Say how it went, or leave it to the story. Everyone in it will remember.</DialogDescription>
            <TextArea aria-label="How it went" value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Optional, e.g. it rained and we ended up at Kai's" className="min-h-[70px] resize-none" />
            <Button type="button" disabled={busy} onClick={() => void happened()}>{busy ? "Writing it up..." : "Write it up"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PlanBar;
