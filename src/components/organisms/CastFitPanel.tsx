import React, { useState } from "react";
import { FaMagic, FaUndo } from "react-icons/fa";
import { Button } from "src/components/atoms/button";
import { TextInput } from "src/components/molecules/form-controls";
import { useAppDispatch } from "src/store/hooks";
import { generateAssistText } from "src/features/aiSlice";
import { buildFitPrompt, currentFit, editFit, FIT_LABELS, FitCard, FitHistory, lastChanges, parseFit, undoFit, withFit } from "src/features/world/fitToWorld";
import { World } from "src/types";

// One person's AI changes in the world wizard (#237): "Fit to <world>" for
// someone joining from another world, "Change with AI" for anyone, and the
// latest change before and after, each field editable, with undo.
export const CastFitPanel = ({
  name, base, traits, joining, world, ties, history, onChange,
}: {
  name: string;
  base: FitCard; // their card as it came, before any change here
  traits?: string[];
  joining: boolean; // from another world: offers "Fit to this world"
  world: Pick<World, "name" | "premise" | "tone" | "era">;
  ties: string[]; // who they are to the others here, in plain words
  history?: FitHistory;
  onChange: (history: FitHistory | undefined) => void;
}) => {
  const dispatch = useAppDispatch();
  const [asking, setAsking] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const card = { ...base, ...currentFit(history) };
  const changes = lastChanges(base, history);

  const run = async (how: string, ask?: string) => {
    setBusy(how);
    setError(null);
    try {
      const reply = await dispatch(generateAssistText({ instruction: buildFitPrompt({ name, card, traits, world, ties, instruction: ask }) })).unwrap();
      const change = parseFit(reply, card);
      if (!Object.keys(change).length) setError("Nothing came back changed. Try again, or say more about what to change.");
      else onChange(withFit(history, change, how));
      if (ask) {
        setInstruction("");
        setAsking(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change them. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-2" role="group" aria-label={`Change ${name} with AI`}>
      <div className="flex flex-wrap gap-2">
        {joining && (
          <Button type="button" variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => void run(`Fit to ${world.name || "this world"}`)}>
            <FaMagic size={11} /> {busy?.startsWith("Fit") ? "Fitting..." : `Fit to ${world.name || "this world"}`}
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" disabled={Boolean(busy)} onClick={() => setAsking((v) => !v)} aria-expanded={asking}>
          <FaMagic size={11} /> Change with AI
        </Button>
        {history && (
          <Button type="button" variant="ghost" size="sm" disabled={Boolean(busy)} onClick={() => onChange(undoFit(history))}>
            <FaUndo size={10} /> Undo {history.steps[history.steps.length - 1].how.toLowerCase()}
          </Button>
        )}
      </div>
      {asking && (
        <div className="flex flex-wrap gap-2">
          <TextInput
            aria-label={`What to change about ${name}`}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && instruction.trim()) void run("Your change", instruction); }}
            placeholder="e.g. make her older, and a smuggler"
            className="min-w-[200px] flex-1"
          />
          <Button type="button" size="sm" disabled={!instruction.trim() || Boolean(busy)} onClick={() => void run("Your change", instruction)}>{busy === "Your change" ? "Changing..." : "Change"}</Button>
        </div>
      )}
      {error && <p role="alert" className="text-[12.5px] text-destructive">{error}</p>}
      {history && changes.length > 0 && (
        <ul aria-label={`What changed for ${name}`} className="flex flex-col gap-2.5 rounded-xl bg-surface p-3 ring-1 ring-inset ring-border">
          {changes.map((c) => (
            <li key={c.field} className="flex flex-col gap-1">
              <span className="text-[12px] font-semibold text-subtle">{FIT_LABELS[c.field]}</span>
              {c.before && <span data-slot="fit-before" className="text-[12.5px] text-muted-foreground line-through decoration-border-strong">{c.before}</span>}
              <textarea
                aria-label={`${FIT_LABELS[c.field]} for ${name}`}
                value={c.after}
                onChange={(e) => onChange(editFit(history, c.field, e.target.value))}
                rows={Math.min(6, Math.max(2, Math.ceil(c.after.length / 70)))}
                className="w-full resize-y rounded-lg bg-raised px-2.5 py-1.5 text-[13px] text-foreground ring-1 ring-inset ring-border"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default CastFitPanel;
