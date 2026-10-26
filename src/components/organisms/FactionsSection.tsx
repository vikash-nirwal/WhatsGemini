import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaMagic } from "react-icons/fa";
import { toast } from "sonner";
import { Button } from "src/components/atoms/button";
import { TextInput } from "src/components/molecules/form-controls";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { generateAssistText } from "src/features/aiSlice";
import { addChat, updateChatOptions } from "src/features/chatSlice";
import { patchWorld } from "src/features/worldSlice";
import { selectActivePersona } from "src/features/settingsSlice";
import { avatarOf } from "src/features/character/profileChanges";
import { buildFactionsPrompt, factionScenario, newFactionId, parseFactions } from "src/features/world/factions";
import { logToTimeline } from "src/features/world/timeline";
import { useWorldCharacters } from "src/hooks/useWorld";
import { Faction, World } from "src/types";

// Families and factions (#171) on the current world: suggested from the
// cast and their ties, or made by hand; each opens its own group chat.
export const FactionsSection = ({ world }: { world: World }) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const cast = useWorldCharacters();
  const chats = useAppSelector((state) => state.chat.chats);
  const persona = useAppSelector(selectActivePersona);
  const [suggested, setSuggested] = useState<Faction[]>([]);
  const [busy, setBusy] = useState(false);
  const [making, setMaking] = useState(false);
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState<number[]>([]);
  const groups = world.factions || [];
  const nameOf = (id: number) => cast.find((c) => c.id === id)?.name;

  const save = (factions: Faction[]) => dispatch(patchWorld(world.id, { factions }));
  const add = async (f: Faction) => {
    await save([...groups, f]);
    setSuggested((list) => list.filter((x) => x.id !== f.id));
    void logToTimeline(world.id, { kind: "you", text: `${f.name} formed: ${f.memberIds.map(nameOf).filter(Boolean).join(", ")}`, characterIds: f.memberIds }, world.storyTime);
  };
  const suggest = async () => {
    setBusy(true);
    try {
      const found = parseFactions(await dispatch(generateAssistText({ instruction: buildFactionsPrompt(world, cast, groups) })).unwrap(), cast);
      if (!found.length) throw new Error("none");
      setSuggested(found);
    } catch {
      toast.error("No groups came back. Try again, or make one yourself.");
    } finally {
      setBusy(false);
    }
  };
  const openChat = async (f: Faction) => {
    const existing = chats.find((c) => c.id === f.chatId);
    if (existing?.id) return navigate(`/chat/${existing.id}`);
    const chat = await dispatch(addChat({ title: f.name, characterIds: f.memberIds, scenario: factionScenario(f, persona?.name?.trim() || "You") })).unwrap();
    // Chats the world makes talk among themselves while you're away (#176).
    await dispatch(updateChatOptions({ chatId: chat.id, patch: { offscreenTalk: true } }));
    await save(groups.map((g) => (g.id === f.id ? { ...g, chatId: chat.id } : g)));
    navigate(`/chat/${chat.id}`);
  };

  return (
    <section aria-label="Families and factions" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[17px] font-bold text-foreground">Families and factions</h3>
        <span className="flex gap-3">
          <button type="button" disabled={busy} onClick={() => void suggest()} className="flex items-center gap-1 text-[13.5px] font-bold text-primary-text hover:underline"><FaMagic size={11} /> {busy ? "Thinking..." : "Suggest"}</button>
          <button type="button" onClick={() => setMaking((v) => !v)} className="text-[13.5px] font-bold text-primary-text hover:underline">New group</button>
        </span>
      </div>
      {groups.length === 0 && suggested.length === 0 && !making && <p className="text-[13.5px] text-muted-foreground">No groups yet. Families, crews and rival camps stick together and get their own group chat.</p>}
      {groups.map((f) => (
        <div key={f.id} className="flex items-center gap-3 rounded-card bg-sunken p-3">
          <span className="flex -space-x-2">{f.memberIds.slice(0, 4).map((id) => { const c = cast.find((x) => x.id === id); return c ? <CharacterAvatar key={id} name={c.name} accent={c.accent} imageSrc={avatarOf(c)} size={26} /> : null; })}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-bold text-foreground">{f.name} <span className="font-normal text-subtle">· {f.kind}</span></div>
            <div className="truncate text-[12.5px] text-muted-foreground">{f.about || f.memberIds.map(nameOf).filter(Boolean).join(", ")}</div>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => void openChat(f)}>Group chat</Button>
          <button type="button" aria-label={`Remove ${f.name}`} onClick={() => void save(groups.filter((g) => g.id !== f.id))} className="text-[12.5px] font-semibold text-subtle hover:text-foreground">Remove</button>
        </div>
      ))}
      {suggested.length > 0 && (
        <ul aria-label="Suggested groups" className="flex flex-col gap-1.5">
          {suggested.map((f) => (
            <li key={f.id} className="flex items-center gap-3 rounded-xl px-3 py-2 ring-1 ring-inset ring-border">
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-foreground">{f.name} <span className="font-normal text-subtle">· {f.memberIds.map(nameOf).filter(Boolean).join(", ")}</span></div>
                {f.about && <div className="text-[12.5px] text-muted-foreground">{f.about}</div>}
              </div>
              <Button type="button" size="sm" aria-label={`Add ${f.name}`} onClick={() => void add(f)}>Add</Button>
              <Button type="button" size="sm" variant="ghost" aria-label={`Skip ${f.name}`} onClick={() => setSuggested((list) => list.filter((x) => x.id !== f.id))}>Skip</Button>
            </li>
          ))}
        </ul>
      )}
      {making && (
        <div className="flex flex-col gap-2 rounded-card p-3 ring-1 ring-inset ring-border">
          <TextInput aria-label="Group name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Vales, or the Night Crew" />
          <div className="flex flex-wrap gap-1.5">
            {cast.map((c) => (
              <button key={c.id} type="button" aria-pressed={chosen.includes(c.id)} onClick={() => setChosen((l) => (l.includes(c.id) ? l.filter((x) => x !== c.id) : [...l, c.id]))}
                className={chosen.includes(c.id) ? "h-8 rounded-full bg-primary/15 px-3 text-[13px] font-semibold text-foreground ring-1 ring-inset ring-primary" : "h-8 rounded-full bg-raised px-3 text-[13px] font-semibold text-foreground ring-1 ring-inset ring-border"}>
                {c.name}
              </button>
            ))}
          </div>
          <Button type="button" size="sm" disabled={!name.trim() || chosen.length < 2} onClick={() => { void add({ id: newFactionId(), name: name.trim(), kind: /family|the \w+s$/i.test(name) ? "family" : "faction", memberIds: chosen }); setMaking(false); setName(""); setChosen([]); }}>Add group</Button>
        </div>
      )}
    </section>
  );
};

export default FactionsSection;
