import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { Select } from "src/components/molecules/form-controls/FormSelect";
import { callsToday, DEFAULT_TALK_LENGTH, isLivingWorld, livingWorldPatch, MAX_TALK_LENGTH, WorldFeature } from "src/features/world/worldPrefs";
import { useCurrentWorld, useWorldPrefs } from "src/hooks/useWorld";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { updateCharacter } from "src/features/characterSlice";
import { inWorld } from "src/features/world/currentWorld";
import { LIFE_PRESETS, lifeOf, presetOf } from "src/features/character/lifePresets";

// Living-world features (#162-#166), off until switched on. My world has no
// map, events or reputation of its own, so only drifting ties apply there.
const FEATURES: [WorldFeature, string][] = [
  ["events", "World events"],
  ["drift", "Relationships change from their talk"],
  ["arrivals", "Newcomers and life events"],
  ["places", "Who's where on the map"],
  ["reputation", "Your reputation"],
  ["introductions", "Introductions to people they know"],
  ["secrets", "Secrets between them"],
  ["goals", "What each wants this week"],
];

const LENGTHS = Array.from({ length: MAX_TALK_LENGTH - 1 }, (_, i) => i + 2);

// A world's life switches on its Worlds page card: Peek (#145), how long
// their exchanges run, and whether it keeps living while you're elsewhere (#146).
export const WorldLifeControls = ({ worldId, name }: { worldId: number | null; name: string }) => {
  const [prefs, update] = useWorldPrefs(worldId);
  // How everyone here lives between your messages, in one go (the user's
  // report, 2026-10-26: a world whose people all had their life switched
  // off was silent). Shows the preset they share, or "Mixed".
  const dispatch = useAppDispatch();
  const { worlds } = useCurrentWorld();
  const residents = useAppSelector((state) => state.character.characters).filter(inWorld(worldId, worlds));
  const presets = Array.from(new Set(residents.map((c) => presetOf(lifeOf(c)) || "custom")));
  const shared = presets.length === 1 ? presets[0] : residents.length ? "mixed" : "";
  const liveAs = (id: string) => {
    const preset = LIFE_PRESETS.find((p) => p.id === id);
    if (preset) residents.forEach((c) => void dispatch(updateCharacter({ ...c, ...preset.values })));
  };
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-2 border-t border-border pt-3 sm:grid-cols-2" role="group" aria-label={`Life in ${name}`}>
      <ToggleSwitch checked={Boolean(prefs.peek)} onChange={(peek) => update({ peek })} label="Peek at their own texts" />
      <ToggleSwitch checked={prefs.keepLiving !== false} onChange={(keepLiving) => update({ keepLiving })} label="Keep living while I'm elsewhere" />
      {worldId != null && (
        <div className="flex items-center justify-between gap-2 sm:col-span-2">
          <span className="text-sm font-medium text-foreground">Living world</span>
          <button type="button" onClick={() => update(livingWorldPatch(!isLivingWorld(prefs)))} className="text-[13px] font-bold text-primary-text hover:underline">
            {isLivingWorld(prefs) ? "Turn all off" : "Turn all on"}
          </button>
        </div>
      )}
      {FEATURES.filter(([key]) => worldId != null || key === "drift").map(([key, label]) => (
        <ToggleSwitch key={key} checked={Boolean(prefs[key])} onChange={(on) => update({ [key]: on })} label={label} />
      ))}
      {residents.length > 0 && (
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="flex-1">Everyone here lives like</span>
          <Select aria-label={`How everyone in ${name} lives`} value={shared} onChange={(e) => liveAs(e.target.value)} className="h-8 w-[170px]">
            {shared === "mixed" && <option value="mixed">Mixed</option>}
            {shared === "custom" && <option value="custom">Custom</option>}
            {LIFE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </label>
      )}
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="flex-1">Background calls a day</span>
        <Select aria-label={`Background calls a day in ${name}`} value={String(prefs.callCap || 0)} onChange={(e) => update({ callCap: Number(e.target.value) || undefined })} className="h-8 w-[110px]">
          {[0, 10, 25, 50, 100].map((n) => <option key={n} value={String(n)}>{n ? `${n}${callsToday(worldId, Date.now()) ? ` (${callsToday(worldId, Date.now())} today)` : ""}` : "No limit"}</option>)}
        </Select>
      </label>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="flex-1">Quiet hours</span>
        <Select aria-label={`Quiet hours in ${name}`} value={prefs.quietHours ? prefs.quietHours.join("-") : "off"} onChange={(e) => update({ quietHours: e.target.value === "off" ? undefined : (e.target.value.split("-").map(Number) as [number, number]) })} className="h-8 w-[110px]">
          {[["off", "Off"], ["23-8", "11pm-8am"], ["22-7", "10pm-7am"], ["0-7", "12am-7am"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </label>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="flex-1">Texts per exchange</span>
        <Select aria-label={`Texts per exchange in ${name}`} value={String(prefs.talkLength || DEFAULT_TALK_LENGTH)} onChange={(e) => update({ talkLength: Number(e.target.value) })} className="h-8 w-[76px]">
          {LENGTHS.map((n) => <option key={n} value={String(n)}>{n}</option>)}
        </Select>
      </label>
    </div>
  );
};
