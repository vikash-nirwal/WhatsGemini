import React, { useState } from "react";
import { FaGift } from "react-icons/fa";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { TextInput } from "src/components/molecules/form-controls";
import { Button } from "src/components/atoms/button";
import { GIFT_IDEAS } from "src/features/character/gifts";
import { Gift } from "src/types";

interface GiftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  characterName: string;
  gifts: Gift[];
  disabled?: boolean;
  onGive: (what: string) => void;
}

const formatDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

// Gifts (#82): pick an idea or write your own, and see what's been given
// both ways.
export const GiftDialog: React.FC<GiftDialogProps> = ({ open, onOpenChange, characterName, gifts, disabled, onGive }) => {
  const [custom, setCustom] = useState("");
  const give = (what: string) => {
    if (!what.trim() || disabled) return;
    onGive(what.trim());
    setCustom("");
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogTitle>Give {characterName} a gift</DialogTitle>
        <DialogDescription>{characterName} reacts, and remembers it.</DialogDescription>
        <div className="flex flex-col gap-3">
          <div role="group" aria-label="Gift ideas" className="flex flex-wrap gap-2">
            {GIFT_IDEAS.map((idea) => (
              <Button key={idea} type="button" variant="outline" size="sm" disabled={disabled} onClick={() => give(idea)}>
                {idea}
              </Button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              give(custom);
            }}
          >
            <TextInput aria-label="Your own gift" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. A snow globe from Paris" />
            <Button type="submit" disabled={disabled || !custom.trim()}>
              <FaGift size={12} /> Give
            </Button>
          </form>
          <section aria-label="Given">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Given</h3>
            {gifts.length === 0 ? (
              <p className="text-sm text-subtle">Nothing yet, either way.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                {[...gifts].reverse().map((g) => (
                  <li key={g.id} className="text-sm text-foreground flex justify-between gap-3">
                    <span>
                      {g.from === "you" ? "You gave " : `${characterName} gave you `}
                      <span className="font-medium">{g.what}</span>
                    </span>
                    <span className="text-xs text-subtle shrink-0">{formatDate(g.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};
