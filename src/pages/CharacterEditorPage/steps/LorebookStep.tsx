import React from "react";
import { FaPlus, FaTrash, FaBook, FaMagic } from "react-icons/fa";
import { LoreEntry } from "../../../types";
import { TextArea, FieldLabel, TagInput } from "src/components/molecules/form-controls";
import { Button } from "src/components/atoms/button";
import { Card } from "src/components/atoms/card";
import { cn } from "../../../utils/cn";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { LORE_SCAN_MESSAGE_COUNT } from "../../../utils/constants";
import { estimateTokens } from "../../../features/ai/utils/tokenEstimator";

interface LorebookStepProps {
  loreEntries: LoreEntry[];
  handleUpdateLoreEntry: (id: string, patch: Partial<LoreEntry>) => void;
  handleRemoveLoreEntry: (id: string) => void;
  handleExpandLoreEntry: (entry: LoreEntry) => void;
  expandingLoreId: string | null;
  handleAddLoreEntry: () => void;
  assistError: string | null;
  neumorphic: boolean;
}

// Wizard step 5/6 - lorebook / world info entries. See IdentityStep.tsx for
// why this is a separate, lazy-loaded file.
const LorebookStep: React.FC<LorebookStepProps> = ({
  loreEntries,
  handleUpdateLoreEntry,
  handleRemoveLoreEntry,
  handleExpandLoreEntry,
  expandingLoreId,
  handleAddLoreEntry,
  assistError,
  neumorphic,
}) => (
  <Card className="p-6 flex flex-col gap-5">
    <div className="flex items-baseline justify-between gap-4">
      <h3 className="font-semibold text-[15px] text-foreground flex items-center gap-2">
        <FaBook size={13} className="text-subtle" /> Lorebook / World Info
      </h3>
      <span className="text-xs text-subtle">Injected into the prompt only when a keyword is mentioned</span>
    </div>
    <p className="text-xs text-subtle -mt-2">
      Add lore entries for places, factions, items, or backstory that shouldn't live in the personality
      prompt full-time. Each entry is only added to the conversation when one of its keywords shows up in
      the last {LORE_SCAN_MESSAGE_COUNT} messages - keeping unrelated lore out of the context budget.
    </p>

    {loreEntries.length === 0 && (
      <p className="text-xs text-subtle italic">No lore entries yet.</p>
    )}

    <div className="flex flex-col gap-3">
      {loreEntries.map((entry, idx) => {
        const entryTokens = estimateTokens(entry.content);
        return (
          <div key={entry.id} className="rounded-lg border border-border p-3.5 flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-subtle">Entry {idx + 1}</span>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-subtle font-mono">~{entryTokens.toLocaleString()} tokens</span>
                <ToggleSwitch
                  checked={entry.enabled !== false}
                  onChange={(v) => handleUpdateLoreEntry(entry.id, { enabled: v })}
                  label="Enabled"
                  className="text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveLoreEntry(entry.id)}
                  className="h-7 w-7 text-subtle hover:bg-destructive/10 hover:text-destructive flex-shrink-0"
                  title="Delete this lore entry"
                  aria-label="Delete this lore entry"
                >
                  <FaTrash size={11} />
                </Button>
              </div>
            </div>
            <div>
              <FieldLabel hint="Any of these words/phrases appearing in the recent conversation triggers this entry.">Keywords</FieldLabel>
              <TagInput
                value={entry.keywords}
                onChange={(kws) => handleUpdateLoreEntry(entry.id, { keywords: kws })}
                placeholder="Add a keyword..."
              />
            </div>
            <TextArea
              placeholder="Lore content injected into the system prompt when triggered (e.g. The Silver Court is a hidden fae kingdom ruled by...)"
              value={entry.content}
              onChange={(e) => handleUpdateLoreEntry(entry.id, { content: e.target.value })}
              className="resize-none min-h-[80px]"
            />
            <div>
              <button
                type="button"
                onClick={() => handleExpandLoreEntry(entry)}
                disabled={expandingLoreId === entry.id}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                title="Have the AI draft or expand this entry's content from its keywords"
              >
                <FaMagic size={10} /> {expandingLoreId === entry.id ? "Expanding..." : "Expand with AI"}
              </button>
            </div>
          </div>
        );
      })}
    </div>

    <Button
      type="button"
      variant="panel"
      onClick={handleAddLoreEntry}
      className={cn(
        "h-auto w-full px-3 py-2 text-xs font-medium hover:text-primary",
        neumorphic ? "surface-sunken" : "border border-dashed border-border hover:border-primary"
      )}
    >
      <FaPlus size={11} /> Add Lore Entry
    </Button>
    {assistError && <p className="text-xs text-destructive">{assistError}</p>}
  </Card>
);

export default LorebookStep;
