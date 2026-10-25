import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import { useColorTheme } from "../hooks/useColorTheme";
import { addCharacter, updateCharacter } from "../features/characterSlice";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { FaUpload, FaEdit, FaPlus, FaArrowLeft, FaArrowRight, FaCheck, FaCrop, FaSlidersH } from "react-icons/fa";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { Character, CharacterSchedule, CharacterHome, CharacterVoice, WritingStyle, LoreEntry, ArtStyle, ContentRating, LocalImageSettings, ImportantDate, Outfit, IntimacyProfile, CharacterSecret } from "../types";
import { dbService } from "../services/dbService";
import { generateAssistText, generateAssistTextWithImage, generateAvatarImage } from "../features/aiSlice";
import { buildVisualTagsDraftPrompt, cleanVisualTags } from "../features/ai/utils/appearanceLock";
import { DisplayImage } from "src/components/molecules/DisplayImage";
import { Slider } from "src/components/molecules/form-controls";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { Button } from "src/components/atoms/button";
import { Card } from "src/components/atoms/card";
import { cn } from "../utils/cn";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import Header from "src/components/organisms/Header";
import { WizardSteps } from "src/components/molecules/WizardSteps";
import LifeStep from "./CharacterEditorPage/steps/LifeStep";
import { backgroundCallsPerDay, LIFE_PRESETS, lifeOf, LifeValues, presetOf } from "../features/character/lifePresets";
import { CostMarker } from "src/components/molecules/SettingRow";

import { CHARACTER_SWATCHES, MAX_MEMORY_ENTRIES, DEFAULT_AUTO_SELFIE_FREQUENCY, EMOTIONS, DEFAULT_ART_STYLE, RELATIONSHIP_PRESETS, TAG_PRESETS, PERSONALITY_TRAIT_PRESETS } from "../utils/constants";
import { estimateTokens } from "../features/ai/utils/tokenEstimator";
import AvatarGenerateButton from "src/components/molecules/AvatarGenerateButton";
import { parseSize, autoCoverCropToBlob, savePortraitBlob, removeChromaKeyBackground, blobToDataUrl, dataUrlToBlob } from "../features/ai/utils/portraitUtils";
import { parseCharacterCardText } from "../features/character/characterCard";
import { detectMinorIndicators, characterTextFields } from "../features/character/contentRating";
import { useModal } from "../contexts/ModalContext";
import { CharacterModelOverride, cleanModelOverride } from "../features/ai/modelResolution";
import { nextMemoryCategory } from "../features/ai/utils/memoryExtraction";
import ModelOverrideSection from "./CharacterEditorPage/ModelOverrideSection";
import LocalImageSettingsSection from "./CharacterEditorPage/LocalImageSettingsSection";
import ImportantDatesSection from "./CharacterEditorPage/ImportantDatesSection";
import SecretsSection from "./CharacterEditorPage/SecretsSection";
import WardrobeSection from "./CharacterEditorPage/WardrobeSection";
import ScheduleSection from "./CharacterEditorPage/ScheduleSection";
import WritingStyleSection from "./CharacterEditorPage/WritingStyleSection";
import HomeSection from "./CharacterEditorPage/HomeSection";
import TextsFirstSection from "./CharacterEditorPage/TextsFirstSection";
import ProfileSection from "./CharacterEditorPage/ProfileSection";
import { cleanWritingStyle } from "../features/character/writingStyle";
import IntimacySection from "src/components/molecules/IntimacySection";
import { cleanSchedule } from "../features/character/schedule";
import { isValidDate } from "../features/character/importantDates";
import VoiceSection, { cleanVoice } from "./CharacterEditorPage/VoiceSection";
import IdeaDraftSection from "./CharacterEditorPage/IdeaDraftSection";
import { buildCharacterDraftPrompt, parseCharacterDraft, CharacterDraftRequest, CharacterDraftError } from "../features/character/characterDraft";
import { cleanLocalImageSettings } from "../features/ai/utils/localImageSettings";
import { toast } from "sonner";

// Saved outfits: ones with a name or a look; the worn one must still exist.
const cleanWardrobe = (outfits: Outfit[], currentId?: string): Pick<Character, "wardrobe" | "currentOutfitId"> => {
  const kept = outfits.map((o) => ({ ...o, name: o.name.trim(), description: o.description.trim() })).filter((o) => o.name || o.description);
  return { wardrobe: kept.length > 0 ? kept : undefined, currentOutfitId: kept.some((o) => o.id === currentId) ? currentId : undefined };
};

// Saved dates: labelled and real (an impossible day is dropped), or none.
const cleanSecrets = (secrets: CharacterSecret[]): CharacterSecret[] | undefined => {
  const kept = secrets.map((s) => ({ ...s, text: s.text.trim() })).filter((s) => s.text);
  return kept.length > 0 ? kept : undefined;
};

const cleanDates = (dates: ImportantDate[]): ImportantDate[] | undefined => {
  const kept = dates.map((d) => ({ ...d, label: d.label.trim() })).filter((d) => d.label && isValidDate(d));
  return kept.length > 0 ? kept : undefined;
};

// Deferred to its own chunk - only fetched once the user actually opens the
// crop dialog, instead of loading with the rest of this already-large page.
const AvatarCropDialog = lazy(() => import("src/components/organisms/AvatarCropDialog"));

// Each wizard step is its own chunk, fetched only as the user reaches it -
// see steps/IdentityStep.tsx for the full rationale (this step in
// particular used to make this whole page's chunk noticeably larger, since
// it pulls in TestChatPane, a full AI chat simulator).
const IdentityStep = lazy(() => import("./CharacterEditorPage/steps/IdentityStep"));
const PersonalityStep = lazy(() => import("./CharacterEditorPage/steps/PersonalityStep"));
const ScenarioGreetingStep = lazy(() => import("./CharacterEditorPage/steps/ScenarioGreetingStep"));
const ExampleDialoguesStep = lazy(() => import("./CharacterEditorPage/steps/ExampleDialoguesStep"));
const LorebookStep = lazy(() => import("./CharacterEditorPage/steps/LorebookStep"));
const TestFinalizeStep = lazy(() => import("./CharacterEditorPage/steps/TestFinalizeStep"));

const StepLoader = () => (
  <div className="flex items-center justify-center py-16">
    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
  </div>
);

const findSwatchIndex = (accent?: [string, string]) => {
  if (!accent) return 0;
  const idx = CHARACTER_SWATCHES.findIndex((s) => s[0] === accent[0] && s[1] === accent[1]);
  return idx === -1 ? 0 : idx;
};

// #154: the canvas's six steps; Advanced sits apart, after them.
const STEPS = ["Who they are", "Look", "Personality", "World and story", "Their life", "Test and finish"];
const ADVANCED_STEP = STEPS.length;

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

// The reference sheet's three views (#35): plain and neutral on purpose, so
// they show the face and build rather than a mood or a scene.
const REFERENCE_SHEET_VIEWS = [
  { id: "front", label: "front view", hint: "Reference sheet view: straight-on front view facing the camera, neutral relaxed expression, even soft lighting, head and shoulders" },
  { id: "three-quarter", label: "three-quarter view", hint: "Reference sheet view: three-quarter view turned slightly to the left, neutral relaxed expression, even soft lighting, head and shoulders" },
  { id: "side", label: "side view", hint: "Reference sheet view: side profile facing left, neutral expression, even soft lighting, head and shoulders" },
];

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
  const portraitResizeEnabled = useAppSelector((state) => state.settings.portraitResizeEnabled);

  const editCharacter = characterId
    ? characters.find((c) => c.id === Number(characterId)) || null
    : null;
  // Seeded once from a "Duplicate" action on the gallery card - a real
  // character to copy fields from, but this is still a create (no id yet).
  const duplicateFrom = (location.state as { duplicateFrom?: Character } | null)?.duplicateFrom;
  // A quick-create draft (#154) opened in the full editor: filled in, not a copy.
  const draftFrom = (location.state as { draftFrom?: Character } | null)?.draftFrom;
  // Set by the gallery's "Create from an idea" button: open the idea dialog
  // straight away (#45).
  const fromIdea = Boolean((location.state as { fromIdea?: boolean } | null)?.fromIdea);

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [scenario, setScenario] = useState("");
  const [firstMes, setFirstMes] = useState("");
  const [alternateGreetings, setAlternateGreetings] = useState<string[]>([]);
  const [postHistoryInstructions, setPostHistoryInstructions] = useState("");
  const [contentRating, setContentRating] = useState<ContentRating | undefined>(undefined);
  const [adultsConfirmed, setAdultsConfirmed] = useState(false);
  const [mesExample, setMesExample] = useState("");
  const [relationship, setRelationship] = useState("");
  const [appearance, setAppearance] = useState("");
  const [visualTags, setVisualTags] = useState("");
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
  const [modelOverride, setModelOverride] = useState<CharacterModelOverride | undefined>(undefined);
  const [localImageSettings, setLocalImageSettings] = useState<LocalImageSettings | undefined>(undefined);
  const [importantDates, setImportantDates] = useState<ImportantDate[]>([]);
  const [secrets, setSecrets] = useState<CharacterSecret[]>([]);
  const [wardrobe, setWardrobe] = useState<Outfit[]>([]);
  const [schedule, setSchedule] = useState<CharacterSchedule | undefined>(undefined);
  const [intimacy, setIntimacy] = useState<IntimacyProfile | undefined>(undefined);
  const [currentOutfitId, setCurrentOutfitId] = useState<string | undefined>(undefined);
  const [voice, setVoice] = useState<CharacterVoice | undefined>(undefined);
  const [writingStyle, setWritingStyle] = useState<WritingStyle | undefined>(undefined); // #111
  const [home, setHome] = useState<CharacterHome | undefined>(undefined); // #112
  const [textsFirst, setTextsFirst] = useState({ enabled: false, limit: 1 }); // #93
  const [profile, setProfile] = useState({ about: "", changes: false }); // #125
  const [life, setLife] = useState<LifeValues>(() => lifeOf({})); // #154: Their life
  // Character from one line (#45).
  const [ideaDialogOpen, setIdeaDialogOpen] = useState(false);
  const [ideaDraftRequest, setIdeaDraftRequest] = useState<CharacterDraftRequest | null>(null);
  const [ideaDraftName, setIdeaDraftName] = useState("");
  const [draftingFromIdea, setDraftingFromIdea] = useState(false);
  const [ideaDraftError, setIdeaDraftError] = useState<string | null>(null);

  // Seed the form from whichever source applies: editing an existing
  // character, duplicating one, or a blank create. Always runs on
  // characterId change (not just when there's a source to seed from) - the
  // sidebar's "New Character" action is reachable from inside the editor
  // itself, navigating straight from editing one character to
  // /characters/new without a page reload, so a missing else branch here
  // used to leave the previous character's data (and wizard step) sitting
  // in the "new" form instead of a blank one.
  useEffect(() => {
    const source = editCharacter || duplicateFrom || draftFrom;
    setStep(0);
    setIdeaDialogOpen(!source && fromIdea);
    setIdeaDraftRequest(null);
    setIdeaDraftName("");
    setIdeaDraftError(null);
    if (source) {
      setName(editCharacter || !duplicateFrom ? source.name : `${source.name} (Copy)`);
      setDescription(source.description);
      setTags(source.tags || []);
      setPrompt(source.prompt);
      setScenario(source.scenario || "");
      setFirstMes(source.first_mes || "");
      setAlternateGreetings(source.alternateGreetings || []);
      setPostHistoryInstructions(source.postHistoryInstructions || "");
      setContentRating(source.contentRating);
      // A duplicate starts unconfirmed: the copy may be edited into something else.
      setAdultsConfirmed(editCharacter ? Boolean(source.adultsConfirmed) : false);
      setMesExample(source.mes_example || "");
      setRelationship(source.relationship || "");
      setAppearance(source.appearance || "");
      setVisualTags(source.visualTags || "");
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
      setModelOverride(source.modelOverride);
      setLocalImageSettings(source.localImageSettings);
      setImportantDates(source.importantDates || []);
      setSecrets(source.secrets || []);
      setWardrobe(source.wardrobe || []);
      setSchedule(source.schedule);
      setIntimacy(source.intimacy);
      setCurrentOutfitId(source.currentOutfitId);
      setVoice(source.voice);
      setWritingStyle(source.writingStyle);
      setHome(source.home);
      setTextsFirst({ enabled: Boolean(source.textsFirst), limit: source.firstTextLimit || 1 });
      setProfile({ about: source.about || "", changes: Boolean(source.profileChanges) });
      setLife(lifeOf(source));
    } else {
      setName("");
      setDescription("");
      setTags([]);
      setPrompt("");
      setScenario("");
      setFirstMes("");
      setAlternateGreetings([]);
      setPostHistoryInstructions("");
      setContentRating(undefined);
      setAdultsConfirmed(false);
      setMesExample("");
      setRelationship("");
      setAppearance("");
      setVisualTags("");
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
      setModelOverride(undefined);
      setLocalImageSettings(undefined);
      setImportantDates([]);
      setWardrobe([]);
      setSchedule(undefined);
      setIntimacy(undefined);
      setCurrentOutfitId(undefined);
      setVoice(undefined);
      setWritingStyle(undefined);
      setHome(undefined);
      setTextsFirst({ enabled: false, limit: 1 });
      setProfile({ about: "", changes: false });
      setLife(lifeOf({}));
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
  // Once true, stays true - keeps the (lazy-loaded) dialog mounted after its
  // first open so its own open/close transition keeps working, while still
  // not fetching its chunk before it's ever needed.
  const cropDialogEverOpenedRef = useRef(false);
  if (cropDialogOpen) cropDialogEverOpenedRef.current = true;

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

  // Character from one line (#45): one AI call drafts the whole character,
  // which fills the editor's fields for review - nothing is saved here. Goes
  // through the helper model when one is set, like other background work, so
  // a user whose main provider filters mature content can still draft an
  // NSFW character they've confirmed as adult.
  const handleDraftFromIdea = async (request: CharacterDraftRequest, another = false) => {
    setIdeaDraftError(null);
    setDraftingFromIdea(true);
    try {
      const instruction = buildCharacterDraftPrompt(another ? { ...request, avoidName: ideaDraftName } : request);
      const text = request.photo
        ? await dispatch(generateAssistTextWithImage({ instruction, image: request.photo })).unwrap()
        : await dispatch(generateAssistText({ instruction, background: true })).unwrap();
      const draft = parseCharacterDraft(text);
      setName(draft.name);
      setDescription(draft.description);
      setPersonalityTraits(draft.personalityTraits);
      setPrompt(draft.prompt);
      setScenario(draft.scenario);
      setFirstMes(draft.first_mes);
      setAlternateGreetings(draft.alternateGreetings);
      setMesExample(draft.mes_example);
      setRelationship(draft.relationship);
      setAppearance(draft.appearance);
      setVisualTags(draft.visualTags);
      setContentRating(request.contentRating);
      setAdultsConfirmed(request.contentRating === "nsfw" && Boolean(request.adultsConfirmed));
      if (request.artStyle) setArtStyle(request.artStyle);
      setIdeaDraftRequest(request);
      setIdeaDraftName(draft.name);
      setIdeaDialogOpen(false);
    } catch (err: any) {
      if (err instanceof CharacterDraftError) setIdeaDraftError(`${err.message} Try again, or reword the idea.`);
      else setIdeaDraftError(typeof err === "string" ? err : err?.message || "Couldn't draft a character. Check your API key in Settings.");
    } finally {
      setDraftingFromIdea(false);
    }
  };

  const minorIndicators = useMemo(
    () => detectMinorIndicators(characterTextFields({ name, description, prompt, scenario, first_mes: firstMes, alternateGreetings, mes_example: mesExample, appearance, relationship, loreEntries })),
    [name, description, prompt, scenario, firstMes, alternateGreetings, mesExample, appearance, relationship, loreEntries]
  );

  // NSFW must be confirmed 18+ and pass the minor-indicator scan before it
  // can be saved; returns false (after telling the user why) when it can't.
  const checkContentRating = (): boolean => {
    if (contentRating !== "nsfw") return true;
    if (minorIndicators.length > 0) {
      showAlert("Can't save as NSFW", `This character's text suggests someone under 18 (${minorIndicators.map((p) => `"${p}"`).join(", ")}). Change that wording, or set the rating to SFW.`);
      return false;
    }
    if (!adultsConfirmed) {
      showAlert("Confirm 18+", "Confirm that every character in this card is an adult, or set the rating to SFW.");
      return false;
    }
    return true;
  };

  const cleanGreetings = (greetings: string[]): string[] | undefined => {
    const kept = greetings.filter((g) => g.trim());
    return kept.length > 0 ? kept : undefined;
  };

  const handleCreateCharacter = () => {
    if (!name || !prompt) {
      alert("Character name and prompt are required.");
      return;
    }
    if (!checkContentRating()) return;
    dispatch(addCharacter({ name, description, tags, prompt, scenario, first_mes: firstMes, alternateGreetings: cleanGreetings(alternateGreetings), postHistoryInstructions: postHistoryInstructions.trim() || undefined, contentRating, adultsConfirmed: contentRating === "nsfw" && adultsConfirmed ? true : undefined, mes_example: mesExample, relationship, appearance, visualTags: visualTags.trim() || undefined, appearanceImages, artStyle, accent: CHARACTER_SWATCHES[accentIndex], autoSelfie: { enabled: autoSelfieEnabled, frequency: autoSelfieFrequency }, emotionPortraits: { enabled: emotionPortraitsEnabled, images: emotionPortraitImages, customEmotions }, loreEntries, personalityTraits, modelOverride: cleanModelOverride(modelOverride), localImageSettings: cleanLocalImageSettings(localImageSettings), voice: cleanVoice(voice), writingStyle: cleanWritingStyle(writingStyle), home, importantDates: cleanDates(importantDates), secrets: cleanSecrets(secrets), ...cleanWardrobe(wardrobe, currentOutfitId), schedule: cleanSchedule(schedule), intimacy, ...life, firstTextLimit: life.textsFirst && textsFirst.limit > 1 ? textsFirst.limit : undefined, about: profile.about.trim() || undefined }));
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
    if (!checkContentRating()) return;
    // Spread the stored record first: db.put replaces the whole row, so any
    // field this form doesn't own (memory, pinnedMemory, avatar, creatorNotes)
    // was being wiped on every save.
    dispatch(updateCharacter({ ...editCharacter, id: editCharacter.id, name, description, tags, prompt, scenario, first_mes: firstMes, alternateGreetings: cleanGreetings(alternateGreetings), postHistoryInstructions: postHistoryInstructions.trim() || undefined, contentRating, adultsConfirmed: contentRating === "nsfw" && adultsConfirmed ? true : undefined, mes_example: mesExample, relationship, appearance, visualTags: visualTags.trim() || undefined, appearanceImages, artStyle, accent: CHARACTER_SWATCHES[accentIndex], gallery: editCharacter.gallery, autoSelfie: { enabled: autoSelfieEnabled, frequency: autoSelfieFrequency }, emotionPortraits: { enabled: emotionPortraitsEnabled, images: emotionPortraitImages, customEmotions }, loreEntries, personalityTraits, modelOverride: cleanModelOverride(modelOverride), localImageSettings: cleanLocalImageSettings(localImageSettings), voice: cleanVoice(voice), writingStyle: cleanWritingStyle(writingStyle), home, importantDates: cleanDates(importantDates), secrets: cleanSecrets(secrets), ...cleanWardrobe(wardrobe, currentOutfitId), schedule: cleanSchedule(schedule), intimacy, ...life, firstTextLimit: life.textsFirst && textsFirst.limit > 1 ? textsFirst.limit : undefined, about: profile.about.trim() || undefined }));
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
      const parsed = parseCharacterCardText(await file.text());
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

  // Locked look (#34): drafted from the free-text appearance by the AI,
  // then edited by hand; image prompts copy it word for word.
  const [draftingVisualTags, setDraftingVisualTags] = useState(false);
  const [visualTagsError, setVisualTagsError] = useState<string | null>(null);
  const handleDraftVisualTags = async () => {
    if (!appearance.trim()) {
      setVisualTagsError("Write the appearance first, then draft the locked look from it.");
      return;
    }
    setVisualTagsError(null);
    setDraftingVisualTags(true);
    try {
      const text = await dispatch(generateAssistText({ instruction: buildVisualTagsDraftPrompt(name.trim() || "the character", appearance) })).unwrap();
      const tags = cleanVisualTags(text);
      if (tags) setVisualTags(tags);
      else setVisualTagsError("The AI returned nothing. Try again, or write it yourself.");
    } catch (err: any) {
      setVisualTagsError(typeof err === "string" ? err : "Couldn't draft the locked look.");
    } finally {
      setDraftingVisualTags(false);
    }
  };

  // Main reference (#35): the first reference photo is the one providers
  // that take a single image get, so "make main" moves a photo to the front.
  const handleMakeMainReference = (index: number) => {
    setAppearanceImages((prev) => (index <= 0 || index >= prev.length ? prev : [prev[index], ...prev.filter((_, i) => i !== index)]));
  };

  // Reference sheet (#35): neutral front, three-quarter and side portraits
  // from the current look, saved as reference photos. Built from the main
  // reference when there is one, so the sheet shows the same face.
  const [generatingSheetView, setGeneratingSheetView] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const handleGenerateReferenceSheet = async () => {
    if (!name.trim()) {
      setSheetError("Give the character a name first.");
      return;
    }
    setSheetError(null);
    const created: string[] = [];
    try {
      for (const view of REFERENCE_SHEET_VIEWS) {
        setGeneratingSheetView(view.label);
        const result = await dispatch(generateAvatarImage({
          name,
          appearance,
          visualTags,
          appearanceImages: appearanceImages.length > 0 ? appearanceImages.slice(0, 1) : undefined,
          artStyle,
          hint: view.hint,
          localImageSettings: cleanLocalImageSettings(localImageSettings),
        })).unwrap();
        const image = result.images?.[0];
        if (!image) throw new Error("No image was returned.");
        // Saved to the Image Save Directory when one is set, otherwise kept
        // inline (references can be data: URLs too).
        created.push(await savePortraitBlob(await dataUrlToBlob(image), `char_ref_${view.id}`).catch(() => image));
      }
    } catch (err: any) {
      setSheetError(typeof err === "string" ? err : err?.message || "Failed to generate the reference sheet. Check your image provider in Settings.");
    } finally {
      // Keep whatever views were made before a failure.
      if (created.length > 0) setAppearanceImages((prev) => [...prev, ...created]);
      setGeneratingSheetView(null);
    }
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
      const result = await dispatch(generateAvatarImage({ name, appearance, visualTags, appearanceImages: referenceImages, emotion, artStyle, hint: emotionHint.trim() || undefined, localImageSettings: cleanLocalImageSettings(localImageSettings) })).unwrap();
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
          const result = await dispatch(generateAvatarImage({ name, appearance, visualTags, appearanceImages: referenceImages, emotion: emo, artStyle, hint: emotionHint.trim() || undefined, localImageSettings: cleanLocalImageSettings(localImageSettings) })).unwrap();
          const dataUrl = result.images?.[0];
          if (!dataUrl) continue;
          // Same chroma-key strip as the single-emotion path above, just
          // ahead of the auto-crop instead of the interactive dialog.
          // eslint-disable-next-line no-await-in-loop
          const keyedBlob = await removeChromaKeyBackground(dataUrl);
          let blob: Blob = keyedBlob;
          if (portraitResizeEnabled) {
            // eslint-disable-next-line no-await-in-loop
            const keyedDataUrl = await blobToDataUrl(keyedBlob);
            // eslint-disable-next-line no-await-in-loop
            blob = await autoCoverCropToBlob(keyedDataUrl, portraitSaveSize.width, portraitSaveSize.height);
          }
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

  // Facts' groups are keyed by their text, so they follow a fact through
  // edits and go when it does.
  const withCategories = (memory: string[], renamed?: { from: string; to: string }) => {
    const old = editCharacter?.memoryCategories || {};
    const next: NonNullable<Character["memoryCategories"]> = {};
    for (const fact of memory) {
      const category = renamed && fact === renamed.to ? old[renamed.from] ?? old[fact] : old[fact];
      if (category) next[fact] = category;
    }
    return Object.keys(next).length > 0 ? next : undefined;
  };

  const handleRemoveMemoryFact = (index: number) => {
    if (!editCharacter) return;
    const newMemory = (editCharacter.memory || []).filter((_, i) => i !== index);
    dispatch(updateCharacter({ ...editCharacter, memory: newMemory, memoryCategories: withCategories(newMemory) }));
  };

  const cycleFactCategory = (index: number) => {
    if (!editCharacter) return;
    const fact = (editCharacter.memory || [])[index];
    if (fact == null) return;
    const next = nextMemoryCategory(editCharacter.memoryCategories?.[fact]);
    const categories = { ...(editCharacter.memoryCategories || {}) };
    if (next) categories[fact] = next;
    else delete categories[fact];
    dispatch(updateCharacter({ ...editCharacter, memoryCategories: Object.keys(categories).length > 0 ? categories : undefined }));
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
    const renamed = trimmed ? { from: memory[editingFactIndex], to: trimmed } : undefined;
    dispatch(updateCharacter({ ...editCharacter, memory: newMemory, memoryCategories: withCategories(newMemory, renamed) }));
    setEditingFactIndex(null);
    setFactDraft("");
  };

  const commitNewFact = () => {
    const trimmed = factDraft.trim();
    if (trimmed && editCharacter) {
      const withNewFact = [...(editCharacter.memory || []), trimmed];
      const capped = withNewFact.length > MAX_MEMORY_ENTRIES ? withNewFact.slice(withNewFact.length - MAX_MEMORY_ENTRIES) : withNewFact;
      dispatch(updateCharacter({ ...editCharacter, memory: capped, memoryCategories: withCategories(capped) }));
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
    if (i === 2 && !prompt.trim()) return "Personality / instructions are required.";
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

  // #154: the steps as on the canvas, with what each holds.
  const stepInfo: Record<number, { title: string; sub: string; intro: string }> = {
    0: { title: "Who they are", sub: "Name, tagline, About line, avatar", intro: "The basics: who they are to you, and how they show up in your chat list." },
    1: { title: "Look", sub: "Appearance, art style, wardrobe", intro: "What they look like, for every picture of them." },
    2: { title: "Personality", sub: "Traits, prompt, how they write", intro: "How they think, talk and write." },
    3: { title: "World and story", sub: "Scenario, greeting, home, routine", intro: "Where they live, their days, and how your story starts." },
    4: { title: "Their life", sub: "Presets and behaviour", intro: "" },
    5: { title: "Test and finish", sub: "Test chat, memory, review", intro: "Try them out before you save." },
    [ADVANCED_STEP]: { title: "Advanced", sub: "Model, local images, intimacy, lorebook", intro: "Model override, local image settings, the intimacy profile and the lorebook." },
  };
  const current = stepInfo[step];
  const lifeCalls = backgroundCallsPerDay(life);
  const presetName = LIFE_PRESETS.find((p) => p.id === presetOf(life))?.name || "Custom";
  const save = () => {
    // Non-linear (#154): any step can be open when you save, so the required
    // fields are checked here and you're taken to the first one missing.
    for (const s of [0, 2]) {
      const error = stepError(s);
      if (error) {
        setBlockedMessage(error);
        setStep(s);
        return;
      }
    }
    if (editCharacter) handleSaveEdit();
    else handleCreateCharacter();
  };

  return (
    <div className="w-full h-dvh flex flex-col">
      <Header
        title={editCharacter ? `Edit character · ${editCharacter.name}` : "New character"}
        subtitle={step === ADVANCED_STEP ? "Advanced" : `Step ${step + 1} of ${STEPS.length} · ${current.title}`}
        onBack={() => navigate("/characters")}
      />
      <div className="flex min-h-0 flex-1">
        {/* The steps, in any order (#154). */}
        <nav aria-label="Editor sections" className="hidden w-[264px] flex-none flex-col gap-0.5 overflow-y-auto border-r border-border bg-surface px-3 py-5 lg:flex">
          {STEPS.map((label, i) => {
            const done = i !== step && !stepError(i) && i < step;
            return (
              <button key={label} type="button" onClick={() => goToStep(i)} aria-current={i === step ? "step" : undefined}
                className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-left", i === step ? "bg-raised" : "hover:bg-raised/60")}>
                <span className={cn("grid h-[26px] w-[26px] flex-none place-items-center rounded-full text-[12px] font-bold", i === step ? "bg-primary text-primary-foreground" : done ? "bg-primary/15 text-primary-text" : "bg-sunken text-muted-foreground")}>
                  {done ? <FaCheck size={10} /> : i + 1}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-[13.5px] font-bold text-foreground">{label}</span>
                  <span className="truncate text-[12px] text-subtle">{stepInfo[i].sub}</span>
                </span>
              </button>
            );
          })}
          <span className="mx-2 my-3.5 h-px bg-border" />
          <button type="button" onClick={() => goToStep(ADVANCED_STEP)} aria-current={step === ADVANCED_STEP ? "step" : undefined}
            className={cn("flex items-center gap-2 rounded-xl px-3 py-2 text-left text-[13.5px] font-bold", step === ADVANCED_STEP ? "bg-raised text-foreground" : "text-muted-foreground hover:bg-raised/60")}>
            <FaSlidersH size={12} /> Advanced
          </button>
          <p className="pl-9 pr-3 text-[12px] text-subtle">{stepInfo[ADVANCED_STEP].sub}</p>
        </nav>

        <div data-slot="editor-form" className="min-w-0 flex-1 overflow-y-auto px-4 py-5 md:px-8 lg:px-10 lg:py-7">
          <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6">
            {/* Phones and tablets: the steps as a strip, Advanced beside it. */}
            <div className="flex flex-col gap-2 lg:hidden">
              {step === ADVANCED_STEP ? (
                <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => goToStep(STEPS.length - 1)}><FaArrowLeft size={11} /> Back to the steps</Button>
              ) : (
                <>
                  <WizardSteps steps={STEPS} current={step} className="mb-0">
                    {STEPS.map((label, i) => (
                      <React.Fragment key={label}>
                        <button type="button" onClick={() => goToStep(i)}
                          className={cn("flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors", i === step ? "bg-primary text-primary-foreground" : "text-subtle hover:text-foreground")}>
                          <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[10px]", i === step ? "bg-primary-foreground/20" : "bg-muted")}>{i + 1}</span>
                          {label}
                        </button>
                        {i < STEPS.length - 1 && <div className="h-px min-w-[12px] flex-1 bg-border" />}
                      </React.Fragment>
                    ))}
                  </WizardSteps>
                  <Button type="button" variant="ghost" size="sm" className="self-end" onClick={() => goToStep(ADVANCED_STEP)}><FaSlidersH size={11} /> Advanced</Button>
                </>
              )}
            </div>

            <div className="flex flex-col gap-1">
              {step !== ADVANCED_STEP && <span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-subtle">Step {step + 1} of {STEPS.length}</span>}
              <h2 className="text-[26px] font-bold tracking-tight text-foreground">{current.title}</h2>
              {current.intro && <p className="text-[13.5px] text-muted-foreground">{current.intro}</p>}
            </div>

            {blockedMessage && (
              <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">{blockedMessage}</div>
            )}

            <Suspense fallback={<StepLoader />}>
              {step === 0 && (
                <>
                  {!editCharacter && (
              <IdeaDraftSection
                lastRequest={ideaDraftRequest}
                drafting={draftingFromIdea}
                error={ideaDraftError}
                dialogOpen={ideaDialogOpen}
                onDialogOpenChange={(open) => { setIdeaDraftError(null); setIdeaDialogOpen(open); }}
                onDraft={(request) => handleDraftFromIdea(request)}
                onTryAnother={() => ideaDraftRequest && handleDraftFromIdea(ideaDraftRequest, true)}
                contentRating={contentRating}
                adultsConfirmed={adultsConfirmed}
                artStyle={artStyle}
                name={name}
                appearance={appearance}
                visualTags={visualTags}
                localImageSettings={cleanLocalImageSettings(localImageSettings)}
                onPortraitGenerated={handleAvatarGenerated}
              />
            )}
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

          </Card>
                  <IdentityStep
                    part="who"
                  editCharacter={editCharacter}
                  surprising={surprising}
                  handleSurpriseMe={handleSurpriseMe}
                  surpriseHint={surpriseHint}
                  setSurpriseHint={setSurpriseHint}
                  assistError={assistError}
                  name={name}
                  setName={setName}
                  relationship={relationship}
                  setRelationship={setRelationship}
                  description={description}
                  setDescription={setDescription}
                  tags={tags}
                  setTags={setTags}
                  contentRating={contentRating}
                  adultsConfirmed={adultsConfirmed}
                  minorIndicators={minorIndicators}
                  onContentRatingChange={(rating, confirmed) => { setContentRating(rating); setAdultsConfirmed(confirmed); }}
                  appearance={appearance}
                  setAppearance={setAppearance}
                  visualTags={visualTags}
                  setVisualTags={setVisualTags}
                  onDraftVisualTags={handleDraftVisualTags}
                  draftingVisualTags={draftingVisualTags}
                  visualTagsError={visualTagsError}
                  onMakeMainReference={handleMakeMainReference}
                  onGenerateReferenceSheet={handleGenerateReferenceSheet}
                  generatingSheetView={generatingSheetView}
                  sheetError={sheetError}
                  artStyle={artStyle}
                  setArtStyle={setArtStyle}
                  appearanceImages={appearanceImages}
                  imageInputRef={imageInputRef}
                  handleImageUpload={handleImageUpload}
                  removeAppearanceImage={removeAppearanceImage}
                  neumorphic={neumorphic}
                  emotionPortraitsEnabled={emotionPortraitsEnabled}
                  setEmotionPortraitsEnabled={setEmotionPortraitsEnabled}
                  emotionHint={emotionHint}
                  setEmotionHint={setEmotionHint}
                  customEmotions={customEmotions}
                  emotionPortraitImages={emotionPortraitImages}
                  generatingEmotion={generatingEmotion}
                  generatingAllEmotions={generatingAllEmotions}
                  handleGenerateEmotion={handleGenerateEmotion}
                  handleTriggerEmotionUpload={handleTriggerEmotionUpload}
                  handleRemoveCustomEmotion={handleRemoveCustomEmotion}
                  newCustomEmotion={newCustomEmotion}
                  setNewCustomEmotion={setNewCustomEmotion}
                  handleAddCustomEmotion={handleAddCustomEmotion}
                  emotionUploadInputRef={emotionUploadInputRef}
                  handleEmotionFileSelected={handleEmotionFileSelected}
                  handleGenerateAllEmotions={handleGenerateAllEmotions}
                  emotionGenError={emotionGenError}
                />
                  <Card className="p-6">
                    <ProfileSection name={name} about={profile.about} changes={Boolean(life.profileChanges)} onChange={(v) => { setProfile(v); setLife((l) => ({ ...l, profileChanges: v.changes || undefined })); }} />
                  </Card>
                </>
              )}

              {step === 1 && (
                <>
                  <IdentityStep
                    part="look"
                  editCharacter={editCharacter}
                  surprising={surprising}
                  handleSurpriseMe={handleSurpriseMe}
                  surpriseHint={surpriseHint}
                  setSurpriseHint={setSurpriseHint}
                  assistError={assistError}
                  name={name}
                  setName={setName}
                  relationship={relationship}
                  setRelationship={setRelationship}
                  description={description}
                  setDescription={setDescription}
                  tags={tags}
                  setTags={setTags}
                  contentRating={contentRating}
                  adultsConfirmed={adultsConfirmed}
                  minorIndicators={minorIndicators}
                  onContentRatingChange={(rating, confirmed) => { setContentRating(rating); setAdultsConfirmed(confirmed); }}
                  appearance={appearance}
                  setAppearance={setAppearance}
                  visualTags={visualTags}
                  setVisualTags={setVisualTags}
                  onDraftVisualTags={handleDraftVisualTags}
                  draftingVisualTags={draftingVisualTags}
                  visualTagsError={visualTagsError}
                  onMakeMainReference={handleMakeMainReference}
                  onGenerateReferenceSheet={handleGenerateReferenceSheet}
                  generatingSheetView={generatingSheetView}
                  sheetError={sheetError}
                  artStyle={artStyle}
                  setArtStyle={setArtStyle}
                  appearanceImages={appearanceImages}
                  imageInputRef={imageInputRef}
                  handleImageUpload={handleImageUpload}
                  removeAppearanceImage={removeAppearanceImage}
                  neumorphic={neumorphic}
                  emotionPortraitsEnabled={emotionPortraitsEnabled}
                  setEmotionPortraitsEnabled={setEmotionPortraitsEnabled}
                  emotionHint={emotionHint}
                  setEmotionHint={setEmotionHint}
                  customEmotions={customEmotions}
                  emotionPortraitImages={emotionPortraitImages}
                  generatingEmotion={generatingEmotion}
                  generatingAllEmotions={generatingAllEmotions}
                  handleGenerateEmotion={handleGenerateEmotion}
                  handleTriggerEmotionUpload={handleTriggerEmotionUpload}
                  handleRemoveCustomEmotion={handleRemoveCustomEmotion}
                  newCustomEmotion={newCustomEmotion}
                  setNewCustomEmotion={setNewCustomEmotion}
                  handleAddCustomEmotion={handleAddCustomEmotion}
                  emotionUploadInputRef={emotionUploadInputRef}
                  handleEmotionFileSelected={handleEmotionFileSelected}
                  handleGenerateAllEmotions={handleGenerateAllEmotions}
                  emotionGenError={emotionGenError}
                />
          <Card className="p-6">
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
          </Card>
                  <Card className="p-6">
                    <WardrobeSection outfits={wardrobe} currentId={currentOutfitId} onChange={(outfits, id) => { setWardrobe(outfits); setCurrentOutfitId(id); }} />
                  </Card>
                </>
              )}

              {step === 2 && (
                <>
                <PersonalityStep
                  promptTokens={promptTokens}
                  personalityTraits={personalityTraits}
                  setPersonalityTraits={setPersonalityTraits}
                  prompt={prompt}
                  setPrompt={setPrompt}
                  handleExpandIdea={handleExpandIdea}
                  expanding={expanding}
                  assistError={assistError}
                />
                  <ExampleDialoguesStep
                    name={name}
                    mesExample={mesExample}
                    setMesExample={setMesExample}
                    handleGenerateExampleDialogue={handleGenerateExampleDialogue}
                    generatingExample={generatingExample}
                    assistError={assistError}
                  />
                  <WritingStyleSection name={name} value={writingStyle} onChange={setWritingStyle} />
                  <Card className="p-6">
                    <VoiceSection name={name} value={voice} onChange={setVoice} />
                  </Card>
                </>
              )}

              {step === 3 && (
                <>
                <ScenarioGreetingStep
                  scenario={scenario}
                  setScenario={setScenario}
                  firstMes={firstMes}
                  setFirstMes={setFirstMes}
                  alternateGreetings={alternateGreetings}
                  setAlternateGreetings={setAlternateGreetings}
                  postHistoryInstructions={postHistoryInstructions}
                  setPostHistoryInstructions={setPostHistoryInstructions}
                  handleGenerateGreeting={handleGenerateGreeting}
                  generatingGreeting={generatingGreeting}
                  assistError={assistError}
                />
                  <Card className="p-6">
                    <HomeSection value={home} onChange={setHome} />
                    <div className="mt-4 border-t border-border pt-4">
                      <ScheduleSection value={schedule} onChange={setSchedule} />
                    </div>
                    <div className="mt-4 border-t border-border pt-4">
                      <ImportantDatesSection value={importantDates} onChange={setImportantDates} memory={editCharacter?.memory} />
                    </div>
                    <div className="mt-4 border-t border-border pt-4">
                      <SecretsSection value={secrets} onChange={setSecrets} />
                    </div>
                  </Card>
                </>
              )}

              {step === 4 && (
                <>
                  <LifeStep name={name} values={life} onChange={setLife} />
                  <Card className="p-6">
                    <TextsFirstSection name={name} enabled={Boolean(life.textsFirst)} limit={textsFirst.limit} onChange={(v) => { setTextsFirst(v); setLife((l) => ({ ...l, textsFirst: v.enabled || undefined })); }} />
                  </Card>
                </>
              )}

              {step === 5 && (
                <TestFinalizeStep
                  name={name}
                  description={description}
                  prompt={prompt}
                  scenario={scenario}
                  firstMes={firstMes}
                  mesExample={mesExample}
                  postHistoryInstructions={postHistoryInstructions}
                  contentRating={contentRating}
                  adultsConfirmed={adultsConfirmed}
                  relationship={relationship}
                  appearance={appearance}
                  appearanceImages={appearanceImages}
                  accent={accent}
                  tags={tags}
                  loreEntries={loreEntries}
                  personalityTraits={personalityTraits}
                  editCharacter={editCharacter}
                  editingFactIndex={editingFactIndex}
                  factDraft={factDraft}
                  setFactDraft={setFactDraft}
                  startEditFact={startEditFact}
                  commitFactEdit={commitFactEdit}
                  setEditingFactIndex={setEditingFactIndex}
                  handleRemoveMemoryFact={handleRemoveMemoryFact}
                  cycleFactCategory={cycleFactCategory}
                  addingFact={addingFact}
                  setAddingFact={setAddingFact}
                  commitNewFact={commitNewFact}
                />
              )}

              {step === ADVANCED_STEP && (
                <>
                  <Card className="p-6">
                    <ModelOverrideSection value={modelOverride} onChange={setModelOverride} />
                    <div className="mt-4 border-t border-border pt-4">
                      <LocalImageSettingsSection value={localImageSettings} onChange={setLocalImageSettings} />
                    </div>
                    <div className="mt-4 border-t border-border pt-4">
                      <IntimacySection value={intimacy} onChange={setIntimacy} />
                    </div>
                  </Card>
                <LorebookStep
                  loreEntries={loreEntries}
                  handleUpdateLoreEntry={handleUpdateLoreEntry}
                  handleRemoveLoreEntry={handleRemoveLoreEntry}
                  handleExpandLoreEntry={handleExpandLoreEntry}
                  expandingLoreId={expandingLoreId}
                  handleAddLoreEntry={handleAddLoreEntry}
                  assistError={assistError}
                  neumorphic={neumorphic}
                />
                </>
              )}
            </Suspense>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json"
              style={{ display: "none" }}
            />
          </div>
        </div>

        {/* Live preview (#154): how they'll look in your chat list. */}
        <aside aria-label="Live preview" className="hidden w-[320px] flex-none flex-col gap-4 overflow-y-auto border-l border-border bg-surface px-5 py-6 xl:flex">
          <span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-subtle">Live preview</span>
          <div className="flex flex-col items-center gap-1.5 rounded-card bg-card px-4 py-5 text-center ring-1 ring-inset ring-border">
            {appearanceImages[0] ? (
              <DisplayImage srcContext={appearanceImages[0]} alt="" className="h-[72px] w-[72px] rounded-full object-cover" />
            ) : (
              <CharacterAvatar name={name || "?"} accent={accent} size={72} />
            )}
            <span className="mt-1.5 text-[17px] font-bold text-foreground">{name || "Unnamed"}</span>
            {(profile.about || description) && <span className="line-clamp-2 text-[12.5px] text-muted-foreground">{profile.about || description}</span>}
            <span className="mt-1 rounded-md bg-raised px-2 py-0.5 text-[11.5px] font-semibold text-muted-foreground">{presetName}{relationship ? ` · ${relationship}` : ""}</span>
          </div>
          {firstMes.trim() && (
            <div className="rounded-card bg-background px-3 py-3">
              <div className="max-w-full rounded-bubble rounded-tl-[5px] bg-bubble-in px-3 py-2 font-serif text-[14px] leading-[21px] text-bubble-in-text line-clamp-6">{firstMes}</div>
            </div>
          )}
          {lifeCalls > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl bg-sunken p-3">
              <CostMarker />
              <p className="text-[12px] text-muted-foreground">About {lifeCalls} background calls a day on your key. The life dial in Settings scales it; the activity log shows what ran.</p>
            </div>
          )}
        </aside>
      </div>

      {/* Step navigation, docked under the scrolling form rather than sticky
          inside it - a sticky bar floated over the form and covered whatever
          sat at the bottom of the screen on phones (U12). */}
      <div className="flex-none border-t border-border/40 bg-background px-4 md:px-8 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="w-full max-w-[1180px] mx-auto flex gap-3 justify-end">
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
              {step < STEPS.length - 1 && step !== ADVANCED_STEP ? (
                <Button
                  onClick={goNext}
                  variant="default"
                  className="h-auto px-5 py-2.5 font-semibold"
                >
                  Next <FaArrowRight size={12} />
                </Button>
              ) : (
                <Button
                  onClick={save}
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
      </div>

      {/* Avatar crop dialog — rendered as a portal overlay */}
      {cropDialogEverOpenedRef.current && (
        <Suspense fallback={null}>
          <AvatarCropDialog
            open={cropDialogOpen}
            onClose={() => setCropDialogOpen(false)}
            imageSrc={cropImageSrc}
            onCropped={handleCropComplete}
            exportSize={portraitSaveSize}
          />
        </Suspense>
      )}
    </div>
  );
};

export default CharacterEditorPage;
