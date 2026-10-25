import React, { useState } from "react";
import { FaPlus, FaTimes } from "react-icons/fa";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { Button } from "src/components/atoms/button";
import { Input } from "src/components/atoms/input";

const MAX_OPTIONS = 6;

// Create a poll (#124) for a group chat: a question and two to six options.
const PollDialog = ({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange: (open: boolean) => void; onCreate: (question: string, options: string[]) => void }) => {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const filled = options.map((o) => o.trim()).filter(Boolean);
  const ready = question.trim() && filled.length >= 2;
  const create = () => {
    if (!ready) return;
    onCreate(question.trim(), filled);
    setQuestion("");
    setOptions(["", ""]);
    onOpenChange(false);
  };
  // #156: a bottom sheet as on the canvas - Cancel, the question, the
  // options in rows, and Send poll at the bottom.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sheet" className="px-4">
        <DialogTitle className="sr-only">Create poll</DialogTitle>
        <DialogDescription className="sr-only">Everyone in the group can vote, you included.</DialogDescription>
        <div className="flex items-center pb-2">
          <Button type="button" variant="ghost" className="text-muted-foreground" onClick={() => onOpenChange(false)}>Cancel</Button>
          <h2 aria-hidden className="flex-1 text-center text-[17px] font-bold text-foreground">New poll</h2>
          <span className="w-[76px]" />
        </div>
        <div className="flex min-h-0 flex-col gap-[18px] overflow-y-auto pb-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="poll-question" className="text-[12px] font-bold text-subtle">Question</label>
            <Input id="poll-question" aria-label="Poll question" placeholder="Ask a question" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={200} className="h-12 rounded-xl border-0 bg-sunken text-[16px]" />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-bold text-subtle">Options</span>
            {options.map((o, i) => (
              <div key={i} className="flex min-h-12 items-center gap-1 rounded-xl bg-sunken pl-1 pr-1.5">
                <Input aria-label={`Option ${i + 1}`} placeholder={`Option ${i + 1}`} value={o} maxLength={80} onChange={(e) => setOptions((all) => all.map((x, j) => (j === i ? e.target.value : x)))} className="h-11 border-0 bg-transparent text-[15px] shadow-none" />
                {options.length > 2 && (
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove option ${i + 1}`} onClick={() => setOptions((all) => all.filter((_, j) => j !== i))} className="h-9 w-9 flex-none">
                    <FaTimes size={11} />
                  </Button>
                )}
              </div>
            ))}
            {options.length < MAX_OPTIONS && (
              <button type="button" onClick={() => setOptions((all) => [...all, ""])} className="flex min-h-11 items-center gap-2 rounded-xl px-3.5 text-[14px] font-semibold text-primary-text ring-[1.5px] ring-inset ring-border-strong">
                <FaPlus size={11} /> Add option
              </button>
            )}
            <p className="text-[12px] text-subtle">Everyone in the group votes in character, you included.</p>
          </div>
        </div>
        <Button type="button" onClick={create} disabled={!ready} className="h-12 w-full text-[15px]">Send poll</Button>
      </DialogContent>
    </Dialog>
  );
};

export default PollDialog;
