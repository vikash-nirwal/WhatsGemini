import React, { useState } from "react";
import { FaChevronRight, FaMagic, FaPlus, FaTrash } from "react-icons/fa";
import { Select, TextInput } from "src/components/molecules/form-controls";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { Button } from "src/components/atoms/button";
import { useAppDispatch } from "src/store/hooks";
import { generateAssistText } from "src/features/aiSlice";
import { buildDatesFromMemoryPrompt, formatDate, isValidDate, mergeDates, newDateId, parseDatesReply } from "src/features/character/importantDates";
import { ImportantDate } from "src/types";

interface ImportantDatesSectionProps {
  value: ImportantDate[];
  onChange: (value: ImportantDate[]) => void;
  memory?: string[]; // the character's remembered facts, for "Find dates in memory"
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const blankDate = (label = ""): ImportantDate => {
  const today = new Date();
  return { id: newDateId(), label, month: today.getMonth() + 1, day: today.getDate(), messageOnDay: true };
};

// "Dates that matter" (#47): birthdays, anniversaries and the day you met.
// The character always knows them, and on the day can message you first.
const ImportantDatesSection: React.FC<ImportantDatesSectionProps> = ({ value, onChange, memory }) => {
  const dispatch = useAppDispatch();
  const [finding, setFinding] = useState(false);
  const [findNote, setFindNote] = useState<string | null>(null);
  const update = (index: number, patch: Partial<ImportantDate>) => onChange(value.map((d, i) => (i === index ? { ...d, ...patch } : d)));

  const findInMemory = async () => {
    if (!memory || memory.length === 0) return;
    setFinding(true);
    setFindNote(null);
    try {
      const reply = await dispatch(generateAssistText({ instruction: buildDatesFromMemoryPrompt(memory), background: true })).unwrap();
      const found = parseDatesReply(reply);
      const merged = mergeDates(value, found);
      onChange(merged);
      setFindNote(merged.length > value.length ? `Found ${merged.length - value.length}.` : "No new dates in memory.");
    } catch (err: any) {
      setFindNote(typeof err === "string" ? err : err?.message || "Couldn't read the memory.");
    } finally {
      setFinding(false);
    }
  };

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <FaChevronRight aria-hidden size={10} className="text-muted-foreground transition-transform group-open:rotate-90" />
        Dates that matter
        <span className="text-xs font-normal text-muted-foreground">{value.length > 0 ? `${value.length} date${value.length === 1 ? "" : "s"}` : "none"}</span>
      </summary>

      <div className="mt-4 flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          Birthdays, anniversaries, the day you met. The character remembers them, brings them up when they're near, and can message you first on the day.
        </p>

        {value.map((d, i) => (
          <div key={d.id} role="group" aria-label={d.label || `Date ${i + 1}`} className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <TextInput aria-label="What the date is" value={d.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="e.g. Your birthday" className="flex-1" />
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remove ${d.label || "date"}`}>
                <FaTrash size={11} />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-36">
                <Select aria-label="Month" value={String(d.month)} onChange={(e) => update(i, { month: Number(e.target.value) })}>
                  {MONTH_NAMES.map((name, m) => (
                    <option key={name} value={String(m + 1)}>
                      {name}
                    </option>
                  ))}
                </Select>
              </div>
              <TextInput type="number" aria-label="Day" min="1" max="31" value={d.day} onChange={(e) => update(i, { day: Number(e.target.value) })} className="w-20" />
              <TextInput
                type="number"
                aria-label="Year (optional)"
                min="1900"
                max="2100"
                value={d.year ?? ""}
                onChange={(e) => update(i, { year: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="Year"
                className="w-24"
              />
            </div>
            {!isValidDate(d) && <span className="text-xs text-destructive">That day doesn't exist in {MONTH_NAMES[d.month - 1] || "that month"}.</span>}
            <ToggleSwitch checked={d.messageOnDay} onChange={(v) => update(i, { messageOnDay: v })} label={<span className="text-xs text-muted-foreground">Message me on {isValidDate(d) ? formatDate({ ...d, year: undefined }) : "the day"}</span>} />
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, blankDate()])}>
            <FaPlus size={10} /> Add a date
          </Button>
          {!value.some((d) => /day we met/i.test(d.label)) && (
            <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, blankDate("The day we met")])}>
              The day we met
            </Button>
          )}
          {memory && memory.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={findInMemory} disabled={finding}>
              <FaMagic size={10} /> {finding ? "Looking..." : "Find dates in memory"}
            </Button>
          )}
          {findNote && <span role="status" className="text-xs text-muted-foreground">{findNote}</span>}
        </div>
      </div>
    </details>
  );
};

export default ImportantDatesSection;
