import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaArrowLeft, FaArrowRight, FaCheck, FaGlobe, FaMagic, FaPlus, FaTimes, FaUserFriends, FaLink, FaUser } from "react-icons/fa";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { addWorld, switchWorld } from "../features/worldSlice";
import { addCharacter, updateCharacter } from "../features/characterSlice";
import { generateAssistText } from "../features/aiSlice";
import { addPersona, selectActivePersona } from "../features/settingsSlice";
import { useWorldAssist } from "../hooks/useWorldAssist";
import { CastSuggestion, castLiteOf, mirrorTie } from "../features/world/worldAssist";
import SuggestField from "src/components/molecules/SuggestField";
import { buildCharacterDraftPrompt, CharacterDraft, parseCharacterDraft } from "../features/character/characterDraft";
import { rootOf, worldCopy } from "../features/character/card";
import { applyTies, buildConnectionsPrompt, castIdea, CastMember, parseConnections, WorldTie } from "../features/world/worldWizard";
import { worldName, worldOf } from "../features/world/currentWorld";
import { circleLayout } from "../features/character/relationshipMap";
import { avatarOf } from "../features/character/profileChanges";
import { Character } from "../types";
import { cn } from "../utils/cn";
import { CHARACTER_SWATCHES, RELATIONSHIP_PRESETS, TIE_PRESETS, WORLD_ERA_PRESETS, WORLD_TONE_PRESETS } from "../utils/constants";
import { Button } from "src/components/atoms/button";
import { Switch } from "src/components/atoms/switch";
import { Card } from "src/components/atoms/card";
import Header from "src/components/organisms/Header";
import { WizardSteps } from "src/components/molecules/WizardSteps";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { TextInput, FieldLabel, Select } from "src/components/molecules/form-controls";

const STEPS = ["World", "Cast", "Connections", "You"];
const NEW_PERSONA = "__new_persona";

// Someone in the new world's cast: a person from another world (joining as a
// copy) or one drafted for this world.
// `memories`: someone from another world comes with what they remember, or fresh.
type Member = CastMember & ({ kind: "existing"; character: Character; memories?: boolean } | { kind: "new"; draft: CharacterDraft });

// A live preview of the connections (#157), as on the canvas: you in the
// middle, the cast around you, their ties as labelled lines.
const ConnectionsPreview = ({ cast, ties, userName }: { cast: Member[]; ties: WorldTie[]; userName: string }) => {
  const spots = circleLayout(cast.length, 220, 210, 130);
  const at = (key: string) => spots[cast.findIndex((m) => m.key === key)];
  return (
    <aside aria-label="Connections preview" className="hidden flex-col gap-3 rounded-card bg-surface p-5 ring-1 ring-inset ring-border xl:flex">
      <span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-subtle">How they're connected</span>
      <svg viewBox="-40 0 520 420" className="w-full" role="img" aria-label={`${userName} in the middle, with ${cast.map((m) => m.name).join(", ")}`}>
        {spots.map((p, i) => <line key={`y${i}`} x1={220} y1={210} x2={p.x} y2={p.y} stroke="rgb(var(--border))" strokeWidth={1.5} />)}
        {ties.map((t, i) => {
          const a = at(t.a), b = at(t.b);
          if (!a || !b) return null;
          // Bowed away from you, so a tie between people opposite each other
          // doesn't run through the middle.
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          let dx = mx - 220, dy = my - 210;
          if (Math.hypot(dx, dy) < 1) { dx = b.y - a.y; dy = a.x - b.x; }
          const len = Math.hypot(dx, dy) || 1;
          const cx = mx + (dx / len) * 140, cy = my + (dy / len) * 140;
          const lx = 0.25 * a.x + 0.5 * cx + 0.25 * b.x, ly = 0.25 * a.y + 0.5 * cy + 0.25 * b.y;
          return (
            <g key={`t${i}`}>
              <path d={`M${a.x} ${a.y} Q${cx} ${cy} ${b.x} ${b.y}`} fill="none" stroke="rgb(var(--primary))" strokeWidth={2} />
              <text x={lx} y={ly + 5} textAnchor="middle" className="fill-foreground text-[15px] font-bold">{t.aToB.replace(/^your\s+/i, "")}</text>
            </g>
          );
        })}
        <circle cx={220} cy={210} r={26} fill="rgb(var(--primary))" />
        <text x={220} y={216} textAnchor="middle" className="fill-primary-foreground text-[15px] font-bold">You</text>
        {cast.map((m, i) => (
          <g key={m.key}>
            <circle cx={spots[i].x} cy={spots[i].y} r={24} fill="rgb(var(--raised))" stroke="rgb(var(--border-strong))" />
            <text x={spots[i].x} y={spots[i].y + 5} textAnchor="middle" className="fill-foreground text-[14px] font-bold">{m.name.slice(0, 2).toUpperCase()}</text>
            <text x={spots[i].x + (spots[i].x >= 220 ? 32 : -32)} y={spots[i].y + 5} textAnchor={spots[i].x >= 220 ? "start" : "end"} className="fill-foreground text-[15px] font-semibold">{m.name}</text>
          </g>
        ))}
      </svg>
      <p className="text-[12px] text-subtle">They use these when they talk about each other. Change them any time in a character's Contact info, under Relationships.</p>
    </aside>
  );
};

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
  // Who the new person is tied to in the cast, and what they are to them.
  const [linkKey, setLinkKey] = useState("");
  const [linkTie, setLinkTie] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [ties, setTies] = useState<WorldTie[]>([]);
  const [proposing, setProposing] = useState(false);
  const [personaId, setPersonaId] = useState("");
  // AI help (#144): field suggestions, filling the rest, suggested people.
  const assist = useWorldAssist();
  const [filling, setFilling] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<CastSuggestion[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [newPersona, setNewPersona] = useState("");
  const pendingPersona = useRef<string | null>(null);
  // A persona made here is picked as soon as it exists.
  useEffect(() => {
    const made = pendingPersona.current && personas.find((p) => p.name === pendingPersona.current);
    if (made) {
      pendingPersona.current = null;
      setPersonaId(made.id);
      setNewPersona("");
    }
  }, [personas]);
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
      const other = cast.find((m) => m.key === linkKey);
      const tie = linkTie.trim();
      const draft = parseCharacterDraft(await dispatch(generateAssistText({ instruction: buildCharacterDraftPrompt({ idea: castIdea(idea, world, other && tie ? { name: other.name, description: other.description, tie } : undefined) }) })).unwrap());
      const key = `n${Date.now()}`;
      setCast((list) => [...list, { key, kind: "new", draft, name: draft.name, description: draft.description, withYou: draft.relationship || "" }]);
      // The tie goes straight into Connections, both ways.
      if (other && tie) setTies((list) => [...list, { a: other.key, b: key, aToB: `your ${tie.replace(/^your\s+/i, "")}`, bToA: `your ${mirrorTie(tie.replace(/^your\s+/i, ""))}` }]);
      setIdea("");
      setLinkKey("");
      setLinkTie("");
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
  const draftWorld = { name, premise, tone, era };

  const fillRest = async () => {
    setFilling(true);
    setError(null);
    try {
      const f = await assist.fillWorld(draftWorld);
      if (f.name && !name.trim()) setName(f.name);
      if (f.premise && !premise.trim()) setPremise(f.premise);
      if (f.tone && !tone.trim()) setTone(f.tone);
      if (f.era && !era.trim()) setEra(f.era);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't fill in the world.");
    } finally {
      setFilling(false);
    }
  };

  const suggestPeople = async () => {
    setSuggesting(true);
    setError(null);
    try {
      const found = await assist.suggestCast(world, cast.map((m) => castLiteOf({ ...(m.kind === "existing" ? m.character : m.draft), name: m.name, relationship: m.withYou })), suggestions.map((x) => x.name));
      if (!found.length) setError("No suggestions came back. Try again.");
      setSuggestions(found);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't suggest anyone.");
    } finally {
      setSuggesting(false);
    }
  };

  // A suggested person joins the cast, drafted in full, tied to whoever
  // they were suggested for.
  const addSuggestion = async (sg: CastSuggestion) => {
    setAdding(sg.name);
    try {
      // Drafted knowing who they're tied to, so they fit that person's story.
      const other = cast.find((m) => m.name === sg.tieWith);
      const connection = other && sg.tie ? { name: other.name, description: castLiteOf({ ...(other.kind === "existing" ? other.character : other.draft), name: other.name }).description, tie: sg.tie } : undefined;
      const draft = parseCharacterDraft(await dispatch(generateAssistText({ instruction: buildCharacterDraftPrompt({ idea: castIdea(`${sg.name}: ${sg.idea}`, world, connection) }) })).unwrap());
      const key = `n${Date.now()}`;
      setCast((list) => [...list, { key, kind: "new", draft: { ...draft, name: sg.name }, name: sg.name, description: draft.description || sg.idea, withYou: draft.relationship || "" }]);
      if (other && sg.tie) setTies((list) => [...list, { a: other.key, b: key, aToB: `your ${sg.tie}`, bToA: `your ${mirrorTie(sg.tie!)}` }]);
      setSuggestions((list) => list.filter((x) => x.name !== sg.name));
    } catch (err) {
      setError(err instanceof Error ? err.message : `Couldn't add ${sg.name}.`);
    } finally {
      setAdding(null);
    }
  };

  // A new connection starts with the first pair not yet connected.
  const addConnection = () => {
    for (const a of cast) for (const b of cast) {
      if (a.key === b.key || ties.some((t) => (t.a === a.key && t.b === b.key) || (t.a === b.key && t.b === a.key))) continue;
      setTies((list) => [...list, { a: a.key, b: b.key, aToB: "your friend", bToA: "your friend" }]);
      return;
    }
  };
  const setTie = (i: number, patch: Partial<WorldTie>) => setTies((list) => list.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  const create = async () => {
    setCreating(true);
    try {
      const saved = await dispatch(addWorld({ ...world, personaId: personaId && personaId !== NEW_PERSONA ? personaId : undefined })).unwrap();
      const idOf: Record<string, number> = {};
      const made: Character[] = [];
      for (const m of cast) {
        const base = m.kind === "existing"
          ? worldCopy(m.character, saved.id, { memories: m.memories })
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
        <div className={cn("mx-auto w-full", step === 2 ? "max-w-[1240px]" : "max-w-[860px]")}>
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-[15px] text-foreground flex items-center gap-2"><FaGlobe size={13} className="text-subtle" /> The world</h3>
                <Button type="button" variant="outline" size="sm" onClick={() => void fillRest()} disabled={filling}><FaMagic size={11} /> {filling ? "Filling in..." : "Fill the rest with AI"}</Button>
              </div>
              <SuggestField id="wizard-name" label="Name" value={name} onChange={setName} placeholder="e.g. Harbour Town" onSuggest={() => assist.suggestField("name", draftWorld)} />
              <SuggestField id="wizard-premise" label="Premise" multiline value={premise} onChange={setPremise} hint="Every chat in this world gets it." placeholder="Where it is, what's unusual about it, what life is like there." onSuggest={() => assist.suggestField("premise", draftWorld)} />
              <SuggestField id="wizard-tone" label="Tone" value={tone} onChange={setTone} options={WORLD_TONE_PRESETS} placeholder="e.g. Cozy small-town drama" onSuggest={() => assist.suggestField("tone", draftWorld)} />
              <SuggestField id="wizard-era" label="Era or technology" value={era} onChange={setEra} options={WORLD_ERA_PRESETS} hint="A medieval world can still 'text': messages stand for letters or messengers." placeholder="e.g. Today, phones and all" onSuggest={() => assist.suggestField("era", draftWorld)} />
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
                {cast.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                    <span>Connected to</span>
                    <Select aria-label="Connected to" value={linkKey} onChange={(e) => setLinkKey(e.target.value)} className="h-8 w-[150px]">
                      <option value="">Nobody in particular</option>
                      {cast.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
                    </Select>
                    {linkKey && (
                      <>
                        <span>as their</span>
                        <TextInput list="tie-choices" aria-label={`What they are to ${cast.find((m) => m.key === linkKey)?.name}`} value={linkTie} onChange={(e) => setLinkTie(e.target.value)} placeholder="older brother" className="h-8 w-[160px]" />
                      </>
                    )}
                  </div>
                )}
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
                      {m.kind === "existing" && (
                        <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground" title="With their memories, or a fresh start here">
                          <Switch aria-label={`${m.name} brings their memories`} checked={Boolean(m.memories)} onCheckedChange={(on) => setCast((list) => list.map((x) => (x.key === m.key && x.kind === "existing" ? { ...x, memories: on } : x)))} />
                          {m.memories ? "With memories" : "Fresh start"}
                        </label>
                      )}
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
                  <p className="mt-2 text-xs text-subtle">Each joins as their own copy. Choose per person whether they bring their memories or start fresh.</p>
                </div>
              )}
              {step === 1 && <datalist id="tie-choices">{TIE_PRESETS.map((t) => <option key={t} value={t} />)}</datalist>}
              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">People who'd fit in</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => void suggestPeople()} disabled={suggesting}><FaMagic size={11} /> {suggesting ? "Thinking..." : suggestions.length ? "Suggest others" : "Suggest people"}</Button>
                </div>
                <p className="text-xs text-subtle">Based on the world and who's in it: their family, friends, exes, rivals. Add the ones you like.</p>
                {suggestions.length > 0 && (
                  <ul aria-label="Suggested people" className="flex flex-col gap-1.5">
                    {suggestions.map((sg) => (
                      <li key={sg.name} className="flex flex-wrap items-center gap-3 rounded-xl bg-raised px-3 py-2">
                        <CharacterAvatar name={sg.name} size={32} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[14px] font-semibold text-foreground">{sg.name}{sg.tieWith && <span className="font-normal text-muted-foreground"> · {sg.tieWith}'s {sg.tie}</span>}</div>
                          <div className="text-[12.5px] text-muted-foreground">{sg.idea}</div>
                        </div>
                        <Button type="button" size="sm" disabled={adding === sg.name} onClick={() => void addSuggestion(sg)} aria-label={`Add ${sg.name}`}>{adding === sg.name ? "Adding..." : "Add"}</Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setSuggestions((list) => list.filter((x) => x.name !== sg.name))} aria-label={`Skip ${sg.name}`}>Skip</Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          )}

          {step === 2 && (
            <div className="grid items-start gap-5 xl:grid-cols-[1fr_400px]">
            <Card className="p-6 flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-[15px] text-foreground flex items-center gap-2"><FaLink size={13} className="text-subtle" /> How they're connected</h3>
                <Button type="button" variant="outline" onClick={() => void proposeConnections()} disabled={proposing}><FaMagic size={11} /> {proposing ? "Thinking..." : ties.length ? "Suggest again" : "Suggest connections"}</Button>
              </div>
              <ul aria-label="Connections" className="flex flex-col gap-2">
                {ties.map((t, i) => (
                  <li key={`${t.a}-${t.b}-${i}`} className="flex flex-wrap items-center gap-2 rounded-xl bg-raised px-3 py-2 text-[13.5px]">
                    <Select aria-label={`Connection ${i + 1}, first person`} value={t.b} onChange={(e) => setTie(i, { b: e.target.value })} className="h-8 w-[140px]">
                      {cast.filter((m) => m.key !== t.a).map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
                    </Select>
                    <span>is</span>
                    <Select aria-label={`Connection ${i + 1}, second person`} value={t.a} onChange={(e) => setTie(i, { a: e.target.value })} className="h-8 w-[140px]">
                      {cast.filter((m) => m.key !== t.b).map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
                    </Select>
                    <span>'s</span>
                    <TextInput list="tie-choices" aria-label={`What ${nameOf(t.b)} is to ${nameOf(t.a)}`} value={t.aToB.replace(/^your\s+/i, "")} onChange={(e) => setTie(i, { aToB: `your ${e.target.value}` })} className="h-8 w-[160px]" />
                    <span className="text-subtle">and {nameOf(t.a)} is their</span>
                    <TextInput list="tie-choices" aria-label={`What ${nameOf(t.a)} is to ${nameOf(t.b)}`} value={t.bToA.replace(/^your\s+/i, "")} onChange={(e) => setTie(i, { bToA: `your ${e.target.value}` })} className="h-8 w-[160px]" />
                    <Button type="button" variant="ghost" size="icon" aria-label="Remove connection" onClick={() => setTies((list) => list.filter((_, j) => j !== i))}><FaTimes size={12} /></Button>
                  </li>
                ))}
              </ul>
              {cast.length > 1 && (
                <Button type="button" variant="ghost" className="self-start" onClick={addConnection}><FaPlus size={11} /> Add a connection</Button>
              )}
              <datalist id="tie-choices">{TIE_PRESETS.map((t) => <option key={t} value={t} />)}</datalist>
              <datalist id="you-choices">{RELATIONSHIP_PRESETS.map((t) => <option key={t} value={t} />)}</datalist>
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Who they are to you</p>
                <ul className="flex flex-col gap-2">
                  {cast.map((m) => (
                    <li key={m.key} className="flex items-center gap-3">
                      <span className="w-[120px] truncate text-[13.5px] font-semibold">{m.name}</span>
                      <TextInput list="you-choices" aria-label={`${m.name} to you`} value={m.withYou} onChange={(e) => setCast((list) => list.map((x) => (x.key === m.key ? { ...x, withYou: e.target.value } : x)))} placeholder="e.g. Neighbour you've never spoken to" className="flex-1" />
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
            <ConnectionsPreview cast={cast} ties={ties} userName={userName} />
            </div>
          )}

          {step === 3 && (
            <Card className="p-6 flex flex-col gap-4">
              <h3 className="font-semibold text-[15px] text-foreground flex items-center gap-2"><FaUser size={13} className="text-subtle" /> Who you are here</h3>
              <div>
                <FieldLabel htmlFor="wizard-persona">You in this world</FieldLabel>
                <Select id="wizard-persona" aria-label="You in this world" value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
                  <option value="">Your active persona</option>
                  {personas.map((p) => <option key={p.id} value={p.id}>{p.name || "Unnamed"}</option>)}
                  <option value={NEW_PERSONA}>New persona…</option>
                </Select>
                {personaId === NEW_PERSONA && (
                  <div className="mt-2 flex gap-2">
                    <TextInput aria-label="New persona's name" value={newPersona} onChange={(e) => setNewPersona(e.target.value)} placeholder="Who you are here, e.g. Sam the baker" className="flex-1" />
                    <Button type="button" disabled={!newPersona.trim()} onClick={() => { pendingPersona.current = newPersona.trim(); dispatch(addPersona({ name: newPersona.trim(), bio: "" })); }}>Create</Button>
                  </div>
                )}
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
