import React, { useEffect, useState } from "react";
import { FaArrowDown, FaArrowUp, FaMagic, FaPlus, FaTrash } from "react-icons/fa";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { TextArea, TextInput } from "src/components/molecules/form-controls";
import { SegmentedControl } from "src/components/molecules/SegmentedControl";
import { Button } from "src/components/atoms/button";
import { useAppDispatch } from "src/store/hooks";
import { generateAssistText } from "src/features/aiSlice";
import { StoryScript } from "src/types";
import {
  buildScriptDraftPrompt,
  cleanScript,
  emptyScript,
  loadStoryTemplates,
  makeBeat,
  parseScriptDraft,
  saveStoryTemplate,
  StoryTemplate,
} from "src/features/chat/storyScript";

interface StoryScriptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  script: StoryScript | undefined;
  // Saves the script, or removes it when given undefined.
  onSave: (script: StoryScript | undefined) => void;
}

const MODE_OPTIONS = [
  { value: "strict", label: "Strict" },
  { value: "loose", label: "Loose" },
];

// The story script editor (#57): premise, ordered beats, directions and the
// ending, written by hand, split from a pasted story, or loaded from a
// template. Saving replaces the chat's script; nothing reaches the model
// until the next reply.
const StoryScriptDialog: React.FC<StoryScriptDialogProps> = ({ open, onOpenChange, script, onSave }) => {
  const dispatch = useAppDispatch();
  const [draft, setDraft] = useState<StoryScript>(script || emptyScript());
  const [pasted, setPasted] = useState("");
  const [splitting, setSplitting] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<StoryTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft(script ? { ...script, beats: script.beats.map((b) => ({ ...b })) } : { ...emptyScript(), beats: [makeBeat("")] });
    setPasted("");
    setSplitError(null);
    setTemplates(loadStoryTemplates());
  }, [open, script]);

  const update = (patch: Partial<StoryScript>) => setDraft((d) => ({ ...d, ...patch }));
  const setBeat = (index: number, text: string) => update({ beats: draft.beats.map((b, i) => (i === index ? { ...b, text } : b)) });
  const moveBeatAt = (index: number, step: number) => {
    const target = index + step;
    if (target < 0 || target >= draft.beats.length) return;
    const beats = [...draft.beats];
    [beats[index], beats[target]] = [beats[target], beats[index]];
    update({ beats });
  };

  const handleSplit = async () => {
    if (!pasted.trim()) return;
    setSplitting(true);
    setSplitError(null);
    try {
      const reply = await dispatch(generateAssistText({ instruction: buildScriptDraftPrompt(pasted.trim()) })).unwrap();
      const parsed = parseScriptDraft(reply);
      if (!parsed) throw new Error("The AI's answer couldn't be read as a story plan. Try again, or write the beats yourself.");
      update({ ...parsed, currentBeat: 0 });
    } catch (err: any) {
      setSplitError(typeof err === "string" ? err : err?.message || "Couldn't split the story.");
    } finally {
      setSplitting(false);
    }
  };

  const handleSave = () => {
    onSave(cleanScript(draft));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="gap-0 p-0">
        <div className="px-6 pt-5 pb-3 border-b border-border">
          <DialogTitle>Story script</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            The story the AI must stay inside. Each reply sees the premise, your directions and only the current beat, and moves on when that beat happens.
          </DialogDescription>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-5 text-sm">
          <details className="rounded-lg border border-border px-3 py-2">
            <summary className="cursor-pointer font-medium text-foreground">Paste a story or script</summary>
            <div className="mt-3 flex flex-col gap-2">
              <TextArea
                aria-label="Story to split into beats"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder="Paste or write the whole story; the AI splits it into a premise and beats for you to edit."
                className="min-h-[120px]"
              />
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleSplit} disabled={splitting || !pasted.trim()}>
                  <FaMagic size={11} /> {splitting ? "Splitting..." : "Split into beats"}
                </Button>
                {splitError && <span role="alert" className="text-xs text-destructive">{splitError}</span>}
              </div>
            </div>
          </details>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] text-muted-foreground">Premise</span>
            <TextArea value={draft.premise} onChange={(e) => update({ premise: e.target.value })} placeholder="The setup: the world, the situation and who everyone is." className="min-h-[70px]" />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-[11.5px] text-muted-foreground">Story beats, in order</span>
            <ol className="flex flex-col gap-2">
              {draft.beats.map((beat, i) => (
                <li key={beat.id} className="flex items-start gap-2">
                  <span className="mt-2 w-5 text-right text-xs tabular-nums text-subtle">{i + 1}.</span>
                  <TextInput
                    aria-label={`Beat ${i + 1}`}
                    value={beat.text}
                    onChange={(e) => setBeat(i, e.target.value)}
                    placeholder="What happens next"
                    className="flex-1"
                  />
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => moveBeatAt(i, -1)} disabled={i === 0} aria-label={`Move beat ${i + 1} up`}>
                    <FaArrowUp size={11} />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => moveBeatAt(i, 1)} disabled={i === draft.beats.length - 1} aria-label={`Move beat ${i + 1} down`}>
                    <FaArrowDown size={11} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground hover:text-destructive"
                    onClick={() => update({ beats: draft.beats.filter((_, j) => j !== i), currentBeat: Math.min(draft.currentBeat, draft.beats.length - 1) })}
                    aria-label={`Remove beat ${i + 1}`}
                  >
                    <FaTrash size={11} />
                  </Button>
                </li>
              ))}
            </ol>
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => update({ beats: [...draft.beats, makeBeat("")] })}>
                <FaPlus size={10} /> Add beat
              </Button>
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] text-muted-foreground">Directions for the AI</span>
            <TextArea value={draft.directions} onChange={(e) => update({ directions: e.target.value })} placeholder="Tone, pacing, what must or must never happen." className="min-h-[60px]" />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] text-muted-foreground">How it ends (optional)</span>
            <TextInput value={draft.ending || ""} onChange={(e) => update({ ending: e.target.value })} placeholder="Where the story should end up" />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-[11.5px] text-muted-foreground">How closely to follow it</span>
            <SegmentedControl value={draft.mode} onChange={(v) => update({ mode: v as StoryScript["mode"] })} options={MODE_OPTIONS} />
            <span className="text-xs text-subtle">
              {draft.mode === "strict" ? "Nothing outside the script; going off-script is steered back." : "The AI improvises between beats but keeps heading for the next one."}
            </span>
          </div>

          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <span className="text-[11.5px] text-muted-foreground">Templates</span>
            {templates.length > 0 && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Load a template">
                {templates.map((t) => (
                  <Button key={t.id} type="button" variant="outline" size="sm" onClick={() => setDraft({ ...t.script, beats: t.script.beats.map((b) => ({ ...b })), currentBeat: 0 })}>
                    {t.name}
                  </Button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <TextInput aria-label="Template name" value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Name this script to reuse it" className="flex-1" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!templateName.trim() || !cleanScript(draft)}
                onClick={() => {
                  const cleaned = cleanScript(draft);
                  if (!cleaned) return;
                  setTemplates(saveStoryTemplate(templateName.trim(), cleaned));
                  setTemplateName("");
                }}
              >
                Save as template
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-6 py-3">
          {script && (
            <Button type="button" variant="ghost" className="mr-auto text-destructive" onClick={() => { onSave(undefined); onOpenChange(false); }}>
              Remove script
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            Save script
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StoryScriptDialog;
