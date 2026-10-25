import { FaClock } from "react-icons/fa";
import { Card } from "src/components/atoms/card";
import { Button } from "src/components/atoms/button";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { TextInput, FieldLabel, Select } from "src/components/molecules/form-controls";
import { DEFAULT_MONTHS, formatStoryDate, newStoryTime, parseMonths, setStoryDate, skipStoryTime, storyParts } from "src/features/world/storyTime";
import { StoryTime } from "src/types";

const SKIPS: [string, number][] = [["A day", 1], ["A week", 7], ["A month", 0]];

// Story time (#147) in the world editor: the world's own calendar, today's
// date in it, whether it moves with real time, and time skips.
export const StoryTimeEditor = ({ value, onChange }: { value: StoryTime | undefined; onChange: (next: StoryTime | undefined) => void }) => {
  const now = Date.now();
  const parts = value ? storyParts(value, now) : undefined;
  const months = value?.months.length ? value.months : DEFAULT_MONTHS;
  const setDate = (patch: Partial<{ year: number; monthIndex: number; day: number }>) =>
    value && parts && onChange(setStoryDate(value, { year: parts.year, monthIndex: parts.monthIndex, day: parts.day, ...patch }, now));

  return (
    <Card className="p-6 flex flex-col gap-4">
      <h3 className="font-semibold text-[15px] text-foreground flex items-center gap-2"><FaClock size={13} className="text-subtle" /> Story time</h3>
      <ToggleSwitch checked={Boolean(value)} onChange={(on) => onChange(on ? newStoryTime(now) : undefined)} label="This world has its own calendar" />
      {value && parts && (
        <>
          <p className="text-sm text-foreground" aria-live="polite">Today here: <span className="font-semibold">{formatStoryDate(value, now)}</span></p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <FieldLabel htmlFor="story-year-label">Years are called</FieldLabel>
              <TextInput id="story-year-label" value={value.yearLabel || ""} onChange={(e) => onChange({ ...value, yearLabel: e.target.value })} placeholder="Year" />
            </div>
            <div>
              <FieldLabel htmlFor="story-year">Year</FieldLabel>
              <TextInput id="story-year" type="number" value={String(parts.year)} onChange={(e) => setDate({ year: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <FieldLabel htmlFor="story-month">Month</FieldLabel>
              <Select id="story-month" aria-label="Month" value={String(parts.monthIndex)} onChange={(e) => setDate({ monthIndex: Number(e.target.value) })}>
                {months.map((m, i) => <option key={`${m}-${i}`} value={String(i)}>{m}</option>)}
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="story-day">Day</FieldLabel>
              <TextInput id="story-day" type="number" min={1} max={value.daysPerMonth} value={String(parts.day)} onChange={(e) => setDate({ day: Number(e.target.value) || 1 })} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
            <div>
              <FieldLabel htmlFor="story-months" hint="Comma-separated, in order.">Months</FieldLabel>
              <TextInput id="story-months" defaultValue={months.join(", ")} onBlur={(e) => { const list = parseMonths(e.target.value); if (list.length) onChange({ ...value, months: list }); }} />
            </div>
            <div>
              <FieldLabel htmlFor="story-days">Days a month</FieldLabel>
              <TextInput id="story-days" type="number" min={1} value={String(value.daysPerMonth)} onChange={(e) => onChange({ ...value, daysPerMonth: Math.max(1, Number(e.target.value) || 1) })} />
            </div>
          </div>
          <ToggleSwitch checked={value.moves} onChange={(moves) => onChange({ ...skipStoryTime(value, 0, now), moves })} label="Moves with real time (a day a day)" />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Skip ahead:</span>
            {SKIPS.map(([label, days]) => (
              <Button key={label} type="button" variant="outline" size="sm" onClick={() => onChange(skipStoryTime(value, days || value.daysPerMonth, now))}>{label}</Button>
            ))}
          </div>
        </>
      )}
    </Card>
  );
};
