import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaArrowLeft, FaArrowRight, FaCheck, FaPlus, FaGlobe, FaMagic, FaDiceD20, FaUserFriends } from "react-icons/fa";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { addWorld } from "../features/worldSlice";
import { addAdventure } from "../features/adventureSlice";
import { addCharacter } from "../features/characterSlice";
import { generateAssistText } from "../features/aiSlice";
import { selectActivePersona } from "../features/settingsSlice";
import { Character } from "../types";
import { cn } from "../utils/cn";
import { MIN_ADVENTURE_CHOICES, MAX_ADVENTURE_CHOICES, DEFAULT_ADVENTURE_CHOICE_COUNT } from "../utils/constants";
import { Button } from "src/components/atoms/button";
import { Card } from "src/components/atoms/card";
import { Badge } from "src/components/atoms/badge";
import Header from "src/components/organisms/Header";
import Modal from "src/components/molecules/Modal";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { NumberStepper } from "src/components/molecules/NumberStepper";
import { TextInput, TextArea, FieldLabel, Select } from "src/components/molecules/form-controls";

const STEPS = ["World", "Cast", "Premise & Player", "Tone & Rules", "Review"];

const AdventureWizardPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const worlds = useAppSelector((state) => state.world.worlds);
  const characters = useAppSelector((state) => state.character.characters);
  const personas = useAppSelector((state) => state.settings.personas);
  const activePersona = useAppSelector(selectActivePersona);
  const creating = useAppSelector((state) => state.adventure.loading);

  const [step, setStep] = useState(0);
  const [worldId, setWorldId] = useState<number | undefined>(undefined);
  const [characterIds, setCharacterIds] = useState<number[]>([]);
  const [title, setTitle] = useState("");
  const [premise, setPremise] = useState("");
  const [personaId, setPersonaId] = useState<string>("");
  const [choiceCount, setChoiceCount] = useState(DEFAULT_ADVENTURE_CHOICE_COUNT);
  const [replyLengthLimit, setReplyLengthLimit] = useState(0);

  useEffect(() => {
    if (!personaId && activePersona) setPersonaId(activePersona.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePersona]);

  const selectedWorld = worlds.find((w) => w.id === worldId);
  const toggleCharacter = (id: number) => setCharacterIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  // Quick-create World, opened from the World step so picking a setting
  // never has to leave the wizard and lose everything else already filled in.
  const [worldModalOpen, setWorldModalOpen] = useState(false);
  const [newWorldName, setNewWorldName] = useState("");
  const [newWorldPremise, setNewWorldPremise] = useState("");
  const [creatingWorld, setCreatingWorld] = useState(false);
  const [worldModalError, setWorldModalError] = useState<string | null>(null);
  const handleQuickCreateWorld = async () => {
    if (!newWorldName.trim() || !newWorldPremise.trim()) {
      setWorldModalError("Name and premise are both required.");
      return;
    }
    setWorldModalError(null);
    setCreatingWorld(true);
    try {
      const world = await dispatch(addWorld({ name: newWorldName.trim(), premise: newWorldPremise.trim() })).unwrap();
      setWorldId(world.id);
      setWorldModalOpen(false);
      setNewWorldName("");
      setNewWorldPremise("");
    } catch (err: any) {
      setWorldModalError(typeof err === "string" ? err : "Failed to create world.");
    } finally {
      setCreatingWorld(false);
    }
  };

  // Quick-create Character (NPC), same rationale as the world modal above -
  // a minimal (name + personality) version of the full Character Editor,
  // good enough to cast an NPC without leaving the wizard. Anyone wanting a
  // portrait/lorebook/etc. can still build a full character beforehand and
  // just pick it here instead.
  const [npcModalOpen, setNpcModalOpen] = useState(false);
  const [newNpcName, setNewNpcName] = useState("");
  const [newNpcPrompt, setNewNpcPrompt] = useState("");
  const [creatingNpc, setCreatingNpc] = useState(false);
  const [npcModalError, setNpcModalError] = useState<string | null>(null);
  const handleQuickCreateNpc = async () => {
    if (!newNpcName.trim() || !newNpcPrompt.trim()) {
      setNpcModalError("Name and a short personality are both required.");
      return;
    }
    setNpcModalError(null);
    setCreatingNpc(true);
    try {
      const character = await dispatch(addCharacter({ name: newNpcName.trim(), description: "", prompt: newNpcPrompt.trim() })).unwrap();
      setCharacterIds((prev) => [...prev, character.id]);
      setNpcModalOpen(false);
      setNewNpcName("");
      setNewNpcPrompt("");
    } catch (err: any) {
      setNpcModalError(typeof err === "string" ? err : "Failed to create character.");
    } finally {
      setCreatingNpc(false);
    }
  };

  const [expandingPremise, setExpandingPremise] = useState(false);
  const [assistError, setAssistError] = useState<string | null>(null);
  const handleExpandPremise = async () => {
    setAssistError(null);
    setExpandingPremise(true);
    try {
      const cast = characters.filter((c) => characterIds.includes(c.id)).map((c) => c.name).join(", ");
      const instruction = `Write a short (2-4 sentence) opening premise for a roleplay adventure, the specific situation the player starts in.${selectedWorld ? ` World: ${selectedWorld.name} - ${selectedWorld.premise}` : ""}${cast ? ` Cast present: ${cast}.` : ""}${premise.trim() ? `\nBuild on this existing idea, keeping its intent: ${premise.trim()}` : ""}\n\nOutput only the premise, no preamble.`;
      const text = await dispatch(generateAssistText({ instruction })).unwrap();
      if (text) setPremise(text);
    } catch (err: any) {
      setAssistError(typeof err === "string" ? err : "Failed to expand premise. Check your API key in Settings.");
    } finally {
      setExpandingPremise(false);
    }
  };

  const stepError = (i: number): string | null => {
    if (i === 2 && !title.trim()) return "Give this adventure a title first.";
    return null;
  };
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  useEffect(() => {
    if (blockedMessage && !stepError(step)) setBlockedMessage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, step]);

  const goNext = () => {
    const error = stepError(step);
    if (error) {
      setBlockedMessage(error);
      return;
    }
    setBlockedMessage(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const goToStep = (i: number) => {
    for (let s = 0; s < i; s++) {
      const error = stepError(s);
      if (error) {
        setBlockedMessage(error);
        setStep(s);
        return;
      }
    }
    setBlockedMessage(null);
    setStep(i);
  };

  const handleStart = async () => {
    if (stepError(2)) {
      setStep(2);
      setBlockedMessage(stepError(2));
      return;
    }
    const result = await dispatch(
      addAdventure({
        title: title.trim(),
        worldId,
        characterIds,
        personaId: personaId || undefined,
        premise: premise.trim() || undefined,
        rules: { choiceCount, replyLengthLimit: replyLengthLimit || undefined },
      })
    ).unwrap();
    navigate(`/adventures/${result.id}`);
  };

  const cast = characters.filter((c) => characterIds.includes(c.id));

  return (
    <div className="w-full h-screen flex flex-col">
      <Header title="New adventure" subtitle="Set the stage, then start playing" onBack={() => navigate("/adventures")} />
      <div className="flex-1 overflow-auto p-4 md:p-8">
        <div className="w-full max-w-[860px] mx-auto">

          <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
            {STEPS.map((label, i) => (
              <React.Fragment key={label}>
                <button
                  type="button"
                  onClick={() => goToStep(i)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors",
                    i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-secondary text-foreground hover:bg-accent" : "text-subtle hover:text-foreground"
                  )}
                >
                  <span className={cn("flex items-center justify-center w-5 h-5 rounded-full text-[10px]", i === step ? "bg-primary-foreground/20" : i < step ? "bg-primary/20 text-primary" : "bg-muted")}>
                    {i < step ? <FaCheck size={9} /> : i + 1}
                  </span>
                  {label}
                </button>
                {i < STEPS.length - 1 && <div className="h-px flex-1 min-w-[12px] bg-border" />}
              </React.Fragment>
            ))}
          </div>

          {blockedMessage && (
            <div className="mb-4 px-4 py-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">{blockedMessage}</div>
          )}

          <div className="flex flex-col gap-6">
            {step === 0 && (
              <Card className="p-6 flex flex-col gap-4">
                <h3 className="font-semibold text-[15px] text-foreground flex items-center gap-2">
                  <FaGlobe size={13} className="text-subtle" /> Pick a world
                </h3>
                <p className="text-xs text-subtle -mt-2">Where this adventure is set. Optional - skip it for a freeform one-off story.</p>
                <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                  <button
                    type="button"
                    onClick={() => setWorldId(undefined)}
                    className={cn(
                      "text-left p-4 rounded-lg border-2 transition-colors",
                      worldId === undefined ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                    )}
                  >
                    <div className="font-semibold text-sm text-foreground">No world</div>
                    <div className="text-xs text-muted-foreground mt-1">Freeform - the premise you write next is all the setting there is.</div>
                  </button>
                  {worlds.map((world) => (
                    <button
                      key={world.id}
                      type="button"
                      onClick={() => setWorldId(world.id)}
                      className={cn(
                        "text-left p-4 rounded-lg border-2 transition-colors",
                        worldId === world.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                      )}
                    >
                      <div className="font-semibold text-sm text-foreground truncate">{world.name}</div>
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{world.premise}</div>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setWorldModalOpen(true)}
                    className="text-left p-4 rounded-lg border-2 border-dashed border-border hover:border-primary text-subtle hover:text-primary transition-colors flex items-center gap-2"
                  >
                    <FaPlus size={13} /> <span className="font-semibold text-sm">New world</span>
                  </button>
                </div>
              </Card>
            )}

            {step === 1 && (
              <Card className="p-6 flex flex-col gap-4">
                <h3 className="font-semibold text-[15px] text-foreground flex items-center gap-2">
                  <FaUserFriends size={13} className="text-subtle" /> Cast
                </h3>
                <p className="text-xs text-subtle -mt-2">
                  Pull in existing characters as NPCs - one narrator voices all of them, so there's no back-and-forth speaker turn to manage.
                </p>
                {characters.length === 0 ? (
                  <p className="text-xs text-subtle italic">No characters yet - create one below to get started.</p>
                ) : (
                  <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto">
                    {characters.map((char: Character) => {
                      const isSelected = characterIds.includes(char.id);
                      return (
                        <Button
                          key={char.id}
                          type="button"
                          onClick={() => toggleCharacter(char.id)}
                          variant="ghost"
                          className={cn("w-full h-auto justify-start gap-3 p-3 rounded-lg text-left font-normal", isSelected && "bg-primary/10")}
                        >
                          <span className={cn("flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition", isSelected ? "bg-primary border-primary" : "border-border")}>
                            {isSelected && <FaCheck size={10} className="text-primary-foreground" />}
                          </span>
                          <CharacterAvatar name={char.name} accent={char.accent} imageSrc={char.appearanceImages?.[0]} size={40} />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-[14px] text-foreground truncate">{char.name}</h4>
                            {char.description && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{char.description}</p>}
                          </div>
                        </Button>
                      );
                    })}
                  </div>
                )}
                <Button type="button" variant="panel" onClick={() => setNpcModalOpen(true)} className="h-auto w-full px-3 py-2 text-xs font-medium border border-dashed border-border hover:border-primary hover:text-primary">
                  <FaPlus size={11} /> Quick-create a character
                </Button>
              </Card>
            )}

            {step === 2 && (
              <Card className="p-6 flex flex-col gap-5">
                <h3 className="font-semibold text-[15px] text-foreground flex items-center gap-2">
                  <FaDiceD20 size={13} className="text-subtle" /> Premise & Player
                </h3>
                <div>
                  <FieldLabel htmlFor="adv-title">Title</FieldLabel>
                  <TextInput id="adv-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. The Silver Court Heist" />
                </div>
                <div>
                  <FieldLabel
                    htmlFor="adv-premise"
                    hint="What situation the player opens in - on top of the world's own premise, if one is set."
                    action={
                      <button type="button" onClick={handleExpandPremise} disabled={expandingPremise} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-50 disabled:no-underline">
                        <FaMagic size={10} /> {expandingPremise ? "Expanding..." : "Expand with AI"}
                      </button>
                    }
                  >
                    Opening premise (optional)
                  </FieldLabel>
                  <TextArea id="adv-premise" value={premise} onChange={(e) => setPremise(e.target.value)} placeholder="You wake up..." className="resize-none min-h-[90px]" />
                  {assistError && <p className="text-xs text-destructive mt-1.5">{assistError}</p>}
                </div>
                <div>
                  <FieldLabel htmlFor="adv-persona" hint="Which of your personas the narrator addresses as you.">Playing as</FieldLabel>
                  {personas.length === 0 ? (
                    <p className="text-xs text-subtle italic">No personas set up yet - set one in Settings to be addressed by name.</p>
                  ) : (
                    <Select id="adv-persona" value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
                      {personas.map((p) => (
                        <option key={p.id} value={p.id}>{p.name || "Unnamed persona"}</option>
                      ))}
                    </Select>
                  )}
                </div>
              </Card>
            )}

            {step === 3 && (
              <Card className="p-6 flex flex-col gap-5">
                <h3 className="font-semibold text-[15px] text-foreground">Tone & rules</h3>
                <div>
                  <FieldLabel hint="How many tappable options the narrator offers after each turn. You can always type your own action instead.">Choices per turn</FieldLabel>
                  <NumberStepper value={choiceCount} min={MIN_ADVENTURE_CHOICES} max={MAX_ADVENTURE_CHOICES} onChange={setChoiceCount} />
                </div>
                <div>
                  <FieldLabel hint="Roughly how long the narrator's replies should be. 0 = no limit.">Reply length limit (characters)</FieldLabel>
                  <TextInput
                    type="number"
                    min={0}
                    value={replyLengthLimit || ""}
                    onChange={(e) => setReplyLengthLimit(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="No limit"
                    className="max-w-[160px]"
                  />
                </div>
              </Card>
            )}

            {step === 4 && (
              <Card className="p-6 flex flex-col gap-4">
                <h3 className="font-semibold text-[15px] text-foreground">Review</h3>
                <div className="flex flex-col gap-3 text-sm">
                  <div><span className="text-subtle">Title: </span><span className="text-foreground font-medium">{title || "(untitled)"}</span></div>
                  <div><span className="text-subtle">World: </span><span className="text-foreground font-medium">{selectedWorld ? selectedWorld.name : "None (freeform)"}</span></div>
                  <div className="flex items-start gap-2">
                    <span className="text-subtle flex-shrink-0">Cast: </span>
                    {cast.length === 0 ? (
                      <span className="text-foreground font-medium">No NPCs - just you and the narrator</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {cast.map((c) => <Badge key={c.id} variant="secondary" className="text-[11px]">{c.name}</Badge>)}
                      </div>
                    )}
                  </div>
                  {premise.trim() && <div><span className="text-subtle">Premise: </span><span className="text-foreground">{premise}</span></div>}
                  <div><span className="text-subtle">Choices per turn: </span><span className="text-foreground font-medium">{choiceCount}</span></div>
                </div>
              </Card>
            )}

            <div className="sticky bottom-0 pt-6 pb-1 bg-gradient-to-t from-background via-background to-transparent flex gap-3 justify-end">
              {step === 0 ? (
                <Button onClick={() => navigate("/adventures")} variant="panel" className="h-auto px-4 py-2.5 border border-border hover:border-primary font-medium">
                  Cancel
                </Button>
              ) : (
                <Button onClick={() => setStep((s) => Math.max(s - 1, 0))} variant="panel" className="h-auto px-4 py-2.5 border border-border hover:border-primary font-medium">
                  <FaArrowLeft size={12} /> Back
                </Button>
              )}
              {step < STEPS.length - 1 ? (
                <Button onClick={goNext} variant="default" className="h-auto px-5 py-2.5 font-semibold">
                  Next <FaArrowRight size={12} />
                </Button>
              ) : (
                <Button onClick={handleStart} variant="default" className="h-auto px-5 py-2.5 font-semibold" disabled={creating}>
                  {creating ? "Starting..." : <><FaDiceD20 size={13} /> Start Adventure</>}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal isOpen={worldModalOpen} onClose={() => setWorldModalOpen(false)} title="Quick-create a world" subtitle="Just enough to get playing - add more detail later from Worlds.">
        <div className="flex flex-col gap-4 p-1">
          <div>
            <FieldLabel htmlFor="qc-world-name">Name</FieldLabel>
            <TextInput id="qc-world-name" value={newWorldName} onChange={(e) => setNewWorldName(e.target.value)} placeholder="e.g. The Silver Court" />
          </div>
          <div>
            <FieldLabel htmlFor="qc-world-premise">Premise</FieldLabel>
            <TextArea id="qc-world-premise" value={newWorldPremise} onChange={(e) => setNewWorldPremise(e.target.value)} placeholder="A one-paragraph pitch for this world." className="resize-none min-h-[80px]" />
          </div>
          {worldModalError && <p className="text-xs text-destructive">{worldModalError}</p>}
          <Button onClick={handleQuickCreateWorld} variant="default" disabled={creatingWorld} className="h-auto px-4 py-2.5 font-semibold self-end">
            {creatingWorld ? "Creating..." : "Create & select"}
          </Button>
        </div>
      </Modal>

      <Modal isOpen={npcModalOpen} onClose={() => setNpcModalOpen(false)} title="Quick-create a character" subtitle="A minimal cast member - build a full character with a portrait later from Characters.">
        <div className="flex flex-col gap-4 p-1">
          <div>
            <FieldLabel htmlFor="qc-npc-name">Name</FieldLabel>
            <TextInput id="qc-npc-name" value={newNpcName} onChange={(e) => setNewNpcName(e.target.value)} placeholder="e.g. Captain Vale" />
          </div>
          <div>
            <FieldLabel htmlFor="qc-npc-prompt">Personality / instructions</FieldLabel>
            <TextArea id="qc-npc-prompt" value={newNpcPrompt} onChange={(e) => setNewNpcPrompt(e.target.value)} placeholder="Who they are, how they act and speak." className="resize-none min-h-[80px]" />
          </div>
          {npcModalError && <p className="text-xs text-destructive">{npcModalError}</p>}
          <Button onClick={handleQuickCreateNpc} variant="default" disabled={creatingNpc} className="h-auto px-4 py-2.5 font-semibold self-end">
            {creatingNpc ? "Creating..." : "Create & add to cast"}
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default AdventureWizardPage;
