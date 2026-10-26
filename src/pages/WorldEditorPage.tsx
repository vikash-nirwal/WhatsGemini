import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FaMagic, FaCheck, FaPlus, FaGlobe, FaMap } from "react-icons/fa";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { addWorld, patchWorld } from "../features/worldSlice";
import { Select } from "src/components/molecules/form-controls/FormSelect";
import SuggestField from "src/components/molecules/SuggestField";
import { WorldCastCard } from "src/components/organisms/WorldCastCard";
import { useWorldAssist } from "../hooks/useWorldAssist";
import { addPersona } from "../features/settingsSlice";
import { StoryTimeEditor } from "src/components/organisms/StoryTimeEditor";
import { generateAssistText, generateWorldMapImage } from "../features/aiSlice";
import { LoreEntry, StoryTime, WorldMap } from "../types";
import { WorldMapView } from "src/components/molecules/WorldMapView";
import { readPhoto } from "../features/chat/photoAttachments";
import { dataUrlToBlob, savePortraitBlob } from "../features/ai/utils/portraitUtils";
import { useColorTheme } from "../hooks/useColorTheme";
import { Button } from "src/components/atoms/button";
import { Card } from "src/components/atoms/card";
import Header from "src/components/organisms/Header";
import { TextInput, ChipSelectField } from "src/components/molecules/form-controls";
import LorebookStep from "./CharacterEditorPage/steps/LorebookStep";
import { TAG_PRESETS, WORLD_ERA_PRESETS, WORLD_TONE_PRESETS } from "../utils/constants";

const makeLoreEntryId = () => `lore_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

const NEW_PERSONA = "__new_persona";

const WorldEditorPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { worldId } = useParams();
  const { is } = useColorTheme();
  const neumorphic = is("neumorphic");
  const worlds = useAppSelector((state) => state.world.worlds);
  const loading = useAppSelector((state) => state.world.loading);

  const editWorld = worldId ? worlds.find((w) => w.id === Number(worldId)) || null : null;

  const [name, setName] = useState("");
  const [premise, setPremise] = useState("");
  const [settingDetails, setSettingDetails] = useState("");
  const [tone, setTone] = useState("");
  const [era, setEra] = useState(""); // era or technology (#144)
  const [tags, setTags] = useState<string[]>([]);
  const [loreEntries, setLoreEntries] = useState<LoreEntry[]>([]);
  const [map, setMap] = useState<WorldMap | undefined>(undefined);
  const [personaId, setPersonaId] = useState(""); // who you are here (#143); "" = your active persona
  const [storyTime, setStoryTime] = useState<StoryTime | undefined>(undefined);
  const personas = useAppSelector((state) => state.settings.personas);

  useEffect(() => {
    if (editWorld) {
      setName(editWorld.name);
      setPremise(editWorld.premise);
      setSettingDetails(editWorld.settingDetails || "");
      setTone(editWorld.tone || "");
      setEra(editWorld.era || "");
      setTags(editWorld.tags || []);
      setLoreEntries(editWorld.loreEntries || []);
      setMap(editWorld.map);
      setPersonaId(editWorld.personaId || "");
      setStoryTime(editWorld.storyTime);
    } else {
      setName("");
      setPremise("");
      setSettingDetails("");
      setTone("");
      setEra("");
      setTags([]);
      setLoreEntries([]);
      setMap(undefined);
      setPersonaId("");
      setStoryTime(undefined);
    }
  }, [editWorld]);

  // World map (#66): generated from the premise and the lorebook's place
  // names, or uploaded.
  const mapInputRef = useRef<HTMLInputElement>(null);
  const [mapBusy, setMapBusy] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const handleGenerateMap = async () => {
    if (!name.trim() || !premise.trim()) {
      setMapError("Give the world a name and premise first.");
      return;
    }
    setMapError(null);
    setMapBusy(true);
    try {
      const places = [...new Set([...(map?.pins || []).map((p) => p.name), ...loreEntries.flatMap((e) => e.keywords.slice(0, 1))])].filter(Boolean);
      const image = await dispatch(generateWorldMapImage({ world: { name: name.trim(), premise: premise.trim(), tone: tone.trim() || undefined }, places })).unwrap();
      const saved = await savePortraitBlob(await dataUrlToBlob(image), "world_map").catch(() => image);
      setMap({ image: saved, pins: map?.pins || [] });
    } catch (err: any) {
      setMapError(typeof err === "string" ? err : "Couldn't draw the map. Check your image provider in Settings.");
    } finally {
      setMapBusy(false);
    }
  };

  const [assistError, setAssistError] = useState<string | null>(null);
  // AI help on every field (#144), and filling the rest at once.
  const assist = useWorldAssist();
  const residents = useAppSelector((state) => state.character.characters).filter((c) => editWorld && c.worldId === editWorld.id);
  const draftWorld = { name, premise, tone, era, details: settingDetails };
  const [filling, setFilling] = useState(false);
  const fillRest = async () => {
    setFilling(true);
    setAssistError(null);
    try {
      const f = await assist.fillWorld(draftWorld, residents);
      if (f.name && !name.trim()) setName(f.name);
      if (f.premise && !premise.trim()) setPremise(f.premise);
      if (f.tone && !tone.trim()) setTone(f.tone);
      if (f.era && !era.trim()) setEra(f.era);
      if (f.details && !settingDetails.trim()) setSettingDetails(f.details);
    } catch (err) {
      setAssistError(err instanceof Error ? err.message : "Couldn't fill in the world.");
    } finally {
      setFilling(false);
    }
  };
  const [newPersona, setNewPersona] = useState("");
  const pendingPersona = useRef<string | null>(null);
  useEffect(() => {
    const made = pendingPersona.current && personas.find((p) => p.name === pendingPersona.current);
    if (made) {
      pendingPersona.current = null;
      setPersonaId(made.id);
      setNewPersona("");
    }
  }, [personas]);

  const handleAddLoreEntry = () => setLoreEntries((prev) => [...prev, { id: makeLoreEntryId(), keywords: [], content: "", enabled: true }]);
  const handleUpdateLoreEntry = (id: string, patch: Partial<LoreEntry>) => setLoreEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const handleRemoveLoreEntry = (id: string) => setLoreEntries((prev) => prev.filter((e) => e.id !== id));

  const [expandingLoreId, setExpandingLoreId] = useState<string | null>(null);
  const handleExpandLoreEntry = async (entry: LoreEntry) => {
    if (entry.keywords.length === 0 && !entry.content.trim()) {
      setAssistError("Add a keyword or a short note first, then expand it.");
      return;
    }
    setAssistError(null);
    setExpandingLoreId(entry.id);
    try {
      const instruction = `Write a concise lorebook / world-info entry for the roleplay adventure world "${name || "this world"}", to be injected into the narrator's system prompt only when relevant.${premise.trim() ? ` World premise for tone reference: ${premise.trim()}.` : ""}\nKeywords for this entry: ${entry.keywords.length > 0 ? entry.keywords.join(", ") : "(none yet - infer them from the note below)"}.${entry.content.trim() ? `\nExisting rough note to expand on, keeping its intent: ${entry.content.trim()}` : ""}\n\nWrite 2-4 sentences of clear, concrete factual lore/background (not narration, not instructions - just world info). Output only the lore text, no preamble or headings.`;
      const text = await dispatch(generateAssistText({ instruction })).unwrap();
      if (text) handleUpdateLoreEntry(entry.id, { content: text });
    } catch (err: any) {
      setAssistError(typeof err === "string" ? err : "Failed to expand lore entry. Check your API key in Settings.");
    } finally {
      setExpandingLoreId(null);
    }
  };

  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim() || !premise.trim()) {
      setSaveError("World name and premise are required.");
      return;
    }
    setSaveError(null);
    const payload = { name: name.trim(), premise: premise.trim(), settingDetails: settingDetails.trim() || undefined, tone: tone.trim() || undefined, era: era.trim() || undefined, tags, loreEntries, map, personaId: personaId && personaId !== NEW_PERSONA ? personaId : undefined, storyTime };
    if (editWorld) {
      // Only the editor's fields (#173): events, storylines and the rest
      // written while it was open stay.
      await dispatch(patchWorld(editWorld.id, payload));
    } else {
      await dispatch(addWorld(payload));
    }
    navigate("/worlds");
  };

  return (
    <div className="w-full h-dvh flex flex-col">
      <Header
        title={editWorld ? "Edit world" : "New world"}
        subtitle={editWorld ? "Update this adventure setting" : "Define a setting to run adventures in"}
        onBack={() => navigate("/worlds")}
      />
      <div className="flex-1 overflow-auto p-4 md:p-8">
        <div className="w-full max-w-[860px] mx-auto flex flex-col gap-6">

          {saveError && (
            <div className="px-4 py-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
              {saveError}
            </div>
          )}

          <Card className="p-6 flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-[15px] text-foreground flex items-center gap-2">
                <FaGlobe size={13} className="text-subtle" /> Setting
              </h3>
              <Button type="button" variant="outline" size="sm" onClick={() => void fillRest()} disabled={filling}><FaMagic size={11} /> {filling ? "Filling in..." : "Fill the rest with AI"}</Button>
            </div>
            <SuggestField id="world-name" label="Name" value={name} onChange={setName} placeholder="e.g. The Silver Court" onSuggest={() => assist.suggestField("name", draftWorld, residents)} />
            <SuggestField id="world-premise" label="Premise" multiline value={premise} onChange={setPremise} hint="Always in scope - the short pitch every chat and adventure in this world starts from." placeholder="A one-paragraph pitch for this world - where it is, what's unusual about it, what kind of stories happen here." onSuggest={() => assist.suggestField("premise", draftWorld, residents)} />
            <SuggestField id="world-details" label="Setting details (optional)" multiline value={settingDetails} onChange={setSettingDetails} hint="Longer background - history, factions, rules of the world." placeholder="History, factions, magic/tech rules, geography..." onSuggest={() => assist.suggestField("details", draftWorld, residents)} />
            <SuggestField id="world-tone" label="Tone" value={tone} onChange={setTone} options={WORLD_TONE_PRESETS} placeholder="e.g. Whimsical fairy-tale horror" onSuggest={() => assist.suggestField("tone", draftWorld, residents)} />
            <SuggestField id="world-era" label="Era or technology" value={era} onChange={setEra} options={WORLD_ERA_PRESETS} hint="A medieval world can still 'text': messages stand for letters or messengers." placeholder="e.g. Today, phones and all" onSuggest={() => assist.suggestField("era", draftWorld, residents)} />
            <ChipSelectField label="Tags" value={tags} onChange={setTags} presets={TAG_PRESETS} placeholder="Add a tag..." />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="world-persona" className="text-sm font-medium text-foreground">You in this world</label>
              <Select id="world-persona" aria-label="You in this world" value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
                <option value="">Your active persona</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>{p.name || "Unnamed"}</option>
                ))}
                <option value={NEW_PERSONA}>New persona…</option>
              </Select>
              {personaId === NEW_PERSONA && (
                <div className="flex gap-2">
                  <TextInput aria-label="New persona's name" value={newPersona} onChange={(e) => setNewPersona(e.target.value)} placeholder="Who you are here" className="flex-1" />
                  <Button type="button" disabled={!newPersona.trim()} onClick={() => { pendingPersona.current = newPersona.trim(); dispatch(addPersona({ name: newPersona.trim(), bio: "" })); }}>Create</Button>
                </div>
              )}
              <p className="text-xs text-subtle">Characters here know you as this persona.</p>
            </div>
            {assistError && <p className="text-xs text-destructive">{assistError}</p>}
          </Card>

          {editWorld && <WorldCastCard world={{ ...editWorld, name: name || editWorld.name, premise: premise || editWorld.premise, tone, era }} />}

          <StoryTimeEditor value={storyTime} onChange={setStoryTime} />

          <Card className="p-6 flex flex-col gap-4">
            <h3 className="font-semibold text-[15px] text-foreground flex items-center gap-2">
              <FaMap size={13} className="text-subtle" /> Map
            </h3>
            <p className="text-xs text-subtle">A map of the world with its places pinned. In a chat set in this world (with the scene tracked) or an adventure, the place the story is at shows as "you are here".</p>
            {map && <WorldMapView map={map} onChange={setMap} />}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleGenerateMap} disabled={mapBusy}>
                {mapBusy ? "Drawing..." : map ? "Redraw" : "Generate"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => mapInputRef.current?.click()}>Upload</Button>
              {map && <Button type="button" variant="ghost" size="sm" onClick={() => setMap(undefined)}>Remove</Button>}
              <input
                ref={mapInputRef}
                type="file"
                accept="image/*"
                data-testid="world-map-input"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    setMap({ image: await readPhoto(file), pins: map?.pins || [] });
                  } catch (err: any) {
                    setMapError(err?.message || "Couldn't read that image.");
                  }
                }}
              />
            </div>
            {mapError && <p className="text-xs text-destructive">{mapError}</p>}
          </Card>

          <LorebookStep
            loreEntries={loreEntries}
            handleUpdateLoreEntry={handleUpdateLoreEntry}
            handleRemoveLoreEntry={handleRemoveLoreEntry}
            handleExpandLoreEntry={handleExpandLoreEntry}
            expandingLoreId={expandingLoreId}
            handleAddLoreEntry={handleAddLoreEntry}
            assistError={null}
            neumorphic={neumorphic}
          />

          <div className="sticky bottom-0 pt-6 pb-1 bg-gradient-to-t from-background via-background to-transparent flex gap-3 justify-end">
            <Button onClick={() => navigate("/worlds")} variant="panel" className="h-auto px-4 py-2.5 border border-border hover:border-primary font-medium">
              Cancel
            </Button>
            <Button onClick={handleSave} variant="default" className="h-auto px-5 py-2.5 font-semibold" disabled={loading}>
              {editWorld ? <><FaCheck size={13} /> Save Changes</> : <><FaPlus size={13} /> Create World</>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorldEditorPage;
