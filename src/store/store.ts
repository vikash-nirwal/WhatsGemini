import { configureStore } from "@reduxjs/toolkit";
import chatReducer from "../features/chatSlice";
import characterReducer from "../features/characterSlice";
import aiReducer from "../features/aiSlice";
import settingsReducer from "../features/settingsSlice";
import {
  LS_AI_MODEL,
  LS_MAX_CHAT_LENGTH,
  LS_MAX_OUTPUT_TOKENS,
  LS_REPLY_LENGTH_LIMIT,
  LS_SAFETY_SETTINGS,
  LS_TEMPRATURE,
  LS_FONT_SIZE,
  LS_USER_PERSONAS,
  LS_ACTIVE_PERSONA_ID,
  LS_IMAGE_RESOLUTION,
  LS_GEMINI_IMAGE_SIZE,
  LS_PORTRAIT_SAVE_SIZE,
  LS_IMAGE_MODEL,
  LS_IMAGE_GEN_PROMPT,
  LS_USE_SD_WEBUI,
  LS_SD_WEBUI_API_URL,
  LS_SD_WEBUI_BATCH_SIZE,
  LS_SD_WEBUI_REF_MODE,
  LS_SD_WEBUI_DENOISING,
  LS_SD_WEBUI_CONTROLNET_MODEL,
  LS_SD_WEBUI_MODELS,
  LS_SD_WEBUI_MODEL,
  LS_COMPRESS_THRESHOLD,
  LS_CHAT_PROVIDER,
  LS_IMAGE_PROVIDER,
  LS_OLLAMA_BASE_URL,
  LS_EMOTION_PANEL_ENABLED,
  LS_EMOTION_POPUP_ENABLED,
  LS_EMOTION_POPUP_DURATION,
  LS_ALWAYS_SHOW_INITIALS,
} from "../utils/constants";

// Configure Redux Store
export const store = configureStore({
  reducer: {
    chat: chatReducer,
    character: characterReducer,
    ai: aiReducer,
    settings: settingsReducer,
  },
  devTools: process.env.NODE_ENV !== "production", // Enable Redux DevTools in development
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Subscribe to store changes to sync settings to localStorage
store.subscribe(() => {
  const state = store.getState().settings;
  localStorage.setItem(LS_USER_PERSONAS, JSON.stringify(state.personas));
  localStorage.setItem(LS_ACTIVE_PERSONA_ID, state.activePersonaId);
  localStorage.setItem(LS_CHAT_PROVIDER, state.chatProvider);
  localStorage.setItem(LS_IMAGE_PROVIDER, state.imageProvider);
  localStorage.setItem(LS_OLLAMA_BASE_URL, state.ollamaBaseUrl);
  localStorage.setItem(LS_AI_MODEL, state.selectedModel);
  localStorage.setItem(LS_IMAGE_MODEL, state.imageModel);
  localStorage.setItem(LS_IMAGE_GEN_PROMPT, state.imageGenPrompt);
  localStorage.setItem(LS_USE_SD_WEBUI, state.useSdWebui.toString());
  localStorage.setItem(LS_SD_WEBUI_API_URL, state.sdWebuiApiUrl);
  localStorage.setItem(LS_SD_WEBUI_BATCH_SIZE, state.sdWebuiBatchSize.toString());
  localStorage.setItem(LS_SD_WEBUI_REF_MODE, state.sdWebuiRefMode);
  localStorage.setItem(LS_SD_WEBUI_DENOISING, state.sdWebuiDenoising.toString());
  localStorage.setItem(LS_SD_WEBUI_CONTROLNET_MODEL, state.sdWebuiControlnetModel);
  localStorage.setItem(LS_SD_WEBUI_MODELS, JSON.stringify(state.sdWebuiModels));
  localStorage.setItem(LS_SD_WEBUI_MODEL, state.sdWebuiModel);
  localStorage.setItem(LS_MAX_OUTPUT_TOKENS, JSON.stringify(state.maxOutputTokens));
  localStorage.setItem(LS_REPLY_LENGTH_LIMIT, JSON.stringify(state.replyLengthLimit));
  localStorage.setItem(LS_COMPRESS_THRESHOLD, JSON.stringify(state.compressThreshold));
  localStorage.setItem(LS_MAX_CHAT_LENGTH, JSON.stringify(state.maxChatLength));
  localStorage.setItem(LS_TEMPRATURE, JSON.stringify(state.temperature));
  localStorage.setItem(LS_SAFETY_SETTINGS, JSON.stringify(state.safetySettings));
  localStorage.setItem(LS_FONT_SIZE, state.fontSize);
  localStorage.setItem(LS_IMAGE_RESOLUTION, state.imageResolution);
  localStorage.setItem(LS_GEMINI_IMAGE_SIZE, state.geminiImageSize);
  localStorage.setItem(LS_PORTRAIT_SAVE_SIZE, state.portraitSaveSize);
  localStorage.setItem(LS_EMOTION_PANEL_ENABLED, state.emotionPanelEnabled.toString());
  localStorage.setItem(LS_EMOTION_POPUP_ENABLED, state.emotionPopupEnabled.toString());
  localStorage.setItem(LS_EMOTION_POPUP_DURATION, JSON.stringify(state.emotionPopupDuration));
  localStorage.setItem(LS_ALWAYS_SHOW_INITIALS, state.alwaysShowInitials.toString());
});

// Debug Logging (Only in Development)
// Chats/characters can carry embedded base64 image data, so log their sizes
// instead of full contents - dumping that on every action floods devtools
// and can noticeably slow the page down during active image generation.
if (process.env.NODE_ENV === "development") {
  store.subscribe(() => {
    const state = store.getState();
    console.debug("Updated Redux State:", {
      ...state,
      chat: { ...state.chat, chats: `${state.chat.chats.length} chat(s)` },
      character: { ...state.character, characters: `${state.character.characters.length} character(s)` },
    });
  });
}

export default store;
