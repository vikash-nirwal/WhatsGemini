import React, { useState, useEffect, useRef, useMemo } from "react";
import { useColorTheme } from "../hooks/useColorTheme";
import { addCharacter, updateCharacter } from "../features/characterSlice";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { FaTimes, FaUpload, FaEdit, FaPlus, FaArrowLeft, FaArrowRight, FaCheck, FaMagic, FaCrop, FaTrash, FaBook, FaDice } from "react-icons/fa";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { Character, LoreEntry, ArtStyle } from "../types";
import { dbService } from "../services/dbService";
import { generateAssistText, generateAvatarImage } from "../features/aiSlice";
import { DisplayImage } from "src/components/molecules/DisplayImage";
import { TextInput, TextArea, FieldLabel, InfoTooltip, Slider, TagInput, PresetSelectField, ChipSelectField } from "src/components/molecules/form-controls";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { Button } from "src/components/atoms/button";
import { Input } from "src/components/atoms/input";
import { Card } from "src/components/atoms/card";
import { cn } from "../utils/cn";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import Header from "src/components/organisms/Header";
import { CHARACTER_SWATCHES, MEMORY_EXTRACTION_INTERVAL, MAX_MEMORY_ENTRIES, DEFAULT_AUTO_SELFIE_FREQUENCY, EMOTIONS, ART_STYLES, DEFAULT_ART_STYLE, LORE_SCAN_MESSAGE_COUNT, RELATIONSHIP_PRESETS, TAG_PRESETS, PERSONALITY_TRAIT_PRESETS } from "../utils/constants";
import { SegmentedControl } from "src/components/molecules/SegmentedControl";
import { estimateTokens } from "../features/ai/utils/tokenEstimator";
import TestChatPane from "src/components/organisms/TestChatPane";
import AvatarCropDialog from "src/components/organisms/AvatarCropDialog";
import AvatarGenerateButton from "src/components/molecules/AvatarGenerateButton";
import { parseSize, autoCoverCropToBlob, savePortraitBlob, removeChromaKeyBackground, blobToDataUrl } from "../features/ai/utils/portraitUtils";
import { parseCharacterCardJson } from "../features/character/characterCard";
import { useModal } from "../contexts/ModalContext";
import { toast } from "sonner";

const findSwatchIndex = (accent?: [string, string]) => {
  if (!accent) return 0;
  const idx = CHARACTER_SWATCHES.findIndex((s) => s[0] === accent[0] && s[1] === accent[1]);
  return idx === -1 ? 0 : idx;
};

const STEPS = ["Identity", "Personality", "Scenario & Greeting", "Example Dialogues", "Lorebook", "Test & Finalize"];

const makeLoreEntryId = () => `lore_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

// Fisher-Yates shuffle, sliced to n - used to pick a random preset combo for
// "Surprise Me" without ever repeating a preset within one roll.
const pickRandomN = <T,>(arr: T[], n: number): T[] => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
};

// Pulls one labeled section out of the AI's "Surprise Me" response (see
// SURPRISE_ME_FORMAT below) - stops at the next ALL-CAPS label or end of text,
// so it tolerates the model wrapping a section across multiple lines.
const extractSurpriseSection = (text: string, label: string): string => {
  const match = text.match(new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n[A-Z][A-Z ]*:|$)`, "i"));
  return match ? match[1].trim() : "";
};

const CharacterEditorPage = () => {
  const dispatch = useAppDispatch();
  const { is } = useColorTheme();
  const neumorphic = is("neumorphic");
  const { showAlert } = useModal();
  const navigate = useNavigate();
  const location = useLocation();
  const { characterId } = useParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const characters = useAppSelector((state) => state.character.characters);
  const loading = useAppSelector((state) => state.character.loading);
  const portraitSaveSize = useAppSelector((state) => parseSize(state.settings.portraitSaveSize));

  const editCharacter = characterId
    ? characters.find((c) => c.id === Number(characterId)) || null
    : null;
  // Seeded once from a "Duplicate" action on the gallery card - a real
  // character to copy fields from, but this is still a create (no id yet).
  const duplicateFrom = (location.state as { duplicateFrom?: Character } | null)?.duplicateFrom;

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [scenario, setScenario] = useState("");
  const [firstMes, setFirstMes] = useState("");
  const [mesExample, setMesExample] = useState("");
  const [relationship, setRelationship] = useState("");
  const [appearance, setAppearance] = useState("");
  const [appearanceImages, setAppearanceImages] = useState<string[]>([]);
  const [artStyle, setArtStyle] = useState<ArtStyle>(DEFAULT_ART_STYLE);
  const [accentIndex, setAccentIndex] = useState(0);
  const [autoSelfieEnabled, setAutoSelfieEnabled] = useState(false);
  const [autoSelfieFrequency, setAutoSelfieFrequency] = useState(DEFAULT_AUTO_SELFIE_FREQUENCY);
  const [emotionPortraitsEnabled, setEmotionPortraitsEnabled] = useState(false);
  const [emotionPortraitImages, setEmotionPortraitImages] = useState<Record<string, string>>({});
  const [customEmotions, setCustomEmotions] = useState<string[]>([]);
  const [loreEntries, setLoreEntries] = useState<LoreEntry[]>([]);
  const [personalityTraits, setPersonalityTraits] = useState<string[]>([]);

  // Seed the form from whichever source applies: editing an existing
  // character, duplicating one, or a blank create. Always runs on
  // characterId change (not just when there's a source to seed from) - the
  // sidebar's "New Character" action is reachable from inside the editor
  // itself, navigating straight from editing one character to
  // /characters/new without a page reload, so a missing else branch here
  // used to leave the previous character's data (and wizard step) sitting
  // in the "new" form instead of a blank one.
  useEffect(() => {
    const source = editCharacter || duplicateFrom;
    setStep(0);
    if (source) {
      setName(editCharacter ? source.name : `${source.name} (Copy)`);
      setDescription(source.description);
      setTags(source.tags || []);
      setPrompt(source.prompt);
      setScenario(source.scenario || "");
      setFirstMes(source.first_mes || "");
      setMesExample(source.mes_example || "");
      setRelationship(source.relationship || "");
      setAppearance(source.appearance || "");
      setAppearanceImages(source.appearanceImages || []);
      setArtStyle(source.artStyle || DEFAULT_ART_STYLE);
      setAccentIndex(findSwatchIndex(source.accent));
      setAutoSelfieEnabled(source.autoSelfie?.enabled || false);
      setAutoSelfieFrequency(source.autoSelfie?.frequency ?? DEFAULT_AUTO_SELFIE_FREQUENCY);
      setEmotionPortraitsEnabled(source.emotionPortraits?.enabled || false);
      setEmotionPortraitImages(source.emotionPortraits?.images || {});
      setCustomEmotions(source.emotionPortraits?.customEmotions || []);
      setLoreEntries(source.loreEntries || []);
      setPersonalityTraits(source.personalityTraits || []);
    } else {
      setName("");
      setDescription("");
      setTags([]);
      setPrompt("");
      setScenario("");
      setFirstMes("");
      setMesExample("");
      setRelationship("");
      setAppearance("");
      setAppearanceImages([]);
      setArtStyle(DEFAULT_ART_STYLE);
      setAccentIndex(0);
      setAutoSelfieEnabled(false);
      setAutoSelfieFrequency(DEFAULT_AUTO_SELFIE_FREQUENCY);
      setEmotionPortraitsEnabled(false);
      setEmotionPortraitImages({});
      setCustomEmotions([]);
      setLoreEntries([]);
      setPersonalityTraits([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId]);

  const promptTokens = useMemo(() => estimateTokens(prompt), [prompt]);

  const [expanding, setExpanding] = useState(false);
  const [generatingGreeting, setGeneratingGreeting] = useState(false);
  const [assistError, setAssistError] = useState<string | null>(null);

  // Avatar crop dialog state - shared by the main portrait and every emotion
  // slot below. `cropTargetEmotion` is null for the main portrait, or the
  // emotion key the crop result should be saved under.
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState("");
  const [cropTargetEmotion, setCropTargetEmotion] = useState<string | null>(null);

  const handleExpandIdea = async () => {
    if (!prompt.trim()) {
      setAssistError("Write a short idea first, then expand it.");
      return;
    }
    setAssistError(null);
    setExpanding(true);
    try {
      const instruction = `Expand this short character idea into a detailed, vivid personality and behavior description for a roleplay AI character, written as direct instructions to the character (second person, "You are..."). Stay grounded in the original idea; 3-5 sentences. Output only the expanded description, no preamble.\n\nIdea: ${prompt}`;
      const text = await dispatch(generateAssistText({ instruction })).unwrap();
      if (text) setPrompt(text);
    } catch (err: any) {
      setAssistError(typeof err === "string" ? err : "Failed to expand idea. Check your API key in Settings.");
    } finally {
      setExpanding(false);
    }
  };

  const handleGenerateGreeting = async () => {
    if (!prompt.trim()) {
      setAssistError("Add a personality first so the greeting matches their voice.");
      return;
    }
    setAssistError(null);
    setGeneratingGreeting(true);
    try {
      const who = name || "the character";
      const instruction = `You are ${who}. Personality: ${prompt}.${scenario ? ` Scenario: ${scenario}.` : ""}\n\nWrite a short, natural opening greeting (1-3 sentences) that ${who} would say to open this roleplay scene, fully in character. Use *asterisks* for physical actions where natural. Output only the greeting line, nothing else.`;
      const text = await dispatch(generateAssistText({ instruction })).unwrap();
      if (text) setFirstMes(text);
    } catch (err: any) {
      setAssistError(typeof err === "string" ? err : "Failed to generate greeting. Check your API key in Settings.");
    } finally {
      setGeneratingGreeting(false);
    }
  };

  // Drafts a couple of sample exchanges in the character's voice, from the
  // personality/scenario already filled in - appended after whatever's
  // already there (rather than replacing it) so this can be used more than
  // once to build up a longer style reference instead of overwriting it.
  const [generatingExample, setGeneratingExample] = useState(false);
  const handleGenerateExampleDialogue = async () => {
    if (!prompt.trim()) {
      setAssistError("Add a personality first so the examples match their voice.");
      return;
    }
    setAssistError(null);
    setGeneratingExample(true);
    try {
      const who = name || "the character";
      const instruction = `You are drafting SAMPLE dialogue exchanges for a roleplay AI character named ${who}, purely as a style/format reference (never shown to the user, never repeated verbatim in the actual chat). Personality: ${prompt}.${scenario ? ` Scenario: ${scenario}.` : ""}${mesExample.trim() ? `\n\nExisting examples already written (write NEW, different exchanges - do not repeat these):\n${mesExample.trim()}` : ""}\n\nWrite 2 short example exchanges that show off ${who}'s distinctive speech style, tone, and formatting (e.g. use of *asterisks* for physical actions). Each exchange formatted exactly as:\nUser: <line>\n${who}: <in-character reply>\n\nSeparate the two exchanges with a blank line. Output only the exchanges, no preamble or explanation.`;
      const text = await dispatch(generateAssistText({ instruction })).unwrap();
      if (text) setMesExample((prev) => (prev.trim() ? `${prev.trim()}\n\n${text.trim()}` : text.trim()));
    } catch (err: any) {
      setAssistError(typeof err === "string" ? err : "Failed to generate example dialogue. Check your API key in Settings.");
    } finally {
      setGeneratingExample(false);
    }
  };

  const [surprising, setSurprising] = useState(false);
  const [surpriseHint, setSurpriseHint] = useState("");
  // Rolls a random Relationship/Tags/Personality Traits combo from the same
  // presets the fields themselves offer, then has the AI invent a whole
  // character around that combo in one call - a fast on-ramp for "I don't
  // know what I want, just give me something" instead of filling six fields
  // by hand. Only offered for a brand-new character (see the render below) -
  // rerolling an existing one's fields wholesale isn't what an edit is for.
  const handleSurpriseMe = async () => {
    setAssistError(null);
    setSurprising(true);
    try {
      const randomRelationship = RELATIONSHIP_PRESETS[Math.floor(Math.random() * RELATIONSHIP_PRESETS.length)];
      const randomTags = pickRandomN(TAG_PRESETS, 2 + Math.floor(Math.random() * 2));
      const randomTraits = pickRandomN(PERSONALITY_TRAIT_PRESETS, 3 + Math.floor(Math.random() * 2));

      const trimmedHint = surpriseHint.trim();
      const instruction = `Invent a complete, original roleplay AI character. The user has a "${randomRelationship}" relationship with them. They fit these genre/vibe tags: ${randomTags.join(", ")}. Their personality traits are: ${randomTraits.join(", ")}.
${trimmedHint ? `\nIf a direction is provided, lean into it: ${trimmedHint}\n` : ""}
Output in exactly this format and nothing else - no markdown, no preamble, no extra commentary:
NAME: <a first name, or first and last name>
DESCRIPTION: <one sentence describing them>
PERSONALITY: <3-5 sentences of personality/instructions written as direct second-person instructions to the character, e.g. "You are...">
SCENARIO: <1-2 sentences setting the current scene/context the roleplay opens in>
GREETING: <a short, in-character opening line they'd say to the user, 1-3 sentences, using *asterisks* for physical actions where natural>`;

      const text = await dispatch(generateAssistText({ instruction })).unwrap();
      const generatedPersonality = extractSurpriseSection(text, "PERSONALITY");
      if (!generatedPersonality) {
        throw new Error("Couldn't parse a character from the AI's response - try again.");
      }

      setName(extractSurpriseSection(text, "NAME") || name);
      setDescription(extractSurpriseSection(text, "DESCRIPTION") || description);
      setPrompt(generatedPersonality);
      setScenario(extractSurpriseSection(text, "SCENARIO") || scenario);
      setFirstMes(extractSurpriseSection(text, "GREETING") || firstMes);
      setRelationship(randomRelationship);
      setTags(randomTags);
      setPersonalityTraits(randomTraits);
    } catch (err: any) {
      setAssistError(typeof err === "string" ? err : err?.message || "Failed to generate a surprise character. Check your API key in Settings.");
    } finally {
      setSurprising(false);
    }
  };

  const handleCreateCharacter = () => {
    if (!name || !prompt) {
      alert("Character name and prompt are required.");
      return;
    }
    dispatch(addCharacter({ name, description, tags, prompt, scenario, first_mes: firstMes, mes_example: mesExample, relationship, appearance, appearanceImages, artStyle, accent: CHARACTER_SWATCHES[accentIndex], autoSelfie: { enabled: autoSelfieEnabled, frequency: autoSelfieFrequency }, emotionPortraits: { enabled: emotionPortraitsEnabled, images: emotionPortraitImages, customEmotions }, loreEntries, personalityTraits }));
    navigate("/characters");
  };

  // `stay: true` is the per-step "Save" button - persists in place without
  // leaving the wizard, so a long editing session (especially one involving
  // slow steps like generating a batch of emotion portraits) doesn't risk
  // losing everything if the user never makes it to the final step's Save
  // Changes, which still navigates away as before.
  const handleSaveEdit = (options?: { stay?: boolean }) => {
    if (!name || !prompt || !editCharacter) {
      alert("Character name and prompt are required.");
      return;
    }
    dispatch(updateCharacter({ id: editCharacter.id, name, description, tags, prompt, scenario, first_mes: firstMes, mes_example: mesExample, relationship, appearance, appearanceImages, artStyle, accent: CHARACTER_SWATCHES[accentIndex], gallery: editCharacter.gallery, autoSelfie: { enabled: autoSelfieEnabled, frequency: autoSelfieFrequency }, emotionPortraits: { enabled: emotionPortraitsEnabled, images: emotionPortraitImages, customEmotions }, loreEntries, personalityTraits }));
    if (options?.stay) {
      toast.success("Character saved");
    } else {
      navigate("/characters");
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  // Accepts WhatsGemini's own native export, a V2 Character Card, or a
  // flat/legacy V1 card (see parseCharacterCardJson) - whichever a
  // "character file" JSON turns out to be.
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // Reset input
    if (!file) return;

    try {
      const parsed = parseCharacterCardJson(JSON.parse(await file.text()));
      dispatch(addCharacter(parsed));
      showAlert("Imported", "Character imported successfully!");
    } catch (err: any) {
      console.error("Import error:", err);
      showAlert("Import failed", err?.message || "Failed to import character. Invalid JSON file.");
    }
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
         const filename = `char_ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;

         const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
         const writable = await fileHandle.createWritable();
         await writable.write(file);
         await writable.close();

         newImageRefs.push(`local:${filename}`);
      }

      // If the user had no portrait yet and is adding their first image, open
      // the crop dialog so they can reframe it to the 3:4 portrait aspect.
      const isFirstPortrait = appearanceImages.length === 0 && newImageRefs.length > 0;
      setAppearanceImages((prev) => [...prev, ...newImageRefs]);

      if (isFirstPortrait) {
        // Create a temporary object URL from the original file for the crop canvas.
        const blobUrl = URL.createObjectURL(files[0]);
        setCropImageSrc(blobUrl);
        setCropDialogOpen(true);
      }
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

  // Called when AvatarGenerateButton returns a generated image data URL.
  const handleAvatarGenerated = (dataUrl: string) => {
    setCropTargetEmotion(null);
    setCropImageSrc(dataUrl);
    setCropDialogOpen(true);
  };

  // Generates one emotion slot's portrait - same pipeline as the main avatar
  // (reference images keep it recognizably the same character), just with the
  // target emotion folded into the prompt. Opens the same crop dialog on
  // success, routed back into emotionPortraitImages via cropTargetEmotion.
  const [generatingEmotion, setGeneratingEmotion] = useState<string | null>(null);
  const [emotionGenError, setEmotionGenError] = useState<string | null>(null);
  const [emotionHint, setEmotionHint] = useState("");
  const handleGenerateEmotion = async (emotion: string) => {
    if (!name.trim()) {
      setEmotionGenError("Give the character a name first.");
      return;
    }
    setEmotionGenError(null);
    setGeneratingEmotion(emotion);
    try {
      const referenceImages = appearanceImages.length > 0 ? appearanceImages : undefined;
      const result = await dispatch(generateAvatarImage({ name, appearance, appearanceImages: referenceImages, emotion, artStyle, hint: emotionHint.trim() || undefined })).unwrap();
      if (result.images && result.images.length > 0) {
        // Generated against a chroma-key backdrop (see the emotion-only prompt
        // clause in aiSlice.ts) - strip it to real transparency before the crop
        // dialog gets it, so what's cropped/saved is already backgroundless.
        const keyedBlob = await removeChromaKeyBackground(result.images[0]);
        const keyedDataUrl = await blobToDataUrl(keyedBlob);
        setCropTargetEmotion(emotion);
        setCropImageSrc(keyedDataUrl);
        setCropDialogOpen(true);
      } else {
        setEmotionGenError("No image was returned.");
      }
    } catch (err: any) {
      setEmotionGenError(typeof err === "string" ? err : "Failed to generate portrait. Check your API key and image provider in Settings.");
    } finally {
      setGeneratingEmotion(null);
    }
  };
  // Lets a specific emotion slot be filled from a local file instead of AI
  // generation - opens the same interactive crop dialog (so it's framed and
  // saved at the same configured size), just skipping generateAvatarImage.
  const emotionUploadInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetEmotion, setUploadTargetEmotion] = useState<string | null>(null);
  const handleTriggerEmotionUpload = (emotion: string) => {
    setUploadTargetEmotion(emotion);
    emotionUploadInputRef.current?.click();
  };
  const handleEmotionFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !uploadTargetEmotion) return;
    setCropTargetEmotion(uploadTargetEmotion);
    setCropImageSrc(URL.createObjectURL(file));
    setCropDialogOpen(true);
  };

  // Batch path: unlike the single-emotion button above, this doesn't open the
  // interactive crop dialog per image (looping that would mean firing every
  // generation before the user could ever crop the first one) - each result
  // is auto-cover-cropped to the configured portrait save size (same
  // resizing the interactive dialog itself exports at) and saved directly.
  // Framing usually comes out reasonable given the prompt already asks for a
  // head-and-shoulders shot; anyone can re-generate + manually crop a
  // specific slot afterward if it isn't.
  const [generatingAllEmotions, setGeneratingAllEmotions] = useState(false);
  const handleGenerateAllEmotions = async () => {
    if (!name.trim()) {
      setEmotionGenError("Give the character a name first.");
      return;
    }
    setEmotionGenError(null);
    setGeneratingAllEmotions(true);
    try {
      const referenceImages = appearanceImages.length > 0 ? appearanceImages : undefined;
      const missing = [...EMOTIONS, ...customEmotions].filter((e) => !emotionPortraitImages[e]);
      for (const emo of missing) {
        setGeneratingEmotion(emo);
        try {
          // eslint-disable-next-line no-await-in-loop
          const result = await dispatch(generateAvatarImage({ name, appearance, appearanceImages: referenceImages, emotion: emo, artStyle, hint: emotionHint.trim() || undefined })).unwrap();
          const dataUrl = result.images?.[0];
          if (!dataUrl) continue;
          // Same chroma-key strip as the single-emotion path above, just
          // ahead of the auto-crop instead of the interactive dialog.
          // eslint-disable-next-line no-await-in-loop
          const keyedBlob = await removeChromaKeyBackground(dataUrl);
          // eslint-disable-next-line no-await-in-loop
          const keyedDataUrl = await blobToDataUrl(keyedBlob);
          // eslint-disable-next-line no-await-in-loop
          const blob = await autoCoverCropToBlob(keyedDataUrl, portraitSaveSize.width, portraitSaveSize.height);
          // eslint-disable-next-line no-await-in-loop
          const localRef = await savePortraitBlob(blob, `avatar_${emo}`);
          setEmotionPortraitImages((prev) => ({ ...prev, [emo]: localRef }));
        } catch (err: any) {
          console.error(`Failed to generate ${emo} portrait:`, err);
          setEmotionGenError(`Failed on "${emo}" (${err?.message || err}) - stopped, already-generated slots are kept.`);
          break;
        }
      }
    } finally {
      setGeneratingEmotion(null);
      setGeneratingAllEmotions(false);
    }
  };

  // Called when the crop dialog produces a saved local: ref - routed to the
  // main portrait or a specific emotion slot depending on what triggered it.
  const handleCropComplete = (localRef: string) => {
    if (cropTargetEmotion) {
      setEmotionPortraitImages((prev) => ({ ...prev, [cropTargetEmotion]: localRef }));
      return;
    }
    // Replace the first image (portrait slot) or insert as the first.
    setAppearanceImages((prev) =>
      prev.length > 0 ? [localRef, ...prev.slice(1)] : [localRef]
    );
  };

  // Lets a character report moods beyond the fixed EMOTIONS list (e.g.
  // "smug", "flustered") - normalized to a single lowercase word so it stays
  // compatible with the [Emotion: <word>] tag format the model is asked to
  // reply in (see extractEmotionTag's regex, which only matches letters).
  const [newCustomEmotion, setNewCustomEmotion] = useState("");
  const handleAddCustomEmotion = () => {
    const normalized = newCustomEmotion.trim().toLowerCase().replace(/[^a-z]/g, "");
    if (!normalized) {
      setEmotionGenError("Enter a single word (letters only) for the custom mood.");
      return;
    }
    if (EMOTIONS.includes(normalized) || customEmotions.includes(normalized)) {
      setEmotionGenError(`"${normalized}" is already in the list.`);
      return;
    }
    setEmotionGenError(null);
    setCustomEmotions((prev) => [...prev, normalized]);
    setNewCustomEmotion("");
  };
  // Also drops any portrait already generated/uploaded for it - the slot is
  // gone, so there's nothing left to show it for.
  const handleRemoveCustomEmotion = (emotion: string) => {
    setCustomEmotions((prev) => prev.filter((e) => e !== emotion));
    setEmotionPortraitImages((prev) => {
      if (!(emotion in prev)) return prev;
      const next = { ...prev };
      delete next[emotion];
      return next;
    });
  };

  const handleAddLoreEntry = () => {
    setLoreEntries((prev) => [...prev, { id: makeLoreEntryId(), keywords: [], content: "", enabled: true }]);
  };
  const handleUpdateLoreEntry = (id: string, patch: Partial<LoreEntry>) => {
    setLoreEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };
  // Drafts/expands one lore entry's content from its keywords (and whatever
  // rough note is already in `content`, if any) - the same "Expand" pattern
  // as the personality idea field, just scoped to a single entry instead of
  // the whole editor. Tracked by entry id (not a single boolean) so expanding
  // one entry doesn't disable the button on every other one.
  const [expandingLoreId, setExpandingLoreId] = useState<string | null>(null);
  const handleExpandLoreEntry = async (entry: LoreEntry) => {
    if (entry.keywords.length === 0 && !entry.content.trim()) {
      setAssistError("Add a keyword or a short note first, then expand it.");
      return;
    }
    setAssistError(null);
    setExpandingLoreId(entry.id);
    try {
      const who = name || "this character";
      const instruction = `Write a concise lorebook / world-info entry for the roleplay AI character ${who}, to be injected into their system prompt only when relevant.${prompt.trim() ? ` Character personality for tone reference: ${prompt.trim()}.` : ""}\nKeywords for this entry: ${entry.keywords.length > 0 ? entry.keywords.join(", ") : "(none yet - infer them from the note below)"}.${entry.content.trim() ? `\nExisting rough note to expand on, keeping its intent: ${entry.content.trim()}` : ""}\n\nWrite 2-4 sentences of clear, concrete factual lore/background (not dialogue, not instructions to the character - just world info). Output only the lore text, no preamble or headings.`;
      const text = await dispatch(generateAssistText({ instruction })).unwrap();
      if (text) handleUpdateLoreEntry(entry.id, { content: text });
    } catch (err: any) {
      setAssistError(typeof err === "string" ? err : "Failed to expand lore entry. Check your API key in Settings.");
    } finally {
      setExpandingLoreId(null);
    }
  };

  const handleRemoveLoreEntry = (id: string) => {
    setLoreEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const handleRemoveMemoryFact = (index: number) => {
    if (!editCharacter) return;
    const newMemory = (editCharacter.memory || []).filter((_, i) => i !== index);
    dispatch(updateCharacter({ ...editCharacter, memory: newMemory }));
  };

  const [editingFactIndex, setEditingFactIndex] = useState<number | null>(null);
  const [factDraft, setFactDraft] = useState("");
  const [addingFact, setAddingFact] = useState(false);

  const startEditFact = (index: number) => {
    setEditingFactIndex(index);
    setFactDraft((editCharacter?.memory || [])[index] || "");
  };

  const commitFactEdit = () => {
    if (!editCharacter || editingFactIndex === null) return;
    const memory = editCharacter.memory || [];
    const trimmed = factDraft.trim();
    const newMemory = trimmed
      ? memory.map((fact, i) => (i === editingFactIndex ? trimmed : fact))
      : memory.filter((_, i) => i !== editingFactIndex);
    dispatch(updateCharacter({ ...editCharacter, memory: newMemory }));
    setEditingFactIndex(null);
    setFactDraft("");
  };

  const commitNewFact = () => {
    const trimmed = factDraft.trim();
    if (trimmed && editCharacter) {
      const withNewFact = [...(editCharacter.memory || []), trimmed];
      const capped = withNewFact.length > MAX_MEMORY_ENTRIES ? withNewFact.slice(withNewFact.length - MAX_MEMORY_ENTRIES) : withNewFact;
      dispatch(updateCharacter({ ...editCharacter, memory: capped }));
    }
    setFactDraft("");
    setAddingFact(false);
  };

  const accent = CHARACTER_SWATCHES[accentIndex];

  // Each step's own required-field check, so the wizard can't be advanced
  // past a step that would fail the final save validation anyway. Shown
  // inline rather than via alert() so it doesn't block on a native dialog.
  const stepError = (i: number): string | null => {
    if (i === 0 && !name.trim()) return "Give this character a name first.";
    if (i === 1 && !prompt.trim()) return "Personality / instructions are required.";
    return null;
  };
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  // Clear a stale warning as soon as the field it complained about is fixed.
  useEffect(() => {
    if (blockedMessage && !stepError(step)) setBlockedMessage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, prompt, step]);

  // AI-assist errors are step-scoped - don't let one linger after navigating away.
  useEffect(() => {
    setAssistError(null);
  }, [step]);

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
    // Only allow jumping forward past steps that are already valid.
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

  return (
    <div className="w-full h-screen flex flex-col">
      <Header
        title={editCharacter ? "Edit character" : "New character"}
        subtitle={editCharacter ? "Update who Gemini becomes" : "Define who Gemini becomes"}
        onBack={() => navigate("/characters")}
      />
      <div className="flex-1 overflow-auto p-4 md:p-8">
      <div className="w-full max-w-[1180px] mx-auto">

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
          {STEPS.map((label, i) => (
            <React.Fragment key={label}>
              <button
                type="button"
                onClick={() => goToStep(i)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors",
                  i === step
                    ? "bg-primary text-primary-foreground"
                    : i < step
                    ? "bg-secondary text-foreground hover:bg-accent"
                    : "text-subtle hover:text-foreground"
                )}
              >
                <span className={cn(
                  "flex items-center justify-center w-5 h-5 rounded-full text-[10px]",
                  i === step ? "bg-primary-foreground/20" : i < step ? "bg-primary/20 text-primary" : "bg-muted"
                )}>
                  {i < step ? <FaCheck size={9} /> : i + 1}
                </span>
                {label}
              </button>
              {i < STEPS.length - 1 && <div className="h-px flex-1 min-w-[12px] bg-border" />}
            </React.Fragment>
          ))}
        </div>

        {blockedMessage && (
          <div className="mb-4 px-4 py-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
            {blockedMessage}
          </div>
        )}

        <div className="flex flex-col gap-6">

          {/* Persistent avatar strip: portrait + accent/auto-selfie, shared
              across every step - per the redesign's spec, a single horizontal
              card (not a tall sidebar) whose controls flex-wrap on narrow
              widths instead of overflowing. */}
          <Card className="p-6">
            <div className="flex flex-wrap gap-6">
              <div className="flex gap-3 flex-1 basis-[220px] min-w-0">
                <div
                  className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center"
                  style={!appearanceImages[0] ? { background: `linear-gradient(135deg, ${accent[0]}26, ${accent[1]}26)` } : undefined}
                >
                  {appearanceImages[0] ? (
                    <DisplayImage srcContext={appearanceImages[0]} alt="Portrait" className="w-full h-full object-cover" />
                  ) : (
                    <CharacterAvatar name={name || "?"} accent={accent} size={64} />
                  )}
                </div>
                <div className="flex flex-col gap-1.5 justify-center min-w-0 flex-1">
                  <AvatarGenerateButton
                    name={name}
                    appearance={appearance}
                    appearanceImages={appearanceImages}
                    artStyle={artStyle}
                    onGenerated={handleAvatarGenerated}
                  />
                  {appearanceImages[0] && (
                    <Button
                      type="button"
                      variant="panel"
                      onClick={() => {
                        // For local: refs we need to resolve to a blob URL for the crop canvas.
                        // The simplest approach: if the first image is local:, load it via
                        // DisplayImage's same path (dbService). For data: URLs, use directly.
                        const src = appearanceImages[0];
                        if (src.startsWith("data:") || src.startsWith("blob:")) {
                          setCropImageSrc(src);
                          setCropDialogOpen(true);
                        } else if (src.startsWith("local:")) {
                          const filename = src.substring(6);
                          dbService.getSetting("image_save_directory").then(async (dirHandle: any) => {
                            if (!dirHandle) return;
                            try {
                              const fh = await dirHandle.getFileHandle(filename);
                              const file = await fh.getFile();
                              const blobUrl = URL.createObjectURL(file);
                              setCropImageSrc(blobUrl);
                              setCropDialogOpen(true);
                            } catch (e) { console.error("Failed to load image for cropping:", e); }
                          });
                        }
                      }}
                      className="h-auto w-full px-3 py-1.5 text-xs font-medium border border-border hover:border-primary hover:text-primary"
                      title="Re-crop the portrait"
                    >
                      <FaCrop size={11} /> Re-crop Portrait
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex-1 basis-[160px] min-w-0">
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

            </div>

            <div className="mt-6 pt-6 border-t border-border/30">
              <ToggleSwitch
                checked={autoSelfieEnabled}
                onChange={setAutoSelfieEnabled}
                label="Sends selfies on their own"
                title="Let this character spontaneously attach a selfie-style picture to their replies, without you asking for one."
              />
              {autoSelfieEnabled && (
                <div className="mt-3 max-w-sm">
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

          {/* Stepped field cards */}
          <div className="flex flex-col gap-6">
            {step === 0 && (
              <>
                <Card className="p-6 flex flex-col gap-5">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="font-semibold text-[15px] text-foreground">Identity</h3>
                    {!editCharacter && (
                      <Button
                        type="button"
                        variant="panel"
                        onClick={handleSurpriseMe}
                        disabled={surprising}
                        className="h-auto px-3 py-1.5 text-xs font-medium border border-border hover:border-primary hover:text-primary"
                        title="Roll a random relationship, tags, and personality traits, then have the AI invent a whole character around them"
                      >
                        <FaDice size={12} /> {surprising ? "Rolling..." : "Surprise Me"}
                      </Button>
                    )}
                  </div>
                  {!editCharacter && (
                    <TextInput
                      type="text"
                      value={surpriseHint}
                      onChange={(e) => setSurpriseHint(e.target.value)}
                      placeholder="Optional: steer the surprise (e.g. cyberpunk hacker, medieval knight)..."
                      className="-mt-1"
                    />
                  )}
                  {assistError && <p className="text-xs text-destructive -mt-1">{assistError}</p>}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <FieldLabel htmlFor="char-name">Character Name</FieldLabel>
                      <TextInput
                        id="char-name"
                        type="text"
                        placeholder="Character Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                    <PresetSelectField
                      label="Tagline / Relationship"
                      value={relationship}
                      onChange={setRelationship}
                      presets={RELATIONSHIP_PRESETS}
                      customPlaceholder="Tagline / Relationship with User (e.g. Best Friend, Enemy)"
                    />
                  </div>
                  <TextArea
                    placeholder="Description (Optional)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="resize-none"
                  />
                  <ChipSelectField
                    label="Tags"
                    hint="Discoverability tags for your library. Press Enter or comma to add a custom one."
                    value={tags}
                    onChange={setTags}
                    presets={TAG_PRESETS}
                    placeholder="Add a tag..."
                  />

                  {/* Appearance fields live in this same card, not a separate
                      one - a lighter sub-heading marks the shift in topic
                      instead of a full second card's worth of chrome. */}
                  <div className="flex items-center gap-1.5 pt-2 mt-1 border-t border-border/30">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-subtle">Appearance</h4>
                    <InfoTooltip hint="Given to image-capable models to keep generated looks consistent" />
                  </div>
                  <TextArea
                    placeholder="Character Appearance/Looks (e.g. Blonde hair, wears a red jacket) (Optional)"
                    value={appearance}
                    onChange={(e) => setAppearance(e.target.value)}
                    className="resize-none"
                  />
                  <div>
                    <FieldLabel hint="Pins a consistent look for the main avatar and every generated emotion portrait, instead of the AI picking a style per call.">Art style</FieldLabel>
                    <SegmentedControl
                      value={artStyle}
                      onChange={(v) => setArtStyle(v as ArtStyle)}
                      options={ART_STYLES}
                    />
                  </div>
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
                        className={cn(
                          "w-20 h-20 flex flex-col justify-center items-center rounded-lg text-muted-foreground hover:text-primary transition-colors",
                          neumorphic ? "surface-sunken" : "border-2 border-dashed border-border hover:border-primary"
                        )}
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

                <Card className="p-6 flex flex-col gap-5">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-semibold text-[15px] text-foreground">Emotion Portraits</h3>
                    <InfoTooltip hint="Swaps the avatar to match their mood as you chat" />
                  </div>
                  <ToggleSwitch
                    checked={emotionPortraitsEnabled}
                    onChange={setEmotionPortraitsEnabled}
                    label="Show a matching portrait for their current emotion"
                    title="The AI reports its mood each reply; the chat avatar swaps to a matching portrait you generate below, including for neutral. Any mood without a generated portrait falls back to the main portrait above."
                  />
                  {emotionPortraitsEnabled && (
                    <div className="flex flex-col gap-3">
                      <TextInput
                        type="text"
                        value={emotionHint}
                        onChange={(e) => setEmotionHint(e.target.value)}
                        placeholder="Optional direction for generated portraits (e.g. wearing glasses)..."
                      />
                      <div className="flex flex-wrap gap-2.5">
                        {[...EMOTIONS.map((emo) => ({ emo, removable: false })), ...customEmotions.map((emo) => ({ emo, removable: true }))].map(({ emo, removable }) => (
                          <div key={emo} className="flex flex-col items-center gap-1 w-[92px]">
                            <div className="relative w-[76px] h-[76px] rounded-lg overflow-hidden border border-border bg-muted">
                              {emotionPortraitImages[emo] ? (
                                <DisplayImage srcContext={emotionPortraitImages[emo]} alt={emo} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-subtle">
                                  <FaMagic size={14} />
                                </div>
                              )}
                              {generatingEmotion === emo && (
                                <div className="absolute inset-0 bg-background/70 flex items-center justify-center text-[10px] text-foreground font-medium">
                                  Generating...
                                </div>
                              )}
                              {removable && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveCustomEmotion(emo)}
                                  disabled={Boolean(generatingEmotion) || generatingAllEmotions}
                                  className="absolute top-1 right-1 h-4 w-4 rounded-full bg-background/80 text-subtle hover:text-destructive flex items-center justify-center"
                                  title={`Remove the "${emo}" custom mood`}
                                  aria-label={`Remove the "${emo}" custom mood`}
                                >
                                  <FaTimes size={8} />
                                </button>
                              )}
                            </div>
                            <span className="capitalize text-[10.5px] font-medium text-foreground">{emo}</span>
                            <div className="flex items-center justify-center flex-wrap gap-1 text-center">
                              <button
                                type="button"
                                onClick={() => handleGenerateEmotion(emo)}
                                disabled={Boolean(generatingEmotion) || generatingAllEmotions}
                                className="text-[10.5px] font-medium text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                              >
                                {emotionPortraitImages[emo] ? "Regenerate" : "Generate"}
                              </button>
                              <span className="text-[10.5px] text-subtle">·</span>
                              <button
                                type="button"
                                onClick={() => handleTriggerEmotionUpload(emo)}
                                disabled={Boolean(generatingEmotion) || generatingAllEmotions}
                                className="text-[10.5px] font-medium text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                              >
                                Upload
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <TextInput
                          type="text"
                          value={newCustomEmotion}
                          onChange={(e) => setNewCustomEmotion(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddCustomEmotion();
                            }
                          }}
                          placeholder="Add a custom mood (e.g. smug, flustered)..."
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="panel"
                          onClick={handleAddCustomEmotion}
                          className="h-auto px-3 py-2 text-xs font-medium border border-border hover:border-primary hover:text-primary flex-shrink-0"
                        >
                          <FaPlus size={10} /> Add mood
                        </Button>
                      </div>
                      <input
                        type="file"
                        ref={emotionUploadInputRef}
                        onChange={handleEmotionFileSelected}
                        accept="image/*"
                        style={{ display: "none" }}
                      />
                      <Button
                        type="button"
                        variant="panel"
                        onClick={handleGenerateAllEmotions}
                        disabled={Boolean(generatingEmotion) || generatingAllEmotions}
                        className="h-auto w-full px-3 py-1.5 text-xs font-medium border border-border hover:border-primary hover:text-primary"
                      >
                        <FaMagic size={11} /> {generatingAllEmotions ? `Generating${generatingEmotion ? ` (${generatingEmotion})` : ""}...` : "Generate all missing"}
                      </Button>
                      {emotionGenError && <p className="text-xs text-destructive">{emotionGenError}</p>}
                    </div>
                  )}
                </Card>
              </>
            )}

            {step === 1 && (
              <Card className="p-6 flex flex-col gap-5">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="font-semibold text-[15px] text-foreground">Personality</h3>
                  <span className="text-xs text-subtle font-mono">~{promptTokens.toLocaleString()} tokens</span>
                </div>
                <ChipSelectField
                  label="Personality Traits"
                  hint="Quick-pick traits folded into the prompt alongside the full personality below."
                  value={personalityTraits}
                  onChange={setPersonalityTraits}
                  presets={PERSONALITY_TRAIT_PRESETS}
                  placeholder="Add a trait..."
                />
                <TextArea
                  placeholder="Character Prompt (Personality, Style, etc.)"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="resize-none min-h-[220px]"
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="panel"
                    onClick={handleExpandIdea}
                    disabled={expanding}
                    className="h-auto px-3 py-1.5 text-xs font-medium border border-border hover:border-primary hover:text-primary"
                    title="Have the AI turn your short idea into a fuller personality description"
                  >
                    <FaMagic size={11} /> {expanding ? "Expanding..." : "AI Assist: Expand my idea"}
                  </Button>
                </div>
                {assistError && <p className="text-xs text-destructive">{assistError}</p>}
              </Card>
            )}

            {step === 2 && (
              <>
                <Card className="p-6 flex flex-col gap-5">
                  <FieldLabel hint="The current setting or plot context, given to the AI alongside the personality above.">Scenario</FieldLabel>
                  <TextArea
                    placeholder="Scenario (e.g. You run into each other at a rainy bus stop after years apart) (Optional)"
                    value={scenario}
                    onChange={(e) => setScenario(e.target.value)}
                    className="resize-none min-h-[100px]"
                  />
                </Card>

                <Card className="p-6 flex flex-col gap-5">
                  <FieldLabel hint="Sent as this character's opening message when a brand-new chat is started. Leave blank to use the app's default greeting instead.">First Message</FieldLabel>
                  <TextArea
                    placeholder="First Message / Greeting (Optional)"
                    value={firstMes}
                    onChange={(e) => setFirstMes(e.target.value)}
                    className="resize-none min-h-[100px]"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="panel"
                      onClick={handleGenerateGreeting}
                      disabled={generatingGreeting}
                      className="h-auto px-3 py-1.5 text-xs font-medium border border-border hover:border-primary hover:text-primary"
                      title="Have the AI draft a greeting from the personality and scenario above"
                    >
                      <FaMagic size={11} /> {generatingGreeting ? "Generating..." : "Generate Greeting from Scenario"}
                    </Button>
                  </div>
                  {assistError && <p className="text-xs text-destructive">{assistError}</p>}
                </Card>
              </>
            )}

            {step === 3 && (
              <Card className="p-6 flex flex-col gap-5">
                <FieldLabel hint="Sample exchanges given to the AI purely as a style/format reference (e.g. use asterisks for actions) - never repeated verbatim in the chat.">Example Dialogues</FieldLabel>
                <TextArea
                  placeholder={`Example Dialogues (Optional)\nUser: Hey, how was your day?\n${name || "Character"}: *stretches* Long. Yours?`}
                  value={mesExample}
                  onChange={(e) => setMesExample(e.target.value)}
                  className="resize-none min-h-[220px]"
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="panel"
                    onClick={handleGenerateExampleDialogue}
                    disabled={generatingExample}
                    className="h-auto px-3 py-1.5 text-xs font-medium border border-border hover:border-primary hover:text-primary"
                    title="Have the AI draft example exchanges from the personality and scenario - added after anything already here"
                  >
                    <FaMagic size={11} /> {generatingExample ? "Generating..." : "Generate Example with AI"}
                  </Button>
                </div>
                {assistError && <p className="text-xs text-destructive">{assistError}</p>}
              </Card>
            )}

            {step === 4 && (
              <Card className="p-6 flex flex-col gap-5">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="font-semibold text-[15px] text-foreground flex items-center gap-2">
                    <FaBook size={13} className="text-subtle" /> Lorebook / World Info
                  </h3>
                  <span className="text-xs text-subtle">Injected into the prompt only when a keyword is mentioned</span>
                </div>
                <p className="text-xs text-subtle -mt-2">
                  Add lore entries for places, factions, items, or backstory that shouldn't live in the personality
                  prompt full-time. Each entry is only added to the conversation when one of its keywords shows up in
                  the last {LORE_SCAN_MESSAGE_COUNT} messages - keeping unrelated lore out of the context budget.
                </p>

                {loreEntries.length === 0 && (
                  <p className="text-xs text-subtle italic">No lore entries yet.</p>
                )}

                <div className="flex flex-col gap-3">
                  {loreEntries.map((entry, idx) => {
                    const entryTokens = estimateTokens(entry.content);
                    return (
                      <div key={entry.id} className="rounded-lg border border-border p-3.5 flex flex-col gap-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-subtle">Entry {idx + 1}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] text-subtle font-mono">~{entryTokens.toLocaleString()} tokens</span>
                            <ToggleSwitch
                              checked={entry.enabled !== false}
                              onChange={(v) => handleUpdateLoreEntry(entry.id, { enabled: v })}
                              label="Enabled"
                              className="text-xs"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveLoreEntry(entry.id)}
                              className="h-7 w-7 text-subtle hover:bg-destructive/10 hover:text-destructive flex-shrink-0"
                              title="Delete this lore entry"
                              aria-label="Delete this lore entry"
                            >
                              <FaTrash size={11} />
                            </Button>
                          </div>
                        </div>
                        <div>
                          <FieldLabel hint="Any of these words/phrases appearing in the recent conversation triggers this entry.">Keywords</FieldLabel>
                          <TagInput
                            value={entry.keywords}
                            onChange={(kws) => handleUpdateLoreEntry(entry.id, { keywords: kws })}
                            placeholder="Add a keyword..."
                          />
                        </div>
                        <TextArea
                          placeholder="Lore content injected into the system prompt when triggered (e.g. The Silver Court is a hidden fae kingdom ruled by...)"
                          value={entry.content}
                          onChange={(e) => handleUpdateLoreEntry(entry.id, { content: e.target.value })}
                          className="resize-none min-h-[80px]"
                        />
                        <div>
                          <button
                            type="button"
                            onClick={() => handleExpandLoreEntry(entry)}
                            disabled={expandingLoreId === entry.id}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                            title="Have the AI draft or expand this entry's content from its keywords"
                          >
                            <FaMagic size={10} /> {expandingLoreId === entry.id ? "Expanding..." : "Expand with AI"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Button
                  type="button"
                  variant="panel"
                  onClick={handleAddLoreEntry}
                  className={cn(
                    "h-auto w-full px-3 py-2 text-xs font-medium hover:text-primary",
                    neumorphic ? "surface-sunken" : "border border-dashed border-border hover:border-primary"
                  )}
                >
                  <FaPlus size={11} /> Add Lore Entry
                </Button>
                {assistError && <p className="text-xs text-destructive">{assistError}</p>}
              </Card>
            )}

            {step === 5 && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* Left: Review summary + Memory */}
                <div className="flex flex-col gap-6">
                  <Card className="p-6 flex flex-col gap-5">
                    <h3 className="font-semibold text-[15px] text-foreground">Review</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
                      <div>
                        <div className="text-xs text-subtle mb-1">Name</div>
                        <div className="text-foreground">{name || <span className="text-subtle">-</span>}</div>
                      </div>
                      <div>
                        <div className="text-xs text-subtle mb-1">Tagline</div>
                        <div className="text-foreground">{relationship || <span className="text-subtle">-</span>}</div>
                      </div>
                      <div>
                        <div className="text-xs text-subtle mb-1">Tags</div>
                        <div className="text-foreground">{tags.length > 0 ? tags.join(", ") : <span className="text-subtle">-</span>}</div>
                      </div>
                      <div>
                        <div className="text-xs text-subtle mb-1">First message</div>
                        <div className="text-foreground truncate">{firstMes || <span className="text-subtle">Uses default greeting</span>}</div>
                      </div>
                      <div>
                        <div className="text-xs text-subtle mb-1">Lore entries</div>
                        <div className="text-foreground">{loreEntries.length > 0 ? `${loreEntries.length} entr${loreEntries.length === 1 ? "y" : "ies"}` : <span className="text-subtle">-</span>}</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-subtle mb-1">Personality</div>
                      <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-4">{prompt || <span className="text-subtle">-</span>}</p>
                    </div>
                    {scenario && (
                      <div>
                        <div className="text-xs text-subtle mb-1">Scenario</div>
                        <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-3">{scenario}</p>
                      </div>
                    )}
                    {mesExample && (
                      <div>
                        <div className="text-xs text-subtle mb-1">Example dialogue</div>
                        <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-3">{mesExample}</p>
                      </div>
                    )}
                  </Card>

                  {editCharacter && (
                    <Card className="p-6 flex flex-col gap-5">
                      <div className="flex items-baseline justify-between gap-4">
                        <h3 className="font-semibold text-[15px] text-foreground">
                          Memory {editCharacter.memory && editCharacter.memory.length > 0 && (
                            <span className="text-subtle font-normal text-xs">({editCharacter.memory.length} facts remembered)</span>
                          )}
                        </h3>
                      </div>
                      {editCharacter.memory && editCharacter.memory.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {editCharacter.memory.map((fact, idx) =>
                            editingFactIndex === idx ? (
                              <Input
                                key={idx}
                                autoFocus
                                value={factDraft}
                                onChange={(e) => setFactDraft(e.target.value)}
                                onBlur={commitFactEdit}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    commitFactEdit();
                                  } else if (e.key === "Escape") {
                                    setEditingFactIndex(null);
                                    setFactDraft("");
                                  }
                                }}
                                className="h-7 w-48 text-xs px-2.5 py-0 rounded-full"
                              />
                            ) : (
                              <span key={idx} className="inline-flex items-center gap-2 pl-3 pr-1 py-1 rounded-full bg-background border border-input text-xs">
                                {fact}
                                <Button
                                  onClick={() => startEditFact(idx)}
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 rounded-full text-subtle hover:bg-primary/10 hover:text-primary flex-shrink-0"
                                  title="Edit this fact"
                                  aria-label="Edit this fact"
                                >
                                  <FaEdit size={9} />
                                </Button>
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
                            )
                          )}
                        </div>
                      ) : (
                        !addingFact && <p className="text-xs text-subtle">No facts remembered yet.</p>
                      )}
                      {addingFact ? (
                        <Input
                          autoFocus
                          value={factDraft}
                          onChange={(e) => setFactDraft(e.target.value)}
                          onBlur={commitNewFact}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitNewFact();
                            } else if (e.key === "Escape") {
                              setFactDraft("");
                              setAddingFact(false);
                            }
                          }}
                          placeholder="A fact to remember…"
                          className="h-7 w-48 text-xs px-2.5 py-0 rounded-full"
                        />
                      ) : (
                        <Button
                          onClick={() => setAddingFact(true)}
                          variant="outline"
                          size="sm"
                          className="h-7 self-start text-xs rounded-full border-dashed"
                        >
                          <FaPlus size={9} className="mr-1.5" /> Add
                        </Button>
                      )}
                      <p className="text-xs text-subtle">Automatically learned from your conversations, every {MEMORY_EXTRACTION_INTERVAL} messages or so.</p>
                    </Card>
                  )}
                </div>

                {/* Right: Test Chat */}
                <TestChatPane
                  name={name}
                  description={description}
                  prompt={prompt}
                  scenario={scenario}
                  firstMes={firstMes}
                  mesExample={mesExample}
                  relationship={relationship}
                  appearance={appearance}
                  appearanceImages={appearanceImages}
                  accent={accent}
                  memory={editCharacter?.memory}
                  loreEntries={loreEntries}
                  personalityTraits={personalityTraits}
                />
              </div>
            )}

            <div className="sticky bottom-0 pt-6 pb-1 bg-gradient-to-t from-background via-background to-transparent flex gap-3 justify-end">
              {!editCharacter && step === 0 && (
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
              {step === 0 ? (
                <Button
                  onClick={() => navigate("/characters")}
                  variant="panel"
                  className="h-auto px-4 py-2.5 border border-border hover:border-primary font-medium"
                >
                  Cancel
                </Button>
              ) : (
                <Button
                  onClick={() => setStep((s) => Math.max(s - 1, 0))}
                  variant="panel"
                  className="h-auto px-4 py-2.5 border border-border hover:border-primary font-medium"
                >
                  <FaArrowLeft size={12} /> Back
                </Button>
              )}
              {editCharacter && (
                <Button
                  onClick={() => handleSaveEdit({ stay: true })}
                  variant="panel"
                  className="h-auto px-4 py-2.5 border border-border hover:border-primary font-medium"
                  title="Save without leaving the editor"
                >
                  <FaCheck size={12} /> Save
                </Button>
              )}
              {step < STEPS.length - 1 ? (
                <Button
                  onClick={goNext}
                  variant="default"
                  className="h-auto px-5 py-2.5 font-semibold"
                >
                  Next <FaArrowRight size={12} />
                </Button>
              ) : (
                <Button
                  onClick={() => (editCharacter ? handleSaveEdit() : handleCreateCharacter())}
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
              )}
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

      {/* Avatar crop dialog — rendered as a portal overlay */}
      <AvatarCropDialog
        open={cropDialogOpen}
        onClose={() => setCropDialogOpen(false)}
        imageSrc={cropImageSrc}
        onCropped={handleCropComplete}
        exportSize={portraitSaveSize}
      />
    </div>
  );
};

export default CharacterEditorPage;
