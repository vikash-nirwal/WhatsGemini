import {
  GoogleGenAI,
  Content,
  GenerateContentConfig,
  GenerateContentResponseUsageMetadata,
  SafetySetting,
  HarmCategory,
  HarmBlockThreshold,
  Part,
} from "@google/genai";
import { AISafetySettings } from "../../../types";
import { ChatMessage, UsageInfo } from "../types";
import {
  ChatCallOptions,
  ChatCallResult,
  ChatProviderAdapter,
  ImageGenCallOptions,
  ImageGenCallResult,
  ImageProviderAdapter,
  ProviderRuntimeConfig,
} from "./types";

const toGeminiRole = (role: ChatMessage["role"]): "user" | "model" => (role === "assistant" ? "model" : "user");

const toGeminiHistory = (history: ChatMessage[]): Content[] =>
  history.map((m) => ({ role: toGeminiRole(m.role), parts: [{ text: m.text || " " }] }));

const normalizeUsage = (usage?: GenerateContentResponseUsageMetadata): UsageInfo | undefined => {
  if (!usage) return undefined;
  const inputTokens = usage.promptTokenCount || 0;
  const outputTokens = usage.candidatesTokenCount || 0;
  return { inputTokens, outputTokens, totalTokens: usage.totalTokenCount || inputTokens + outputTokens };
};

// Gemini is the only provider with a safety-settings concept - other adapters
// simply ignore this param.
export const formatSafetySettings = (settings?: AISafetySettings): SafetySetting[] | undefined => {
  if (!settings) return undefined;
  return [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: (settings.harassment || "BLOCK_NONE") as HarmBlockThreshold },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: (settings.hate_speech || "BLOCK_NONE") as HarmBlockThreshold },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: (settings.sexual || "BLOCK_NONE") as HarmBlockThreshold },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: (settings.dangerous || "BLOCK_NONE") as HarmBlockThreshold },
  ];
};

const generateChat = async (opts: ChatCallOptions, config: ProviderRuntimeConfig): Promise<ChatCallResult> => {
  const ai = new GoogleGenAI({ apiKey: config.apiKey || "" });
  const modelConfig: GenerateContentConfig = {
    maxOutputTokens: opts.maxOutputTokens,
    temperature: opts.temperature,
    safetySettings: formatSafetySettings(opts.safetySettings),
  };
  if (opts.systemInstruction) modelConfig.systemInstruction = opts.systemInstruction;

  const chat = ai.chats.create({ model: opts.model, config: modelConfig, history: toGeminiHistory(opts.history) });
  const promptParts: Part[] = [{ text: opts.prompt }];

  // sendMessage's per-call config replaces (rather than merges with) the chat's
  // config, so modelConfig has to be spread back in alongside the signal.
  const stream = await chat.sendMessageStream({ message: promptParts, config: { ...modelConfig, abortSignal: opts.signal } });

  let text = "";
  let usage: GenerateContentResponseUsageMetadata | undefined;
  for await (const chunk of stream) {
    if (opts.signal?.aborted) {
      console.log("AI response generation aborted by user.");
      break;
    }
    try {
      if (chunk.text) text += chunk.text;
      if (chunk.usageMetadata) usage = chunk.usageMetadata;
    } catch (e) {
      console.warn("Could not parse Gemini stream chunk:", e);
    }
  }

  return { text, usage: normalizeUsage(usage) };
};

const generateOnce = async (
  prompt: string,
  model: string,
  config: ProviderRuntimeConfig,
  systemInstruction?: string
): Promise<ChatCallResult> => {
  const ai = new GoogleGenAI({ apiKey: config.apiKey || "" });
  const modelConfig: GenerateContentConfig = {};
  if (systemInstruction) modelConfig.systemInstruction = systemInstruction;

  const result = await ai.models.generateContent({ model, contents: prompt, config: modelConfig });
  return { text: result.text?.trim() || "", usage: normalizeUsage(result.usageMetadata) };
};

export const geminiAdapter: ChatProviderAdapter = {
  id: "gemini",
  capabilities: { supportsImageGen: true, requiresApiKey: true, requiresBaseUrl: false },
  generateChat,
  generateOnce,
};

const generateImage = async (opts: ImageGenCallOptions, config: ProviderRuntimeConfig): Promise<ImageGenCallResult> => {
  const ai = new GoogleGenAI({ apiKey: config.apiKey || "" });

  const promptParts: Part[] = [{ text: opts.prompt }];
  if (opts.referenceCharacters && opts.referenceCharacters.length > 0) {
    // Precedes each character's reference photo(s) with a text part naming
    // them, so a multi-character (group room) request doesn't hand the model
    // one undifferentiated pile of faces - it can tell which reference is
    // whose and place them correctly when the prompt calls for several
    // characters together.
    const namedRefs = opts.referenceCharacters.filter((ref) => ref.images.length > 0);
    for (const ref of namedRefs) {
      promptParts.push({ text: `Reference photo${ref.images.length > 1 ? "s" : ""} of ${ref.name} - match ${ref.name}'s face and appearance to this:` });
      for (const img of ref.images) {
        promptParts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
      }
    }
    // A room hands over every present character's reference photos regardless
    // of who the scene actually calls for (so "us together" requests work) -
    // this guardrail keeps that from leaking bystanders into a scene meant
    // for only one or two of them.
    if (namedRefs.length > 1) {
      promptParts.push({
        text: "Multiple reference characters were provided above only so you know what each named person looks like. Only actually depict the character(s) the description at the top calls for - leave out any reference character it doesn't mention.",
      });
    }
  } else {
    for (const img of opts.referenceImages || []) {
      promptParts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    }
  }

  const imageConfig = (opts.imageSize || opts.aspectRatio)
    ? { imageSize: opts.imageSize, aspectRatio: opts.aspectRatio }
    : undefined;

  const imageRes = await ai.models.generateContent({
    model: opts.model,
    contents: promptParts,
    config: { safetySettings: formatSafetySettings(opts.safetySettings), abortSignal: opts.signal, imageConfig },
  });

  const images: string[] = [];
  const parts = imageRes.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData) {
      images.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
    }
  }
  return { images, usage: normalizeUsage(imageRes.usageMetadata) };
};

export const geminiImageAdapter: ImageProviderAdapter = {
  id: "gemini",
  capabilities: { requiresApiKey: true, requiresBaseUrl: false },
  generateImage,
};
