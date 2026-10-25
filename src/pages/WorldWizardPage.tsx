import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaArrowLeft, FaArrowRight, FaCheck, FaGlobe, FaMagic, FaPlus, FaTimes, FaUserFriends, FaLink, FaUser } from "react-icons/fa";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { addWorld, switchWorld } from "../features/worldSlice";
import { addCharacter, updateCharacter } from "../features/characterSlice";
import { generateAssistText } from "../features/aiSlice";
import { selectActivePersona } from "../features/settingsSlice";
import { buildCharacterDraftPrompt, CharacterDraft, parseCharacterDraft } from "../features/character/characterDraft";
import { rootOf, worldCopy } from "../features/character/card";
import { applyTies, buildConnectionsPrompt, castIdea, CastMember, parseConnections, WorldTie } from "../features/world/worldWizard";
import { worldName, worldOf } from "../features/world/currentWorld";
import { avatarOf } from "../features/character/profileChanges";
import { Character } from "../types";
import { cn } from "../utils/cn";
import { CHARACTER_SWATCHES, WORLD_TONE_PRESETS } from "../utils/constants";
import { Button } from "src/components/atoms/button";
import { Card } from "src/components/atoms/card";
import Header from "src/components/organisms/Header";
import { WizardSteps } from "src/components/molecules/WizardSteps";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { TextInput, TextArea, FieldLabel, Select, PresetSelectField } from "src/components/molecules/form-controls";

const STEPS = ["World", "Cast", "Connections", "You"];

// Someone in the new world's cast: a person from another world (joining as a
// copy) or one drafted for this world.
type Member = CastMember & ({ kind: "existing"; character: Character } | { kind: "new"; draft: CharacterDraft });

// The world wizard (#144): the world, who lives there, how they're
// connected, and who you are there. Nothing is saved until "Create world".
const WorldWizardPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const worlds = useAppSelector((state) => state.world.worlds);
  const characters = useAppSelector((state) => state.character.characters);
  const personas = useAppSelector((state) => state.settings.personas);
  const activePersona = useAppSelector(selectActivePersona);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [premise, setPremise] = useState("");
  const [tone, setTone] = useState("");
  const [era, setEra] = useState("");
  const world = { name: name.trim(), premise: premise.trim(), tone: tone.trim() || undefined, era: era.trim() || undefined };

  const [cast, setCast] = useState<Member[]>([]);
  const [idea, setIdea] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [ties, setTies] = useState<WorldTie[]>([]);
  const [proposing, setProposing] = useState(false);
  const [personaId, setPersonaId] = useState("");
  const [creating, setCreating] = useState(false);
  const userName = (personas.find((p) => p.id === personaId) || activePersona)?.name?.trim() || "the user";

  // One entry per person, whichever worlds they're already in.
  const people = useMemo(() => {
    const seen = new Set<number>();
    return characters.filter((c) => !seen.has(rootOf(c)) && seen.add(rootOf(c)));
  }, [characters]);

  const stepError = (s: number) => {
    if (s === 0 && (!world.name || !world.premise)) return "Give the world a name and a premise.";
    if (s === 1 && cast.length === 0) return "Add at least one person to the cast.";
    return null;
  };
  const goTo = (target: number) => {
    for (let s = 0; s < target; s++) {
      const e = stepError(s);
      if (e) {
        setError(e);
        setStep(s);
        return;
      }
    }
    setError(null);
    setStep(target);
  };

  const togglePerson = (c: Character) =>
    setCast((list) => (list.some((m) => m.key === `c${c.id}`) ? list.filter((m) => m.key !== `c${c.id}`) : [...list, { key: `c${c.id}`, kind: "existing", character: c, name: c.name, description: c.description, withYou: c.relationship || "" }]));

  const draftPerson = async () => {
    if (!idea.trim()) return;
    setDrafting(true);
    setError(null);
    try {
      const draft = parseCharacterDraft(await dispatch(generateAssistText({ instruction: buildCharacterDraftPrompt({ idea: castIdea(idea, world) }) })).unwrap());
      setCast((list) => [...list, { key: `n${Date.now()}`, kind: "new", draft, name: draft.name, description: draft.description, withYou: draft.relationship || "" }]);
      setIdea("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't draft that person. Try again.");
    } finally {
      setDrafting(false);
    }
  };

  const proposeConnections = async () => {
    setProposing(true);
    setError(null);
    try {
      const reply = await dispatch(generateAssistText({ instruction: buildConnectionsPrompt(world, cast, userName) })).unwrap();
      const parsed = parseConnections(reply, cast);
      setTies(parsed.ties);
      setCast((list) => list.map((m) => (parsed.withYou[m.key] ? { ...m, withYou: parsed.withYou[m.key] } : m)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't suggest connections. Try again.");
    } finally {
      setProposing(false);
    }
  };

  const nameOf = (key: string) => cast.find((m) => m.key === key)?.name || "";
  const setTie = (i: number, patch: Partial<WorldTie>) => setTies((list) => list.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  const create = async () => {
    setCreating(true);
    try {
      const saved = await dispatch(addWorld({ ...world, personaId: personaId || undefined })).unwrap();
      const idOf: Record<string, number> = {};
      const made: Character[] = [];
      for (const m of cast) {
        const base = m.kind === "existing"
          ? worldCopy(m.character, saved.id)
          : { ...m.draft, first_mes: m.draft.first_mes || undefined, accent: CHARACTER_SWATCHES[Math.floor(Math.random() * CHARACTER_SWATCHES.length)], worldId: saved.id };
        const c = await dispatch(addCharacter({ ...base, relationship: m.withYou.trim() || base.relationship } as Omit<Character, "id">)).unwrap();
        idOf[m.key] = c.id;
        made.push(c);
      }
      for (const c of applyTies(made, ties.filter((t) => t.aToB.trim() && t.bToA.trim()), idOf)) await dispatch(updateCharacter(c));
      dispatch(switchWorld(saved.id));
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the world.");
      setCreating(false);
    }
  };

  return (
    <div className="w-full h-dvh flex flex-col">
      <Header title="New world" subtitle="Its own people, chats and news" onBack={() => navigate("/worlds")} />
      <div className="flex-1 overflow-auto p-4 md:p-8">
        <div className="w-full max-w-[860px] mx-auto">
          <WizardSteps steps={STEPS} current={step}>
            {STEPS.map((label, i) => (
              <React.Fragment key={label}>
                <button
                  type="button"
                  onClick={() => goTo(i)}
                  aria-current={i === step ? "step" : undefined}
                  className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors", i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-secondary text-foreground hover:bg-accent" : "text-subtle hover:text-foreground")}
                >
                  <span className={cn("flex items-center justify-center w-5 h-5 rounded-full text-[10px]", i === step ? "bg-primary-foreground/20" : i < step ? "bg-primary/20 text-primary" : "bg-muted")}>
                    {i < step ? <FaCheck size={9} /> : i + 1}
                  </span>
                  {label}
                </button>
                {i < STEPS.length - 1 && <div className="h-px flex-1 min-w-[12px] bg-border" />}
              </React.Fragment>
            ))}
          </WizardSteps>

          {error && <div role="alert" className="mb-4 px-4 py-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">{error}</div>}

          {step === 0 && (
            <Card className="p-6 flex flex-col gap-4">
              <h3 className="font-semibold text-[15px] text-foreground flex items-center gap-2"><FaGlobe size={13} className="text-subtle" /> The world</h3>
              <div>
                <FieldLabel htmlFor="wizard-name">Name</FieldLabel>
                <TextInput id="wizard-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Harbour Town" />
              </div>
              <div>
                <FieldLabel htmlFor="wizard-premise" hint="Every chat in this world gets it.">Premise</FieldLabel>
                <TextArea id="wizard-premise" value={premise} onChange={(e) => setPremise(e.target.value)} placeholder="Where it is, what's unusual about it, what life is like there." className="resize-none min-h-[90px]" />
              </div>
              <PresetSelectField label="Tone" value={tone} onChange={setTone} presets={WORLD_TONE_PRESETS} customPlaceholder="e.g. Cosy small-town drama" />
              <div>
                <FieldLabel htmlFor="wizard-era" hint="A medieval world can still 'text': messages stand for letters or messengers.">Era or technology</FieldLabel>
                <TextInput id="wizard-era" value={era} onChange={(e) => setEra(e.target.value)} placeholder="e.g. Today, phones and all / Medieval, news travels by letter" />
              </div>
            </Card>
          )}

          {step === 1 && (
            <Card className="p-6 flex flex-col gap-4">
              <h3 className="font-semibold text-[15px] text-foreground flex items-center gap-2"><FaUserFriends size={13} className="text-subtle" /> The cast</h3>
              <div>
                <FieldLabel htmlFor="wizard-idea" hint="One line; the rest is drafted to fit the world.">Someone new</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  <TextInput id="wizard-idea" value={idea} onChange={(e) => setIdea(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void draftPerson()} placeholder="e.g. A grumpy lighthouse keeper with a soft spot for strays" className="flex-1 min-w-[200px]" />
                  <Button type="button" onClick={() => void draftPerson()} disabled={drafting || !idea.trim()}><FaMagic size={11} /> {drafting ? "Drafting..." : "Draft"}</Button>
                </div>
              </div>
              {cast.length > 0 && (
                <ul aria-label="Cast" className="flex flex-col gap-1">
                  {cast.map((m) => (
                    <li key={m.key} className="flex items-center gap-3 rounded-xl bg-raised px-3 py-2">
                      <CharacterAvatar name={m.name} imageSrc={m.kind === "existing" ? avatarOf(m.character) : undefined} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14.5px] font-semibold text-foreground">{m.name}</div>
                        <div className="truncate text-[12.5px] text-muted-foreground">{m.kind === "new" ? "New" : `From ${worldName(worldOf(m.character, worlds), worlds)}`}{m.description ? ` · ${m.description}` : ""}</div>
                      </div>
                      <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${m.name}`} onClick={() => { setCast((list) => list.filter((x) => x.key !== m.key)); setTies((list) => list.filter((t) => t.a !== m.key && t.b !== m.key)); }}><FaTimes size={12} /></Button>
                    </li>
                  ))}
                </ul>
              )}
              {people.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium text-foreground">People you already have</p>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="People you already have">
                    {people.map((c) => {
                      const picked = cast.some((m) => m.key === `c${c.id}`);
                      return (
                        <button key={c.id} type="button" aria-pressed={picked} onClick={() => togglePerson(c)} className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px]", picked ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
                          <CharacterAvatar name={c.name} accent={c.accent} imageSrc={avatarOf(c)} size={22} /> {c.name}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs text-subtle">They join as themselves, with no memories from other worlds.</p>
                </div>
              )}
            </Card>
          )}

          {step === 2 && (
            <Card className="p-6 flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-[15px] text-foreground flex items-center gap-2"><FaLink size={13} className="text-subtle" /> How they're connected</h3>
                <Button type="button" variant="outline" onClick={() => void proposeConnections()} disabled={proposing}><FaMagic size={11} /> {proposing ? "Thinking..." : ties.length ? "Suggest again" : "Suggest connections"}</Button>
              </div>
              <ul aria-label="Connections" className="flex flex-col gap-2">
                {ties.map((t, i) => (
                  <li key={`${t.a}-${t.b}-${i}`} className="flex flex-wrap items-center gap-2 rounded-xl bg-raised px-3 py-2 text-[13.5px]">
                    <span className="font-semibold">{nameOf(t.b)}</span> is {nameOf(t.a)}'s
                    <TextInput aria-label={`What ${nameOf(t.b)} is to ${nameOf(t.a)}`} value={t.aToB.replace(/^your\s+/i, "")} onChange={(e) => setTie(i, { aToB: `your ${e.target.value}` })} className="h-8 w-[180px]" />
                    <span className="text-subtle">and {nameOf(t.a)} is their</span>
                    <TextInput aria-label={`What ${nameOf(t.a)} is to ${nameOf(t.b)}`} value={t.bToA.replace(/^your\s+/i, "")} onChange={(e) => setTie(i, { bToA: `your ${e.target.value}` })} className="h-8 w-[180px]" />
                    <Button type="button" variant="ghost" size="icon" aria-label="Remove connection" onClick={() => setTies((list) => list.filter((_, j) => j !== i))}><FaTimes size={12} /></Button>
                  </li>
                ))}
              </ul>
              {cast.length > 1 && (
                <Button type="button" variant="ghost" className="self-start" onClick={() => setTies((list) => [...list, { a: cast[0].key, b: cast[1].key, aToB: "your friend", bToA: "your friend" }])}><FaPlus size={11} /> Add a connection</Button>
              )}
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Who they are to you</p>
                <ul className="flex flex-col gap-2">
                  {cast.map((m) => (
                    <li key={m.key} className="flex items-center gap-3">
                      <span className="w-[120px] truncate text-[13.5px] font-semibold">{m.name}</span>
                      <TextInput aria-label={`${m.name} to you`} value={m.withYou} onChange={(e) => setCast((list) => list.map((x) => (x.key === m.key ? { ...x, withYou: e.target.value } : x)))} placeholder="e.g. Neighbour you've never spoken to" className="flex-1" />
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          )}

          {step === 3 && (
            <Card className="p-6 flex flex-col gap-4">
              <h3 className="font-semibold text-[15px] text-foreground flex items-center gap-2"><FaUser size={13} className="text-subtle" /> Who you are here</h3>
              <div>
                <FieldLabel htmlFor="wizard-persona">You in this world</FieldLabel>
                <Select id="wizard-persona" aria-label="You in this world" value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
                  <option value="">Your active persona</option>
                  {personas.map((p) => <option key={p.id} value={p.id}>{p.name || "Unnamed"}</option>)}
                </Select>
              </div>
              <p className="text-sm text-muted-foreground">{world.name} starts with {cast.length} {cast.length === 1 ? "person" : "people"} and {ties.length} {ties.length === 1 ? "connection" : "connections"}. You'll switch to it when it's made.</p>
            </Card>
          )}

          <div className="mt-6 flex justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => (step === 0 ? navigate("/worlds") : goTo(step - 1))}><FaArrowLeft size={11} /> {step === 0 ? "Cancel" : "Back"}</Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={() => goTo(step + 1)}>Next <FaArrowRight size={11} /></Button>
            ) : (
              <Button type="button" onClick={() => void create()} disabled={creating}><FaCheck size={11} /> {creating ? "Creating..." : "Create world"}</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorldWizardPage;
