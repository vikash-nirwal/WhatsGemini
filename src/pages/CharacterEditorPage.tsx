import React, { useState, useEffect, useRef } from "react";
import { addCharacter, updateCharacter } from "../features/characterSlice";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { FaTimes, FaUpload, FaPlay, FaEdit, FaPlus } from "react-icons/fa";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { Character } from "../types";
import { dbService } from "../services/dbService";
import { DisplayImage } from "../components/DisplayImage";
import { TextInput, TextArea, Select, FieldLabel, Slider } from "../components/ui/FormControls";
import { CharacterAvatar } from "../components/ui/CharacterAvatar";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import ToggleSwitch from "../components/ToggleSwitch";
import Header from "../components/Header";
import { CHARACTER_SWATCHES, MEMORY_EXTRACTION_INTERVAL, DEFAULT_AUTO_SELFIE_FREQUENCY } from "../utils/constants";
import { isSpeechSynthesisSupported, getVoices, speak } from "../utils/speech";

const findSwatchIndex = (accent?: [string, string]) => {
  if (!accent) return 0;
  const idx = CHARACTER_SWATCHES.findIndex((s) => s[0] === accent[0] && s[1] === accent[1]);
  return idx === -1 ? 0 : idx;
};

const CharacterEditorPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { characterId } = useParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const characters = useAppSelector((state) => state.character.characters);
  const loading = useAppSelector((state) => state.character.loading);

  const editCharacter = characterId
    ? characters.find((c) => c.id === Number(characterId)) || null
    : null;
  // Seeded once from a "Duplicate" action on the gallery card - a real
  // character to copy fields from, but this is still a create (no id yet).
  const duplicateFrom = (location.state as { duplicateFrom?: Character } | null)?.duplicateFrom;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [scenario, setScenario] = useState("");
  const [firstMes, setFirstMes] = useState("");
  const [mesExample, setMesExample] = useState("");
  const [relationship, setRelationship] = useState("");
  const [appearance, setAppearance] = useState("");
  const [appearanceImages, setAppearanceImages] = useState<string[]>([]);
  const [accentIndex, setAccentIndex] = useState(0);
  const [voiceURI, setVoiceURI] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [autoSelfieEnabled, setAutoSelfieEnabled] = useState(false);
  const [autoSelfieFrequency, setAutoSelfieFrequency] = useState(DEFAULT_AUTO_SELFIE_FREQUENCY);

  useEffect(() => {
    if (!isSpeechSynthesisSupported()) return;
    getVoices().then(setVoices);
  }, []);

  // Seed the form from whichever source applies: editing an existing
  // character, duplicating one, or a blank create.
  useEffect(() => {
    const source = editCharacter || duplicateFrom;
    if (source) {
      setName(editCharacter ? source.name : `${source.name} (Copy)`);
      setDescription(source.description);
      setPrompt(source.prompt);
      setScenario(source.scenario || "");
      setFirstMes(source.first_mes || "");
      setMesExample(source.mes_example || "");
      setRelationship(source.relationship || "");
      setAppearance(source.appearance || "");
      setAppearanceImages(source.appearanceImages || []);
      setAccentIndex(findSwatchIndex(source.accent));
      setVoiceURI(source.voiceURI || "");
      setAutoSelfieEnabled(source.autoSelfie?.enabled || false);
      setAutoSelfieFrequency(source.autoSelfie?.frequency ?? DEFAULT_AUTO_SELFIE_FREQUENCY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId]);

  const handleCreateCharacter = () => {
    if (!name || !prompt) {
      alert("Character name and prompt are required.");
      return;
    }
    dispatch(addCharacter({ name, description, prompt, scenario, first_mes: firstMes, mes_example: mesExample, relationship, appearance, appearanceImages, accent: CHARACTER_SWATCHES[accentIndex], voiceURI: voiceURI || undefined, autoSelfie: { enabled: autoSelfieEnabled, frequency: autoSelfieFrequency } }));
    navigate("/characters");
  };

  const handleSaveEdit = () => {
    if (!name || !prompt || !editCharacter) {
      alert("Character name and prompt are required.");
      return;
    }
    dispatch(updateCharacter({ id: editCharacter.id, name, description, prompt, scenario, first_mes: firstMes, mes_example: mesExample, relationship, appearance, appearanceImages, accent: CHARACTER_SWATCHES[accentIndex], voiceURI: voiceURI || undefined, gallery: editCharacter.gallery, autoSelfie: { enabled: autoSelfieEnabled, frequency: autoSelfieFrequency } }));
    navigate("/characters");
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);

        if (!parsed.name || !parsed.prompt) {
          alert("Invalid character file: Missing name or prompt.");
          return;
        }

        dispatch(
          addCharacter({
            name: parsed.name,
            description: parsed.description || "",
            prompt: parsed.prompt,
            scenario: parsed.scenario || "",
            first_mes: parsed.first_mes || "",
            mes_example: parsed.mes_example || "",
            relationship: parsed.relationship || "",
            appearance: parsed.appearance || "",
            appearanceImages: parsed.appearanceImages || [],
            accent: parsed.accent,
            voiceURI: parsed.voiceURI,
            autoSelfie: parsed.autoSelfie,
          })
        );

        alert("Character imported successfully!");
      } catch (err) {
        console.error("Import error:", err);
        alert("Failed to import character. Invalid JSON file.");
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset input
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    try {
      const dirHandle = await dbService.getSetting("image_save_directory");
      if (!dirHandle) {
         alert("Please select an Image Save Directory in Settings first to use file persistence.");
         return;
      }

      const newImageRefs: string[] = [];

      for (const file of Array.from(files)) {
         const ext = file.name.split('.').pop() || 'png';
         const filename = `char_ref_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${ext}`;

         const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
         const writable = await fileHandle.createWritable();
         await writable.write(file);
         await writable.close();

         newImageRefs.push(`local:${filename}`);
      }

      setAppearanceImages((prev) => [...prev, ...newImageRefs]);
    } catch (err: any) {
      console.error("Error saving image files to directory:", err);
      if (err.name === 'NotAllowedError') {
         alert("Permission to write to directory was denied. Please re-select the directory in Settings.");
      } else {
         alert("Failed to save image files to the local directory.");
      }
    }

    event.target.value = ''; // Reset input
  };

  const removeAppearanceImage = (index: number) => {
    setAppearanceImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleRemoveMemoryFact = (index: number) => {
    if (!editCharacter) return;
    const newMemory = (editCharacter.memory || []).filter((_, i) => i !== index);
    dispatch(updateCharacter({ ...editCharacter, memory: newMemory }));
  };

  const accent = CHARACTER_SWATCHES[accentIndex];

  return (
    <div className="w-full h-screen flex flex-col bg-background">
      <Header
        title={editCharacter ? "Edit character" : "New character"}
        subtitle={editCharacter ? "Update who Gemini becomes" : "Define who Gemini becomes"}
        onBack={() => navigate("/characters")}
      />
      <div className="flex-1 overflow-auto p-4 md:p-8">
      <div className="w-full max-w-[1180px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-6 items-start">

          {/* Persistent left rail: portrait + accent/voice/auto-selfie */}
          <div className="flex flex-col gap-4 lg:sticky lg:top-0">
            <Card className="overflow-hidden">
              <div
                className="relative aspect-[3/4] flex items-center justify-center"
                style={!appearanceImages[0] ? { background: `linear-gradient(135deg, ${accent[0]}26, ${accent[1]}26)` } : undefined}
              >
                {appearanceImages[0] ? (
                  <DisplayImage srcContext={appearanceImages[0]} alt="Portrait" className="w-full h-full object-cover" />
                ) : (
                  <CharacterAvatar name={name || "?"} accent={accent} size={96} />
                )}
              </div>
            </Card>

            <Card className="p-4 flex flex-col gap-4">
              <div>
                <label className="block text-[11.5px] text-muted-foreground mb-1.5">Accent</label>
                <div className="flex gap-[7px]">
                  {CHARACTER_SWATCHES.map((sw, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setAccentIndex(i)}
                      title="Choose accent color"
                      aria-label={`Accent color ${i + 1}`}
                      className="w-[26px] h-[26px] rounded-full flex-shrink-0 transition transform hover:scale-110"
                      style={{
                        background: `linear-gradient(135deg, ${sw[0]}, ${sw[1]})`,
                        boxShadow: accentIndex === i ? `0 0 0 2px rgb(var(--card)), 0 0 0 4px ${sw[0]}` : undefined,
                      }}
                    />
                  ))}
                </div>
              </div>

              {isSpeechSynthesisSupported() && (
                <>
                  <div className="h-px bg-border" />
                  <div>
                    <FieldLabel hint="Used to read this character's replies aloud with the speak button in chat.">Voice (optional)</FieldLabel>
                    <div className="flex gap-2">
                      <Select value={voiceURI} onChange={(e) => setVoiceURI(e.target.value)} className="flex-1">
                        <option value="">Browser default</option>
                        {voices.map((v) => (
                          <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
                        ))}
                      </Select>
                      <Button
                        type="button"
                        variant="panel"
                        onClick={() => speak(`Hi, I'm ${name || "your character"}.`, voiceURI || undefined)}
                        disabled={voices.length === 0}
                        className="w-11 h-11 flex-shrink-0 border border-border hover:border-primary hover:text-primary"
                        title="Preview voice"
                        aria-label="Preview voice"
                      >
                        <FaPlay size={12} />
                      </Button>
                    </div>
                  </div>
                </>
              )}

              <div className="h-px bg-border" />

              <div>
                <ToggleSwitch
                  checked={autoSelfieEnabled}
                  onChange={setAutoSelfieEnabled}
                  label="Sends selfies on their own"
                  title="Let this character spontaneously attach a selfie-style picture to their replies, without you asking for one."
                />
                {autoSelfieEnabled && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-muted-foreground mb-2">
                      <span>Frequency</span>
                      <span className="font-mono">{autoSelfieFrequency}%</span>
                    </div>
                    <Slider value={autoSelfieFrequency} min={5} max={100} step={5} onChange={setAutoSelfieFrequency} />
                    <p className="text-xs text-subtle mt-1.5">Chance each of their replies includes a spontaneous selfie - lower saves AI credits.</p>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Grouped field cards */}
          <div className="flex flex-col gap-4">
            <Card className="p-5 flex flex-col gap-3">
              <h3 className="font-semibold text-[15px] text-foreground">Identity</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextInput
                  type="text"
                  placeholder="Character Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <TextInput
                  type="text"
                  placeholder="Tagline / Relationship with User (e.g. Best Friend, Enemy)"
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                />
              </div>
              <TextArea
                placeholder="Description (Optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="resize-none"
              />
            </Card>

            <Card className="p-5 flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="font-semibold text-[15px] text-foreground">Appearance</h3>
                <span className="text-xs text-subtle">Given to image-capable models to keep generated looks consistent</span>
              </div>
              <TextArea
                placeholder="Character Appearance/Looks (e.g. Blonde hair, wears a red jacket) (Optional)"
                value={appearance}
                onChange={(e) => setAppearance(e.target.value)}
                className="resize-none"
              />
              <div>
                <label className="block text-sm text-foreground font-medium mb-2">Reference Images</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {appearanceImages.map((src, idx) => (
                    <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border bg-muted">
                      <DisplayImage srcContext={src} alt="Appearance Reference" className="w-full h-full object-cover" />
                      <Button
                        onClick={() => removeAppearanceImage(idx)}
                        variant="destructive"
                        className="absolute top-1 right-1 h-auto w-auto rounded-full p-1"
                      >
                        <FaTimes size={10} />
                      </Button>
                    </div>
                  ))}
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    className="w-20 h-20 flex flex-col justify-center items-center rounded-lg border-2 border-dashed border-border text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                  >
                    <FaUpload size={16} />
                    <span className="text-[10px] mt-1 text-center font-medium">Add Image</span>
                  </button>
                </div>
                <p className="text-xs text-subtle">Provided to image-capable models to keep generated appearance consistent.</p>
                <input
                  type="file"
                  ref={imageInputRef}
                  onChange={handleImageUpload}
                  accept="image/*"
                  multiple
                  style={{ display: "none" }}
                />
              </div>
            </Card>

            <Card className="p-5 flex flex-col gap-3">
              <h3 className="font-semibold text-[15px] text-foreground">Personality</h3>
              <TextArea
                placeholder="Character Prompt (Personality, Style, etc.)"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="resize-none min-h-[120px]"
              />
            </Card>

            <Card className="p-5 flex flex-col gap-3">
              <FieldLabel hint="The current setting or plot context, given to the AI alongside the personality above.">Scenario</FieldLabel>
              <TextArea
                placeholder="Scenario (e.g. You run into each other at a rainy bus stop after years apart) (Optional)"
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                className="resize-none"
              />
            </Card>

            <Card className="p-5 flex flex-col gap-3">
              <FieldLabel hint="Sent as this character's opening message when a brand-new chat is started. Leave blank to use the app's default greeting instead.">First Message</FieldLabel>
              <TextArea
                placeholder="First Message / Greeting (Optional)"
                value={firstMes}
                onChange={(e) => setFirstMes(e.target.value)}
                className="resize-none"
              />
            </Card>

            <Card className="p-5 flex flex-col gap-3">
              <FieldLabel hint="Sample exchanges given to the AI purely as a style/format reference (e.g. use asterisks for actions) - never repeated verbatim in the chat.">Example Dialogues</FieldLabel>
              <TextArea
                placeholder={`Example Dialogues (Optional)\nUser: Hey, how was your day?\n${name || "Character"}: *stretches* Long. Yours?`}
                value={mesExample}
                onChange={(e) => setMesExample(e.target.value)}
                className="resize-none min-h-[100px]"
              />
            </Card>

            {editCharacter && (
              <Card className="p-5 flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="font-semibold text-[15px] text-foreground">
                    Memory {editCharacter.memory && editCharacter.memory.length > 0 && (
                      <span className="text-subtle font-normal text-xs">({editCharacter.memory.length} facts remembered)</span>
                    )}
                  </h3>
                </div>
                {editCharacter.memory && editCharacter.memory.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {editCharacter.memory.map((fact, idx) => (
                      <span key={idx} className="inline-flex items-center gap-2 pl-3 pr-1 py-1 rounded-full bg-background border border-input text-xs">
                        {fact}
                        <Button
                          onClick={() => handleRemoveMemoryFact(idx)}
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 rounded-full text-subtle hover:bg-destructive/10 hover:text-destructive flex-shrink-0"
                          title="Forget this fact"
                          aria-label="Forget this fact"
                        >
                          <FaTimes size={10} />
                        </Button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-subtle">No facts remembered yet.</p>
                )}
                <p className="text-xs text-subtle">Automatically learned from your conversations, every {MEMORY_EXTRACTION_INTERVAL} messages or so.</p>
              </Card>
            )}

            <div className="sticky bottom-0 pt-6 pb-1 bg-gradient-to-t from-background via-background to-transparent flex gap-3 justify-end">
              {!editCharacter && (
                <Button
                  onClick={handleImportClick}
                  variant="panel"
                  className="h-auto px-4 py-2.5 border border-border hover:border-primary font-medium"
                  title="Import Character from JSON"
                >
                  <FaUpload size={14} />
                  <span className="hidden sm:inline">Import</span>
                </Button>
              )}
              <Button
                onClick={() => navigate("/characters")}
                variant="panel"
                className="h-auto px-4 py-2.5 border border-border hover:border-primary font-medium"
              >
                Cancel
              </Button>
              <Button
                onClick={editCharacter ? handleSaveEdit : handleCreateCharacter}
                variant="default"
                className="h-auto px-5 py-2.5 font-semibold"
                disabled={loading}
              >
                {loading ? "Saving..." : editCharacter ? (
                  <><FaEdit size={13} /> Save Changes</>
                ) : (
                  <><FaPlus size={13} /> Create Character</>
                )}
              </Button>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json"
              style={{ display: "none" }}
            />
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default CharacterEditorPage;
