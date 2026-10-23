import React from "react";
import { toast } from "sonner";
import { FaCopy, FaBook } from "react-icons/fa";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { Button } from "src/components/atoms/button";
import MarkdownRenderer from "src/components/molecules/MarkdownRenderer";

interface PovDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  characterName: string;
  text: string | null; // null while it's being written
  onKeep: (text: string) => void;
}

// Their point of view (#101): the recent scene, told by the character.
export const PovDialog: React.FC<PovDialogProps> = ({ open, onOpenChange, characterName, text, onKeep }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-lg">
      <DialogTitle>{characterName}'s side of the story</DialogTitle>
      <DialogDescription>The recent scene, as {characterName} saw it, with what they didn't say.</DialogDescription>
      {text ? (
        <>
          <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-border bg-background px-4 py-3 font-serif text-[15px] leading-relaxed text-foreground" data-slot="pov-text">
            <MarkdownRenderer msgText={text} isUser={false} />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void navigator.clipboard?.writeText(text).then(() => toast.success("Copied"), () => toast.error("Couldn't copy"));
              }}
            >
              <FaCopy size={11} /> Copy
            </Button>
            <Button type="button" onClick={() => onKeep(text)}>
              <FaBook size={11} /> Keep in {characterName}'s diary
            </Button>
          </div>
        </>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">{characterName} is writing it…</p>
      )}
    </DialogContent>
  </Dialog>
);
