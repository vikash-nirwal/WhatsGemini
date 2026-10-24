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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Create poll</DialogTitle>
        <DialogDescription>Everyone in the group can vote, you included.</DialogDescription>
        <Input aria-label="Poll question" placeholder="Ask a question" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={200} />
        <div className="flex flex-col gap-2">
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input aria-label={`Option ${i + 1}`} placeholder={`Option ${i + 1}`} value={o} maxLength={80} onChange={(e) => setOptions((all) => all.map((x, j) => (j === i ? e.target.value : x)))} />
              {options.length > 2 && (
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove option ${i + 1}`} onClick={() => setOptions((all) => all.filter((_, j) => j !== i))}>
                  <FaTimes size={11} />
                </Button>
              )}
            </div>
          ))}
          {options.length < MAX_OPTIONS && (
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setOptions((all) => [...all, ""])}>
              <FaPlus size={10} /> Add option
            </Button>
          )}
        </div>
        <Button type="button" onClick={create} disabled={!ready}>Send poll</Button>
      </DialogContent>
    </Dialog>
  );
};

export default PollDialog;
