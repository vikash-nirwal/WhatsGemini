import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  DEFAULT_CHAT_LENGTH,
  DEFAULT_OUTPUT_TOKENS,
  DEFAULT_SAFETY_SETTINGS,
  DEFAULT_TEMPRATURE,
  LS_AI_MODEL,
  LS_MAX_CHAT_LENGTH,
  LS_MAX_OUTPUT_TOKENS,
  LS_REPLY_LENGTH_LIMIT,
  DEFAULT_REPLY_LENGTH_LIMIT,
  LS_SAFETY_SETTINGS,
  LS_TEMPRATURE,
  LS_FONT_SIZE,
  LS_USER_PROFILE,
  LS_USER_PERSONAS,
  LS_ACTIVE_PERSONA_ID,
  LS_IMAGE_RESOLUTION,
  DEFAULT_IMAGE_RESOLUTION,
  LS_GEMINI_IMAGE_SIZE,
  DEFAULT_GEMINI_IMAGE_SIZE,
  LS_PORTRAIT_SAVE_SIZE,
  DEFAULT_PORTRAIT_SAVE_SIZE,
  LS_IMAGE_MODEL,
  DEFAULT_IMAGE_MODEL,
  LS_IMAGE_GEN_PROMPT,
  DEFAULT_IMAGE_GEN_PROMPT,
  LS_USE_SD_WEBUI,
  LS_SD_WEBUI_API_URL,
  DEFAULT_SD_WEBUI_API_URL,
  LS_SD_WEBUI_BATCH_SIZE,
  DEFAULT_SD_WEBUI_BATCH_SIZE,
  LS_SD_WEBUI_REF_MODE,
  DEFAULT_SD_WEBUI_REF_MODE,
  LS_SD_WEBUI_DENOISING,
  DEFAULT_SD_WEBUI_DENOISING,
  LS_SD_WEBUI_CONTROLNET_MODEL,
  DEFAULT_SD_WEBUI_CONTROLNET_MODEL,
  LS_SD_WEBUI_MODELS,
  LS_SD_WEBUI_MODEL,
  DEFAULT_SD_WEBUI_MODEL,
  LS_COMPRESS_THRESHOLD,
  DEFAULT_COMPRESS_THRESHOLD,
  LS_CHAT_PROVIDER,
  DEFAULT_CHAT_PROVIDER,
  LS_IMAGE_PROVIDER,
  DEFAULT_IMAGE_PROVIDER,
  LS_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_BASE_URL,
  models,
} from '../utils/constants';
import { AISafetySettings, UserProfile } from '../types';
import { RootState } from '../store/store';

const getStoredValue = <T>(key: string, defaultValue: T): T => {
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : defaultValue;
  } catch {
    return defaultValue;
  }
};

const generatePersonaId = () => `persona_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// Migrates the old single { name, bio } LS_USER_PROFILE object (if present
// and no personas array has been saved yet) into a one-item personas array,
// so upgrading users don't lose the persona they already set up.
const loadInitialPersonas = (): UserProfile[] => {
  const stored = getStoredValue<UserProfile[] | null>(LS_USER_PERSONAS, null);
  if (stored && stored.length > 0) return stored;
  const legacy = getStoredValue<{ name: string; bio: string } | null>(LS_USER_PROFILE, null);
  if (legacy && (legacy.name || legacy.bio)) {
    return [{ id: generatePersonaId(), name: legacy.name || '', bio: legacy.bio || '' }];
  }
  return [];
};

export interface SettingsState {
  personas: UserProfile[];
  activePersonaId: string;
  chatProvider: string;
  imageProvider: string;
  ollamaBaseUrl: string;
  selectedModel: string;
  imageModel: string;
  imageGenPrompt: string;
  useSdWebui: boolean;
  sdWebuiApiUrl: string;
  sdWebuiBatchSize: number;
  sdWebuiRefMode: string;
  sdWebuiDenoising: number;
  sdWebuiControlnetModel: string;
  sdWebuiModels: { title: string; model_name: string }[];
  sdWebuiModel: string;
  maxOutputTokens: number;
  replyLengthLimit: number;
  compressThreshold: number;
  maxChatLength: number;
  temperature: number;
  safetySettings: AISafetySettings;
  fontSize: string;
  imageResolution: string;
  geminiImageSize: string;
  portraitSaveSize: string;
}

const initialPersonas = loadInitialPersonas();

const initialState: SettingsState = {
  personas: initialPersonas,
  activePersonaId: localStorage.getItem(LS_ACTIVE_PERSONA_ID) || initialPersonas[0]?.id || '',
  chatProvider: localStorage.getItem(LS_CHAT_PROVIDER) || DEFAULT_CHAT_PROVIDER,
  // Migrates the old useSdWebui boolean into the new imageProvider choice for
  // existing users who never saw an explicit provider picker before.
  imageProvider:
    localStorage.getItem(LS_IMAGE_PROVIDER) ||
    (localStorage.getItem(LS_USE_SD_WEBUI) === 'true' ? 'sdwebui' : DEFAULT_IMAGE_PROVIDER),
  ollamaBaseUrl: localStorage.getItem(LS_OLLAMA_BASE_URL) || DEFAULT_OLLAMA_BASE_URL,
  selectedModel: localStorage.getItem(LS_AI_MODEL) || models[0],
  imageModel: localStorage.getItem(LS_IMAGE_MODEL) || DEFAULT_IMAGE_MODEL,
  imageGenPrompt: localStorage.getItem(LS_IMAGE_GEN_PROMPT) || DEFAULT_IMAGE_GEN_PROMPT,
  useSdWebui: localStorage.getItem(LS_USE_SD_WEBUI) === 'true',
  sdWebuiApiUrl: localStorage.getItem(LS_SD_WEBUI_API_URL) || DEFAULT_SD_WEBUI_API_URL,
  sdWebuiBatchSize: parseInt(localStorage.getItem(LS_SD_WEBUI_BATCH_SIZE) || '1', 10) || DEFAULT_SD_WEBUI_BATCH_SIZE,
  sdWebuiRefMode: localStorage.getItem(LS_SD_WEBUI_REF_MODE) || DEFAULT_SD_WEBUI_REF_MODE,
  sdWebuiDenoising: parseFloat(localStorage.getItem(LS_SD_WEBUI_DENOISING) || String(DEFAULT_SD_WEBUI_DENOISING)),
  sdWebuiControlnetModel: localStorage.getItem(LS_SD_WEBUI_CONTROLNET_MODEL) || DEFAULT_SD_WEBUI_CONTROLNET_MODEL,
  sdWebuiModels: getStoredValue(LS_SD_WEBUI_MODELS, []),
  sdWebuiModel: localStorage.getItem(LS_SD_WEBUI_MODEL) || DEFAULT_SD_WEBUI_MODEL,
  maxOutputTokens: getStoredValue(LS_MAX_OUTPUT_TOKENS, DEFAULT_OUTPUT_TOKENS),
  replyLengthLimit: getStoredValue(LS_REPLY_LENGTH_LIMIT, DEFAULT_REPLY_LENGTH_LIMIT),
  compressThreshold: getStoredValue(LS_COMPRESS_THRESHOLD, DEFAULT_COMPRESS_THRESHOLD),
  maxChatLength: getStoredValue(LS_MAX_CHAT_LENGTH, DEFAULT_CHAT_LENGTH),
  temperature: getStoredValue(LS_TEMPRATURE, DEFAULT_TEMPRATURE),
  safetySettings: getStoredValue(LS_SAFETY_SETTINGS, DEFAULT_SAFETY_SETTINGS as unknown as AISafetySettings),
  fontSize: localStorage.getItem(LS_FONT_SIZE) || '16px',
  imageResolution: localStorage.getItem(LS_IMAGE_RESOLUTION) || DEFAULT_IMAGE_RESOLUTION,
  geminiImageSize: localStorage.getItem(LS_GEMINI_IMAGE_SIZE) || DEFAULT_GEMINI_IMAGE_SIZE,
  portraitSaveSize: localStorage.getItem(LS_PORTRAIT_SAVE_SIZE) || DEFAULT_PORTRAIT_SAVE_SIZE,
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    addPersona: (state, action: PayloadAction<Omit<UserProfile, 'id'>>) => {
      const persona: UserProfile = { ...action.payload, id: generatePersonaId() };
      state.personas.push(persona);
      if (!state.activePersonaId) state.activePersonaId = persona.id;
    },
    updatePersona: (state, action: PayloadAction<UserProfile>) => {
      const i = state.personas.findIndex((p) => p.id === action.payload.id);
      if (i !== -1) state.personas[i] = action.payload;
    },
    deletePersona: (state, action: PayloadAction<string>) => {
      state.personas = state.personas.filter((p) => p.id !== action.payload);
      if (state.activePersonaId === action.payload) {
        state.activePersonaId = state.personas[0]?.id || '';
      }
    },
    setActivePersonaId: (state, action: PayloadAction<string>) => {
      state.activePersonaId = action.payload;
    },
    // Bulk-replaces the whole personas array - used by settings import/restore.
    // Entries missing an id (e.g. from a legacy single-profile import) get one
    // generated; if the current active id no longer exists, falls back to the
    // first persona.
    setPersonas: (state, action: PayloadAction<UserProfile[]>) => {
      state.personas = action.payload.map((p) => (p.id ? p : { ...p, id: generatePersonaId() }));
      if (!state.personas.find((p) => p.id === state.activePersonaId)) {
        state.activePersonaId = state.personas[0]?.id || '';
      }
    },
    setChatProvider: (state, action: PayloadAction<string>) => {
      state.chatProvider = action.payload;
    },
    setImageProvider: (state, action: PayloadAction<string>) => {
      state.imageProvider = action.payload;
      // Keep the legacy boolean in sync so any remaining reader of it
      // (imports/exports, older code paths) still sees a consistent value.
      state.useSdWebui = action.payload === 'sdwebui';
    },
    setOllamaBaseUrl: (state, action: PayloadAction<string>) => {
      state.ollamaBaseUrl = action.payload;
    },
    setSelectedModel: (state, action: PayloadAction<string>) => {
      state.selectedModel = action.payload;
    },
    setImageModel: (state, action: PayloadAction<string>) => {
      state.imageModel = action.payload;
    },
    setImageGenPrompt: (state, action: PayloadAction<string>) => {
      state.imageGenPrompt = action.payload;
    },
    setUseSdWebui: (state, action: PayloadAction<boolean>) => {
      state.useSdWebui = action.payload;
    },
    setSdWebuiApiUrl: (state, action: PayloadAction<string>) => {
      state.sdWebuiApiUrl = action.payload;
    },
    setSdWebuiBatchSize: (state, action: PayloadAction<number>) => {
      state.sdWebuiBatchSize = action.payload;
    },
    setSdWebuiRefMode: (state, action: PayloadAction<string>) => {
      state.sdWebuiRefMode = action.payload;
    },
    setSdWebuiDenoising: (state, action: PayloadAction<number>) => {
      state.sdWebuiDenoising = action.payload;
    },
    setSdWebuiControlnetModel: (state, action: PayloadAction<string>) => {
      state.sdWebuiControlnetModel = action.payload;
    },
    setSdWebuiModels: (state, action: PayloadAction<{ title: string; model_name: string }[]>) => {
      state.sdWebuiModels = action.payload;
    },
    setSdWebuiModel: (state, action: PayloadAction<string>) => {
      state.sdWebuiModel = action.payload;
    },
    setMaxOutputTokens: (state, action: PayloadAction<number>) => {
      state.maxOutputTokens = action.payload;
    },
    setReplyLengthLimit: (state, action: PayloadAction<number>) => {
      state.replyLengthLimit = action.payload;
    },
    setCompressThreshold: (state, action: PayloadAction<number>) => {
      state.compressThreshold = action.payload;
    },
    setMaxChatLength: (state, action: PayloadAction<number>) => {
      state.maxChatLength = action.payload;
    },
    setTemperature: (state, action: PayloadAction<number>) => {
      state.temperature = action.payload;
    },
    setSafetySettings: (state, action: PayloadAction<AISafetySettings>) => {
      state.safetySettings = action.payload;
    },
    setFontSize: (state, action: PayloadAction<string>) => {
      state.fontSize = action.payload;
    },
    setImageResolution: (state, action: PayloadAction<string>) => {
      state.imageResolution = action.payload;
    },
    setGeminiImageSize: (state, action: PayloadAction<string>) => {
      state.geminiImageSize = action.payload;
    },
    setPortraitSaveSize: (state, action: PayloadAction<string>) => {
      state.portraitSaveSize = action.payload;
    },
  },
});

export const {
  addPersona,
  updatePersona,
  deletePersona,
  setActivePersonaId,
  setPersonas,
  setChatProvider,
  setImageProvider,
  setOllamaBaseUrl,
  setSelectedModel,
  setImageModel,
  setImageGenPrompt,
  setUseSdWebui,
  setSdWebuiApiUrl,
  setSdWebuiBatchSize,
  setSdWebuiRefMode,
  setSdWebuiDenoising,
  setSdWebuiControlnetModel,
  setSdWebuiModels,
  setSdWebuiModel,
  setMaxOutputTokens,
  setReplyLengthLimit,
  setCompressThreshold,
  setMaxChatLength,
  setTemperature,
  setSafetySettings,
  setFontSize,
  setImageResolution,
  setGeminiImageSize,
  setPortraitSaveSize,
} = settingsSlice.actions;

// The persona characters actually see: the active one, falling back to the
// first persona if activePersonaId somehow points at nothing (stale id).
export const selectActivePersona = (state: RootState): UserProfile | undefined =>
  state.settings.personas.find((p) => p.id === state.settings.activePersonaId) || state.settings.personas[0];

export default settingsSlice.reducer;
