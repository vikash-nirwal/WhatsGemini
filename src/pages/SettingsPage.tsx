import React, { useState, useEffect, useCallback, useMemo, useRef, useContext } from "react";
import { CHAT_PROVIDER_META } from "../features/ai/providers/registry";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { CostMarker } from "src/components/molecules/SettingRow";
import { SegmentedControl } from "src/components/molecules/SegmentedControl";
import { LIFE_HINT, LIFE_LEVELS, LifeLevel, LS_LIFE_DIAL, loadLifeDial, restoreLifeDial, saveLifeDial } from "../features/life/lifeDial";
import { useMediaQuery } from "src/hooks/useMediaQuery";
import { useCurrentWorld } from "src/hooks/useWorld";
import { useNavigate, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "../store/store";
import { useAppDispatch } from "../store/hooks";
import {
  addPersona, updatePersona, deletePersona, setActivePersonaId, setPersonas,
  setSelectedModel, setImageModel, setVideoModel, setImageGenPrompt,
  setSdWebuiApiUrl, setSdWebuiBatchSize, setSdWebuiRefMode,
  setSdWebuiDenoising, setSdWebuiControlnetModel, setSdWebuiModels,
  setSdWebuiModel, setMaxOutputTokens, setReplyLengthLimit, setCompressThreshold, setMaxChatLength,
  setTemperature, setSamplers, setRoleplayStyle, setHelperModel, setPrivacy, setSafetySettings, setFontSize, setImageResolution, setGeminiImageSize, setPortraitSaveSize, setPortraitResizeEnabled,
  setChatProvider, setImageProvider, setOllamaBaseUrl,
  setEmotionPanelEnabled, setEmotionPopupEnabled, setEmotionPopupDuration, setAlwaysShowInitials, setTextingMode, setRecapAfterDays,
} from "../features/settingsSlice";
import { FaUser, FaMicrochip, FaImage, FaComments, FaShieldAlt, FaDatabase, FaPalette, FaLock, FaWallet, FaChevronRight, FaGlobe } from "react-icons/fa";
import Header from "src/components/organisms/Header";
import { toast } from "sonner";
import { useColorTheme } from "../hooks/useColorTheme";
import { AuthContext } from "../contexts/AuthContext";
import UserProfileSettings from "src/components/organisms/UserProfileSettings";
import TextModelSettings from "src/components/organisms/TextModelSettings";
import ImageGenerationSettings from "src/components/organisms/ImageGenerationSettings";
import AppearanceSettings from "src/components/organisms/AppearanceSettings";
import { getAPIKey, getProviderApiKey, saveProviderApiKey, getWanBaseUrl, saveWanBaseUrl } from "../features/ai/utils/settings";
import { CHAT_PROVIDERS, IMAGE_PROVIDERS } from "../features/ai/providers/registry";
import { useModal } from "../contexts/ModalContext";
import { fetchChats } from "../features/chatSlice";
import { fetchCharacters } from "../features/characterSlice";
import { fetchWorlds } from "../features/worldSlice";
import {
  // DEFAULT_CHAT_LENGTH,
  // DEFAULT_OUTPUT_TOKENS,
  // DEFAULT_SAFETY_SETTINGS,
  // DEFAULT_TEMPRATURE,
  LS_AI_MODEL,
  LS_INITIAL_MESSAGES,
  LS_MAX_CHAT_LENGTH,
  LS_MAX_OUTPUT_TOKENS,
  LS_REPLY_LENGTH_LIMIT,
  LS_SAFETY_SETTINGS,
  LS_TEMPRATURE,
  LS_SAMPLERS,
  LS_ROLEPLAY_STYLE,
  DEFAULT_ROLEPLAY_STYLE,
  LS_FONT_SIZE,
  LS_USER_PROFILE,
  LS_USER_PERSONAS,
  LS_ACTIVE_PERSONA_ID,
  LS_IMAGE_RESOLUTION,
  LS_GEMINI_IMAGE_SIZE,
  LS_PORTRAIT_SAVE_SIZE,
  LS_PORTRAIT_RESIZE_ENABLED,
  LS_EMOTION_PANEL_ENABLED,
  LS_ALWAYS_SHOW_INITIALS,
  LS_TEXTING_MODE,
  LS_RECAP_AFTER_DAYS,
  LS_EMOTION_POPUP_ENABLED,
  LS_EMOTION_POPUP_DURATION,
  // IMAGE_RESOLUTIONS,
  // DEFAULT_IMAGE_RESOLUTION,
  LS_IMAGE_MODEL,
  // DEFAULT_IMAGE_MODEL,
  // LS_IMAGE_GEN_PROMPT,
  // DEFAULT_IMAGE_GEN_PROMPT,
  // LS_USE_SD_WEBUI,
  // LS_SD_WEBUI_API_URL,
  // DEFAULT_SD_WEBUI_API_URL,
  // LS_SD_WEBUI_BATCH_SIZE,
  // DEFAULT_SD_WEBUI_BATCH_SIZE,
  // LS_SD_WEBUI_REF_MODE,
  // DEFAULT_SD_WEBUI_REF_MODE,
  // LS_SD_WEBUI_DENOISING,
  // DEFAULT_SD_WEBUI_DENOISING,
  // LS_SD_WEBUI_CONTROLNET_MODEL,
  // DEFAULT_SD_WEBUI_CONTROLNET_MODEL,
  // LS_SD_WEBUI_MODELS,
  LS_SD_WEBUI_MODEL,
  // DEFAULT_SD_WEBUI_MODEL,
  models,
  imageModels,
  LS_COMPRESS_THRESHOLD,
  // DEFAULT_COMPRESS_THRESHOLD,
  LS_LAST_BACKUP_AT,
  LS_SPENDING_LEDGER,
  LS_SPENDING_BUDGET,
  PROVIDER_CHAT_MODELS,
  PROVIDER_IMAGE_MODELS,
  PROVIDER_VIDEO_MODELS,
  LS_WAN_REFERENCE_MODEL,
  DEFAULT_WAN_REFERENCE_MODEL,
  WAN_REFERENCE_MODELS,
} from "../utils/constants";
import { FAL_IMAGE_MODEL_OPTIONS } from "../features/ai/providers/falImageAdapter";
import { AISafetySettings, UserProfile } from "../types";
import { dbService } from "../services/dbService";
import ChatInterfaceSettings from "src/components/organisms/ChatInterfaceSettings";
import SafetySettings from "src/components/organisms/SafetySettings";
import DataBackupSettings from "src/components/organisms/DataBackupSettings";
import PrivacySettings from "src/components/organisms/PrivacySettings";
import LifeSettings from "src/components/organisms/LifeSettings";
import SpendingSettings from "src/components/organisms/SpendingSettings";
import { getSpendingSnapshot, importLedger, setBudget } from "../features/spending/spending";
import { formatRelativeTime } from "../utils/formatRelativeTime";
import { cn } from "../utils/cn";

const SECTION_IDS = ["profile", "text", "image", "chat", "appearance", "privacy", "safety", "spending", "data"] as const;

const SettingsPage = () => {
  const navigate = useNavigate();
  const { section } = useParams<{ section: string }>();
  const { showConfirm } = useModal();
  const { colorTheme, setColorTheme, accentPalette, setAccentPalette, is } = useColorTheme();
  const terminal = is("terminal");
  const { logout } = useContext(AuthContext);
  const [initialMessagesKey, setInitialMessagesKey] = useState(0);

  const [modelList, setModelList] = useState<{value: string, label: string}[]>(() => {
    const list = models.map((m: string) => ({ value: m, label: m }));
    const stored = localStorage.getItem(LS_AI_MODEL);
    if (stored && !models.includes(stored)) {
      list.push({ value: stored, label: stored });
    }
    return list;
  });
  
  const [imageModelList, setImageModelList] = useState<{value: string, label: string}[]>(() => {
    const list = imageModels.map((m: string) => ({ value: m, label: m }));
    const stored = localStorage.getItem(LS_IMAGE_MODEL);
    if (stored && !list.find(m => m.value === stored)) {
      list.push({ value: stored, label: stored });
    }
    return list;
  });

  useEffect(() => {
    const fetchModels = async () => {
      const apiKey = await getAPIKey();
      if (!apiKey) return;

      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );
        if (!response.ok) throw new Error("Failed to fetch models");
        const data = await response.json();
        
        const seenModelValues = new Set<string>();
        const validModels = data.models
          .filter((model: any) =>
            model.supportedGenerationMethods &&
            model.supportedGenerationMethods.includes("generateContent")
          )
          .map((model: any) => ({
            value: model.name.replace("models/", ""),
            label: model.displayName || model.name.replace("models/", "")
          }))
          // The API can list the same model under more than one resource name
          // (e.g. a "-preview" alias alongside the canonical one) that both
          // simplify to the same value once "models/" is stripped - dedupe so
          // <option key={value}> doesn't collide.
          .filter((model: { value: string }) => {
            if (seenModelValues.has(model.value)) return false;
            seenModelValues.add(model.value);
            return true;
          });

        if (validModels.length > 0) {
          setModelList(validModels);
          // Every current model ID starts with "gemini-2" or "gemini-3", so that alone
          // no longer distinguishes image-capable models from text-only ones - match
          // against the known image-model allowlist instead.
          const validImageModels = validModels.filter((m: {value: string}) => imageModels.includes(m.value));
          if (validImageModels.length > 0) {
            setImageModelList(validImageModels);
          }
        }
      } catch (error) {
        console.error("Error fetching models:", error);
      }
    };

    fetchModels();
  }, []);

  // Live model lists for the OpenAI-wire-format providers (DeepSeek, OpenAI,
  // Qwen, Kimi) whose adapters implement listModels() - same idea as Gemini's
  // fetch above, just keyed by provider since more than one of these can be
  // fetched (and cached) across a session. Ollama is excluded: it already has
  // its own dedicated free-text + "Fetch installed models" UI below.
  const [providerModelLists, setProviderModelLists] = useState<Record<string, {value: string, label: string}[]>>({});
  // Returns a result instead of just mutating state, so a manual "Fetch
  // available models" click can toast success/failure - the auto-fetch on
  // provider switch below calls this the same way but ignores the result,
  // staying silent like Gemini's own background fetch.
  const fetchProviderModels = useCallback(async (providerId: string): Promise<{ ok: boolean; count: number; message?: string }> => {
    const adapter = CHAT_PROVIDERS[providerId];
    if (!adapter?.listModels || providerId === "ollama") return { ok: false, count: 0 };
    try {
      const apiKey = await getProviderApiKey(providerId);
      if (CHAT_PROVIDERS[providerId].capabilities.requiresApiKey && !apiKey) {
        return { ok: false, count: 0, message: "Add an API key first." };
      }
      const list = await adapter.listModels({ apiKey });
      if (list.length > 0) {
        setProviderModelLists((prev) => ({ ...prev, [providerId]: list }));
      }
      return { ok: true, count: list.length };
    } catch (error: any) {
      console.error(`Error fetching ${providerId} models:`, error);
      return { ok: false, count: 0, message: error?.message || "Failed to fetch models." };
    }
  }, []);

  // Same idea as providerModelLists/fetchProviderModels above, but for image
  // providers whose adapters implement listModels() (currently OpenAI - GLM's
  // /models catalog turns out to be chat-only, and Wan has no discovery
  // endpoint at all; Gemini's image list is already live-fetched separately,
  // see fetchModels() below).
  const [imageProviderModelLists, setImageProviderModelLists] = useState<Record<string, {value: string, label: string}[]>>({});
  const fetchImageProviderModels = useCallback(async (providerId: string): Promise<{ ok: boolean; count: number; message?: string }> => {
    const adapter = IMAGE_PROVIDERS[providerId];
    if (!adapter?.listModels) return { ok: false, count: 0 };
    try {
      const apiKey = await getProviderApiKey(providerId);
      if (adapter.capabilities.requiresApiKey && !apiKey) {
        return { ok: false, count: 0, message: "Add an API key first." };
      }
      const list = await adapter.listModels({ apiKey });
      if (list.length > 0) {
        setImageProviderModelLists((prev) => ({ ...prev, [providerId]: list }));
      }
      return { ok: true, count: list.length };
    } catch (error: any) {
      console.error(`Error fetching ${providerId} image models:`, error);
      return { ok: false, count: 0, message: error?.message || "Failed to fetch models." };
    }
  }, []);

  const fetchSdModels = async () => {
    try {
      const response = await fetch(`${sdWebuiApiUrl.replace(/\/$/, '')}/sdapi/v1/sd-models`);
      if (!response.ok) throw new Error("Failed to fetch SD models");
      const data = await response.json();
      const mappedModels = data.map((m: any) => ({ title: m.title, model_name: m.model_name }));
      dispatch(setSdWebuiModels(mappedModels));
      
      // Select the first one if current is not in the list or empty
      if (mappedModels.length > 0) {
        if (!sdWebuiModel || !mappedModels.find((m: any) => m.title === sdWebuiModel)) {
           dispatch(setSdWebuiModel(mappedModels[0].title));
        }
      }
      
      toast.success("Successfully fetched SD models");
    } catch (e: any) {
      console.error(e);
      toast.error("Failed to fetch SD models: " + e.message);
    }
  };

  const dispatch = useAppDispatch();
  const settings = useSelector((state: RootState) => state.settings);

  const {
    personas, activePersonaId, chatProvider, imageProvider, ollamaBaseUrl, selectedModel, imageModel, videoModel,
    imageGenPrompt, sdWebuiApiUrl,
    sdWebuiBatchSize, sdWebuiRefMode, sdWebuiDenoising, sdWebuiControlnetModel, sdWebuiModels,
    sdWebuiModel, maxOutputTokens, replyLengthLimit, compressThreshold, maxChatLength, temperature, samplers, roleplayStyle, helperProvider, helperModel, privacy,
    safetySettings, fontSize, imageResolution, geminiImageSize, portraitSaveSize, portraitResizeEnabled,
    emotionPanelEnabled, emotionPopupEnabled, emotionPopupDuration, alwaysShowInitials, textingMode, recapAfterDays,
  } = settings;

  const chatProviderCapabilities = CHAT_PROVIDERS[chatProvider]?.capabilities || CHAT_PROVIDERS.gemini.capabilities;

  // The chat provider's key, loaded (and re-loaded on provider switch) via the
  // same encrypted-at-rest per-provider storage the adapters read from.
  const [chatApiKey, setChatApiKeyState] = useState("");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const key = await getProviderApiKey(chatProvider);
      if (!cancelled) setChatApiKeyState(key || "");
    })();
    return () => { cancelled = true; };
  }, [chatProvider]);

  const handleSetChatApiKey = useCallback((key: string) => {
    setChatApiKeyState(key);
    saveProviderApiKey(chatProvider, key);
  }, [chatProvider]);

  useEffect(() => {
    fetchProviderModels(chatProvider);
  }, [chatProvider, fetchProviderModels]);

  const handleFetchChatModelsClick = useCallback(async () => {
    const result = await fetchProviderModels(chatProvider);
    if (result.ok) {
      toast.success(`Fetched ${result.count} model${result.count === 1 ? "" : "s"}.`);
    } else {
      toast.error(result.message || "Failed to fetch models.");
    }
  }, [chatProvider, fetchProviderModels]);

  useEffect(() => {
    fetchImageProviderModels(imageProvider);
  }, [imageProvider, fetchImageProviderModels]);

  const handleFetchImageModelsClick = useCallback(async () => {
    const result = await fetchImageProviderModels(imageProvider);
    if (result.ok) {
      toast.success(`Fetched ${result.count} model${result.count === 1 ? "" : "s"}.`);
    } else {
      toast.error(result.message || "Failed to fetch models.");
    }
  }, [imageProvider, fetchImageProviderModels]);

  // OpenAI's key is only ever needed on the image side when imageProvider is
  // "openai" - it shares the same per-provider storage slot the chat side
  // uses, so picking OpenAI for both doesn't require entering the key twice.
  const [openaiImageApiKey, setOpenaiImageApiKeyState] = useState("");
  useEffect(() => {
    if (imageProvider !== "openai") return;
    let cancelled = false;
    (async () => {
      const key = await getProviderApiKey("openai");
      if (!cancelled) setOpenaiImageApiKeyState(key || "");
    })();
    return () => { cancelled = true; };
  }, [imageProvider]);

  const handleSetOpenaiImageApiKey = useCallback((key: string) => {
    setOpenaiImageApiKeyState(key);
    saveProviderApiKey("openai", key);
  }, []);

  // Wan's key/endpoint are shared by both its image and video adapters (same
  // DashScope account) - video generation always uses "wan" regardless of
  // which imageProvider is active, so unlike the OpenAI image key above this
  // loads unconditionally on mount rather than only when Wan is selected.
  const [wanApiKey, setWanApiKeyState] = useState("");
  const [wanBaseUrl, setWanBaseUrlState] = useState("");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const key = await getProviderApiKey("wan");
      if (!cancelled) {
        setWanApiKeyState(key || "");
        setWanBaseUrlState(getWanBaseUrl());
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSetWanApiKey = useCallback((key: string) => {
    setWanApiKeyState(key);
    saveProviderApiKey("wan", key);
  }, []);

  const handleSetWanBaseUrl = useCallback((url: string) => {
    setWanBaseUrlState(url);
    saveWanBaseUrl(url);
  }, []);

  // The Wan model for pictures with reference photos (#36). wanAdapter.ts
  // reads it from localStorage at generation time.
  const [wanReferenceModel, setWanReferenceModelState] = useState(
    () => localStorage.getItem(LS_WAN_REFERENCE_MODEL) || DEFAULT_WAN_REFERENCE_MODEL
  );
  const handleSetWanReferenceModel = useCallback((model: string) => {
    setWanReferenceModelState(model);
    localStorage.setItem(LS_WAN_REFERENCE_MODEL, model);
  }, []);

  // fal.ai is image-only, so its key is loaded only when it's the image provider.
  const [falApiKey, setFalApiKeyState] = useState("");
  useEffect(() => {
    if (imageProvider !== "fal") return;
    let cancelled = false;
    (async () => {
      const key = await getProviderApiKey("fal");
      if (!cancelled) setFalApiKeyState(key || "");
    })();
    return () => { cancelled = true; };
  }, [imageProvider]);

  const handleSetFalApiKey = useCallback((key: string) => {
    setFalApiKeyState(key);
    saveProviderApiKey("fal", key);
  }, []);

  // GLM's key is shared between its chat and image adapters (same provider id
  // "glm"), same pattern as OpenAI's image key above.
  const [glmImageApiKey, setGlmImageApiKeyState] = useState("");
  useEffect(() => {
    if (imageProvider !== "glm") return;
    let cancelled = false;
    (async () => {
      const key = await getProviderApiKey("glm");
      if (!cancelled) setGlmImageApiKeyState(key || "");
    })();
    return () => { cancelled = true; };
  }, [imageProvider]);

  const handleSetGlmImageApiKey = useCallback((key: string) => {
    setGlmImageApiKeyState(key);
    saveProviderApiKey("glm", key);
  }, []);

  const [ollamaModelOptions, setOllamaModelOptions] = useState<string[]>([]);
  const fetchOllamaModels = useCallback(async () => {
    try {
      const base = ollamaBaseUrl.replace(/\/v1\/?$/, "").replace(/\/$/, "");
      const response = await fetch(`${base}/api/tags`);
      if (!response.ok) throw new Error("Failed to fetch Ollama models");
      const data = await response.json();
      const names: string[] = (data.models || []).map((m: any) => m.name);
      setOllamaModelOptions(names);
    } catch (e: any) {
      console.error(e);
    }
  }, [ollamaBaseUrl]);

  const currentChatModelList = chatProvider === "gemini"
    ? modelList
    : providerModelLists[chatProvider]?.length
      ? providerModelLists[chatProvider]
      : (PROVIDER_CHAT_MODELS[chatProvider] || []).map((m) => ({ value: m, label: m }));

  const canFetchChatModels = !!CHAT_PROVIDERS[chatProvider]?.listModels && chatProvider !== "ollama";

  const currentImageModelList = imageProvider === "gemini" ? imageModelList : [];
  const openaiImageModelList = imageProviderModelLists.openai?.length
    ? imageProviderModelLists.openai
    : (PROVIDER_IMAGE_MODELS.openai || []).map((m) => ({ value: m, label: m }));
  const canFetchImageModels = !!IMAGE_PROVIDERS[imageProvider]?.listModels;
  const wanImageModelList = (PROVIDER_IMAGE_MODELS.wan || []).map((m) => ({ value: m, label: m }));
  const glmImageModelList = (PROVIDER_IMAGE_MODELS.glm || []).map((m) => ({ value: m, label: m }));
  const wanReferenceModelList = WAN_REFERENCE_MODELS.map((m) => ({ value: m, label: m === "none" ? "None (text only)" : m }));

  // Switching image provider keeps the old model id otherwise, which the new
  // provider's dropdown can't show (and fal would silently replace), so it
  // moves to the new provider's first model. Gemini's list is fetched live,
  // so it's left alone.
  const handleSetImageProvider = useCallback((providerId: string) => {
    dispatch(setImageProvider(providerId));
    const list = PROVIDER_IMAGE_MODELS[providerId];
    if (providerId !== "gemini" && list?.length && !list.includes(imageModel)) {
      dispatch(setImageModel(list[0]));
    }
  }, [dispatch, imageModel]);

  const selectedSection = SECTION_IDS.includes(section as any) ? (section as string) : "profile";
  const desktopSettings = useMediaQuery("(min-width: 768px)");
  const [lifeLevel, setLifeLevel] = useState<LifeLevel>(() => loadLifeDial());
  const { name: worldTitle } = useCurrentWorld();
  const setSelectedSection = (id: string) => navigate(`/settings/${id}`);
  const [lastBackupAt, setLastBackupAt] = useState<number>(() => Number(localStorage.getItem(LS_LAST_BACKUP_AT) || 0));

  useEffect(() => {
    if (section && !SECTION_IDS.includes(section as any)) {
      navigate("/settings/profile", { replace: true });
    }
  }, [section, navigate]);

  const [imageSaveDirName, setImageSaveDirName] = useState<string>("Not Selected");

  useEffect(() => {
    const loadDirName = async () => {
      try {
        const handle = await dbService.getSetting("image_save_directory");
        if (handle && handle.name) {
          setImageSaveDirName(handle.name);
        }
      } catch (err) {
        console.warn("Could not load directory handle", err);
      }
    };
    loadDirName();
  }, []);

  const handleSelectDirectory = async () => {
    try {
      if (!('showDirectoryPicker' in window)) {
        toast.error("Your browser does not support the File System Access API. Please configure standard downloads instead.");
        return;
      }
      const dirHandle = await (window as any).showDirectoryPicker({
        mode: "readwrite",
      });
      // Try to save to IndexedDB
      await dbService.setSetting("image_save_directory", dirHandle);
      setImageSaveDirName(dirHandle.name);
      toast.success("Directory selected and saved successfully!");
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error("Directory picker error:", err);
        toast.error("Failed to select directory.");
      }
    }
  };

  // Roast messages for when settings are saved
  const roastMessages = useMemo(() => [
    "Fine, I saved your precious settings. Happy now?",
    "Settings saved. You're welcome, your majesty.",
    "Wow, another setting change. Groundbreaking.",
    "Saved! Not like I had anything better to do.",
    "Settings updated. Try not to break anything.",
    "Done. You sure do love clicking things.",
    "Saved successfully. I'm so proud of you.",
    "Changes saved. You're really keeping me busy today.",
    "Got it. Any more demands, your highness?",
    "Saved! That's definitely going to fix all your problems.",
  ], []);

  // Debounced roast toast for any setting change
  const roastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevSettingsRef = useRef(settings);

  useEffect(() => {
    const hasChanged = Object.keys(settings).some(
      (key) => settings[key as keyof typeof settings] !== prevSettingsRef.current[key as keyof typeof settings]
    );

    if (hasChanged) {
      prevSettingsRef.current = settings;
      if (roastTimeoutRef.current) clearTimeout(roastTimeoutRef.current);
      
      roastTimeoutRef.current = setTimeout(() => {
        const randomRoast = roastMessages[Math.floor(Math.random() * roastMessages.length)];
        toast.success(randomRoast);
      }, 1000);
    }

    return () => {
      if (roastTimeoutRef.current) clearTimeout(roastTimeoutRef.current);
    };
  }, [settings, roastMessages]);

  // Redux automatically handles syncing to localStorage via store.subscribe, 
  // so we don't need the 100-line useEffect for localStorage synchronization anymore.
  
  const handleSafetyChange = useCallback((category: keyof AISafetySettings, value: string) => {
    dispatch(setSafetySettings({ ...safetySettings, [category]: value }));
  }, [dispatch, safetySettings]);

  const handleInitialMessagesSave = useCallback(() => {
    const randomRoast = roastMessages[Math.floor(Math.random() * roastMessages.length)];
    toast.success(randomRoast);
  }, [roastMessages]);

  const settingsFileInputRef = useRef<HTMLInputElement>(null);

  // Shared shape for both the settings-only export and the settings portion of a full backup.
  const buildSettingsExport = useCallback(() => ({
    [LS_AI_MODEL]: selectedModel,
    [LS_MAX_OUTPUT_TOKENS]: maxOutputTokens,
    [LS_REPLY_LENGTH_LIMIT]: replyLengthLimit,
    [LS_COMPRESS_THRESHOLD]: compressThreshold,
    [LS_TEMPRATURE]: temperature,
    [LS_SAMPLERS]: samplers,
    [LS_ROLEPLAY_STYLE]: roleplayStyle,
    [LS_SAFETY_SETTINGS]: safetySettings,
    [LS_MAX_CHAT_LENGTH]: maxChatLength,
    [LS_FONT_SIZE]: fontSize,
    [LS_IMAGE_RESOLUTION]: imageResolution,
    [LS_GEMINI_IMAGE_SIZE]: geminiImageSize,
    [LS_PORTRAIT_SAVE_SIZE]: portraitSaveSize,
    [LS_PORTRAIT_RESIZE_ENABLED]: portraitResizeEnabled,
    [LS_EMOTION_PANEL_ENABLED]: emotionPanelEnabled,
    [LS_EMOTION_POPUP_ENABLED]: emotionPopupEnabled,
    [LS_EMOTION_POPUP_DURATION]: emotionPopupDuration,
    [LS_ALWAYS_SHOW_INITIALS]: alwaysShowInitials,
    [LS_TEXTING_MODE]: textingMode,
    [LS_RECAP_AFTER_DAYS]: recapAfterDays,
    [LS_USER_PERSONAS]: personas,
    [LS_ACTIVE_PERSONA_ID]: activePersonaId,
    [LS_INITIAL_MESSAGES]: JSON.parse(localStorage.getItem(LS_INITIAL_MESSAGES) || "[]"),
    // Read at export time from the spending store (#42), which lives outside Redux.
    [LS_SPENDING_LEDGER]: getSpendingSnapshot().ledger,
    [LS_SPENDING_BUDGET]: getSpendingSnapshot().budget,
    // Read from storage rather than state, so a change made on the Life
    // screen since this page opened is the one saved (#215).
    [LS_LIFE_DIAL]: loadLifeDial(),
  }), [selectedModel, maxOutputTokens, replyLengthLimit, compressThreshold, temperature, samplers, roleplayStyle, safetySettings, maxChatLength, fontSize, imageResolution, geminiImageSize, portraitSaveSize, portraitResizeEnabled, emotionPanelEnabled, emotionPopupEnabled, emotionPopupDuration, alwaysShowInitials, textingMode, recapAfterDays, personas, activePersonaId]);

  const downloadJson = (data: unknown, filename: string) => {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportSettings = () => {
    downloadJson(buildSettingsExport(), "kindred_settings.json");
  };

  const handleImportSettingsClick = () => {
    settingsFileInputRef.current?.click();
  };

  // Applies a previously-exported settings object (from either a settings-only
  // export or the settings portion of a full backup) to the current app state.
  const applyImportedSettings = useCallback((settings: any) => {
    if (settings[LS_AI_MODEL]) {
        const model = settings[LS_AI_MODEL];
        if (models.includes(model)) {
            dispatch(setSelectedModel(model));
        } else {
            // If it's a custom model from old settings, just keep it, or fallback
            dispatch(setSelectedModel(model));
            setModelList(prev => {
              if (!prev.find(m => m.value === model)) {
                 return [...prev, { value: model, label: model }];
              }
              return prev;
            });
        }
    }
    if (settings[LS_MAX_OUTPUT_TOKENS]) dispatch(setMaxOutputTokens(settings[LS_MAX_OUTPUT_TOKENS]));
    if (settings[LS_REPLY_LENGTH_LIMIT] !== undefined) dispatch(setReplyLengthLimit(settings[LS_REPLY_LENGTH_LIMIT]));
    if (settings[LS_COMPRESS_THRESHOLD]) dispatch(setCompressThreshold(settings[LS_COMPRESS_THRESHOLD]));
    if (settings[LS_TEMPRATURE]) dispatch(setTemperature(settings[LS_TEMPRATURE]));
    if (settings[LS_SAMPLERS] && typeof settings[LS_SAMPLERS] === "object") dispatch(setSamplers(settings[LS_SAMPLERS]));
    if (settings[LS_ROLEPLAY_STYLE] && typeof settings[LS_ROLEPLAY_STYLE] === "object") dispatch(setRoleplayStyle({ ...DEFAULT_ROLEPLAY_STYLE, ...settings[LS_ROLEPLAY_STYLE] }));
    if (settings[LS_SAFETY_SETTINGS]) dispatch(setSafetySettings(settings[LS_SAFETY_SETTINGS]));
    if (settings[LS_MAX_CHAT_LENGTH]) dispatch(setMaxChatLength(settings[LS_MAX_CHAT_LENGTH]));
    if (settings[LS_FONT_SIZE]) {
        dispatch(setFontSize(settings[LS_FONT_SIZE]));
        document.documentElement.style.setProperty('--chat-font-size', settings[LS_FONT_SIZE]);
    }
    if (settings[LS_IMAGE_RESOLUTION]) {
        dispatch(setImageResolution(settings[LS_IMAGE_RESOLUTION]));
    }
    if (settings[LS_GEMINI_IMAGE_SIZE]) {
        dispatch(setGeminiImageSize(settings[LS_GEMINI_IMAGE_SIZE]));
    }
    if (settings[LS_PORTRAIT_SAVE_SIZE]) {
        dispatch(setPortraitSaveSize(settings[LS_PORTRAIT_SAVE_SIZE]));
    }
    if (settings[LS_PORTRAIT_RESIZE_ENABLED] !== undefined) dispatch(setPortraitResizeEnabled(Boolean(settings[LS_PORTRAIT_RESIZE_ENABLED])));
    if (settings[LS_EMOTION_PANEL_ENABLED] !== undefined) dispatch(setEmotionPanelEnabled(Boolean(settings[LS_EMOTION_PANEL_ENABLED])));
    if (settings[LS_EMOTION_POPUP_ENABLED] !== undefined) dispatch(setEmotionPopupEnabled(Boolean(settings[LS_EMOTION_POPUP_ENABLED])));
    if (settings[LS_EMOTION_POPUP_DURATION]) dispatch(setEmotionPopupDuration(settings[LS_EMOTION_POPUP_DURATION]));
    if (settings[LS_ALWAYS_SHOW_INITIALS] !== undefined) dispatch(setAlwaysShowInitials(Boolean(settings[LS_ALWAYS_SHOW_INITIALS])));
    if (settings[LS_TEXTING_MODE] !== undefined) dispatch(setTextingMode(Boolean(settings[LS_TEXTING_MODE])));
    if (typeof settings[LS_RECAP_AFTER_DAYS] === "number") dispatch(setRecapAfterDays(settings[LS_RECAP_AFTER_DAYS]));
    if (settings[LS_USER_PERSONAS]) {
        dispatch(setPersonas(settings[LS_USER_PERSONAS]));
        if (settings[LS_ACTIVE_PERSONA_ID]) dispatch(setActivePersonaId(settings[LS_ACTIVE_PERSONA_ID]));
    } else if (settings[LS_USER_PROFILE]) {
        // Backward-compat: importing an older export that still has the single-persona shape.
        const legacy = settings[LS_USER_PROFILE];
        if (legacy?.name || legacy?.bio) {
            dispatch(setPersonas([{ name: legacy.name || '', bio: legacy.bio || '' } as UserProfile]));
        }
    }
    if (settings[LS_INITIAL_MESSAGES]) {
        localStorage.setItem(LS_INITIAL_MESSAGES, JSON.stringify(settings[LS_INITIAL_MESSAGES]));
        setInitialMessagesKey(prev => prev + 1);
    }
    // Merged rather than replaced, so restoring a backup never loses (or
    // double-counts) spending recorded in this browser.
    if (settings[LS_SPENDING_LEDGER] && typeof settings[LS_SPENDING_LEDGER] === "object") importLedger(settings[LS_SPENDING_LEDGER]);
    if (settings[LS_SPENDING_BUDGET] && typeof settings[LS_SPENDING_BUDGET] === "object") setBudget(settings[LS_SPENDING_BUDGET]);
    if (settings[LS_LIFE_DIAL] !== undefined) {
        restoreLifeDial(settings[LS_LIFE_DIAL]);
        setLifeLevel(loadLifeDial());
    }
  }, [dispatch]);

  const handleSettingsFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const settings = JSON.parse(e.target?.result as string);
        applyImportedSettings(settings);
        toast.success("Settings imported successfully!");
      } catch (err) {
        console.error("Import error:", err);
        toast.error("Failed to import settings. Invalid JSON file.");
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const backupFileInputRef = useRef<HTMLInputElement>(null);

  const handleExportFullBackup = async () => {
    try {
      const { getFullBackupZip } = await import("../services/backupService");
      const { blob, chats, characters, worlds, imagesIncluded, imagesSkipped } = await getFullBackupZip(buildSettingsExport());
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `kindred_backup_${dateStr}.zip`);

      let message = `Backed up ${chats.length} chat(s), ${characters.length} character(s) and ${worlds.length} world(s)`;
      message += imagesIncluded > 0 ? `, including ${imagesIncluded} image(s).` : ".";
      if (imagesSkipped > 0) message += ` ${imagesSkipped} local image(s) couldn't be read and were skipped.`;
      toast.success(message);

      const now = Date.now();
      localStorage.setItem(LS_LAST_BACKUP_AT, String(now));
      setLastBackupAt(now);
    } catch (err) {
      console.error("Backup export error:", err);
      toast.error("Failed to create backup.");
    }
  };

  const handleImportBackupClick = () => {
    backupFileInputRef.current?.click();
  };

  // The full backup zip, for "Download full backup" and Google Drive (#54).
  const buildBackupBlob = async (): Promise<Blob> => {
    const { getFullBackupZip } = await import("../services/backupService");
    return (await getFullBackupZip(buildSettingsExport())).blob;
  };

  const markBackedUp = () => {
    const now = Date.now();
    localStorage.setItem(LS_LAST_BACKUP_AT, String(now));
    setLastBackupAt(now);
  };

  const handleBackupFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await restoreBackupFile(file);
  };

  // Restores a backup zip after a confirm: from a file, or from Drive (#54).
  const restoreBackupFile = async (file: File) => {
    try {
      const { parseBackupFile, applyParsedBackup } = await import("../services/backupService");
      const parsed = await parseBackupFile(file);
      const { data, imageFilenames } = parsed;

      const worldCount = Array.isArray(data.worlds) ? data.worlds.length : 0;
      let confirmMessage = `This will add ${data.chats.length} chat(s), ${data.characters.length} character(s) and ${worldCount} world(s) to your existing library (nothing will be overwritten or removed).`;
      if (imageFilenames.length > 0) confirmMessage += ` It also includes ${imageFilenames.length} local image(s).`;
      confirmMessage += " Continue?";

      const confirmed = await showConfirm("Restore Backup", confirmMessage);
      if (!confirmed) return;

      const { chatsRestored, charactersRestored, worldsRestored, imagesRestored } = await applyParsedBackup(parsed);
      if (data.settings) applyImportedSettings(data.settings);

      dispatch(fetchChats());
      dispatch(fetchCharacters());
      dispatch(fetchWorlds());

      let message = `Restored ${chatsRestored} chat(s), ${charactersRestored} character(s) and ${worldsRestored} world(s)`;
      message += imagesRestored > 0 ? `, including ${imagesRestored} image(s).` : ".";
      toast.success(message);
    } catch (err) {
      console.error("Backup import error:", err);
      toast.error("Failed to restore backup. Invalid file.");
    }
  };

  const safetyCategories: (keyof AISafetySettings)[] = useMemo(
    () => ["harassment", "hate_speech", "sexual", "dangerous"],
    []
  );

  const goBackOrHome = () => {
    const idx = window.history.state?.idx;
    if (typeof idx === 'number' && idx > 0) {
      navigate(-1);
    } else {
      navigate('/', { replace: true });
    }
  };

  // `conf` names the section under the terminal theme's `$ cat <conf>.conf` title.
  // #155: grouped as You, AI, Chat and look, and Care, as on the canvas.
  const sections: { id: string; icon: React.ReactNode; title: string; subtitle: string; conf: string; group: string; value?: string }[] = [
    { id: "profile", icon: <FaUser size={13} />, title: "Profile and personas", subtitle: "Who you are in your chats", conf: "user_profile", group: "You" },
    { id: "text", icon: <FaMicrochip size={13} />, title: "Text model", subtitle: "Provider, model, temperature, tokens", conf: "text_model", group: "AI", value: CHAT_PROVIDER_META.find((p) => p.id === chatProvider)?.label },
    { id: "image", icon: <FaImage size={13} />, title: "Images and voice", subtitle: "Provider, model, ratio, count", conf: "image_model", group: "AI" },
    { id: "chat", icon: <FaComments size={13} />, title: "Chat defaults", subtitle: "System prompt, bubbles, notifications", conf: "chat_ui", group: "Chat and look", value: textingMode ? "Texting on" : undefined },
    { id: "appearance", icon: <FaPalette size={13} />, title: "Appearance", subtitle: "Theme and reading comfort", conf: "appearance", group: "Chat and look" },
    { id: "privacy", icon: <FaLock size={13} />, title: "Privacy", subtitle: "Blur, discreet list, app lock", conf: "privacy", group: "Care" },
    { id: "safety", icon: <FaShieldAlt size={13} />, title: "Safety", subtitle: chatProvider === "gemini" ? "Content filtering thresholds" : "Gemini only - not used by other providers", conf: "safety", group: "Care" },
    { id: "spending", icon: <FaWallet size={13} />, title: "Spending and life", subtitle: "Life dial, activity log, costs and a monthly limit", conf: "spending", group: "Care", value: lifeLevel[0].toUpperCase() + lifeLevel.slice(1) },
    { id: "data", icon: <FaDatabase size={13} />, title: "Data and backup", subtitle: "Import / export conversations", conf: "data_io", group: "Care", value: lastBackupAt ? formatRelativeTime(lastBackupAt) : undefined },
  ];
  const groups = ["You", "AI", "Chat and look", "Care"].map((g) => ({ title: g, items: sections.filter((s) => s.group === g) }));
  const activePersona = personas.find((p) => p.id === activePersonaId) || personas[0];
  const personaCard = (big: boolean) => (
    <button type="button" onClick={() => setSelectedSection("profile")} className={cn("flex w-full items-center gap-3 rounded-card bg-raised text-left ring-1 ring-inset ring-border", big ? "p-3.5" : "p-3")}>
      <CharacterAvatar name={activePersona?.name || "You"} imageSrc={activePersona?.avatar} size={big ? 56 : 40} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("font-bold text-foreground", big ? "text-[17px]" : "text-[14px]")}>{activePersona?.name?.trim() || "You"}</span>
        {big && activePersona?.bio && <span className="truncate text-[12.5px] text-muted-foreground">{activePersona.bio}</span>}
        <span className="truncate text-[12px] text-subtle">Persona in {worldTitle}</span>
      </span>
    </button>
  );
  // Phones (#155): /settings is a list of everything; each section opens on
  // its own screen, with Back to the list.
  const phoneList = !desktopSettings && !section;
  const activeSection = sections.find((s) => s.id === selectedSection) || sections[0];

  return (
    <div className="w-full h-dvh flex flex-col">
      <Header title={phoneList || desktopSettings ? "Settings" : activeSection.title} subtitle={phoneList || desktopSettings ? undefined : "Settings"} onBack={!desktopSettings && section ? () => navigate("/settings") : goBackOrHome} />
      <div className="flex-1 overflow-auto p-4 md:p-8 flex justify-center">
      <div className="w-full max-w-5xl bg-transparent">

        {phoneList && (
          <div className="flex flex-col gap-3.5">
            {personaCard(true)}
            <div className="flex flex-col gap-2.5 rounded-card bg-card p-3.5 ring-1 ring-inset ring-border">
              <div className="flex items-center gap-2"><CostMarker /><span className="flex-1 text-[15px] font-bold text-foreground">Life in the background</span><button type="button" onClick={() => setSelectedSection("spending")} className="text-[13.5px] font-bold text-primary-text">Activity log</button></div>
              <SegmentedControl aria-label="Life dial" value={lifeLevel} onChange={(v) => { saveLifeDial(v as LifeLevel); setLifeLevel(v as LifeLevel); }} options={LIFE_LEVELS.map((l) => ({ value: l, label: l[0].toUpperCase() + l.slice(1) }))} className="w-full [&>*]:flex-1" />
              <span className="text-[12px] text-subtle">{LIFE_HINT[lifeLevel]}</span>
            </div>
            {groups.map((g) => (
              <nav key={g.title} aria-label={g.title} className="rounded-card bg-card px-1 ring-1 ring-inset ring-border">
                {g.items.map((item, i) => (
                  <button key={item.id} type="button" onClick={() => setSelectedSection(item.id)} className={cn("flex min-h-[52px] w-full items-center gap-3.5 px-3 text-left", i > 0 && "border-t border-border")}>
                    <span className="grid h-8 w-8 flex-none place-items-center rounded-[9px] bg-sunken text-muted-foreground">{item.icon}</span>
                    <span className="flex-1 text-[15px] font-semibold text-foreground">{item.title}</span>
                    {item.value && <span className="text-[12px] text-subtle">{item.value}</span>}
                    <FaChevronRight size={11} className="text-subtle" />
                  </button>
                ))}
                {g.title === "Care" && (
                  <button type="button" onClick={() => navigate("/worlds")} className="flex min-h-[52px] w-full items-center gap-3.5 border-t border-border px-3 text-left">
                    <span className="grid h-8 w-8 flex-none place-items-center rounded-[9px] bg-sunken text-muted-foreground"><FaGlobe size={13} /></span>
                    <span className="flex-1 text-[15px] font-semibold text-foreground">Worlds</span>
                    <FaChevronRight size={11} className="text-subtle" />
                  </button>
                )}
              </nav>
            ))}
          </div>
        )}

        {!phoneList && (
        <div className="flex flex-col md:flex-row gap-8 items-start">
          {(desktopSettings || terminal) && (
          <nav aria-label="Settings sections" className={cn("w-full md:w-[264px] flex-none flex flex-col gap-0.5", terminal && "gap-2")}>
            {!terminal && <div className="mb-3">{personaCard(false)}</div>}
            {terminal ? sections.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedSection(s.id)}
                className={cn(
                  "px-3.5 py-2 text-[11px] font-bold text-left border transition-colors",
                  s.id === selectedSection ? "bg-primary text-primary-foreground border-border-bright" : "border-border text-foreground hover:border-border-bright"
                )}
              >
                [{i + 1}] {s.title}
              </button>
            )) : groups.map((g) => (
              <div key={g.title} className="flex flex-col gap-0.5 pb-2">
                <span className="px-3 pb-1 pt-2 text-[11.5px] font-bold uppercase tracking-[0.06em] text-subtle">{g.title}</span>
                {g.items.map((s) => {
                  const active = s.id === selectedSection;
                  return (
                    <button key={s.id} type="button" onClick={() => setSelectedSection(s.id)} aria-current={active ? "page" : undefined}
                      className={cn("flex h-11 items-center gap-3 rounded-[10px] px-3 text-left text-[14px] font-semibold transition-colors", active ? "bg-primary/15 text-foreground ring-1 ring-inset ring-primary/40" : "text-foreground hover:bg-raised")}>
                      <span className={cn("flex-none", active ? "text-foreground" : "text-muted-foreground")}>{s.icon}</span>
                      <span className="flex-1">{s.title}</span>
                      {s.value && <span className={cn("text-[12px] font-normal", active ? "text-foreground" : "text-subtle")}>{s.value}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
            <div className="mt-5 p-3.5 rounded-lg bg-card border border-border/50 text-xs text-muted-foreground leading-relaxed">
              {terminal && "# "}
              <span className="text-foreground font-semibold">Everything lives in this browser.</span>{" "}
              Last backup {lastBackupAt ? formatRelativeTime(lastBackupAt) : "never"}.{" "}
              <button type="button" onClick={() => setSelectedSection("data")} className="font-medium text-primary hover:underline">
                Back up now
              </button>
            </div>
          </nav>
          )}

          <div className="flex-1 min-w-0 max-w-[720px] flex flex-col gap-5">
            {terminal ? (
              <div>
                <div className="text-[15px] font-bold text-foreground">$ cat {activeSection.conf}.conf</div>
                <div className="text-[11px] text-muted-foreground mt-1 lowercase"># {activeSection.subtitle}</div>
              </div>
            ) : (
              <div>
                <div className="text-[22px] font-bold tracking-tight text-foreground">{activeSection.title}</div>
                <div className="text-sm text-muted-foreground mt-1">{activeSection.subtitle}</div>
              </div>
            )}

            <>
                {selectedSection === "profile" && (
                  <UserProfileSettings
                    personas={personas}
                    activePersonaId={activePersonaId}
                    onAddPersona={() => dispatch(addPersona({ name: '', bio: '' }))}
                    onUpdatePersona={(val) => dispatch(updatePersona(val))}
                    onDeletePersona={(id) => dispatch(deletePersona(id))}
                    onSetActivePersonaId={(id) => dispatch(setActivePersonaId(id))}
                  />
                )}

                {selectedSection === "text" && (
                  <TextModelSettings
                    temperature={temperature}
                    setTemperature={(val) => dispatch(setTemperature(val))}
                    chatProvider={chatProvider}
                    setChatProvider={(val) => dispatch(setChatProvider(val))}
                    chatProviderCapabilities={chatProviderCapabilities}
                    providerApiKey={chatApiKey}
                    setProviderApiKey={handleSetChatApiKey}
                    ollamaBaseUrl={ollamaBaseUrl}
                    setOllamaBaseUrl={(val) => dispatch(setOllamaBaseUrl(val))}
                    ollamaModels={ollamaModelOptions}
                    fetchOllamaModels={fetchOllamaModels}
                    selectedModel={selectedModel}
                    setSelectedModel={(val) => dispatch(setSelectedModel(val))}
                    modelList={currentChatModelList}
                    canFetchModels={canFetchChatModels}
                    fetchModels={handleFetchChatModelsClick}
                    replyLengthLimit={replyLengthLimit}
                    setReplyLengthLimit={(val) => dispatch(setReplyLengthLimit(val))}
                    compressThreshold={compressThreshold}
                    setCompressThreshold={(val) => dispatch(setCompressThreshold(val))}
                    samplers={samplers}
                    setSamplers={(val) => dispatch(setSamplers(val))}
                    roleplayStyle={roleplayStyle}
                    setRoleplayStyle={(val) => dispatch(setRoleplayStyle(val))}
                    helperProvider={helperProvider}
                    helperModel={helperModel}
                    setHelperModel={(provider, model) => dispatch(setHelperModel({ provider, model }))}
                    onLogout={logout}
                  />
                )}

                {selectedSection === "image" && (
                  <ImageGenerationSettings
                    imageProvider={imageProvider}
                    setImageProvider={handleSetImageProvider}
                    openaiApiKey={openaiImageApiKey}
                    setOpenaiApiKey={handleSetOpenaiImageApiKey}
                    wanApiKey={wanApiKey}
                    setWanApiKey={handleSetWanApiKey}
                    wanBaseUrl={wanBaseUrl}
                    setWanBaseUrl={handleSetWanBaseUrl}
                    wanImageModelList={wanImageModelList}
                    wanReferenceModel={wanReferenceModel}
                    setWanReferenceModel={handleSetWanReferenceModel}
                    wanReferenceModelList={wanReferenceModelList}
                    falApiKey={falApiKey}
                    setFalApiKey={handleSetFalApiKey}
                    falImageModelList={FAL_IMAGE_MODEL_OPTIONS}
                    glmApiKey={glmImageApiKey}
                    setGlmApiKey={handleSetGlmImageApiKey}
                    glmImageModelList={glmImageModelList}
                    sdWebuiApiUrl={sdWebuiApiUrl}
                    setSdWebuiApiUrl={(val) => dispatch(setSdWebuiApiUrl(val))}
                    sdWebuiBatchSize={sdWebuiBatchSize}
                    setSdWebuiBatchSize={(val) => dispatch(setSdWebuiBatchSize(val))}
                    fetchSdModels={fetchSdModels}
                    sdWebuiModel={sdWebuiModel}
                    setSdWebuiModel={(val) => dispatch(setSdWebuiModel(val))}
                    sdWebuiModels={sdWebuiModels}
                    sdWebuiRefMode={sdWebuiRefMode}
                    setSdWebuiRefMode={(val) => dispatch(setSdWebuiRefMode(val))}
                    sdWebuiDenoising={sdWebuiDenoising}
                    setSdWebuiDenoising={(val) => dispatch(setSdWebuiDenoising(val))}
                    sdWebuiControlnetModel={sdWebuiControlnetModel}
                    setSdWebuiControlnetModel={(val) => dispatch(setSdWebuiControlnetModel(val))}
                    imageModel={imageModel}
                    setImageModel={(val) => dispatch(setImageModel(val))}
                    imageModelList={currentImageModelList}
                    openaiImageModelList={openaiImageModelList}
                    canFetchImageModels={canFetchImageModels}
                    fetchImageModels={handleFetchImageModelsClick}
                    imageGenPrompt={imageGenPrompt}
                    setImageGenPrompt={(val) => dispatch(setImageGenPrompt(val))}
                    imageResolution={imageResolution}
                    setImageResolution={(val) => dispatch(setImageResolution(val))}
                    geminiImageSize={geminiImageSize}
                    setGeminiImageSize={(val) => dispatch(setGeminiImageSize(val))}
                    portraitSaveSize={portraitSaveSize}
                    setPortraitSaveSize={(val) => dispatch(setPortraitSaveSize(val))}
                    portraitResizeEnabled={portraitResizeEnabled}
                    setPortraitResizeEnabled={(val) => dispatch(setPortraitResizeEnabled(val))}
                    imageSaveDirName={imageSaveDirName}
                    handleSelectDirectory={handleSelectDirectory}
                    LS_SD_WEBUI_MODEL={LS_SD_WEBUI_MODEL}
                    videoModel={videoModel}
                    setVideoModel={(val) => dispatch(setVideoModel(val))}
                    videoModelSuggestions={PROVIDER_VIDEO_MODELS.wan || []}
                  />
                )}

                {selectedSection === "chat" && (
                  <ChatInterfaceSettings
                    maxChatLength={maxChatLength}
                    setMaxChatLength={(val) => dispatch(setMaxChatLength(val))}
                    fontSize={fontSize}
                    setFontSize={(val) => dispatch(setFontSize(val))}
                    initialMessagesKey={initialMessagesKey}
                    onInitialMessagesSave={handleInitialMessagesSave}
                    textingMode={textingMode}
                    setTextingMode={(val) => dispatch(setTextingMode(val))}
                    recapAfterDays={recapAfterDays}
                    setRecapAfterDays={(val) => dispatch(setRecapAfterDays(val))}
                  />
                )}

                {selectedSection === "appearance" && (
                  <AppearanceSettings
                    colorTheme={colorTheme}
                    setColorTheme={setColorTheme}
                    accentPalette={accentPalette}
                    setAccentPalette={setAccentPalette}
                    alwaysShowInitials={alwaysShowInitials}
                    setAlwaysShowInitials={(val) => dispatch(setAlwaysShowInitials(val))}
                  />
                )}

                {selectedSection === "safety" && (
                  <SafetySettings
                    chatProvider={chatProvider}
                    safetySettings={safetySettings}
                    safetyCategories={safetyCategories}
                    onSafetyChange={handleSafetyChange}
                  />
                )}

                {selectedSection === "privacy" && (
                  <PrivacySettings privacy={privacy} setPrivacy={(val) => dispatch(setPrivacy(val))} />
                )}

                {selectedSection === "spending" && (
                  <>
                    <LifeSettings />
                    <SpendingSettings />
                  </>
                )}

                {selectedSection === "data" && (
                  <DataBackupSettings
                    lastBackupAt={lastBackupAt}
                    onExportFullBackup={handleExportFullBackup}
                    onImportBackupClick={handleImportBackupClick}
                    backupFileInputRef={backupFileInputRef}
                    onBackupFileChange={handleBackupFileChange}
                    onExportSettings={handleExportSettings}
                    onImportSettingsClick={handleImportSettingsClick}
                    settingsFileInputRef={settingsFileInputRef}
                    onSettingsFileChange={handleSettingsFileChange}
                    buildBackup={buildBackupBlob}
                    restoreBackup={restoreBackupFile}
                    onBackedUp={markBackedUp}
                  />
                )}
            </>
          </div>
        </div>
        )}
      </div>
      </div>
    </div>
  );
};

export default SettingsPage;
