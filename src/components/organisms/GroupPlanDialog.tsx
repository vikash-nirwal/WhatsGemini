import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { TextInput } from "src/components/molecules/form-controls";
import { Button } from "src/components/atoms/button";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { addChat, updateChatOptions } from "src/features/chatSlice";
import { selectActivePersona } from "src/features/settingsSlice";
import { avatarOf } from "src/features/character/profileChanges";
import { planScenario } from "src/features/world/groupPlans";
import { logToTimeline } from "src/features/world/timeline";
import { Character, World } from "src/types";

// Making a group plan (#168): what, when and who, then its group chat.
export const GroupPlanDialog = ({ open, onOpenChange, cast, world }: { open: boolean; onOpenChange: (open: boolean) => void; cast: Character[]; world?: World }) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const persona = useAppSelector(selectActivePersona);
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [date, setDate] = useState("");
  const [chosen, setChosen] = useState<number[]>([]);
  const toggle = (id: number) => setChosen((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const start = async () => {
    const people = cast.filter((c) => chosen.includes(c.id));
    const plan = { title: title.trim(), when: when.trim() || undefined, ...(date ? { date } : {}), memberIds: people.map((c) => c.id), at: Date.now() };
    const chat = await dispatch(addChat({ title: plan.title, characterIds: plan.memberIds, scenario: planScenario(plan, people.map((c) => c.name), persona?.name?.trim() || "You") })).unwrap();
    await dispatch(updateChatOptions({ chatId: chat.id, patch: { groupPlan: plan, offscreenTalk: true } }));
    void logToTimeline(world ? world.id : null, { kind: "you", text: `You made a plan: ${plan.title}${plan.when ? `, ${plan.when}` : ""} (with ${people.map((c) => c.name).join(", ")})`, characterIds: plan.memberIds }, world?.storyTime);
    onOpenChange(false);
    setTitle("");
    setWhen("");
    setDate("");
    setChosen([]);
    navigate(`/chat/${chat.id}`);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sheet" className="px-4">
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pb-2">
          <DialogTitle className="pt-1">Make a plan</DialogTitle>
          <DialogDescription>A plan with a few people, and a group chat to sort it out. When it has happened, they'll remember how it went.</DialogDescription>
          <TextInput aria-label="The plan" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Bonfire on the beach" />
          <div className="flex gap-2">
            <TextInput aria-label="When" value={when} onChange={(e) => setWhen(e.target.value)} placeholder="When (optional), e.g. Saturday night" />
            {/* A real day (#184): a reminder the day before, and it happens even if you forget. */}
            <TextInput type="date" aria-label="Day" value={date} onChange={(e) => setDate(e.target.value)} className="w-[160px] flex-none" />
          </div>
          <ul aria-label="Who's in" className="flex flex-col gap-1.5">
            {cast.map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-3 rounded-xl px-2 py-1.5 ring-1 ring-inset ring-border">
                  <CharacterAvatar name={c.name} accent={c.accent} imageSrc={avatarOf(c)} size={30} />
                  <span className="flex-1 text-[14px] font-semibold text-foreground">{c.name}</span>
                  <input type="checkbox" checked={chosen.includes(c.id)} onChange={() => toggle(c.id)} aria-label={`${c.name} is in`} />
                </label>
              </li>
            ))}
          </ul>
          <Button type="button" disabled={!title.trim() || chosen.length < 2} onClick={() => void start()}>Start the group chat</Button>
          {chosen.length < 2 && <span className="text-[12.5px] text-subtle">Pick at least two people.</span>}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GroupPlanDialog;
