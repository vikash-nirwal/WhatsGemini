import React from "react";
import { FaChevronRight, FaPlus, FaTrash } from "react-icons/fa";
import { Select, TextInput } from "src/components/molecules/form-controls";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { Button } from "src/components/atoms/button";
import { CharacterSchedule, ScheduleBlock } from "src/types";
import { TYPICAL_DAY } from "src/features/character/schedule";

interface ScheduleSectionProps {
  value: CharacterSchedule | undefined;
  onChange: (value: CharacterSchedule | undefined) => void;
}

const HOURS = Array.from({ length: 25 }, (_, h) => h);
const fmt = (h: number) => `${String(h).padStart(2, "0")}:00`;

// "Daily routine" (#7): hour blocks of what the character does. It shows as
// "online" or "at work · last seen..." in the chat header, and the
// character knows what they're up to.
const ScheduleSection: React.FC<ScheduleSectionProps> = ({ value, onChange }) => {
  const blocks = value?.blocks || [];
  const set = (next: ScheduleBlock[], realistic = value?.realistic) => onChange({ blocks: next, realistic });
  const update = (i: number, patch: Partial<ScheduleBlock>) => set(blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <FaChevronRight aria-hidden size={10} className="text-muted-foreground transition-transform group-open:rotate-90" />
        Daily routine
        <span className="text-xs font-normal text-muted-foreground">{blocks.length > 0 ? `${blocks.length} part${blocks.length === 1 ? "" : "s"} of the day` : "none"}</span>
      </summary>

      <div className="mt-4 flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          What they do through the day, in your time zone. The chat header shows "online" or what they're doing, and they talk about their day naturally.
        </p>
        {blocks.length === 0 && (
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => set(TYPICAL_DAY.map((b) => ({ ...b })))}>
              Start from a typical day
            </Button>
          </div>
        )}
        {blocks.map((b, i) => (
          <div key={i} role="group" aria-label={b.activity || `Part ${i + 1}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2.5">
            <div className="w-24">
              <Select aria-label="From" value={String(b.start)} onChange={(e) => update(i, { start: Number(e.target.value) })}>
                {HOURS.slice(0, 24).map((h) => <option key={h} value={String(h)}>{fmt(h)}</option>)}
              </Select>
            </div>
            <span className="text-xs text-subtle">to</span>
            <div className="w-24">
              <Select aria-label="Until" value={String(b.end)} onChange={(e) => update(i, { end: Number(e.target.value) })}>
                {HOURS.slice(1).map((h) => <option key={h} value={String(h)}>{fmt(h)}</option>)}
              </Select>
            </div>
            <TextInput aria-label="Doing" value={b.activity} onChange={(e) => update(i, { activity: e.target.value })} placeholder="e.g. at work" className="min-w-[8rem] flex-1" />
            <div className="w-28">
              <Select aria-label="Status" value={b.status} onChange={(e) => update(i, { status: e.target.value as ScheduleBlock["status"] })}>
                <option value="free">Free</option>
                <option value="busy">Busy</option>
                <option value="asleep">Asleep</option>
              </Select>
            </div>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => set(blocks.filter((_, j) => j !== i))} aria-label={`Remove ${b.activity || "this part"}`}>
              <FaTrash size={11} />
            </Button>
          </div>
        ))}
        {blocks.length > 0 && (
          <>
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => set([...blocks, { start: 12, end: 13, activity: "", status: "free" }])}>
                <FaPlus size={10} /> Add a part of the day
              </Button>
            </div>
            <ToggleSwitch
              checked={Boolean(value?.realistic)}
              onChange={(v) => set(blocks, v || undefined)}
              label={<span className="text-xs text-muted-foreground">Realistic: replies wait a little while they're busy or asleep</span>}
            />
          </>
        )}
      </div>
    </details>
  );
};

export default ScheduleSection;
