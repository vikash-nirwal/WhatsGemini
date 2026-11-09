import React, { useEffect, useState } from "react";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { FaArrowDown, FaArrowUp, FaMagic, FaPlus, FaTrash } from "react-icons/fa";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/components/molecules/dialog";
import { Select, TextArea, TextInput } from "src/components/molecules/form-controls";
import { SegmentedControl } from "src/components/molecules/SegmentedControl";
import { Button } from "src/components/atoms/button";
import { useAppDispatch } from "src/store/hooks";
import { generateAssistText } from "src/features/aiSlice";
import { StoryCastMember, StoryScript } from "src/types";
import { StoryCastEditor } from "src/components/molecules/StoryCastEditor";
import {
  applyCastRenames,
  beatsMissingDetails,
  buildFillDetailsPrompt,
  buildResplitPrompt,
  buildScriptDraftPrompt,
  cleanScript,
  emptyScript,
  keepSource,
  loadStoryTemplates,
  makeBeat,
  parseFillDetails,
  parseResplit,
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
  // The chat's character in a 1:1 chat, who can take one of the story's parts.
  characterName?: string;
  // A group chat's members (#242), who can each take one of the parts.
  members?: { id: number; name: string }[];
  // An 18+ story or chat (#255), where beats can be marked intimate.
  adult?: boolean;
}

const MODE_OPTIONS = [
  { value: "strict", label: "Strict" },
  { value: "loose", label: "Loose" },
];

// The story script editor (#57): premise, ordered beats, directions and the
// ending, written by hand, split from a pasted story, or loaded from a
// template. Saving replaces the chat's script; nothing reaches the model
// until the next reply.
const StoryScriptDialog: React.FC<StoryScriptDialogProps> = ({ open, onOpenChange, script, onSave, characterName, members, adult = false }) => {
  const dispatch = useAppDispatch();
  const [draft, setDraft] = useState<StoryScript>(script || emptyScript());
  const [pasted, setPasted] = useState("");
  const [splitting, setSplitting] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);
  // "Read the story again" (#240): which helper call is running, and the
  // beat (1-based) to split again from.
  const [rereading, setRereading] = useState<"details" | "split" | null>(null);
  const [rereadError, setRereadError] = useState<string | null>(null);
  const [resplitFrom, setResplitFrom] = useState(1);
  const [templates, setTemplates] = useState<StoryTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");
  // The story's people as the script text names them, so a rename can be
  // carried through the premise, beats and the rest on save.
  const [castBefore, setCastBefore] = useState<StoryCastMember[] | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    setDraft(script ? { ...script, beats: script.beats.map((b) => ({ ...b })), cast: script.cast?.map((c) => ({ ...c })) } : { ...emptyScript(), beats: [makeBeat("")] });
    setCastBefore(script?.cast);
    setPasted("");
    setSplitError(null);
    setRereadError(null);
    setResplitFrom(Math.min((script?.currentBeat ?? 0) + 1, Math.max(1, script?.beats.length ?? 1)));
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
      // The story's text is kept with the script (#240), to read it again later.
      update({ ...parsed, cast: parsed.cast || [], currentBeat: 0, source: keepSource(pasted) });
      setCastBefore(parsed.cast);
    } catch (err: any) {
      setSplitError(typeof err === "string" ? err : err?.message || "Couldn't split the story.");
    } finally {
      setSplitting(false);
    }
  };

  // Both keep the beats already there and where the story is; only the
  // helper reads the kept story, never a reply.
  const handleReread = async (kind: "details" | "split") => {
    if (!draft.source) return;
    setRereading(kind);
    setRereadError(null);
    try {
      const from = Math.max(0, Math.min(resplitFrom - 1, draft.beats.length));
      const instruction = kind === "details" ? buildFillDetailsPrompt(draft) : buildResplitPrompt(draft, from);
      const reply = await dispatch(generateAssistText({ instruction })).unwrap();
      const next = kind === "details" ? parseFillDetails(reply, draft) : parseResplit(reply, draft, from);
      if (!next) throw new Error("The AI's answer couldn't be read. Try again.");
      setDraft(next);
    } catch (err: any) {
      setRereadError(typeof err === "string" ? err : err?.message || "Couldn't read the story again.");
    } finally {
      setRereading(null);
    }
  };
  const missingDetails = beatsMissingDetails(draft).filter((i) => draft.beats[i].text.trim()).length;

  // Renames are written into the script text here, once, rather than on
  // every keystroke, where half-typed names would be swapped in.
  const finalDraft = () => applyCastRenames(draft, castBefore);

  const handleSave = () => {
    onSave(cleanScript(finalDraft()));
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

          {draft.source && (
            <details className="rounded-lg border border-border px-3 py-2">
              <summary className="cursor-pointer font-medium text-foreground">Read the story again</summary>
              <div className="mt-3 flex flex-col gap-3">
                <span className="text-xs text-subtle">Your story is kept with the script, so the AI can read it again. Replies never see it, only the beats.</span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => handleReread("details")} disabled={rereading !== null || missingDetails === 0}>
                    <FaMagic size={11} /> {rereading === "details" ? "Reading..." : "Fill in beat events"}
                  </Button>
                  <span className="text-xs text-subtle">{missingDetails === 0 ? "Every beat has its events." : `${missingDetails} beat${missingDetails === 1 ? " has" : "s have"} none yet.`}</span>
                </div>
                {draft.beats.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Split again from beat</span>
                    <Select aria-label="Split again from beat" value={String(resplitFrom)} onChange={(e) => setResplitFrom(Number(e.target.value))} className="w-20">
                      {draft.beats.map((_, i) => (
                        <option key={i} value={String(i + 1)}>{i + 1}</option>
                      ))}
                    </Select>
                    <Button type="button" variant="outline" size="sm" onClick={() => handleReread("split")} disabled={rereading !== null}>
                      <FaMagic size={11} /> {rereading === "split" ? "Splitting..." : "Split again"}
                    </Button>
                  </div>
                )}
                {rereadError && <span role="alert" className="text-xs text-destructive">{rereadError}</span>}
              </div>
            </details>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] text-muted-foreground">Premise</span>
            <TextArea value={draft.premise} onChange={(e) => update({ premise: e.target.value })} placeholder="The setup: the world, the situation and who everyone is." className="min-h-[70px]" />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-[11.5px] text-muted-foreground">Story characters</span>
            <span className="text-xs text-subtle">
              Rename anyone and the whole story follows.{" "}
              {members
                ? "Give anyone in the group a part; the parts nobody plays are shared out among them."
                : characterName
                  ? `${characterName} voices everyone the AI plays, several in one reply when the scene needs them.`
                  : "The AI voices everyone you don't play."}
            </span>
            <StoryCastEditor cast={draft.cast || []} onChange={(cast) => update({ cast })} characterName={characterName} members={members} />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[11.5px] text-muted-foreground">Story beats, in order{draft.beats.length > 1 ? ` (${draft.beats.length})` : ""}</span>
            <ol className="flex flex-col gap-2">
              {draft.beats.map((beat, i) => (
                <li key={beat.id} className="flex items-start gap-2">
                  <span className="mt-2 w-5 text-right text-xs tabular-nums text-subtle">{i + 1}.</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <TextInput aria-label={`Beat ${i + 1}`} value={beat.text} onChange={(e) => setBeat(i, e.target.value)} placeholder="What happens next" />
                    <TextArea
                      aria-label={`What happens in beat ${i + 1}`}
                      value={beat.details || ""}
                      onChange={(e) => update({ beats: draft.beats.map((b, j) => (j === i ? { ...b, details: e.target.value } : b)) })}
                      placeholder="What happens in it in the story (optional)"
                      className="min-h-[44px] text-[13px]"
                    />
                    {adult && (
                      <ToggleSwitch
                        checked={Boolean(beat.intimate)}
                        onChange={(on) => update({ beats: draft.beats.map((b, j) => (j === i ? { ...b, intimate: on || undefined } : b)) })}
                        label="Intimate beat"
                        title="Only intimate beats go as far as the intensity allows; the rest keep to the plot"
                        className="text-xs"
                      />
                    )}
                  </div>
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
            <span className="text-[11.5px] text-muted-foreground">Your changes to the story (optional)</span>
            <TextArea
              aria-label="Your changes to the story"
              value={draft.instructions || ""}
              onChange={(e) => update({ instructions: e.target.value })}
              placeholder="Anything to do differently from the story: a twist, a different setting, someone kinder or crueler."
              className="min-h-[60px]"
            />
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
                  const cleaned = cleanScript(finalDraft());
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
