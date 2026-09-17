import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FaMagic, FaCheck, FaPlus, FaGlobe } from "react-icons/fa";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { addWorld, updateWorld } from "../features/worldSlice";
import { generateAssistText } from "../features/aiSlice";
import { LoreEntry } from "../types";
import { useColorTheme } from "../hooks/useColorTheme";
import { Button } from "src/components/atoms/button";
import { Card } from "src/components/atoms/card";
import Header from "src/components/organisms/Header";
import { TextInput, TextArea, FieldLabel, ChipSelectField, PresetSelectField } from "src/components/molecules/form-controls";
import LorebookStep from "./CharacterEditorPage/steps/LorebookStep";
import { TAG_PRESETS, WORLD_TONE_PRESETS } from "../utils/constants";

const makeLoreEntryId = () => `lore_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

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
  const [tags, setTags] = useState<string[]>([]);
  const [loreEntries, setLoreEntries] = useState<LoreEntry[]>([]);

  useEffect(() => {
    if (editWorld) {
      setName(editWorld.name);
      setPremise(editWorld.premise);
      setSettingDetails(editWorld.settingDetails || "");
      setTone(editWorld.tone || "");
      setTags(editWorld.tags || []);
      setLoreEntries(editWorld.loreEntries || []);
    } else {
      setName("");
      setPremise("");
      setSettingDetails("");
      setTone("");
      setTags([]);
      setLoreEntries([]);
    }
  }, [editWorld]);

  const [expanding, setExpanding] = useState(false);
  const [assistError, setAssistError] = useState<string | null>(null);

  const handleExpandPremise = async () => {
    if (!premise.trim()) {
      setAssistError("Write a short idea first, then expand it.");
      return;
    }
    setAssistError(null);
    setExpanding(true);
    try {
      const instruction = `Expand this short setting idea into a vivid 3-5 sentence premise for a roleplay adventure world, written for a narrator/game-master to draw on. Stay grounded in the original idea. Output only the expanded premise, no preamble.\n\nIdea: ${premise}`;
      const text = await dispatch(generateAssistText({ instruction })).unwrap();
      if (text) setPremise(text);
    } catch (err: any) {
      setAssistError(typeof err === "string" ? err : "Failed to expand premise. Check your API key in Settings.");
    } finally {
      setExpanding(false);
    }
  };

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
    const payload = { name: name.trim(), premise: premise.trim(), settingDetails: settingDetails.trim() || undefined, tone: tone.trim() || undefined, tags, loreEntries };
    if (editWorld) {
      await dispatch(updateWorld({ ...editWorld, ...payload }));
    } else {
      await dispatch(addWorld(payload));
    }
    navigate("/worlds");
  };

  return (
    <div className="w-full h-screen flex flex-col">
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
            <h3 className="font-semibold text-[15px] text-foreground flex items-center gap-2">
              <FaGlobe size={13} className="text-subtle" /> Setting
            </h3>
            <div>
              <FieldLabel htmlFor="world-name">Name</FieldLabel>
              <TextInput id="world-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Silver Court" />
            </div>
            <div>
              <FieldLabel
                htmlFor="world-premise"
                hint="Always in scope - the short pitch every adventure in this world starts from."
                action={
                  <button
                    type="button"
                    onClick={handleExpandPremise}
                    disabled={expanding}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                  >
                    <FaMagic size={10} /> {expanding ? "Expanding..." : "Expand with AI"}
                  </button>
                }
              >
                Premise
              </FieldLabel>
              <TextArea
                id="world-premise"
                value={premise}
                onChange={(e) => setPremise(e.target.value)}
                placeholder="A one-paragraph pitch for this world - where it is, what's unusual about it, what kind of stories happen here."
                className="resize-none min-h-[90px]"
              />
            </div>
            <div>
              <FieldLabel htmlFor="world-details" hint="Longer background - history, factions, rules of the world. Not always in scope; for your own reference and future lore.">
                Setting details (optional)
              </FieldLabel>
              <TextArea
                id="world-details"
                value={settingDetails}
                onChange={(e) => setSettingDetails(e.target.value)}
                placeholder="History, factions, magic/tech rules, geography..."
                className="resize-none min-h-[100px]"
              />
            </div>
            <PresetSelectField label="Tone" value={tone} onChange={setTone} presets={WORLD_TONE_PRESETS} customPlaceholder="e.g. Whimsical fairy-tale horror" />
            <ChipSelectField label="Tags" value={tags} onChange={setTags} presets={TAG_PRESETS} placeholder="Add a tag..." />
            {assistError && <p className="text-xs text-destructive">{assistError}</p>}
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
