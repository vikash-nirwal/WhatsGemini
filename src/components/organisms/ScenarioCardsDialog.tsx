import React, { useState } from "react";
import { FaPlus, FaTimes } from "react-icons/fa";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { TextInput, TextArea } from "src/components/molecules/form-controls";
import { Button } from "src/components/atoms/button";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { BUILT_IN_CARDS, loadCustomCards, makeCardId, saveCustomCards, ScenarioCard, TIME_SKIPS } from "src/features/chat/scenarioCards";
import { describeGap, TIME_UNITS, TimeUnit } from "src/features/chat/passTime";

interface ScenarioCardsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (card: ScenarioCard, drawBackdrop: boolean) => void;
}

const EMPTY = { title: "", setting: "", opening: "", place: "", time: "", outfit: "" };

// Scenario cards (#79): tap one to start that scene; your own are kept in
// this browser.
export const ScenarioCardsDialog: React.FC<ScenarioCardsDialogProps> = ({ open, onOpenChange, onStart }) => {
  const [custom, setCustom] = useState<ScenarioCard[]>(() => loadCustomCards());
  const [drawBackdrop, setDrawBackdrop] = useState(false);
  const [draft, setDraft] = useState<typeof EMPTY | null>(null);

  const saveDraft = () => {
    if (!draft || !draft.title.trim() || !draft.setting.trim() || !draft.opening.trim()) return;
    const card: ScenarioCard = {
      id: makeCardId(),
      title: draft.title.trim(),
      setting: draft.setting.trim(),
      opening: draft.opening.trim(),
      place: draft.place.trim() || undefined,
      time: draft.time.trim() || undefined,
      outfit: draft.outfit.trim() || undefined,
      custom: true,
    };
    const next = [...custom, card];
    setCustom(next);
    saveCustomCards(next);
    setDraft(null);
  };
  const remove = (id: string) => {
    const next = custom.filter((c) => c.id !== id);
    setCustom(next);
    saveCustomCards(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogTitle>Scenario cards</DialogTitle>
        <DialogDescription>Start a new scene in one tap: it sets the place, time and outfit, and the character opens it.</DialogDescription>
        <ToggleSwitch checked={drawBackdrop} onChange={setDrawBackdrop} label={<span className="text-sm text-muted-foreground">Also draw a backdrop for it (uses your image provider)</span>} />
        <ul className="grid gap-2 sm:grid-cols-2">
          {[...BUILT_IN_CARDS, ...custom].map((card) => (
            <li key={card.id} className="relative">
              <button
                type="button"
                onClick={() => onStart(card, drawBackdrop)}
                className="w-full h-full text-left rounded-xl border border-border/60 bg-card/60 p-3 hover:border-primary/60 hover:bg-primary/[0.06] transition-colors"
              >
                <div className="text-[13.5px] font-semibold text-foreground">{card.title}</div>
                <div className="mt-1 text-[12px] text-muted-foreground line-clamp-3">{card.setting}</div>
              </button>
              {card.custom && (
                <Button type="button" variant="ghost" size="icon" className="absolute right-1.5 top-1.5 h-7 w-7 text-subtle hover:text-destructive" aria-label={`Remove ${card.title}`} onClick={() => remove(card.id)}>
                  <FaTimes size={10} />
                </Button>
              )}
            </li>
          ))}
        </ul>
        {draft ? (
          <div role="group" aria-label="New scenario card" className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <TextInput aria-label="Card title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title, e.g. Picnic in the park" />
            <TextArea aria-label="The setting" value={draft.setting} onChange={(e) => setDraft({ ...draft, setting: e.target.value })} placeholder="The setting, as a line of narration" className="resize-none min-h-[60px]" />
            <TextInput aria-label="How they open it" value={draft.opening} onChange={(e) => setDraft({ ...draft, opening: e.target.value })} placeholder="How the character opens the scene" />
            <div className="grid gap-2 sm:grid-cols-3">
              <TextInput aria-label="Place" value={draft.place} onChange={(e) => setDraft({ ...draft, place: e.target.value })} placeholder="Place (optional)" />
              <TextInput aria-label="Time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} placeholder="Time (optional)" />
              <TextInput aria-label="Outfit" value={draft.outfit} onChange={(e) => setDraft({ ...draft, outfit: e.target.value })} placeholder="Outfit (optional)" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)}>Cancel</Button>
              <Button type="button" size="sm" onClick={saveDraft} disabled={!draft.title.trim() || !draft.setting.trim() || !draft.opening.trim()}>Save card</Button>
            </div>
          </div>
        ) : (
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => setDraft({ ...EMPTY })}><FaPlus size={10} /> New card</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// Time skips (#80): a few common jumps, or your own.
// Pass the time (the user's ask) and scene jumps (#80), in one place: how
// long has gone by for everyone - they react to it - or just a cut to later.
export const TimeSkipDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSkip: (skip: string) => void;
  onPassTime: (pass: { amount: number; unit: TimeUnit; note: string; theyTextFirst: boolean }) => void;
}> = ({ open, onOpenChange, onSkip, onPassTime }) => {
  const [custom, setCustom] = useState("");
  const [amount, setAmount] = useState("3");
  const [unit, setUnit] = useState<TimeUnit>("days");
  const [note, setNote] = useState("");
  const [theyTextFirst, setTheyTextFirst] = useState(true);
  const n = Number(amount);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sheet" className="px-4">
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pb-2">
        <DialogTitle className="pt-1">Pass the time</DialogTitle>
        <DialogDescription>Hours, days or years go by for everyone here. They act like it: catching up, what changed, how a long silence feels.</DialogDescription>
        <div className="flex flex-col gap-3">
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
          <TextArea aria-label="What happened meanwhile" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened meanwhile (optional), e.g. she moved to Porto and you never wrote" className="min-h-[60px] resize-none" />
          <ToggleSwitch checked={theyTextFirst} onChange={setTheyTextFirst} label={<span className="text-sm text-muted-foreground">They text first</span>} />
          <Button type="button" disabled={!(n > 0)} onClick={() => onPassTime({ amount: n, unit, note: note.trim(), theyTextFirst })}>
            Pass {n > 0 ? describeGap(n, unit) : "the time"}
          </Button>
        </div>
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <span className="text-sm font-medium text-foreground">Or jump the scene</span>
          <span className="text-xs text-subtle">A short narration moves the story on, without anyone remarking on the time.</span>
          {TIME_SKIPS.map((skip) => (
            <Button key={skip} type="button" variant="outline" onClick={() => onSkip(skip)} className="justify-start">{skip}...</Button>
          ))}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (custom.trim()) onSkip(custom.trim());
            }}
          >
            <TextInput aria-label="Your own time skip" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. That summer" />
            <Button type="submit" disabled={!custom.trim()}>Skip</Button>
          </form>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

