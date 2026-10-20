import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { performChatCompression, buildValidHistory, buildAutoCompressedMessages, truncateHistory, splitTrailingUserMessages, formatTranscript, TranscriptNames, summarizeConversation, parseChapterReply, CHAPTER_INSTRUCTIONS } from "./ai/utils/chatHistoryUtils";
import { AI, getModelPricing, ART_STYLE_CLAUSES, DEFAULT_ART_STYLE } from "../utils/constants";
import { getProviderApiKey, getOllamaBaseUrl, getWanBaseUrl } from "./ai/utils/settings";
import { extractAndSaveBase64ImagesLocally, stripLeakedBase64 } from "./ai/utils/apiUtils";
import { deriveImagePrompt, generateImage, RoomReferenceCharacter } from "./ai/utils/imageGeneration";
import { generateVideo } from "./ai/utils/videoGeneration";
import { extractEmotionTag } from "./ai/utils/emotionUtils";
import { extractMemoryChanges } from "./ai/utils/memoryExtraction";
import { looksLikeRefusal } from "./ai/utils/refusal";
import { CHAT_PROVIDERS, IMAGE_PROVIDERS, VIDEO_PROVIDERS } from "./ai/providers/registry";
import { ProviderRuntimeConfig } from "./ai/providers/types";
import { ChatMessage, UsageInfo } from "./ai/types";
import { RootState } from "../store/store";
import { SDImageParams, Message, ArtStyle, Character, UserProfile, World, DiaryEntry } from "../types";
import { buildDiaryPrompt, cleanDiaryEntry } from "./ai/utils/diary";
import { buildAdventureSceneImageInstruction, findCastInNarration } from "./ai/utils/adventurePrompt";
import { insertCompressionSummary, fetchChats } from "./chatSlice";
import { resolveTurnModel } from "./ai/modelResolution";
import { AppearanceLock, appearanceLocksFor, applyAppearanceLocks } from "./ai/utils/appearanceLock";
import { insertAdventureCompressionSummary } from "./adventureSlice";

export interface GenerateAIResponseResult {
  text: string;
  tokenCount: number;
  costEstimate: number;
  imagePrompt: string;
  imageParams: SDImageParams;
  images?: string[];
  videoPrompt?: string;
  videos?: string[];
  emotion?: string;
  isRefusal?: boolean;
}

// Resolves the runtime config (API key / base URL) a chat or image provider
// adapter needs to actually make a call. Ollama and Wan are the only
// providers with requiresBaseUrl set today, each with its own storage slot.
const resolveProviderConfig = async (providerId: string, requiresBaseUrl: boolean): Promise<ProviderRuntimeConfig> => ({
  apiKey: await getProviderApiKey(providerId),
  baseUrl: !requiresBaseUrl ? undefined : providerId === "wan" ? getWanBaseUrl() : getOllamaBaseUrl(),
});

// The adapter/config/model for background work (memory extraction, history
// compression): the separately configured helper model when one is set,
// otherwise the main chat model. Lets a user whose main provider filters
// mature content route these calls to one that doesn't, instead of having
// them fail silently.
const resolveHelperCall = async (settings: RootState["settings"]) => {
  const useHelper = Boolean(settings.helperProvider && settings.helperModel && CHAT_PROVIDERS[settings.helperProvider]);
  const providerId = useHelper ? settings.helperProvider : settings.chatProvider;
  const adapter = CHAT_PROVIDERS[providerId] || CHAT_PROVIDERS.gemini;
  const config = await resolveProviderConfig(providerId, adapter.capabilities.requiresBaseUrl);
  if (!config.apiKey && adapter.capabilities.requiresApiKey) {
    throw new Error(`No API key saved for ${providerId}. Add one in Settings.`);
  }
  return { providerId, adapter, config, model: useHelper ? settings.helperModel : settings.selectedModel };
};

// Async Thunk for generating AI response

export const generateAIResponse = createAsyncThunk(
  "ai/generateResponse",
  async ({ prompt, history = [], systemInstruction, postHistoryNote, streamKey, characterImages, characterName, artStyle, isImageRequest = false, isVideoRequest = false, isCharacterInitiated = false, isAutoSelfie = false, existingImagePrompt, existingImageParams, customEmotions, otherRoomCharacters, protectedCount, modelOverride, appearanceLocks }: { prompt: string; history?: ChatMessage[], systemInstruction?: string, postHistoryNote?: string, streamKey?: string, characterImages?: string[], characterName?: string, artStyle?: ArtStyle, isImageRequest?: boolean, isVideoRequest?: boolean, isCharacterInitiated?: boolean, isAutoSelfie?: boolean, existingImagePrompt?: string, existingImageParams?: SDImageParams, customEmotions?: string[], otherRoomCharacters?: RoomReferenceCharacter[], protectedCount?: number, modelOverride?: Character["modelOverride"], appearanceLocks?: AppearanceLock[] }, { getState, dispatch, rejectWithValue, signal }) => {
    try {
      const state = getState() as RootState;
      const settings = state.settings;

      // The replying character's own model settings (#32), falling back to
      // the app's text model settings for anything it doesn't set.
      const turnModel = resolveTurnModel(settings, { modelOverride });
      const chatProviderId = turnModel.provider;
      const chatAdapter = CHAT_PROVIDERS[chatProviderId] || CHAT_PROVIDERS.gemini;
      const chatConfig = await resolveProviderConfig(chatProviderId, chatAdapter.capabilities.requiresBaseUrl);
      if (!chatConfig.apiKey && chatAdapter.capabilities.requiresApiKey) {
        throw new Error(turnModel.overridden && chatProviderId !== settings.chatProvider
          ? `This character uses ${chatProviderId}, but no API key is saved for it. Add one in Settings, or change the character's model.`
          : "API key is missing. Please log in.");
      }

      const imageProviderId = settings.imageProvider;
      const imageAdapter = IMAGE_PROVIDERS[imageProviderId] || IMAGE_PROVIDERS.gemini;
      const useSdWebui = imageProviderId === "sdwebui";
      const imageConfig = useSdWebui
        ? { apiKey: null }
        : await resolveProviderConfig(imageProviderId, imageAdapter.capabilities.requiresBaseUrl);

      // Wan is the only video provider on offer today (see registry.ts) - no
      // settings.videoProvider to resolve, just its model choice. Only
      // actually looked up when a turn is a video request, unlike imageConfig
      // above (image generation predates this and always resolves eagerly).
      const videoProviderId = "wan";
      const videoConfig = isVideoRequest
        ? await resolveProviderConfig(videoProviderId, VIDEO_PROVIDERS[videoProviderId].capabilities.requiresBaseUrl)
        : { apiKey: null };
      const videoModelName = settings.videoModel;

      const selectedModel = turnModel.model;
      const imageModelName = settings.imageModel;

      const turnConfig = {
        maxOutputTokens: settings.maxOutputTokens,
        temperature: turnModel.temperature,
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
      validHistory = truncateHistory(validHistory, settings.maxChatLength, protectedCount);
      // Unanswered user turns at the end (a double-send, a silent send, or -
      // in a room - other characters' lines since this speaker last talked)
      // are folded into the outgoing prompt rather than dropped, so the
      // history still ends on an assistant turn without losing them.
      const { history: trimmedHistory, trailingText } = splitTrailingUserMessages(validHistory);
      validHistory = trimmedHistory;
      // The trailing turns usually already end with the prompt itself (room
      // history labels it "Name: text", which buildValidHistory's exact-match
      // dedupe misses) - don't send it twice.
      const promptAlreadyTrailing = trailingText === prompt || trailingText.endsWith(`\n\n${prompt}`) || trailingText.endsWith(`: ${prompt}`);
      const fullPrompt = !trailingText ? prompt : promptAlreadyTrailing ? trailingText : `${trailingText}\n\n${prompt}`;

      const historyForSdk = [...validHistory];

      let response = "";
      let generatedImages: string[] = [];
      let finalDerivedImagePrompt = "";
      let finalDerivedImageParams: SDImageParams = {};
      let generatedVideos: string[] = [];
      let finalDerivedVideoPrompt = "";

      if (isImageRequest || isVideoRequest) {
        // Same derivation step for both - it just describes the scene; video
        // gets no extra camera-motion-specific instruction yet.
        const derivation = await deriveImagePrompt(
          chatAdapter, chatConfig, selectedModel, turnConfig, historyForSdk, fullPrompt,
          settings.imageGenPrompt, settings.sdWebuiModel, useSdWebui,
          existingImagePrompt, existingImageParams, signal, isCharacterInitiated, isAutoSelfie, artStyle, appearanceLocks
        );
        trackUsage(derivation.usage, chatProviderId, selectedModel);
        response = derivation.derivedSummary;

        if (isVideoRequest) {
          finalDerivedVideoPrompt = derivation.derivedImagePrompt;

          const videoResult = await generateVideo(videoProviderId, videoConfig, videoModelName, derivation.derivedImagePrompt, signal);
          trackUsage(videoResult.usage, videoProviderId, videoModelName);
          generatedVideos = videoResult.videos;
          if (videoResult.warning) response += videoResult.warning;
        } else {
          finalDerivedImagePrompt = derivation.derivedImagePrompt;
          finalDerivedImageParams = derivation.derivedParams;

          const imageResult = await generateImage(
            imageProviderId, imageConfig, useSdWebui, imageModelName, derivation.derivedImagePrompt, derivation.derivedParams,
            characterImages, characterName, settings.safetySettings, signal, settings.geminiImageSize, undefined, otherRoomCharacters
          );
          trackUsage(imageResult.usage, imageProviderId, imageModelName);
          generatedImages = imageResult.images;
          if (imageResult.warning) response += imageResult.warning;
        }
      } else {
        // Throttled so a fast stream doesn't dispatch (and re-render, and
        // re-sync settings to localStorage) on every token.
        let lastEmit = 0;
        const onToken = streamKey
          ? (textSoFar: string) => {
              const now = Date.now();
              if (now - lastEmit < STREAM_UPDATE_INTERVAL_MS) return;
              lastEmit = now;
              dispatch(setStreamingReply({ key: streamKey, text: textSoFar }));
            }
          : undefined;
        if (streamKey) dispatch(setStreamingReply({ key: streamKey, text: "" }));
        let streamed;
        try {
          streamed = await chatAdapter.generateChat(
            {
              model: selectedModel,
              systemInstruction: turnConfig.systemInstruction,
              temperature: turnConfig.temperature,
              maxOutputTokens: turnConfig.maxOutputTokens,
              safetySettings: turnConfig.safetySettings,
              samplers: turnModel.samplers,
              history: historyForSdk,
              prompt: postHistoryNote ? `${fullPrompt}\n\n${postHistoryNote}` : fullPrompt,
              signal,
              onToken,
            },
            chatConfig
          );
        } finally {
          if (streamKey) dispatch(clearStreamingReply());
        }
        trackUsage(streamed.usage, chatProviderId, selectedModel);
        response = streamed.text;
      }

      // Parsed and stripped unconditionally (cheap no-op when the tag isn't
      // present) rather than gated on the character having Emotion Portraits
      // enabled right now - a toggle flip mid-conversation shouldn't require
      // extra plumbing here to stay correct.
      const { text: responseWithoutEmotion, emotion } = extractEmotionTag(response, customEmotions);

      const finalResponseText = await extractAndSaveBase64ImagesLocally(responseWithoutEmotion, generatedImages);

      const returnPayload: GenerateAIResponseResult = {
        text: finalResponseText.trim(),
        tokenCount: totalTokens,
        costEstimate: costEstimate,
        imagePrompt: finalDerivedImagePrompt,
        imageParams: finalDerivedImageParams,
        emotion,
        // Only a plain text reply can be an out-of-character refusal; image/
        // video turns carry a derived scene summary instead.
        isRefusal: !isImageRequest && !isVideoRequest && looksLikeRefusal(finalResponseText) ? true : undefined,
      };

      if (generatedImages.length > 0) {
        returnPayload.images = generatedImages;
      }
      if (generatedVideos.length > 0) {
        returnPayload.videos = generatedVideos;
        returnPayload.videoPrompt = finalDerivedVideoPrompt;
      }

      return returnPayload;
    } catch (error: any) {
      console.error("AI Response Error:", error);
      return rejectWithValue(error.message || "An unexpected error occurred.");
    }
  }
);

// Minimum gap between streamed-text UI updates.
const STREAM_UPDATE_INTERVAL_MS = 60;

interface AIState {
  // The reply currently being streamed, keyed by whatever the caller passed as
  // streamKey (ChatPage uses the chat id) so a view only shows its own.
  streamingReply: { key: string; text: string } | null;
  response: string;
  loading: boolean;
  compressing: boolean;
  error: string | null;
  tokenCount: number;
  costEstimate: number;
}

const initialState: AIState = {
  streamingReply: null,
  response: "",
  loading: false,
  compressing: false,
  error: null,
  tokenCount: 0,
  costEstimate: 0,
};



// If the part of the chat the model sees has grown past
// settings.compressThreshold, summarizes its older portion into one persisted,
// visible summary placed right after the messages it covers (nothing is
// deleted), and returns the chat's new active path; otherwise returns
// `messages` unchanged.
// Called from ChatPage before building turn context for a new send, so the
// compression - and its cost - happens once, up front, rather than being
// silently redone on every subsequent turn.
// Return shape carries this call's own real usage/cost (0 when no summarization
// call actually happened) alongside the resulting message list, so the caller
// can fold a compression's spend into the chat's running total instead of it
// being silently dropped.
// Shared by the chat and adventure versions below: works out whether a
// compression is due and, if so, splices the summary in via `insert` and
// returns the conversation's new active path.
const runAutoCompression = async (
  settings: RootState["settings"],
  messages: Message[],
  names: TranscriptNames | undefined,
  insert: (args: { afterMessageId?: string; afterIndex: number; summaryMessages: Message[] }) => Promise<Message[]>
): Promise<{ messages: Message[]; tokens: number; cost: number; error?: string }> => {
  try {
    if (settings.compressThreshold <= 0) return { messages, tokens: 0, cost: 0 };
    const helper = await resolveHelperCall(settings);

    const result = await buildAutoCompressedMessages(helper.adapter, helper.config, helper.model, messages, settings.compressThreshold, names);
    // `error` lets the caller tell the user compression is failing (e.g. a
    // content filter rejecting the transcript) instead of it silently
    // never happening while the history keeps growing.
    if (!result.compressed || !result.summaryMessages || result.afterIndex == null) return { messages, tokens: 0, cost: 0, error: result.error };

    // Spliced into the tree after the last summarized message - nothing is
    // deleted, and the returned path includes everything plus the summary
    // (prompt building trims to the newest summary).
    const content = await insert({
      afterMessageId: messages[result.afterIndex]?.id,
      afterIndex: result.afterIndex,
      summaryMessages: result.summaryMessages,
    });

    const pricing = getModelPricing(helper.providerId, helper.model);
    const tokens = result.usage?.totalTokens || 0;
    const cost = result.usage
      ? (result.usage.inputTokens / 1_000_000) * pricing.input + (result.usage.outputTokens / 1_000_000) * pricing.output
      : 0;
    return { messages: content, tokens, cost };
  } catch (error: any) {
    console.warn("Auto-compression failed, continuing with full history.", error);
    return { messages, tokens: 0, cost: 0, error: error?.message || String(error) };
  }
};

export const autoCompressChat = createAsyncThunk(
  "ai/autoCompressChat",
  async ({ chatId, messages, names }: { chatId: number; messages: Message[]; names?: TranscriptNames }, { getState, dispatch }) =>
    runAutoCompression((getState() as RootState).settings, messages, names, async (args) => {
      const inserted = await dispatch(insertCompressionSummary({ chatId, ...args })).unwrap();
      dispatch(fetchChats());
      return inserted.content;
    })
);

// Same as autoCompressChat, for an adventure's narrator/player turns.
export const autoCompressAdventure = createAsyncThunk(
  "ai/autoCompressAdventure",
  async ({ adventureId, messages, names }: { adventureId: number; messages: Message[]; names?: TranscriptNames }, { getState, dispatch }) =>
    runAutoCompression((getState() as RootState).settings, messages, names, async (args) => {
      const inserted = await dispatch(insertAdventureCompressionSummary({ adventureId, ...args })).unwrap();
      return inserted.content;
    })
);

// Async Thunk for compressing chat history (manual "Compress" button)
export const compressChatHistory = createAsyncThunk(
  "ai/compressHistory",
  async ({ messages, names, systemInstruction }: { messages: Message[]; names?: TranscriptNames; systemInstruction?: string }, { getState, rejectWithValue }) => {
    try {
      const helper = await resolveHelperCall((getState() as RootState).settings);
      return await performChatCompression(helper.adapter, helper.config, helper.providerId, helper.model, formatTranscript(messages, names), systemInstruction);
    } catch (error: any) {
      console.error("AI Compress Error:", error);
      return rejectWithValue(error.message || "Failed to compress history.");
    }
  }
);

// "End chapter": summarizes the conversation since the last summary into a
// titled chapter - a short recap of just this chapter, plus the usual
// whole-story summary the next replies build on.
export const summarizeChapter = createAsyncThunk(
  "ai/summarizeChapter",
  async ({ messages, names, systemInstruction }: { messages: Message[]; names?: TranscriptNames; systemInstruction?: string }, { getState, rejectWithValue }) => {
    try {
      const helper = await resolveHelperCall((getState() as RootState).settings);
      const { summary: reply, usage } = await summarizeConversation(
        helper.adapter, helper.config, helper.model, formatTranscript(messages, names), systemInstruction, CHAPTER_INSTRUCTIONS
      );
      const parsed = parseChapterReply(reply);
      if (!parsed.summary) throw new Error("The model returned an empty summary.");
      const pricing = getModelPricing(helper.providerId, helper.model);
      const tokens = usage?.totalTokens || 0;
      const cost = usage ? (usage.inputTokens / 1_000_000) * pricing.input + (usage.outputTokens / 1_000_000) * pricing.output : 0;
      return { ...parsed, tokens, cost };
    } catch (error: any) {
      console.error("Chapter summary error:", error);
      return rejectWithValue(error.message || "Failed to summarize the chapter.");
    }
  }
);

// Character diary (#5): one background call writing a short private entry
// in the character's voice about the recent conversation.
export const writeDiaryEntry = createAsyncThunk(
  "ai/writeDiaryEntry",
  async (
    { charName, userName, recentMessages, names, previousEntry }: { charName: string; userName: string; recentMessages: Message[]; names?: TranscriptNames; previousEntry?: DiaryEntry },
    { getState, rejectWithValue }
  ) => {
    try {
      const helper = await resolveHelperCall((getState() as RootState).settings);
      const prompt = buildDiaryPrompt(charName, userName, formatTranscript(recentMessages, names), previousEntry);
      const result = await helper.adapter.generateOnce(prompt, helper.model, helper.config);
      return cleanDiaryEntry(result.text);
    } catch (error: any) {
      console.error("Diary entry error:", error);
      return rejectWithValue(error.message || "Failed to write a diary entry.");
    }
  }
);

// Bare one-shot call with a caller-built instruction and no history - backs the
// Character Editor's "AI assist" buttons (expand a personality idea, draft a
// greeting from the scenario). Same generateOnce path summarization/memory
// extraction use, just with a freeform instruction instead of a fixed prompt.
export const generateAssistText = createAsyncThunk(
  "ai/generateAssistText",
  // `background`: use the cheaper background model (see resolveHelperCall),
  // for helpers like reply suggestions that run after every reply.
  async ({ instruction, background = false }: { instruction: string; background?: boolean }, { getState, rejectWithValue }) => {
    try {
      const state = getState() as RootState;
      const settings = state.settings;
      if (background) {
        const helper = await resolveHelperCall(settings);
        const result = await helper.adapter.generateOnce(instruction, helper.model, helper.config);
        return result.text.trim();
      }
      const chatProviderId = settings.chatProvider;
      const chatAdapter = CHAT_PROVIDERS[chatProviderId] || CHAT_PROVIDERS.gemini;
      const chatConfig = await resolveProviderConfig(chatProviderId, chatAdapter.capabilities.requiresBaseUrl);
      if (!chatConfig.apiKey && chatAdapter.capabilities.requiresApiKey) {
        throw new Error("API key is missing. Please log in.");
      }
      const result = await chatAdapter.generateOnce(instruction, settings.selectedModel, chatConfig);
      return result.text.trim();
    } catch (error: any) {
      console.error("AI Assist Error:", error);
      return rejectWithValue(error.message || "Failed to generate text.");
    }
  }
);

// Generates a character portrait image from a text prompt. Uses the configured
// image provider (Gemini Imagen / OpenAI DALL-E / SD WebUI) with a simple
// portrait-optimized prompt rather than the full deriveImagePrompt pipeline
// (which expects chat history and a conversational context).
export const generateAvatarImage = createAsyncThunk(
  "ai/generateAvatarImage",
  async (
    { name, appearance, visualTags, appearanceImages, emotion, artStyle, hint }: { name: string; appearance?: string; visualTags?: string; appearanceImages?: string[]; emotion?: string; artStyle?: ArtStyle; hint?: string },
    { getState, rejectWithValue }
  ) => {
    try {
      const state = getState() as RootState;
      const settings = state.settings;

      const imageProviderId = settings.imageProvider;
      const useSdWebui = imageProviderId === "sdwebui";
      const imageConfig = useSdWebui
        ? { apiKey: null }
        : await resolveProviderConfig(imageProviderId, IMAGE_PROVIDERS[imageProviderId]?.capabilities.requiresBaseUrl || false);
      const imageModelName = settings.imageModel;

      // Build a portrait-optimized prompt from the character's name + appearance.
      // For an emotion portrait, the reference images (ideally including the
      // existing neutral portrait) keep it recognizably the same character
      // while the prompt's only job is to change the expression/pose.
      // The style clause is pinned explicitly (rather than left as a vague
      // "stylized") so separate generation calls for the same character don't
      // drift between anime/realistic/in-between looks.
      const styleClause = ART_STYLE_CLAUSES[artStyle || DEFAULT_ART_STYLE];
      const parts = [`Character portrait of ${name}`];
      // The locked look first (#34), so every portrait and mood variant
      // starts from the same fixed traits; the free text adds the rest.
      if (visualTags?.trim()) parts.push(visualTags.trim());
      if (appearance) parts.push(appearance);
      if (emotion) parts.push(`Showing a clear, unmistakable "${emotion}" facial expression and body language, same character and outfit as usual`);
      if (hint) parts.push(`Also incorporate this direction: ${hint}`);
      parts.push(`Head and shoulders, 3:4 aspect ratio, ${styleClause}, high quality, detailed`);
      // Emotion portraits are meant to eventually render as a backgroundless
      // sprite (see portraitUtils.ts's removeChromaKeyBackground), so they get
      // a specific, unnatural chroma-key backdrop instead of the main avatar's
      // ordinary "plain background" - magenta rather than the traditional
      // green-screen green, since green shows up far more often in character
      // coloring (eyes, clothing, magic effects) and would get punched out
      // along with the real background. The main avatar (no emotion) keeps
      // the plain-background look with no chroma-key/removal step applied.
      parts.push(
        emotion
          ? 'Solid, perfectly flat, uniform chroma-key background in pure magenta (hex #FF00FF) - no gradient, no shadow, no vignette, no texture, the entire background must be one single uniform color for background removal, only the character visible in the foreground, PNG output'
          : "Plain, uncluttered solid-color background, no scenery or props, only the character visible, PNG output"
      );
      const prompt = parts.join(". ") + ".";

      const result = await generateImage(
        imageProviderId, imageConfig, useSdWebui, imageModelName,
        prompt, {}, // no SD-specific params
        appearanceImages, name,
        settings.safetySettings, undefined, settings.geminiImageSize, "3:4"
      );

      if (!result.images || result.images.length === 0) {
        throw new Error("No image was generated. The image provider returned an empty result.");
      }

      return { images: result.images };
    } catch (error: any) {
      console.error("Avatar generation error:", error);
      return rejectWithValue(error.message || "Failed to generate avatar.");
    }
  }
);

// Illustrates one adventure narrator turn: asks the text model for a scene
// prompt (skipped when regenerating with an existing one), then renders a wide
// image with reference photos of whichever cast members the narration names,
// plus the player's persona photos. Saved to the Image Save Directory the
// same way chat images are, so callers get back local: refs when possible.
export const generateAdventureSceneImage = createAsyncThunk(
  "ai/generateAdventureSceneImage",
  async (
    { narration, world, cast, persona, artStyle, existingImagePrompt, castEmotions, requestedFocus, includeFullCast }: { narration: string; world?: World; cast: Character[]; persona?: UserProfile; artStyle?: ArtStyle; existingImagePrompt?: string; castEmotions?: Record<number, string>; requestedFocus?: string; includeFullCast?: boolean },
    { getState, rejectWithValue }
  ) => {
    try {
      const state = getState() as RootState;
      const settings = state.settings;

      const imageProviderId = settings.imageProvider;
      const useSdWebui = imageProviderId === "sdwebui";
      const imageConfig = useSdWebui
        ? { apiKey: null }
        : await resolveProviderConfig(imageProviderId, IMAGE_PROVIDERS[imageProviderId]?.capabilities.requiresBaseUrl || false);
      const imageModelName = settings.imageModel;

      let tokens = 0;
      let cost = 0;
      const trackUsage = (usage: UsageInfo | undefined, providerId: string, modelName: string) => {
        if (!usage) return;
        tokens += usage.totalTokens;
        const pricing = getModelPricing(providerId, modelName);
        cost += (usage.inputTokens / 1_000_000) * pricing.input + (usage.outputTokens / 1_000_000) * pricing.output;
      };

      // Normally only NPCs the narration names; an explicit request can ask for everyone.
      const presentCast = includeFullCast ? cast : findCastInNarration(narration, cast);
      let imagePrompt = existingImagePrompt;
      if (!imagePrompt) {
        const chatAdapter = CHAT_PROVIDERS[settings.chatProvider] || CHAT_PROVIDERS.gemini;
        const chatConfig = await resolveProviderConfig(settings.chatProvider, chatAdapter.capabilities.requiresBaseUrl);
        if (!chatConfig.apiKey && chatAdapter.capabilities.requiresApiKey) {
          throw new Error("API key is missing. Please log in.");
        }
        const instruction = buildAdventureSceneImageInstruction(
          stripLeakedBase64(narration), world, presentCast, persona,
          ART_STYLE_CLAUSES[artStyle || DEFAULT_ART_STYLE], settings.imageGenPrompt, useSdWebui,
          { castEmotions, requestedFocus, includeFullCast }
        );
        const derivation = await chatAdapter.generateOnce(instruction, settings.selectedModel, chatConfig);
        trackUsage(derivation.usage, settings.chatProvider, settings.selectedModel);
        imagePrompt = derivation.text.trim() || narration;
      }
      // Each drawn NPC's locked look (#34), guaranteed in the final prompt.
      imagePrompt = applyAppearanceLocks(imagePrompt, appearanceLocksFor(presentCast), useSdWebui ? "tags" : "sentences");

      const references: RoomReferenceCharacter[] = presentCast
        .filter((c) => c.appearanceImages && c.appearanceImages.length > 0)
        .map((c) => ({ name: c.name, images: c.appearanceImages! }));
      const personaImages = [...(persona?.avatar ? [persona.avatar] : []), ...(persona?.appearanceImages || [])];
      if (personaImages.length > 0) {
        references.push({ name: `${persona?.name || "The player"} (the player)`, images: personaImages });
      }

      // Always the named-reference path (never a single "speaking character"),
      // since a scene has no one subject the way a chat reply does.
      const result = await generateImage(
        imageProviderId, imageConfig, useSdWebui, imageModelName, imagePrompt,
        useSdWebui ? { width: 768, height: 512 } : {},
        undefined, undefined, settings.safetySettings, undefined, settings.geminiImageSize, "16:9",
        references.length > 0 ? references : undefined
      );
      trackUsage(result.usage, imageProviderId, imageModelName);

      if (!result.images || result.images.length === 0) {
        throw new Error("No image was generated. Check your image provider in Settings.");
      }

      const images = [...result.images];
      await extractAndSaveBase64ImagesLocally("", images);
      return { images, imagePrompt, tokens, cost };
    } catch (error: any) {
      console.error("Adventure scene image error:", error);
      return rejectWithValue(error.message || "Failed to illustrate the scene.");
    }
  }
);

// Async Thunk for working out what to add, correct, drop or reconfirm in
// long-term memory from a slice of recent messages. Returns the changes, not
// a new list - the caller applies them (applyMemoryChanges) to the same
// `memory` snapshot it passed in, since the changes refer to it by index.
export const extractCharacterMemory = createAsyncThunk(
  "ai/extractCharacterMemory",
  async (
    { recentMessages, memory, pinnedMemory, names }: { recentMessages: Message[]; memory: string[]; pinnedMemory: string[]; names?: TranscriptNames },
    { getState, rejectWithValue }
  ) => {
    try {
      const helper = await resolveHelperCall((getState() as RootState).settings);
      const conversationText = formatTranscript(recentMessages, names);

      const { changes } = await extractMemoryChanges(helper.adapter, helper.config, helper.model, conversationText, memory, pinnedMemory, names);
      return changes;
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
    setStreamingReply: (state, action: PayloadAction<{ key: string; text: string }>) => {
      state.streamingReply = action.payload;
    },
    clearStreamingReply: (state) => {
      state.streamingReply = null;
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

export const { clearResponse, setStreamingReply, clearStreamingReply } = aiSlice.actions;
export default aiSlice.reducer;
