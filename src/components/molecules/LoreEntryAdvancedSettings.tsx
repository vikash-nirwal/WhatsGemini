import React from "react";
import { FaChevronRight } from "react-icons/fa";
import { LoreEntry } from "src/types";
import { FieldLabel, Select, TagInput } from "src/components/molecules/form-controls";
import { Input } from "src/components/atoms/input";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { cn } from "src/utils/cn";
import { LORE_SCAN_MESSAGE_COUNT } from "src/utils/constants";
import { LORE_MAX_SCAN_DEPTH, LORE_MAX_STICKY } from "src/features/ai/utils/loreUtils";

interface LoreEntryAdvancedSettingsProps {
  entry: LoreEntry;
  onChange: (patch: Partial<LoreEntry>) => void;
}

// How many of the advanced settings differ from the plain defaults, shown on
// the collapsed summary so an entry that behaves unusually (often one that
// came in with an imported card) says so without having to be opened.
export const countAdvancedLoreSettings = (entry: LoreEntry): number =>
  [
    entry.priority !== undefined && entry.priority !== 0,
    entry.selective === true,
    entry.sticky !== undefined && entry.sticky > 0,
    entry.scanDepth !== undefined,
    entry.probability !== undefined && entry.probability < 100,
  ].filter(Boolean).length;

// An empty box means "use the default" (undefined), not 0, so clearing a
// field really clears the setting.
const parseNumber = (raw: string, min: number, max: number): number | undefined => {
  if (raw.trim() === "") return undefined;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
};

const NumberField: React.FC<{
  id: string;
  label: string;
  hint: React.ReactNode;
  value: number | undefined;
  min: number;
  max: number;
  placeholder: string;
  unit: string;
  onChange: (value: number | undefined) => void;
}> = ({ id, label, hint, value, min, max, placeholder, unit, onChange }) => (
  <div>
    <FieldLabel htmlFor={id} hint={hint}>{label}</FieldLabel>
    <div className="flex items-center gap-2">
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(parseNumber(e.target.value, min, max))}
        className="w-24"
      />
      <span className="text-xs text-subtle">{unit}</span>
    </div>
  </div>
);

// The per-entry "Advanced" section of a lorebook entry (#29): priority,
// second keywords, sticky, scan depth and trigger chance. Collapsed by
// default; every field is optional and empty means today's plain behavior.
// The help text avoids lorebook jargon on purpose - most people editing a
// character have never seen SillyTavern's world info screen.
const LoreEntryAdvancedSettings: React.FC<LoreEntryAdvancedSettingsProps> = ({ entry, onChange }) => {
  const idBase = `lore-${entry.id}`;
  const count = countAdvancedLoreSettings(entry);
  const keywordOnly = entry.constant ? " Not used while Always on is set." : "";
  return (
    <details className="group rounded-md border border-border/70">
      <summary
        className={cn(
          "flex min-h-[32px] cursor-pointer list-none items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground",
          "[&::-webkit-details-marker]:hidden"
        )}
      >
        <FaChevronRight size={9} className="transition-transform group-open:rotate-90" aria-hidden />
        Advanced
        {count > 0 && <span className="text-subtle font-normal">({count} {count === 1 ? "setting" : "settings"} changed)</span>}
      </summary>
      <div className="flex flex-col gap-4 border-t border-border/70 px-3 py-3">
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            id={`${idBase}-priority`}
            label="Priority"
            hint="When more lore is triggered than fits in one reply, entries with a higher number are kept first. Leave empty for normal (0); negative numbers go last. Always-on entries are always kept first."
            value={entry.priority}
            min={-1000}
            max={1000}
            placeholder="0"
            unit="higher is kept first"
            onChange={(priority) => onChange({ priority })}
          />
          <NumberField
            id={`${idBase}-probability`}
            label="Chance to trigger"
            hint="How likely this entry is to be added each time it's triggered. Empty or 100% means every time; lower values add variety, like a rumour that only sometimes comes up. The same point in a chat always gives the same result, so regenerating a reply doesn't change it."
            value={entry.probability}
            min={0}
            max={100}
            placeholder="100"
            unit="%"
            onChange={(probability) => onChange({ probability })}
          />
          <NumberField
            id={`${idBase}-scan-depth`}
            label="Look back"
            hint={`How many of the latest messages are searched for this entry's keywords. Empty uses the default of ${LORE_SCAN_MESSAGE_COUNT}. A bigger number notices older mentions; a smaller one reacts only to what was just said.${keywordOnly}`}
            value={entry.scanDepth}
            min={0}
            max={LORE_MAX_SCAN_DEPTH}
            placeholder={String(LORE_SCAN_MESSAGE_COUNT)}
            unit="messages"
            onChange={(scanDepth) => onChange({ scanDepth })}
          />
          <NumberField
            id={`${idBase}-sticky`}
            label="Stay active for"
            hint={`Once triggered, keep this entry for this many more messages, even if its keyword isn't mentioned again, so the AI doesn't drop it mid-scene. Empty or 0 means only while the keyword is recent.${keywordOnly}`}
            value={entry.sticky}
            min={0}
            max={LORE_MAX_STICKY}
            placeholder="0"
            unit="more messages"
            onChange={(sticky) => onChange({ sticky })}
          />
        </div>

        <div className="flex flex-col gap-2.5">
          <ToggleSwitch
            checked={entry.selective === true}
            onChange={(v) => onChange({ selective: v || undefined })}
            label="Also needs a second keyword"
            title="Only trigger when one of the keywords above AND one of a second set of keywords are both mentioned"
            className="text-xs"
          />
          {entry.selective && (
            <>
              <p className="text-xs text-subtle -mt-1">
                Narrows the entry down: with keyword "sword" and second keyword "fire", the lore about the flaming sword
                only comes up when both are mentioned.{keywordOnly}
              </p>
              <div>
                <FieldLabel htmlFor={`${idBase}-secondary-logic`}>Trigger when the second keywords are</FieldLabel>
                <Select
                  id={`${idBase}-secondary-logic`}
                  aria-label="Trigger when the second keywords are"
                  value={entry.secondaryLogic ?? "andAny"}
                  onChange={(e) => {
                    const v = e.target.value as NonNullable<LoreEntry["secondaryLogic"]>;
                    onChange({ secondaryLogic: v === "andAny" ? undefined : v });
                  }}
                  className="w-full sm:w-72"
                >
                  <option value="andAny">Any one of them mentioned</option>
                  <option value="andAll">All of them mentioned</option>
                  <option value="notAny">None of them mentioned</option>
                  <option value="notAll">Not all of them mentioned</option>
                </Select>
              </div>
              <div>
                <FieldLabel>Second keywords</FieldLabel>
                <TagInput
                  value={entry.secondaryKeywords || []}
                  onChange={(kws) => onChange({ secondaryKeywords: kws.length > 0 ? kws : undefined })}
                  placeholder="Add a second keyword..."
                />
              </div>
            </>
          )}
        </div>
      </div>
    </details>
  );
};

export default LoreEntryAdvancedSettings;
