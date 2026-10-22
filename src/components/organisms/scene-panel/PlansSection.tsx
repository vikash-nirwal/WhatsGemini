import React, { useState } from "react";
import { FaTimes } from "react-icons/fa";
import { useAppDispatch } from "src/store/hooks";
import { updateChatOptions } from "src/features/chatSlice";
import { Input } from "src/components/atoms/input";
import { Button } from "src/components/atoms/button";
import { Checkbox } from "src/components/atoms/checkbox";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { cn } from "src/utils/cn";
import { newPlanId } from "src/features/chat/sharedPlans";
import { Chat, SharedPlan } from "src/types";

// Shared plans (#84) in the Story tab: tick one off, remove it, or add your
// own; "Notice plans" lets a helper check pick them up from the chat.
export const PlansSection: React.FC<{ chat: Chat; characterName: string }> = ({ chat, characterName }) => {
  const dispatch = useAppDispatch();
  const [draft, setDraft] = useState("");
  const plans = chat.plans || [];
  const save = (next: SharedPlan[]) => dispatch(updateChatOptions({ chatId: chat.id!, patch: { plans: next } }));
  const add = () => {
    const what = draft.trim();
    if (!what) return;
    save([...plans, { id: newPlanId(), what, createdAt: Date.now() }]);
    setDraft("");
  };
  const open = plans.filter((p) => !p.doneAt);
  // Open plans first, then the last few that happened.
  const shown = [...open, ...plans.filter((p) => p.doneAt).slice(-5).reverse()];

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span data-slot="section-title" className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold">Plans together</span>
        {open.length > 0 && <span className="text-[11px] text-primary">{open.length}</span>}
      </div>
      <div className="mb-2.5">
        <ToggleSwitch
          checked={Boolean(chat.planTracking)}
          onChange={(on) => dispatch(updateChatOptions({ chatId: chat.id!, patch: { planTracking: on } }))}
          label={<span className="text-[12.5px] text-foreground">Notice plans you make with {characterName}</span>}
        />
      </div>
      {shown.length === 0 ? (
        <p className="text-[12.5px] text-subtle mb-2">No plans yet. {characterName} remembers the ones here and brings them up when the day comes.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 mb-2" aria-label="Plans together">
          {shown.map((p) => (
            <li key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background border border-border/30 text-[12.5px]">
              <Checkbox
                checked={Boolean(p.doneAt)}
                onCheckedChange={(checked) => save(plans.map((x) => (x.id === p.id ? { ...x, doneAt: checked === true ? Date.now() : undefined } : x)))}
                aria-label={`Done: ${p.what}`}
              />
              <span className={cn("flex-1 text-foreground", p.doneAt && "line-through text-subtle")}>
                {p.what}
                {(p.when || p.date) && <span className="text-subtle"> · {p.when || p.date}</span>}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => save(plans.filter((x) => x.id !== p.id))}
                className="h-auto w-auto p-0.5 text-subtle hover:text-destructive hover:bg-transparent"
                aria-label={`Remove plan: ${p.what}`}
              >
                <FaTimes size={10} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Input aria-label="New plan" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. Stargazing on Saturday" className="h-8 text-[12.5px]" />
        <Button type="submit" size="sm" disabled={!draft.trim()}>Add</Button>
      </form>
    </div>
  );
};
