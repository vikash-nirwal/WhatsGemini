import React, { useState } from "react";
import { SettingGroup } from "src/components/molecules/SettingRow";
import { Select } from "src/components/molecules/form-controls/FormSelect";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { patchCharacter } from "src/features/characterSlice";
import { worldName, worldOf } from "src/features/world/currentWorld";
import { pointsOn, pointsToward, setPointsTo, Toward, traitsOf } from "src/features/world/pointsNotes";
import { useWorldPrefs } from "src/hooks/useWorld";
import { Character } from "src/types";
import { selectActivePersona } from "src/features/settingsSlice";

// Points (#234) on Contact info: how this character scores you and each
// person they know in their world, 0 to 10 per trait, with what moved them
// last. Shown only where the world's Points switch is on; each slider sets
// the score by hand (it fades back from there like any other change).
export const PointsSection = ({ character }: { character: Character }) => {
  const dispatch = useAppDispatch();
  const persona = useAppSelector(selectActivePersona);
  const userName = persona?.name?.trim() || "You";
  const characters = useAppSelector((state) => state.character.characters);
  const worlds = useAppSelector((state) => state.world.worlds);
  const worldId = worldOf(character, worlds);
  // Re-renders when the switch or the traits change.
  useWorldPrefs(worldId);
  const me = characters.find((c) => c.id === character.id) || character;
  const others = characters.filter((c) => c.id !== me.id && worldOf(c, worlds) === worldId);
  const [toward, setToward] = useState<Toward>("you");
  // While dragging, the slider moves on its own; it's saved when let go.
  const [draft, setDraft] = useState<Record<string, number>>({});
  if (!pointsOn(worldId)) return null;
  const now = Date.now();
  const target = toward === "you" ? undefined : others.find((c) => c.id === toward);
  const who = target ? target.name : userName;
  const values = pointsToward(me, target ? target.id : "you", now);
  const why = (target ? me.bonds?.find((b) => b.withId === target.id)?.points?.why : me.youPoints?.why)?.slice(-1)[0]?.text;
  const commit = (trait: string) => {
    const value = draft[trait];
    if (value === undefined) return;
    void dispatch(patchCharacter(me.id, (fresh) => setPointsTo(fresh, target ? target.id : "you", trait, value, Date.now()))).then(() => setDraft(({ [trait]: _done, ...rest }) => rest));
  };

  return (
    <SettingGroup title={`Points · ${worldName(worldId, worlds)}`}>
      <div className="flex flex-col gap-3 py-3" role="group" aria-label={`${me.name}'s points`}>
        {others.length > 0 && (
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <span className="flex-1">Toward</span>
            <Select aria-label="Points toward" value={String(toward)} onChange={(e) => { setDraft({}); setToward(e.target.value === "you" ? "you" : Number(e.target.value)); }} className="h-8 w-[170px]">
              <option value="you">{`You (${userName})`}</option>
              {others.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </Select>
          </label>
        )}
        {traitsOf(worldId).map((trait) => { const v = draft[trait] ?? values[trait]; return (
          <label key={trait} className="flex items-center gap-3 text-[13.5px] text-foreground">
            <span className="w-24 flex-none capitalize">{trait}</span>
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={v}
              aria-label={`${me.name}'s ${trait} toward ${who}`}
              onChange={(e) => setDraft((d) => ({ ...d, [trait]: Number(e.target.value) }))}
              onPointerUp={() => commit(trait)}
              onKeyUp={() => commit(trait)}
              onBlur={() => commit(trait)}
              className="h-1.5 min-w-0 flex-1 cursor-pointer accent-primary"
            />
            <span data-slot="points-value" className="w-8 flex-none text-right font-semibold tabular-nums">{Number.isInteger(v) ? v : v.toFixed(1)}</span>
          </label>
        ); })}
        {why && <p className="text-[12.5px] text-subtle">Last moved: {why}</p>}
      </div>
    </SettingGroup>
  );
};

export default PointsSection;
