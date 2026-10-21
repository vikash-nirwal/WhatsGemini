import { AISafetySettings, SDImageParams, ArtStyle, LocalImageSettings } from "../../../types";
import { appendCharacterImages } from "./imageProcessing";
import { generateSDImage } from "./sdWebuiUtils";
import { UsageInfo } from "../types";
import { ChatProviderAdapter, ImageProviderAdapter, NamedReferenceImages, ProviderRuntimeConfig } from "../providers/types";
import { IMAGE_PROVIDERS } from "../providers/registry";
import { ART_STYLE_CLAUSES, DEFAULT_ART_STYLE } from "../../../utils/constants";
import { AppearanceLock, applyAppearanceLocks, buildAppearanceLockInstruction } from "./appearanceLock";
import { buildImagePromptRequest, ImagePromptTarget, parseImagePromptReply } from "./imagePromptGuide";

// A room's OTHER participants (never the speaking character, who is passed
// separately as characterImages/characterName below) - name + raw appearance
// image refs (local: paths or data: URLs, same shape as Character.appearanceImages)
// for every other character present, so a "picture of us together" request in
// a group chat can actually draw everyone instead of just whoever is replying.
export interface RoomReferenceCharacter {
  name: string;
  images: string[];
}

// The derivation prompt below instructs the model to append a trailing
// [Image Context: ...] tag to its reply so it can recall what it sent in later
// turns - that tag needs to stay in the persisted message text (it's fed back
// as history), but isn't meant for the user to actually see or get when
// copying the message. Callers that render/copy message text should run it
// through this first; the DB/history copy stays untouched.
export const stripImageContextTag = (text: string): string =>
  text.replace(/\n*\[Image Context:[\s\S]*?\]\s*$/i, "").trimEnd();

export interface ImageDerivationResult {
  derivedImagePrompt: string;
  derivedParams: SDImageParams;
  derivedSummary: string;
  usage?: UsageInfo;
}

// Step 1 of an image request: the text model writes the picture's prompt and
// the character's reply. Two calls, because one call doing both did neither
// well and, when it broke the PROMPT/SUMMARY format, sent the user's own
// message to the image model as the prompt:
//   1. In character, with the chat's history: the reply, plus a plain
//      description of what the picture shows (who, how they look right now,
//      what they're doing, where, the light, the framing).
//   2. Out of character: that description rewritten as a prompt for the
//      image model actually in use (`target`, see imagePromptGuide.ts):
//      tags for Stable Diffusion, Pony's score tags, prose for FLUX or OpenAI.
// Skipped in favor of the prior prompt/params when regenerating an image.
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
  target: ImagePromptTarget,
  existingImagePrompt: string | undefined,
  existingImageParams: SDImageParams | undefined,
  signal?: AbortSignal,
  isCharacterInitiated = false,
  isAutoSelfie = false,
  artStyle?: ArtStyle,
  // Locked looks (#34) of the characters who may appear in the picture.
  appearanceLocks: AppearanceLock[] = []
): Promise<ImageDerivationResult> => {
  const lockStyle = target.tags ? "tags" : "sentences";
  if (existingImagePrompt) {
    const regenSummary = isCharacterInitiated || isAutoSelfie
      ? "Here's another look at that same moment.\n[Image Context: Retrying generation of the previous scene]"
      : "Here is the regenerated image you requested.\n[Image Context: Retrying generation of the previous scene]";
    return {
      // Re-applied so a look locked after the first try still reaches the redraw.
      derivedImagePrompt: applyAppearanceLocks(existingImagePrompt, appearanceLocks, lockStyle),
      derivedParams: existingImageParams || {},
      derivedSummary: regenSummary,
    };
  }

  const requestContext = isCharacterInitiated
    ? `(INTERNAL DIRECTIVE) You are sending a follow-up message and have decided, entirely on your own initiative, to share a picture as part of it. There was no request from the user for this - you're choosing to send it because it fits the moment.`
    : isAutoSelfie
      ? `(INTERNAL DIRECTIVE) You are replying to the user's message: "${prompt}" as usual, but you've also decided, entirely on your own initiative, to attach a selfie of yourself to your reply. There was no request for this picture - you just felt like sharing one that fits the moment.`
      : `(INTERNAL DIRECTIVE) The user's message: "${prompt}"\nA picture will go with your reply. Base it on the user's message and the surrounding context - do not assume the message itself explicitly asked for a picture unless it actually did.`;

  const summaryInstruction = isCharacterInitiated || isAutoSelfie
    ? `<Respond IN CHARACTER, maintaining your exact persona, personality, and tone, as a natural message. Naturally mention that you're sharing a picture, framed as your own idea - never imply the user asked for it.`
    : `<Respond IN CHARACTER to the user's message above, maintaining your exact persona, personality, and tone. Only say you're "sending/showing the picture they asked for" if their message literally asked for one - otherwise just reply naturally to what they actually said, and let the picture accompany your reply without claiming they requested it.`;

  const selfieStyleHint = isAutoSelfie
    ? " It's a casual selfie you took yourself (close or medium shot, arm's length), but the pose, expression, outfit, setting and mood are yours to choose for the moment."
    : "";

  const scenePrompt = `${requestContext}

Write two sections, formatted exactly like this:

SCENE:
<What the picture shows, in plain sentences: who is in it and exactly how they look right now (face, hair, build, outfit), what they're doing and their expression, where it is, the light and mood, and the framing (selfie, close-up, upper body, full body, wide shot). Make it match everything this conversation has established. Plain description only: no style keywords or prompt jargon.${selfieStyleHint}>

REPLY:
${summaryInstruction} MUST INCLUDE: At the end of your response, append [Image Context: <short visual description of the picture>] so you can remember what you sent in future turns.>`;

  const sceneResult = await chatAdapter.generateChat(
    {
      model: selectedModel,
      systemInstruction: turnConfig.systemInstruction,
      temperature: turnConfig.temperature,
      maxOutputTokens: turnConfig.maxOutputTokens,
      safetySettings: turnConfig.safetySettings,
      history: historyForSdk,
      prompt: scenePrompt,
      signal,
    },
    chatConfig
  );
  const { scene, reply } = parseSceneReply(sceneResult.text || "", prompt);

  // Folds the character's chosen art style (see ArtStyle/ART_STYLE_CLAUSES,
  // constants.ts) into the same instruction that already carries the user's
  // global base-style preference, so an in-chat auto-selfie or requested
  // image matches the character's established look the same way their main
  // avatar and emotion portraits already do (generateAvatarImage, aiSlice.ts).
  const artStyleClause = ART_STYLE_CLAUSES[artStyle || DEFAULT_ART_STYLE];
  const composed = await composeImagePrompt(chatAdapter, chatConfig, selectedModel, {
    target,
    scene,
    baseStyle: imageGenPrompt,
    artStyleClause,
    lockInstruction: buildAppearanceLockInstruction(appearanceLocks),
    signal,
  });

  // Models still paraphrase sometimes; make sure each locked look is there.
  const derivedImagePrompt = applyAppearanceLocks(composed.prompt || scene, appearanceLocks, lockStyle);
  return {
    derivedImagePrompt,
    derivedParams: composed.params as SDImageParams,
    derivedSummary: reply,
    usage: addUsage(sceneResult.usage, composed.usage),
  };
};

// The SCENE and REPLY sections of the in-character call. Older models
// sometimes answer PROMPT/SUMMARY or skip the labels; whatever comes back,
// the image model gets a description of the moment, never just the user's
// message.
export const parseSceneReply = (text: string, userMessage: string): { scene: string; reply: string } => {
  const sceneMatch = text.match(/(?:SCENE|PROMPT):\s*([\s\S]*?)(?=\n\s*(?:REPLY|SUMMARY|PARAMS):)/i);
  const replyMatch = text.match(/(?:REPLY|SUMMARY):\s*([\s\S]*)$/i);
  const reply = (replyMatch ? replyMatch[1] : text.replace(/(?:SCENE|PROMPT):\s*/i, "")).trim();
  const scene = sceneMatch?.[1].trim()
    || `The picture goes with this moment in the chat. The user said: "${userMessage.trim()}". The reply that comes with the picture: "${stripImageContextTag(reply)}"${/\[Image Context:\s*([^\]]+)\]/i.test(reply) ? `. It shows: ${reply.match(/\[Image Context:\s*([^\]]+)\]/i)![1].trim()}` : ""}`;
  return { scene, reply };
};

const addUsage = (a?: UsageInfo, b?: UsageInfo): UsageInfo | undefined =>
  a && b ? { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens, totalTokens: a.totalTokens + b.totalTokens } : a || b;

// Step 2 on its own: a description of a picture in, a prompt for this image
// model out. Also used for adventure scenes, portraits and backdrops. A
// failed call falls back to the description itself, so the picture still
// gets made.
export const composeImagePrompt = async (
  chatAdapter: ChatProviderAdapter,
  chatConfig: ProviderRuntimeConfig,
  model: string,
  { target, scene, baseStyle, artStyleClause, lockInstruction, extra, signal }: { target: ImagePromptTarget; scene: string; baseStyle?: string; artStyleClause?: string; lockInstruction?: string; extra?: string; signal?: AbortSignal }
): Promise<{ prompt: string; params: Record<string, unknown>; usage?: UsageInfo }> => {
  try {
    const result = await chatAdapter.generateChat(
      { model, history: [], prompt: buildImagePromptRequest({ target, scene, baseStyle, artStyleClause, lockInstruction, extra }), temperature: 0.7, signal },
      chatConfig
    );
    const { prompt, params } = parseImagePromptReply(result.text || "", target.wantsParams);
    return { prompt: prompt || scene, params, usage: result.usage };
  } catch (err) {
    if (signal?.aborted) throw err;
    console.warn("Writing the image prompt failed; using the description as it is:", err);
    return { prompt: scene, params: {} };
  }
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
  aspectRatio?: string,
  // Room-only (Gemini-only for now, see NamedReferenceImages) - every OTHER
  // character present besides characterName/characterImages above.
  otherRoomCharacters?: RoomReferenceCharacter[],
  // Local generation only (#40): the character's seed, LoRA and reference
  // mode, for the SD WebUI and ComfyUI.
  localImageSettings?: LocalImageSettings
): Promise<ImageGenerationResult> => {
  try {
    if (useSdWebui) {
      const images = await generateSDImage(derivedImagePrompt, derivedParams, characterImages, characterName, signal, localImageSettings);
      return { images };
    }

    const adapter: ImageProviderAdapter = IMAGE_PROVIDERS[imageProvider] || IMAGE_PROVIDERS.gemini;
    const hasOthers = otherRoomCharacters && otherRoomCharacters.length > 0;
    const referenceImages = !hasOthers && characterImages && characterImages.length > 0
      ? await appendCharacterImages(characterImages)
      : undefined;

    // Only built when other room participants actually have reference images
    // to contribute - keeps a normal 1:1 chat's call byte-identical to before
    // (flat `referenceImages`, no name labels) since there's only ever one
    // face in play there anyway.
    let referenceCharacters: NamedReferenceImages[] | undefined;
    if (hasOthers) {
      referenceCharacters = [];
      if (characterImages && characterImages.length > 0) {
        referenceCharacters.push({ name: characterName || "the character replying", images: await appendCharacterImages(characterImages) });
      }
      for (const other of otherRoomCharacters!) {
        if (!other.images || other.images.length === 0) continue;
        referenceCharacters.push({ name: other.name, images: await appendCharacterImages(other.images) });
      }
    }

    const result = await adapter.generateImage(
      { model: imageModelName, prompt: derivedImagePrompt, referenceImages, referenceCharacters, signal, safetySettings, imageSize, aspectRatio, localImageSettings },
      imageConfig
    );
    return { images: result.images, usage: result.usage };
  } catch (err) {
    console.error("Image generation failed:", err);
    // The provider's own message says what to fix (a ComfyUI started
    // without CORS, a missing node, a rejected key), so pass it on.
    const reason = err instanceof Error && err.message ? `: ${err.message.slice(0, 300)}` : " due to API error";
    return { images: [], warning: `\n\n[Warning: Image generation failed${reason}.]` };
  }
};
