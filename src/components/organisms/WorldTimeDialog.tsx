import React, { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { TextInput, TextArea } from "src/components/molecules/form-controls";
import { Button } from "src/components/atoms/button";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { selectActivePersona } from "src/features/settingsSlice";
import { describeGap, TIME_UNITS, TimeUnit } from "src/features/chat/passTime";
import { passWorldTime } from "src/features/world/passWorldTime";
import { useCurrentWorld, useWorldCharacters, useWorldChats } from "src/hooks/useWorld";

// Pass the time for the whole world you're in (the user's ask, 2026-10-26),
// the same choices as in a chat: every chat there moves on together.
export const WorldTimeDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
  const dispatch = useAppDispatch();
  const { current, currentWorldId, name } = useCurrentWorld();
  const chats = useWorldChats();
  const characters = useWorldCharacters();
  const persona = useAppSelector(selectActivePersona);
  const [amount, setAmount] = useState("3");
  const [unit, setUnit] = useState<TimeUnit>("days");
  const [note, setNote] = useState("");
  const [theyTextFirst, setTheyTextFirst] = useState(true);
  const [busy, setBusy] = useState(false);
  const n = Number(amount);
  const pass = async () => {
    setBusy(true);
    try {
      const texted = await dispatch(passWorldTime({ world: current, worldId: currentWorldId, chats, characters, userName: persona?.name?.trim() || "the user" }, { amount: n, unit, note: note.trim(), theyTextFirst }));
      toast.success(`${describeGap(n, unit)} later in ${name}${texted ? ` · ${texted} texted you` : ""}`);
      onOpenChange(false);
      setNote("");
    } catch {
      toast.error("Couldn't pass the time. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sheet" className="px-4">
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pb-2">
          <DialogTitle className="pt-1">Pass the time in {name}</DialogTitle>
          <DialogDescription>Time goes by for everyone here at once: every chat picks up after the gap, and the people you talk to most may text first.</DialogDescription>
          <div className="flex items-center gap-2">
            <TextInput type="number" min={1} aria-label="How long" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-20" />
            <div role="radiogroup" aria-label="Unit" className="flex flex-wrap gap-1.5">
              {TIME_UNITS.map((u) => (
                <button key={u} type="button" role="radio" aria-checked={unit === u} onClick={() => setUnit(u)}
                  className={unit === u ? "h-9 rounded-full bg-primary/15 px-3 text-[13px] font-semibold text-foreground ring-1 ring-inset ring-primary" : "h-9 rounded-full bg-raised px-3 text-[13px] font-semibold text-foreground ring-1 ring-inset ring-border"}>
                  {u}
                </button>
              ))}
            </div>
          </div>
          <TextArea aria-label="What happened meanwhile" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened meanwhile (optional), e.g. a hard winter; the harbour froze" className="min-h-[60px] resize-none" />
          <ToggleSwitch checked={theyTextFirst} onChange={setTheyTextFirst} label={<span className="text-sm text-muted-foreground">The people you talk to most text first</span>} />
          <Button type="button" disabled={!(n > 0) || busy} onClick={() => void pass()}>{busy ? "Passing..." : `Pass ${n > 0 ? describeGap(n, unit) : "the time"}`}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WorldTimeDialog;
