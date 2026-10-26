import React, { useState } from "react";
import { FaPen, FaPlus, FaTimes } from "react-icons/fa";
import { Button } from "src/components/atoms/button";
import { Input } from "src/components/atoms/input";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { SettingGroup } from "src/components/molecules/SettingRow";
import { Select } from "src/components/molecules/form-controls/FormSelect";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { updateCharacter } from "src/features/characterSlice";
import { avatarOf } from "src/features/character/profileChanges";
import { tiesOf, withTie, withoutTie } from "src/features/character/ties";
import { worldOf } from "src/features/world/currentWorld";
import { logToTimeline } from "src/features/world/timeline";
import { Character } from "src/types";

// Relationships with other characters, in Contact info: who they are to each
// other ("Lena is Aria's older sister"), both ways, any time - not only in
// the world wizard. Characters bring these up, text each other because of
// them, and the relationship map shows them.
export const RelationshipsSection = ({ character }: { character: Character }) => {
  const dispatch = useAppDispatch();
  const characters = useAppSelector((state) => state.character.characters);
  const worlds = useAppSelector((state) => state.world.worlds);
  const me = characters.find((c) => c.id === character.id) || character;
  const sameWorld = characters.filter((c) => c.id !== me.id && worldOf(c, worlds) === worldOf(me, worlds));
  const ties = tiesOf(me, characters);
  const [editing, setEditing] = useState<{ otherId: number | null; toMe: string; toThem: string } | null>(null);
  const others = sameWorld.filter((c) => editing?.otherId === c.id || !ties.some((t) => t.other.id === c.id));
  const other = sameWorld.find((c) => c.id === editing?.otherId);

  const save = async () => {
    if (!editing || !other || !editing.toMe.trim()) return;
    const [a, b] = withTie(me, other, editing.toMe, editing.toThem);
    await dispatch(updateCharacter(a));
    await dispatch(updateCharacter(b));
    const world = worlds.find((w) => w.id === me.worldId);
    void logToTimeline(world ? world.id : null, { kind: "tie", text: `${other.name} is now ${me.name}'s ${editing.toMe.trim().replace(/^your\s+/i, "")}`, characterIds: [me.id, other.id] }, world?.storyTime);
    setEditing(null);
  };
  const remove = async (o: Character) => {
    const [a, b] = withoutTie(me, o);
    await dispatch(updateCharacter(a));
    await dispatch(updateCharacter(b));
  };

  return (
    <SettingGroup title={`Relationships · ${ties.length}`}>
      {ties.length === 0 && !editing && (
        <p className="py-3 text-[13px] text-muted-foreground">{sameWorld.length ? `Who ${me.name} is to the others here: family, friends, exes, rivals.` : `Nobody else lives in ${me.name}'s world yet.`}</p>
      )}
      {ties.length > 0 && (
        <ul aria-label={`${me.name}'s relationships`} className="flex flex-col">
          {ties.map((t) => (
            <li key={t.other.id} className="flex min-h-14 items-center gap-3 py-2 [&+&]:border-t [&+&]:border-border">
              <CharacterAvatar name={t.other.name} accent={t.other.accent} imageSrc={avatarOf(t.other)} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-foreground">{t.other.name} · {t.toMe}</span>
                {t.toThem && <span className="block truncate text-[12.5px] text-subtle">{me.name} is {t.other.name}'s {t.toThem}</span>}
              </span>
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label={`Edit ${me.name} and ${t.other.name}`} onClick={() => setEditing({ otherId: t.other.id, toMe: t.toMe, toThem: t.toThem })}><FaPen size={11} /></Button>
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label={`Remove ${me.name} and ${t.other.name}`} onClick={() => void remove(t.other)}><FaTimes size={12} /></Button>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <div className="flex flex-col gap-2.5 border-t border-border py-3" role="group" aria-label="Relationship">
          <Select aria-label="Who" value={editing.otherId ? String(editing.otherId) : ""} disabled={ties.some((t) => t.other.id === editing.otherId)} onChange={(e) => setEditing({ ...editing, otherId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Pick someone</option>
            {others.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
          </Select>
          {other && (
            <>
              <label className="flex flex-col gap-1 text-[12.5px] text-muted-foreground">
                {other.name} is {me.name}'s
                <Input value={editing.toMe} onChange={(e) => setEditing({ ...editing, toMe: e.target.value })} placeholder="older sister, ex, rival at work…" />
              </label>
              <label className="flex flex-col gap-1 text-[12.5px] text-muted-foreground">
                {me.name} is {other.name}'s
                <Input value={editing.toThem} onChange={(e) => setEditing({ ...editing, toThem: e.target.value })} placeholder="little brother, ex, rival at work…" />
              </label>
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="button" size="sm" disabled={!other || !editing.toMe.trim()} onClick={() => void save()}>Save</Button>
          </div>
        </div>
      ) : (
        others.length > 0 && (
          <button type="button" onClick={() => setEditing({ otherId: null, toMe: "", toThem: "" })} className="flex min-h-12 w-full items-center gap-2 border-t border-border text-[14px] font-semibold text-primary-text">
            <FaPlus size={11} /> Add a relationship
          </button>
        )
      )}
    </SettingGroup>
  );
};

export default RelationshipsSection;
