import React, { useEffect, useState } from "react";
import { FaForward, FaMagic, FaRedo } from "react-icons/fa";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { TextArea } from "src/components/molecules/form-controls";
import { SegmentedControl } from "src/components/molecules/SegmentedControl";
import { Button } from "src/components/atoms/button";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { BEAT_FOCUS, BeatFocus } from "src/features/chat/storyScript";
import { loadFinishLength, saveFinishLength, STORY_LENGTH_OPTIONS, STORY_LENGTHS, StoryLength } from "src/features/chat/storyLength";

export interface FinishBeatChoices {
  length: StoryLength;
  focus: BeatFocus;
  direction: string;
}

const FOCUS_OPTIONS = (Object.keys(BEAT_FOCUS) as BeatFocus[]).map((value) => ({ value, label: BEAT_FOCUS[value].label }));

// "Finish this beat" with the reader in charge: how long the passage is,
// what it leans on and anything they want in it; then a draft to read,
// edit or write again before it goes into the story. Summing the beat up
// as a chapter is on unless they'd rather keep the whole conversation.
const FinishBeatDialog = ({
  open,
  onOpenChange,
  beatText,
  onWrite,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  beatText: string;
  onWrite: (choices: FinishBeatChoices) => Promise<string>;
  onAdd: (text: string, options: { chapter: boolean }) => Promise<void>;
}) => {
  const [length, setLength] = useState<StoryLength>("medium");
  const [focus, setFocus] = useState<BeatFocus>("balanced");
  const [direction, setDirection] = useState("");
  const [draft, setDraft] = useState("");
  const [chapter, setChapter] = useState(true);
  const [busy, setBusy] = useState<"writing" | "adding" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLength(loadFinishLength());
    setFocus("balanced");
    setDirection("");
    setDraft("");
    setChapter(true);
    setError(null);
  }, [open]);

  const write = async () => {
    setBusy("writing");
    setError(null);
    saveFinishLength(length);
    try {
      setDraft(await onWrite({ length, focus, direction }));
    } catch (err: any) {
      setError(typeof err === "string" ? err : err?.message || "Couldn't write the beat.");
    } finally {
      setBusy(null);
    }
  };

  const add = async () => {
    if (!draft.trim()) return;
    setBusy("adding");
    setError(null);
    try {
      await onAdd(draft.trim(), { chapter });
      onOpenChange(false);
    } catch (err: any) {
      setError(typeof err === "string" ? err : err?.message || "Couldn't add it to the story.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent size="lg" className="gap-0 p-0">
        <div className="px-6 pt-5 pb-3 border-b border-border">
          <DialogTitle>Finish this beat</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            The AI writes what's left of "{beatText}" from your story, up to where the next beat starts. Read it, change it, then add it.
          </DialogDescription>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4 text-sm">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11.5px] text-muted-foreground">Length</span>
            <SegmentedControl aria-label="Length" value={length} onChange={(v) => setLength(v as StoryLength)} options={STORY_LENGTH_OPTIONS} />
            <span className="text-xs text-subtle">{STORY_LENGTHS[length].hint}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11.5px] text-muted-foreground">Leaning on</span>
            <SegmentedControl aria-label="Leaning on" value={focus} onChange={(v) => setFocus(v as BeatFocus)} options={FOCUS_OPTIONS} />
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] text-muted-foreground">Anything you want in it (optional)</span>
            <TextArea
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              placeholder="e.g. Darcy hesitates before he speaks; end on Jane's smile"
              className="min-h-[56px]"
            />
          </label>
          <div>
            <Button type="button" variant={draft ? "outline" : "default"} onClick={write} disabled={busy !== null}>
              {draft ? <FaRedo size={10} /> : <FaMagic size={11} />} {busy === "writing" ? "Writing..." : draft ? "Write again" : "Write it"}
            </Button>
          </div>
          {draft && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[11.5px] text-muted-foreground">The rest of the beat (edit freely)</span>
              <TextArea aria-label="The rest of the beat" value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-[200px] text-[14px] leading-relaxed" />
            </label>
          )}
          <ToggleSwitch
            checked={chapter}
            onChange={setChapter}
            label="Sum the beat up as a chapter"
            title="The next replies start from a summary of the beat, as with End chapter; nothing is deleted"
          />
          {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-6 py-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy !== null}>
            Cancel
          </Button>
          <Button type="button" onClick={add} disabled={!draft.trim() || busy !== null}>
            <FaForward size={10} /> {busy === "adding" ? "Adding..." : "Add and go to the next beat"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FinishBeatDialog;
