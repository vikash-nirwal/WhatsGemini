import React, { useState, useEffect, useCallback, useMemo, useRef, useContext } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "../store/store";
import { useAppDispatch } from "../store/hooks";
import {
  addPersona, updatePersona, deletePersona, setActivePersonaId, setPersonas,
  setSelectedModel, setImageModel, setImageGenPrompt,
  setSdWebuiApiUrl, setSdWebuiBatchSize, setSdWebuiRefMode,
  setSdWebuiDenoising, setSdWebuiControlnetModel, setSdWebuiModels,
  setSdWebuiModel, setMaxOutputTokens, setReplyLengthLimit, setCompressThreshold, setMaxChatLength,
  setTemperature, setSafetySettings, setFontSize, setImageResolution, setGeminiImageSize, setPortraitSaveSize,
  setChatProvider, setImageProvider, setOllamaBaseUrl
} from "../features/settingsSlice";
import { FaInfoCircle, FaUser, FaMicrochip, FaImage, FaComments, FaShieldAlt, FaDatabase, FaPalette } from "react-icons/fa";
import Header from "src/components/organisms/Header";
import { toast } from "sonner";
import { useColorTheme } from "../hooks/useColorTheme";
import { AuthContext } from "../contexts/AuthContext";
import UserProfileSettings from "src/components/organisms/UserProfileSettings";
import TextModelSettings from "src/components/organisms/TextModelSettings";
import ImageGenerationSettings from "src/components/organisms/ImageGenerationSettings";
import AppearanceSettings from "src/components/organisms/AppearanceSettings";
import { getAPIKey, getProviderApiKey, saveProviderApiKey } from "../features/ai/utils/settings";
import { CHAT_PROVIDERS } from "../features/ai/providers/registry";
import { useModal } from "../contexts/ModalContext";
import { fetchChats } from "../features/chatSlice";
import { fetchCharacters } from "../features/characterSlice";
import { getFullBackupZip, parseBackupFile, applyParsedBackup } from "../services/backupService";
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
  LS_FONT_SIZE,
  LS_USER_PROFILE,
  LS_USER_PERSONAS,
  LS_ACTIVE_PERSONA_ID,
  LS_IMAGE_RESOLUTION,
  LS_GEMINI_IMAGE_SIZE,
  LS_PORTRAIT_SAVE_SIZE,
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
  PROVIDER_CHAT_MODELS,
  PROVIDER_IMAGE_MODELS,
} from "../utils/constants";
import { AISafetySettings, UserProfile } from "../types";
import { dbService } from "../services/dbService";
import ChatInterfaceSettings from "src/components/organisms/ChatInterfaceSettings";
import SafetySettings from "src/components/organisms/SafetySettings";
import DataBackupSettings from "src/components/organisms/DataBackupSettings";
import { formatRelativeTime } from "../utils/formatRelativeTime";
import { cn } from "../utils/cn";

const SettingsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showConfirm } = useModal();
  const { colorTheme, setColorTheme, accentPalette, setAccentPalette } = useColorTheme();
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
    personas, activePersonaId, chatProvider, imageProvider, ollamaBaseUrl, selectedModel, imageModel,
    imageGenPrompt, sdWebuiApiUrl,
    sdWebuiBatchSize, sdWebuiRefMode, sdWebuiDenoising, sdWebuiControlnetModel, sdWebuiModels,
    sdWebuiModel, maxOutputTokens, replyLengthLimit, compressThreshold, maxChatLength, temperature,
    safetySettings, fontSize, imageResolution, geminiImageSize, portraitSaveSize
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
    : (PROVIDER_CHAT_MODELS[chatProvider] || []).map((m) => ({ value: m, label: m }));

  const currentImageModelList = imageProvider === "gemini" ? imageModelList : [];
  const openaiImageModelList = (PROVIDER_IMAGE_MODELS.openai || []).map((m) => ({ value: m, label: m }));

  const [selectedSection, setSelectedSection] = useState<string>(() => (location.state as { openSection?: string } | null)?.openSection || "profile");
  const [lastBackupAt, setLastBackupAt] = useState<number>(() => Number(localStorage.getItem(LS_LAST_BACKUP_AT) || 0));

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
    [LS_SAFETY_SETTINGS]: safetySettings,
    [LS_MAX_CHAT_LENGTH]: maxChatLength,
    [LS_FONT_SIZE]: fontSize,
    [LS_IMAGE_RESOLUTION]: imageResolution,
    [LS_GEMINI_IMAGE_SIZE]: geminiImageSize,
    [LS_PORTRAIT_SAVE_SIZE]: portraitSaveSize,
    [LS_USER_PERSONAS]: personas,
    [LS_ACTIVE_PERSONA_ID]: activePersonaId,
    [LS_INITIAL_MESSAGES]: JSON.parse(localStorage.getItem(LS_INITIAL_MESSAGES) || "[]"),
  }), [selectedModel, maxOutputTokens, replyLengthLimit, compressThreshold, temperature, safetySettings, maxChatLength, fontSize, imageResolution, geminiImageSize, portraitSaveSize, personas, activePersonaId]);

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
    downloadJson(buildSettingsExport(), "whatsgemini_settings.json");
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
      const { blob, chats, characters, imagesIncluded, imagesSkipped } = await getFullBackupZip(buildSettingsExport());
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `whatsgemini_backup_${dateStr}.zip`);

      let message = `Backed up ${chats.length} chat(s) and ${characters.length} character(s)`;
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

  const handleBackupFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const parsed = await parseBackupFile(file);
      const { data, imageFilenames } = parsed;

      let confirmMessage = `This will add ${data.chats.length} chat(s) and ${data.characters.length} character(s) to your existing library (nothing will be overwritten or removed).`;
      if (imageFilenames.length > 0) confirmMessage += ` It also includes ${imageFilenames.length} local image(s).`;
      confirmMessage += " Continue?";

      const confirmed = await showConfirm("Restore Backup", confirmMessage);
      if (!confirmed) return;

      const { chatsRestored, charactersRestored, imagesRestored } = await applyParsedBackup(parsed);
      if (data.settings) applyImportedSettings(data.settings);

      dispatch(fetchChats());
      dispatch(fetchCharacters());

      let message = `Restored ${chatsRestored} chat(s) and ${charactersRestored} character(s)`;
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

  const sections: { id: string; icon: React.ReactNode; title: string; subtitle: string }[] = [
    { id: "profile", icon: <FaUser size={13} />, title: "User Profile", subtitle: "Your name and bio" },
    { id: "text", icon: <FaMicrochip size={13} />, title: "Text Generation Model", subtitle: "Provider, model, temperature, tokens" },
    { id: "image", icon: <FaImage size={13} />, title: "Image Generation Settings", subtitle: "Provider, model, ratio, count" },
    { id: "chat", icon: <FaComments size={13} />, title: "Chat Interface Settings", subtitle: "System prompt, bubbles, sending" },
    { id: "appearance", icon: <FaPalette size={13} />, title: "Appearance", subtitle: "Color theme" },
    { id: "safety", icon: <FaShieldAlt size={13} />, title: "Safety Settings", subtitle: chatProvider === "gemini" ? "Content filtering thresholds" : "Gemini only - not used by other providers" },
    { id: "data", icon: <FaDatabase size={13} />, title: "Data & Import/Export", subtitle: "Import / export conversations" },
  ];
  const activeSection = sections.find((s) => s.id === selectedSection) || sections[0];

  return (
    <div className="w-full h-screen flex flex-col">
      <Header title="Settings" subtitle="Providers, chat behavior, and data" onBack={goBackOrHome} />
      <div className="flex-1 overflow-auto p-4 md:p-8 flex justify-center">
      <div className="w-full max-w-5xl bg-transparent">

        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">AI Provider Settings</h1>
          <FaInfoCircle className="text-muted-foreground" size={18} />
        </div>

        <div className="flex flex-col md:flex-row gap-8 items-start">
          <nav className="w-full md:w-60 flex-none flex flex-col gap-0.5">
            {sections.map((s) => {
              const active = s.id === selectedSection;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedSection(s.id)}
                  className={cn(
                    "flex items-center gap-3 h-11 px-3 rounded-lg text-sm text-left transition-colors",
                    active
                      ? "bg-card text-foreground font-semibold"
                      : "text-muted-foreground font-normal hover:bg-card/60"
                  )}
                >
                  <span className={cn("w-2 h-2 rounded-full flex-none", active ? "bg-primary" : "bg-muted")} />
                  {s.title}
                </button>
              );
            })}

            <div className="mt-5 p-3.5 rounded-lg bg-card border border-border/50 text-xs text-muted-foreground leading-relaxed">
              <span className="text-foreground font-semibold">Everything lives in this browser.</span>{" "}
              Last backup {lastBackupAt ? formatRelativeTime(lastBackupAt) : "never"}.{" "}
              <button type="button" onClick={() => setSelectedSection("data")} className="font-medium text-primary hover:underline">
                Back up now
              </button>
            </div>
          </nav>

          <div className="flex-1 min-w-0 max-w-[720px] flex flex-col gap-5">
            <div>
              <div className="text-[22px] font-bold tracking-tight text-foreground">{activeSection.title}</div>
              <div className="text-sm text-muted-foreground mt-1">{activeSection.subtitle}</div>
            </div>

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
                    replyLengthLimit={replyLengthLimit}
                    setReplyLengthLimit={(val) => dispatch(setReplyLengthLimit(val))}
                    compressThreshold={compressThreshold}
                    setCompressThreshold={(val) => dispatch(setCompressThreshold(val))}
                    onLogout={logout}
                  />
                )}

                {selectedSection === "image" && (
                  <ImageGenerationSettings
                    imageProvider={imageProvider}
                    setImageProvider={(val) => dispatch(setImageProvider(val))}
                    openaiApiKey={openaiImageApiKey}
                    setOpenaiApiKey={handleSetOpenaiImageApiKey}
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
                    imageGenPrompt={imageGenPrompt}
                    setImageGenPrompt={(val) => dispatch(setImageGenPrompt(val))}
                    imageResolution={imageResolution}
                    setImageResolution={(val) => dispatch(setImageResolution(val))}
                    geminiImageSize={geminiImageSize}
                    setGeminiImageSize={(val) => dispatch(setGeminiImageSize(val))}
                    portraitSaveSize={portraitSaveSize}
                    setPortraitSaveSize={(val) => dispatch(setPortraitSaveSize(val))}
                    imageSaveDirName={imageSaveDirName}
                    handleSelectDirectory={handleSelectDirectory}
                    LS_SD_WEBUI_MODEL={LS_SD_WEBUI_MODEL}
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
                  />
                )}

                {selectedSection === "appearance" && (
                  <AppearanceSettings
                    colorTheme={colorTheme}
                    setColorTheme={setColorTheme}
                    accentPalette={accentPalette}
                    setAccentPalette={setAccentPalette}
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
                  />
                )}
            </>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default SettingsPage;
