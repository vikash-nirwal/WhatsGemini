import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { Select } from "src/components/molecules/form-controls/FormSelect";
import { DEFAULT_TALK_LENGTH, MAX_TALK_LENGTH } from "src/features/world/worldPrefs";
import { useWorldPrefs } from "src/hooks/useWorld";

const LENGTHS = Array.from({ length: MAX_TALK_LENGTH - 1 }, (_, i) => i + 2);

// A world's life switches on its Worlds page card: Peek (#145), how long
// their exchanges run, and whether it keeps living while you're elsewhere (#146).
export const WorldLifeControls = ({ worldId, name }: { worldId: number | null; name: string }) => {
  const [prefs, update] = useWorldPrefs(worldId);
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3" role="group" aria-label={`Life in ${name}`}>
      <ToggleSwitch checked={Boolean(prefs.peek)} onChange={(peek) => update({ peek })} label="Peek at their own texts" />
      <ToggleSwitch checked={prefs.keepLiving !== false} onChange={(keepLiving) => update({ keepLiving })} label="Keep living while I'm elsewhere" />
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="flex-1">Texts per exchange</span>
        <Select aria-label={`Texts per exchange in ${name}`} value={String(prefs.talkLength || DEFAULT_TALK_LENGTH)} onChange={(e) => update({ talkLength: Number(e.target.value) })} className="h-8 w-[76px]">
          {LENGTHS.map((n) => <option key={n} value={String(n)}>{n}</option>)}
        </Select>
      </label>
    </div>
  );
};
