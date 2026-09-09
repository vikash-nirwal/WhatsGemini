import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { performChatCompression, buildValidHistory, buildAutoCompressedMessages, truncateHistory, trimTrailingUserMessages } from "./ai/utils/chatHistoryUtils";
import { AI, YOU, getModelPricing } from "../utils/constants";
import { getProviderApiKey, getOllamaBaseUrl } from "./ai/utils/settings";
import { extractAndSaveBase64ImagesLocally, stripLeakedBase64 } from "./ai/utils/apiUtils";
import { deriveImagePrompt, generateImage } from "./ai/utils/imageGeneration";
import { extractMemoryFacts } from "./ai/utils/memoryExtraction";
import { CHAT_PROVIDERS, IMAGE_PROVIDERS } from "./ai/providers/registry";
import { ProviderRuntimeConfig } from "./ai/providers/types";
import { ChatMessage, UsageInfo } from "./ai/types";
import { RootState } from "../store/store";
import { SDImageParams, Message } from "../types";
import { updateMessages, fetchChats } from "./chatSlice";

export interface GenerateAIResponseResult {
  text: string;
  tokenCount: number;
  costEstimate: number;
  imagePrompt: string;
  imageParams: SDImageParams;
  images?: string[];
}

// Resolves the runtime config (API key / base URL) a chat or image provider
// adapter needs to actually make a call.
const resolveProviderConfig = async (providerId: string, requiresBaseUrl: boolean): Promise<ProviderRuntimeConfig> => ({
  apiKey: await getProviderApiKey(providerId),
  baseUrl: requiresBaseUrl ? getOllamaBaseUrl() : undefined,
});

// Async Thunk for generating AI response

export const generateAIResponse = createAsyncThunk(
  "ai/generateResponse",
  async ({ prompt, history = [], systemInstruction, characterImages, characterName, isImageRequest = false, isCharacterInitiated = false, isAutoSelfie = false, existingImagePrompt, existingImageParams }: { prompt: string; history?: ChatMessage[], systemInstruction?: string, characterImages?: string[], characterName?: string, isImageRequest?: boolean, isCharacterInitiated?: boolean, isAutoSelfie?: boolean, existingImagePrompt?: string, existingImageParams?: SDImageParams }, { getState, rejectWithValue, signal }) => {
    try {
      const state = getState() as RootState;
      const settings = state.settings;

      const chatProviderId = settings.chatProvider;
      const chatAdapter = CHAT_PROVIDERS[chatProviderId] || CHAT_PROVIDERS.gemini;
      const chatConfig = await resolveProviderConfig(chatProviderId, chatAdapter.capabilities.requiresBaseUrl);
      if (!chatConfig.apiKey && chatAdapter.capabilities.requiresApiKey) {
        throw new Error("API key is missing. Please log in.");
      }

      const imageProviderId = settings.imageProvider;
      const imageAdapter = IMAGE_PROVIDERS[imageProviderId] || IMAGE_PROVIDERS.gemini;
      const useSdWebui = imageProviderId === "sdwebui";
      const imageConfig = useSdWebui
        ? { apiKey: null }
        : await resolveProviderConfig(imageProviderId, imageAdapter.capabilities.requiresBaseUrl);

      const selectedModel = settings.selectedModel;
      const imageModelName = settings.imageModel;

      const turnConfig = {
        maxOutputTokens: settings.maxOutputTokens,
        temperature: settings.temperature,
        systemInstruction,
        safetySettings: settings.safetySettings,
      };

      let totalTokens = 0;
      let costEstimate = 0;

      // Adds a call's usage to the running totals, priced by whichever provider/model
      // actually served that call (a turn can span the selected text model and the image model).
      const trackUsage = (usage: UsageInfo | undefined, providerId: string, modelName: string) => {
        if (!usage) return;
        totalTokens += usage.totalTokens;
        const pricing = getModelPricing(providerId, modelName);
        costEstimate += (usage.inputTokens / 1_000_000) * pricing.input + (usage.outputTokens / 1_000_000) * pricing.output;
      };

      // Prepare the context: dedupe, hard-cap by estimated token count, and make
      // sure it ends on an assistant turn. (Auto-compression already happened, if
      // needed, before this thunk was dispatched - see autoCompressChat.)
      let validHistory = buildValidHistory(history, prompt);
      validHistory = truncateHistory(validHistory, settings.maxChatLength);
      validHistory = trimTrailingUserMessages(validHistory);

      const historyForSdk = [...validHistory];

      let response = "";
      let generatedImages: string[] = [];
      let finalDerivedImagePrompt = "";
      let finalDerivedImageParams: SDImageParams = {};

      if (isImageRequest) {
        const derivation = await deriveImagePrompt(
          chatAdapter, chatConfig, selectedModel, turnConfig, historyForSdk, prompt,
          settings.imageGenPrompt, settings.sdWebuiModel, useSdWebui,
          existingImagePrompt, existingImageParams, signal, isCharacterInitiated, isAutoSelfie
        );
        trackUsage(derivation.usage, chatProviderId, selectedModel);

        finalDerivedImagePrompt = derivation.derivedImagePrompt;
        finalDerivedImageParams = derivation.derivedParams;
        response = derivation.derivedSummary;

        const imageResult = await generateImage(
          imageProviderId, imageConfig, useSdWebui, imageModelName, derivation.derivedImagePrompt, derivation.derivedParams,
          characterImages, characterName, settings.safetySettings, signal
        );
        trackUsage(imageResult.usage, imageProviderId, imageModelName);
        generatedImages = imageResult.images;
        if (imageResult.warning) response += imageResult.warning;
      } else {
        const streamed = await chatAdapter.generateChat(
          {
            model: selectedModel,
            systemInstruction: turnConfig.systemInstruction,
            temperature: turnConfig.temperature,
            maxOutputTokens: turnConfig.maxOutputTokens,
            safetySettings: turnConfig.safetySettings,
            history: historyForSdk,
            prompt,
            signal,
          },
          chatConfig
        );
        trackUsage(streamed.usage, chatProviderId, selectedModel);
        response = streamed.text;
      }

      const finalResponseText = await extractAndSaveBase64ImagesLocally(response, generatedImages);

      const returnPayload: GenerateAIResponseResult = {
        text: finalResponseText.trim(),
        tokenCount: totalTokens,
        costEstimate: costEstimate,
        imagePrompt: finalDerivedImagePrompt,
        imageParams: finalDerivedImageParams
      };

      if (generatedImages.length > 0) {
        returnPayload.images = generatedImages;
      }

      return returnPayload;
    } catch (error: any) {
      console.error("AI Response Error:", error);
      return rejectWithValue(error.message || "An unexpected error occurred.");
    }
  }
);

interface AIState {
  response: string;
  loading: boolean;
  compressing: boolean;
  error: string | null;
  tokenCount: number;
  costEstimate: number;
}

const initialState: AIState = {
  response: "",
  loading: false,
  compressing: false,
  error: null,
  tokenCount: 0,
  costEstimate: 0,
};



// If the chat's estimated token count has grown past settings.compressThreshold,
// summarizes the aged-out portion into one persisted, visible message and returns
// the resulting (shorter) message list; otherwise returns `messages` unchanged.
// Called from ChatPage before building turn context for a new send, so the
// compression - and its cost - happens once, up front, rather than being
// silently redone on every subsequent turn.
export const autoCompressChat = createAsyncThunk(
  "ai/autoCompressChat",
  async ({ chatId, messages }: { chatId: number; messages: Message[] }, { getState, dispatch }) => {
    try {
      const state = getState() as RootState;
      const settings = state.settings;
      const chatAdapter = CHAT_PROVIDERS[settings.chatProvider] || CHAT_PROVIDERS.gemini;
      const chatConfig = await resolveProviderConfig(settings.chatProvider, chatAdapter.capabilities.requiresBaseUrl);
      if (!chatConfig.apiKey && chatAdapter.capabilities.requiresApiKey) return messages;

      const result = await buildAutoCompressedMessages(chatAdapter, chatConfig, settings.selectedModel, messages, settings.compressThreshold);
      if (!result.compressed) return messages;

      await dispatch(updateMessages({ chatId, newMessages: result.messages }));
      dispatch(fetchChats());
      return result.messages;
    } catch (error) {
      console.warn("Auto-compression failed, continuing with full history.", error);
      return messages;
    }
  }
);

// Async Thunk for compressing chat history
export const compressChatHistory = createAsyncThunk(
  "ai/compressHistory",
  async ({ history = [], systemInstruction }: { history: ChatMessage[], systemInstruction?: string }, { rejectWithValue }) => {
    try {
      return await performChatCompression(history, systemInstruction);
    } catch (error: any) {
      console.error("AI Compress Error:", error);
      return rejectWithValue(error.message || "Failed to compress history.");
    }
  }
);

// Async Thunk for extracting long-term character memory from a slice of recent messages
export const extractCharacterMemory = createAsyncThunk(
  "ai/extractCharacterMemory",
  async (
    { recentMessages, existingMemory }: { recentMessages: Message[]; existingMemory: string[] },
    { getState, rejectWithValue }
  ) => {
    try {
      const state = getState() as RootState;
      const settings = state.settings;
      const chatProviderId = settings.chatProvider;
      const chatAdapter = CHAT_PROVIDERS[chatProviderId] || CHAT_PROVIDERS.gemini;
      const chatConfig = await resolveProviderConfig(chatProviderId, chatAdapter.capabilities.requiresBaseUrl);
      if (!chatConfig.apiKey && chatAdapter.capabilities.requiresApiKey) {
        throw new Error("API key is missing. Please log in.");
      }

      const selectedModel = settings.selectedModel;

      const conversationText = recentMessages
        .map((m) => `${m.role === YOU ? "User" : "AI"}: ${stripLeakedBase64(m.txt || "")}`)
        .join("\n\n");

      const { facts } = await extractMemoryFacts(chatAdapter, chatConfig, selectedModel, conversationText, existingMemory);
      return facts;
    } catch (error: any) {
      console.error("Memory extraction error:", error);
      return rejectWithValue(error.message || "Failed to extract memory.");
    }
  }
);

// AI Slice
const aiSlice = createSlice({
  name: AI,
  initialState,
  reducers: {
    clearResponse: (state) => {
      state.response = "";
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(generateAIResponse.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(generateAIResponse.fulfilled, (state, action) => {
        state.loading = false;
        state.response = action.payload.text;
        state.tokenCount = action.payload.tokenCount;
        state.costEstimate = action.payload.costEstimate;
      })
      .addCase(generateAIResponse.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(compressChatHistory.pending, (state) => {
        state.compressing = true;
        state.error = null;
      })
      .addCase(compressChatHistory.fulfilled, (state) => {
        state.compressing = false;
      })
      .addCase(compressChatHistory.rejected, (state, action) => {
        state.compressing = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearResponse } = aiSlice.actions;
export default aiSlice.reducer;
