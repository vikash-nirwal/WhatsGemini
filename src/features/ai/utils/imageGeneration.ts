import { AISafetySettings, SDImageParams } from "../../../types";
import { appendCharacterImages } from "./imageProcessing";
import { generateSDImage } from "./sdWebuiUtils";
import { UsageInfo } from "../types";
import { ChatProviderAdapter, ImageProviderAdapter, ProviderRuntimeConfig } from "../providers/types";
import { IMAGE_PROVIDERS } from "../providers/registry";

// The derivation prompt below instructs the model to append a trailing
// [Image Context: ...] tag to its reply so it can recall what it sent in later
// turns - that tag needs to stay in the persisted message text (it's fed back
// as history), but isn't meant for the user to actually see, hear via
// text-to-speech, or get when copying the message. Callers that render/copy/
// speak message text should run it through this first; the DB/history copy
// stays untouched.
export const stripImageContextTag = (text: string): string =>
  text.replace(/\n*\[Image Context:[\s\S]*?\]\s*$/i, "").trimEnd();

export interface ImageDerivationResult {
  derivedImagePrompt: string;
  derivedParams: SDImageParams;
  derivedSummary: string;
  usage?: UsageInfo;
}

// Step 1 of an image request: ask the text model to turn the user's request (plus
// chat context) into an SD-style image prompt, optional generation params, and an
// in-character reply acknowledging the picture. Skipped in favor of the prior
// prompt/params when regenerating an existing image.
//
// isCharacterInitiated distinguishes two very different situations that both flow
// through this function: a real user turn (toggle + message, which may or may not
// literally ask for a picture in its text) vs. a character-initiated follow-up
// (no user message at all - the character is choosing to share a picture on its
// own). Conflating them used to make every image reply say "here's the picture you
// asked for" even when the user's actual text never asked for one.
export const deriveImagePrompt = async (
  chatAdapter: ChatProviderAdapter,
  chatConfig: ProviderRuntimeConfig,
  selectedModel: string,
  turnConfig: { temperature?: number; maxOutputTokens?: number; systemInstruction?: string; safetySettings?: AISafetySettings },
  historyForSdk: import("../types").ChatMessage[],
  prompt: string,
  imageGenPrompt: string,
  sdWebuiModel: string,
  useSdWebui: boolean,
  existingImagePrompt: string | undefined,
  existingImageParams: SDImageParams | undefined,
  signal?: AbortSignal,
  isCharacterInitiated = false,
  isAutoSelfie = false
): Promise<ImageDerivationResult> => {
  if (existingImagePrompt) {
    const regenSummary = isCharacterInitiated || isAutoSelfie
      ? "Here's another look at that same moment.\n[Image Context: Retrying generation of the previous scene]"
      : "Here is the regenerated image you requested.\n[Image Context: Retrying generation of the previous scene]";
    return {
      derivedImagePrompt: existingImagePrompt,
      derivedParams: existingImageParams || {},
      derivedSummary: regenSummary,
    };
  }

  const sdModelInfo = sdWebuiModel
    ? ` The currently active model checkpoint is "${sdWebuiModel}". Tailor your prompt and parameters (especially "sampler_name" and "steps") for this specific model.`
    : " We are using a Stable Diffusion 1.5 model. Use tag-based prompting (e.g., masterpiece, best quality, highly detailed, comma-separated keywords) tailored for SD 1.5.";

  const sdInstruction = useSdWebui
    ? `\n\nPARAMS:\n<A strictly valid JSON object containing optimal generation parameters tailored to the requested image style and model checkpoint. Allowed keys: "cfg_scale" (1.0-15.0), "steps" (15-40), "sampler_name", "width", "height". Determine the optimal width and height (e.g., portrait/selfie 512x768, landscape 768x512, square 512x512) based on the image subject. If a specific model checkpoint is active or a specific artistic style requires it, ALWAYS include the ideal "sampler_name" (e.g., "DPM++ 2M Karras", "Euler a"). Leave the JSON empty {} if no specific tweaking is needed.>`
    : "";
  const parseSection = useSdWebui
    ? `three sections formatted exactly like this:\n\nPROMPT:\n<...>${sdInstruction}\n\nSUMMARY:`
    : `two sections formatted exactly like this:\n\nPROMPT:\n<...>\n\nSUMMARY:`;

  const requestContext = isCharacterInitiated
    ? `(INTERNAL DIRECTIVE) You are sending a follow-up message and have decided, entirely on your own initiative, to share a picture as part of it. There was no request from the user for this - you're choosing to send it because it fits the moment.`
    : isAutoSelfie
      ? `(INTERNAL DIRECTIVE) You are replying to the user's message: "${prompt}" as usual, but you've also decided, entirely on your own initiative, to attach a selfie of yourself to your reply. There was no request for this picture - you just felt like sharing one that fits the moment.`
      : `(INTERNAL DIRECTIVE) The user's message: "${prompt}"\nAn image will be generated to accompany your reply. Base it on the user's message and the surrounding context - do not assume the message itself explicitly asked for a picture unless it actually did.`;

  const summaryInstruction = isCharacterInitiated || isAutoSelfie
    ? `<Respond IN CHARACTER, maintaining your exact persona, personality, and tone, as a natural message. Naturally mention that you're sharing a picture, framed as your own idea - never imply the user asked for it.`
    : `<Respond IN CHARACTER to the user's message above, maintaining your exact persona, personality, and tone. Only say you're "sending/showing the picture they asked for" if their message literally asked for one - otherwise just reply naturally to what they actually said, and let the picture accompany your reply without claiming they requested it.`;

  const selfieStyleHint = isAutoSelfie
    ? " This should read as a casual selfie-style self-portrait (close/medium shot, as if you took it yourself) - but you have full creative freedom over your pose, expression, outfit, setting, and mood to fit the moment."
    : "";

  const derivationPrompt = `${requestContext}${useSdWebui ? sdModelInfo : ""}\n\nYou must function as an expert prompt engineer. Prioritize this base style rule:\n${imageGenPrompt}\n\nPlease output EXACTLY ${parseSection}\n\nPROMPT:\n<write a highly detailed, clean, and optimized tag-based SD 1.5 image generation prompt that fits the scene and context. Make sure the subject matches your visual description.${selfieStyleHint}>${sdInstruction}\n\nSUMMARY:\n${summaryInstruction} MUST INCLUDE: At the end of your response, append [Image Context: <short visual description of the generated image>] so you can remember what you sent in future turns.>`;

  const derivationResult = await chatAdapter.generateChat(
    {
      model: selectedModel,
      systemInstruction: turnConfig.systemInstruction,
      temperature: turnConfig.temperature,
      maxOutputTokens: turnConfig.maxOutputTokens,
      safetySettings: turnConfig.safetySettings,
      history: historyForSdk,
      prompt: derivationPrompt,
      signal,
    },
    chatConfig
  );
  const derivationText = derivationResult.text || "";

  const promptMatch = useSdWebui ? derivationText.match(/PROMPT:\s*([\s\S]*?)PARAMS:/i) : derivationText.match(/PROMPT:\s*([\s\S]*?)SUMMARY:/i);
  const paramsMatch = useSdWebui ? derivationText.match(/PARAMS:\s*([\s\S]*?)SUMMARY:/i) : null;
  const summaryMatch = derivationText.match(/SUMMARY:\s*([\s\S]*)/i);

  let derivedImagePrompt = prompt;
  let derivedParams: SDImageParams = {};
  let derivedSummary = derivationText;

  if (promptMatch && promptMatch[1]) {
    derivedImagePrompt = promptMatch[1].trim();
  }
  if (paramsMatch && paramsMatch[1]) {
    try {
      // Remove any markdown code block formatting if present
      const jsonStr = paramsMatch[1].trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
      derivedParams = JSON.parse(jsonStr);
    } catch (e) {
      console.warn("Failed to parse SD PARAMS json:", e);
    }
  }
  if (summaryMatch && summaryMatch[1]) {
    derivedSummary = summaryMatch[1].trim();
  }

  return { derivedImagePrompt, derivedParams, derivedSummary, usage: derivationResult.usage };
};

export interface ImageGenerationResult {
  images: string[];
  warning?: string;
  usage?: UsageInfo;
}

// Step 2 of an image request: actually render the image, via the local SD WebUI,
// Gemini's native image output, or another configured image provider (e.g. OpenAI).
// Never throws - generation failures come back as a warning so the text reply can
// still be saved.
export const generateImage = async (
  imageProvider: string,
  imageConfig: ProviderRuntimeConfig,
  useSdWebui: boolean,
  imageModelName: string,
  derivedImagePrompt: string,
  derivedParams: SDImageParams,
  characterImages: string[] | undefined,
  characterName: string | undefined,
  safetySettings: AISafetySettings,
  signal?: AbortSignal,
  // Gemini-only for now - ignored by SD WebUI/other providers.
  imageSize?: string,
  aspectRatio?: string
): Promise<ImageGenerationResult> => {
  try {
    if (useSdWebui) {
      const images = await generateSDImage(derivedImagePrompt, derivedParams, characterImages, characterName, signal);
      return { images };
    }

    const adapter: ImageProviderAdapter = IMAGE_PROVIDERS[imageProvider] || IMAGE_PROVIDERS.gemini;
    const referenceImages = characterImages && characterImages.length > 0
      ? await appendCharacterImages(characterImages)
      : undefined;

    const result = await adapter.generateImage(
      { model: imageModelName, prompt: derivedImagePrompt, referenceImages, signal, safetySettings, imageSize, aspectRatio },
      imageConfig
    );
    return { images: result.images, usage: result.usage };
  } catch (err) {
    console.error("Image generation failed:", err);
    return { images: [], warning: "\n\n[Warning: Image generation failed due to API error.]" };
  }
};
