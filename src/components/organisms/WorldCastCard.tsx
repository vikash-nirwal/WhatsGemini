import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaMagic, FaPen, FaPlus, FaTimes, FaTrash, FaUserFriends } from "react-icons/fa";
import { Button } from "src/components/atoms/button";
import { Card } from "src/components/atoms/card";
import { Input } from "src/components/atoms/input";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { Select } from "src/components/molecules/form-controls/FormSelect";
import { JoinWorldDialog } from "src/components/organisms/JoinWorldDialog";
import { useModal } from "src/contexts/ModalContext";
import { useAppDispatch, useAppSelector } from "src/store/hooks";
import { addCharacter, deleteCharacter, updateCharacter } from "src/features/characterSlice";
import { generateAssistText } from "src/features/aiSlice";
import { selectActivePersona } from "src/features/settingsSlice";
import { avatarOf } from "src/features/character/profileChanges";
import { buildCharacterDraftPrompt, parseCharacterDraft } from "src/features/character/characterDraft";
import { withTie, withoutTie } from "src/features/character/ties";
import { buildConnectionsPrompt, castIdea, parseConnections, WorldTie } from "src/features/world/worldWizard";
import { CastSuggestion, mirrorTie } from "src/features/world/worldAssist";
import { useWorldAssist } from "src/hooks/useWorldAssist";
import { CHARACTER_SWATCHES, RELATIONSHIP_PRESETS, TIE_PRESETS } from "src/utils/constants";
import { Character, World } from "src/types";

const bare = (t: string) => t.replace(/^your\s+/i, "");

// A world's cast in its editor (#144, 2026-10-26): who lives there (each
// their own copy, edited or deleted alone), people from other worlds, AI
// suggestions of who else would fit, and how everyone is connected - to each
// other and to you - set by hand or suggested.
export const WorldCastCard = ({ world }: { world: World }) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { showConfirm } = useModal();
  const assist = useWorldAssist();
  const persona = useAppSelector(selectActivePersona);
  const characters = useAppSelector((state) => state.character.characters);
  const residents = characters.filter((c) => c.worldId === world.id);
  const byId = (id: number) => characters.find((c) => c.id === id);
  const [joinOpen, setJoinOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<CastSuggestion[]>([]);
  const [proposals, setProposals] = useState<{ a: number; b: number; aToB: string; bToA: string }[]>([]);
  const [form, setForm] = useState<{ a: number; b: number; aToB: string; bToA: string } | null>(null);
  const [idea, setIdea] = useState("");

  // Each pair once: "b is a's aToB".
  const pairs: { a: Character; b: Character; aToB: string; bToA: string }[] = [];
  for (const a of residents) for (const t of a.ties || []) {
    const b = byId(t.withId);
    if (!b || b.worldId !== world.id || pairs.some((p) => p.a.id === b.id && p.b.id === a.id)) continue;
    pairs.push({ a, b, aToB: bare(t.tie), bToA: bare(b.ties?.find((x) => x.withId === a.id)?.tie || "") });
  }

  const run = async (label: string, job: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await job();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };
  const saveTie = async (aId: number, bId: number, aToB: string, bToA: string) => {
    const a = byId(aId), b = byId(bId);
    if (!a || !b) return;
    const [na, nb] = withTie(a, b, aToB, bToA);
    await dispatch(updateCharacter(na));
    await dispatch(updateCharacter(nb));
  };
  const removeTie = async (a: Character, b: Character) => {
    const [na, nb] = withoutTie(a, b);
    await dispatch(updateCharacter(na));
    await dispatch(updateCharacter(nb));
  };
  const remove = async (c: Character) => {
    if (await showConfirm(`Delete ${c.name} from ${world.name}?`, `Only this copy is deleted, with its chats' link to them. Copies in other worlds stay as they are.`)) await dispatch(deleteCharacter(c.id));
  };

  const suggestPeople = () => run("people", async () => {
    const found = await assist.suggestCast({ name: world.name, premise: world.premise, tone: world.tone, era: world.era }, residents, suggestions.map((s) => s.name));
    if (!found.length) throw new Error("No suggestions came back. Try again.");
    setSuggestions(found);
  });
  const addSuggestion = (sg: CastSuggestion) => run(`add-${sg.name}`, async () => {
    const draft = parseCharacterDraft(await dispatch(generateAssistText({ instruction: buildCharacterDraftPrompt({ idea: castIdea(`${sg.name}: ${sg.idea}`, world) }) })).unwrap());
    const made = await dispatch(addCharacter({ ...draft, name: sg.name, first_mes: draft.first_mes || undefined, accent: CHARACTER_SWATCHES[Math.floor(Math.random() * CHARACTER_SWATCHES.length)], worldId: world.id } as Omit<Character, "id">)).unwrap();
    const other = residents.find((c) => c.name === sg.tieWith);
    if (other && sg.tie) {
      const [na, nb] = withTie(other, made, sg.tie, mirrorTie(sg.tie));
      await dispatch(updateCharacter(na));
      await dispatch(updateCharacter(nb));
    }
    setSuggestions((list) => list.filter((x) => x.name !== sg.name));
  });
  // Someone new, from a line you write: drafted in full to fit the world.
  const createFromIdea = () => run("idea", async () => {
    const line = idea.trim();
    if (!line) return;
    const draft = parseCharacterDraft(await dispatch(generateAssistText({ instruction: buildCharacterDraftPrompt({ idea: castIdea(line, world) }) })).unwrap());
    await dispatch(addCharacter({ ...draft, first_mes: draft.first_mes || undefined, accent: CHARACTER_SWATCHES[Math.floor(Math.random() * CHARACTER_SWATCHES.length)], worldId: world.id } as Omit<Character, "id">)).unwrap();
    setIdea("");
  });
  const suggestTies = () => run("ties", async () => {
    const cast = residents.map((c) => ({ key: String(c.id), name: c.name, description: c.description, withYou: c.relationship || "" }));
    const reply = await dispatch(generateAssistText({ instruction: buildConnectionsPrompt(world, cast, persona?.name?.trim() || "the user") })).unwrap();
    const { ties } = parseConnections(reply, cast);
    const fresh = ties
      .map((t: WorldTie) => ({ a: Number(t.a), b: Number(t.b), aToB: bare(t.aToB), bToA: bare(t.bToA) }))
      .filter((t) => !pairs.some((p) => (p.a.id === t.a && p.b.id === t.b) || (p.a.id === t.b && p.b.id === t.a)));
    if (!fresh.length) throw new Error("No new connections came back. Try again.");
    setProposals(fresh);
  });

  const name = (id: number) => byId(id)?.name || "?";

  return (
    <Card className="flex flex-col gap-5 p-6" aria-label="Cast and relationships">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-foreground"><FaUserFriends size={13} className="text-subtle" /> Cast and relationships · {residents.length}</h3>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setJoinOpen(true)}><FaPlus size={10} /> From another world</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void suggestPeople()} disabled={busy === "people"}><FaMagic size={10} /> {busy === "people" ? "Thinking..." : "Suggest people"}</Button>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="cast-new-idea" className="text-sm font-medium text-foreground">Someone new</label>
        <div className="flex flex-wrap gap-2">
          <Input id="cast-new-idea" value={idea} onChange={(e) => setIdea(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void createFromIdea()} placeholder="e.g. A grumpy lighthouse keeper with a soft spot for strays" className="min-w-[200px] flex-1" />
          <Button type="button" onClick={() => void createFromIdea()} disabled={busy === "idea" || !idea.trim()}><FaMagic size={10} /> {busy === "idea" ? "Creating..." : "Create"}</Button>
        </div>
        <p className="text-xs text-subtle">Describe them in a line; the rest is drafted to fit this world. Edit them after with the pencil.</p>
      </div>
      <JoinWorldDialog open={joinOpen} onOpenChange={setJoinOpen} target={{ id: world.id, name: world.name }} />
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      {residents.length === 0 ? (
        <p className="text-[13.5px] text-muted-foreground">Nobody lives here yet. Describe someone new, bring someone from another world, or let the AI suggest people.</p>
      ) : (
        <ul aria-label={`People in ${world.name}`} className="flex flex-col gap-1.5">
          {residents.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-raised px-3 py-2">
              <CharacterAvatar name={c.name} accent={c.accent} imageSrc={avatarOf(c)} size={36} />
              <span className="min-w-[90px] flex-1 truncate text-[14.5px] font-semibold text-foreground">{c.name}</span>
              <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                to you
                <Input list="cast-you-choices" aria-label={`${c.name} to you`} defaultValue={c.relationship || ""} onBlur={(e) => e.target.value.trim() !== (c.relationship || "") && void dispatch(updateCharacter({ ...c, relationship: e.target.value.trim() }))} className="h-8 w-[170px]" placeholder="e.g. neighbour" />
              </label>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${c.name}`} onClick={() => navigate(`/characters/${c.id}/edit`)}><FaPen size={11} /></Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" aria-label={`Delete ${c.name}`} onClick={() => void remove(c)}><FaTrash size={11} /></Button>
            </li>
          ))}
        </ul>
      )}
      <datalist id="cast-you-choices">{RELATIONSHIP_PRESETS.map((t) => <option key={t} value={t} />)}</datalist>
      <datalist id="cast-tie-choices">{TIE_PRESETS.map((t) => <option key={t} value={t} />)}</datalist>

      {suggestions.length > 0 && (
        <ul aria-label="Suggested people" className="flex flex-col gap-1.5">
          {suggestions.map((sg) => (
            <li key={sg.name} className="flex flex-wrap items-center gap-3 rounded-xl px-3 py-2 ring-1 ring-inset ring-border">
              <CharacterAvatar name={sg.name} size={32} />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-foreground">{sg.name}{sg.tieWith && <span className="font-normal text-muted-foreground"> · {sg.tieWith}'s {sg.tie}</span>}</div>
                <div className="text-[12.5px] text-muted-foreground">{sg.idea}</div>
              </div>
              <Button type="button" size="sm" aria-label={`Add ${sg.name}`} disabled={busy === `add-${sg.name}`} onClick={() => void addSuggestion(sg)}>{busy === `add-${sg.name}` ? "Adding..." : "Add"}</Button>
              <Button type="button" variant="ghost" size="sm" aria-label={`Skip ${sg.name}`} onClick={() => setSuggestions((list) => list.filter((x) => x.name !== sg.name))}>Skip</Button>
            </li>
          ))}
        </ul>
      )}

      {residents.length > 1 && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">How they're connected</span>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void suggestTies()} disabled={busy === "ties"}><FaMagic size={10} /> {busy === "ties" ? "Thinking..." : "Suggest connections"}</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ a: residents[0].id, b: residents[1].id, aToB: "", bToA: "" })}><FaPlus size={10} /> Add a connection</Button>
            </div>
          </div>
          {pairs.length > 0 && (
            <ul aria-label={`Connections in ${world.name}`} className="flex flex-col">
              {pairs.map((p) => (
                <li key={`${p.a.id}-${p.b.id}`} className="flex min-h-12 items-center gap-2 text-[13.5px] [&+&]:border-t [&+&]:border-border">
                  <span className="flex-1"><b>{p.b.name}</b> is {p.a.name}'s {p.aToB}{p.bToA && <span className="text-subtle"> · {p.a.name} is their {p.bToA}</span>}</span>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${p.a.name} and ${p.b.name}`} onClick={() => setForm({ a: p.a.id, b: p.b.id, aToB: p.aToB, bToA: p.bToA })}><FaPen size={11} /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Remove ${p.a.name} and ${p.b.name}`} onClick={() => void removeTie(p.a, p.b)}><FaTimes size={12} /></Button>
                </li>
              ))}
            </ul>
          )}
          {proposals.length > 0 && (
            <ul aria-label="Suggested connections" className="flex flex-col gap-1">
              {proposals.map((t, i) => (
                <li key={`${t.a}-${t.b}-${i}`} className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-[13.5px] ring-1 ring-inset ring-border">
                  <span className="flex-1"><b>{name(t.b)}</b> is {name(t.a)}'s {t.aToB} · {name(t.a)} is their {t.bToA}</span>
                  <Button type="button" size="sm" onClick={() => void run("p", async () => { await saveTie(t.a, t.b, t.aToB, t.bToA); setProposals((l) => l.filter((_, j) => j !== i)); })}>Add</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setProposals((l) => l.filter((_, j) => j !== i))}>Skip</Button>
                </li>
              ))}
              {proposals.length > 1 && (
                <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => void run("p", async () => { for (const t of proposals) await saveTie(t.a, t.b, t.aToB, t.bToA); setProposals([]); })}>Add all</Button>
              )}
            </ul>
          )}
          {form && (
            <div role="group" aria-label="Connection" className="flex flex-wrap items-center gap-2 rounded-xl bg-raised px-3 py-2.5 text-[13.5px]">
              <Select aria-label="First person" value={String(form.b)} onChange={(e) => setForm({ ...form, b: Number(e.target.value) })} className="h-8 w-[140px]">
                {residents.filter((c) => c.id !== form.a).map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </Select>
              <span>is</span>
              <Select aria-label="Second person" value={String(form.a)} onChange={(e) => setForm({ ...form, a: Number(e.target.value) })} className="h-8 w-[140px]">
                {residents.filter((c) => c.id !== form.b).map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </Select>
              <span>'s</span>
              <Input list="cast-tie-choices" aria-label={`What ${name(form.b)} is to ${name(form.a)}`} value={form.aToB} onChange={(e) => setForm({ ...form, aToB: e.target.value })} placeholder="older sister" className="h-8 w-[150px]" />
              <span className="text-subtle">and {name(form.a)} is their</span>
              <Input list="cast-tie-choices" aria-label={`What ${name(form.a)} is to ${name(form.b)}`} value={form.bToA} onChange={(e) => setForm({ ...form, bToA: e.target.value })} placeholder="younger brother" className="h-8 w-[150px]" />
              <span className="flex-1" />
              <Button type="button" variant="ghost" size="sm" onClick={() => setForm(null)}>Cancel</Button>
              <Button type="button" size="sm" disabled={!form.aToB.trim()} onClick={() => void run("save", async () => { await saveTie(form.a, form.b, form.aToB, form.bToA || mirrorTie(form.aToB)); setForm(null); })}>Save</Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

export default WorldCastCard;
