import { nameLabels, withoutNames } from "./hideNames";
import { AISafetySettings, SDImageParams, ArtStyle, LocalImageSettings } from "../../../types";
import { appendCharacterImages } from "./imageProcessing";
import { generateSDImage } from "./sdWebuiUtils";
import { UsageInfo } from "../types";
import { looksBlocked, toneLadder, ToneLevel, toneLevel, toneRetryOn } from "./imageTone";
import { calibrationKey, loadCalibration, startLevel } from "./imageCalibration";
import type { ImageOverrides } from "../imagePresets";
import { ChatProviderAdapter, ContentBlockedError, ImageProviderAdapter, NamedReferenceImages, ProviderRuntimeConfig } from "../providers/types";
import { IMAGE_PROVIDERS } from "../providers/registry";
import { ART_STYLE_CLAUSES, DEFAULT_ART_STYLE } from "../../../utils/constants";
import { AppearanceLock, applyAppearanceLocks, buildAppearanceLockInstruction } from "./appearanceLock";
import { buildImagePromptRequest, ImagePromptTarget, parseImagePromptReply } from "./imagePromptGuide";
import { looksLikePromptRefusal, looksLikeRefusal } from "./refusal";

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
// Only the tag itself: it used to match through to the end of the text, so a
// warning or note added after it (a failed or toned-down picture) vanished.
export const stripImageContextTag = (text: string): string =>
  text.replace(/[ \t]*\n*\[Image Context:[^\]]*\]/gi, "").trimEnd();

export interface ImageDerivationResult {
  derivedImagePrompt: string;
  derivedParams: SDImageParams;
  derivedSummary: string;
  usage?: UsageInfo;
  // The text model refused to describe or prompt the picture. There is no
  // prompt then, and nothing should be sent to the image provider.
  refused?: boolean;
}

// A refusal sent as a prompt gets drawn ("I can't create..." rendered as a
// picture), so a refused or blocked prompt call stops the picture instead.
export const IMAGE_PROMPT_REFUSED_MESSAGE =
  "The text model wouldn't write the prompt for this picture, so nothing was sent to the image or video generator. Try again, or pick a text model that allows this content.";

export class ImagePromptRefusedError extends Error {
  constructor() {
    super(IMAGE_PROMPT_REFUSED_MESSAGE);
    this.name = "ImagePromptRefusedError";
  }
}

// Appended to the character's reply, like the other image warnings.
export const IMAGE_PROMPT_REFUSED_WARNING = `\n\n[Warning: ${IMAGE_PROMPT_REFUSED_MESSAGE}]`;

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
  // A refusal saved as an earlier picture's prompt isn't redrawn either.
  if (existingImagePrompt && looksLikePromptRefusal(existingImagePrompt)) {
    return { derivedImagePrompt: "", derivedParams: {}, derivedSummary: "", refused: true };
  }
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
  // A whole reply that refuses has no SCENE label, so its fallback scene
  // would quote the refusal; check both.
  if (looksLikeRefusal(scene) || looksLikeRefusal(reply)) {
    return { derivedImagePrompt: "", derivedParams: {}, derivedSummary: reply, usage: sceneResult.usage, refused: true };
  }

  // Folds the character's chosen art style (see ArtStyle/ART_STYLE_CLAUSES,
  // constants.ts) into the same instruction that already carries the user's
  // global base-style preference, so an in-chat auto-selfie or requested
  // image matches the character's established look the same way their main
  // avatar and emotion portraits already do (generateAvatarImage, aiSlice.ts).
  const artStyleClause = ART_STYLE_CLAUSES[artStyle || DEFAULT_ART_STYLE];
  let composed: Awaited<ReturnType<typeof composeImagePrompt>>;
  try {
    composed = await composeImagePrompt(chatAdapter, chatConfig, selectedModel, {
      target,
      scene,
      baseStyle: imageGenPrompt,
      artStyleClause,
      lockInstruction: buildAppearanceLockInstruction(appearanceLocks),
      safetySettings: turnConfig.safetySettings,
      signal,
    });
  } catch (err) {
    if (!(err instanceof ImagePromptRefusedError)) throw err;
    return { derivedImagePrompt: "", derivedParams: {}, derivedSummary: reply, usage: sceneResult.usage, refused: true };
  }

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
// model out. Also used for portraits and backdrops. A call that fails for a
// technical reason falls back to the description itself, so the picture
// still gets made. A refusal, in words or as a provider block, throws
// ImagePromptRefusedError instead: falling back there sent the plain-prose
// description to tag models like SDXL, and the refusal text itself got drawn.
// The chat's safety settings go with the call, as they do with the chat's
// own calls; without them Gemini applies its stricter defaults here alone.
export const composeImagePrompt = async (
  chatAdapter: ChatProviderAdapter,
  chatConfig: ProviderRuntimeConfig,
  model: string,
  { target, scene, baseStyle, artStyleClause, lockInstruction, extra, safetySettings, signal }: { target: ImagePromptTarget; scene: string; baseStyle?: string; artStyleClause?: string; lockInstruction?: string; extra?: string; safetySettings?: AISafetySettings; signal?: AbortSignal }
): Promise<{ prompt: string; params: Record<string, unknown>; usage?: UsageInfo }> => {
  try {
    const result = await chatAdapter.generateChat(
      { model, history: [], prompt: buildImagePromptRequest({ target, scene, baseStyle, artStyleClause, lockInstruction, extra }), temperature: 0.7, safetySettings, signal },
      chatConfig
    );
    const { prompt, params } = parseImagePromptReply(result.text || "", target.wantsParams);
    if (looksLikePromptRefusal(prompt)) throw new ImagePromptRefusedError();
    return { prompt: prompt || scene, params, usage: result.usage };
  } catch (err) {
    if (signal?.aborted || err instanceof ImagePromptRefusedError) throw err;
    if (err instanceof ContentBlockedError) throw new ImagePromptRefusedError();
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
  localImageSettings?: LocalImageSettings,
  // The character's art style; ComfyUI picks its checkpoint by it.
  artStyle?: ArtStyle,
  // Toning down (2026-10-27): rewrites the prompt at a level, on the text
  // model. Without it, prompts go as written.
  rewrite?: (prompt: string, level: 1 | 2 | 3) => Promise<string>,
  // A character's image preset (imagePresets.ts): its tone-down and fal
  // SDXL setup in place of the ones in Settings.
  overrides?: ImageOverrides
): Promise<ImageGenerationResult> => {
  // The chosen level first, then - if a service blocks it and retrying is on -
  // each stricter one, keeping the picture's idea.
  // A model the content test was run on starts at the level it drew.
  const tone = overrides?.tone ?? { level: toneLevel(), retry: toneRetryOn() };
  const ladder = rewrite ? toneLadder(startLevel(tone.level, loadCalibration(calibrationKey(imageProvider, imageModelName, overrides?.falLora?.checkpoint))), tone.retry) : [0 as ToneLevel];
  let lastError: unknown;
  for (const level of ladder) {
    if (signal?.aborted) break;
    const prompt = level === 0 || !rewrite ? derivedImagePrompt : await rewrite(derivedImagePrompt, level as 1 | 2 | 3).catch(() => derivedImagePrompt);
    try {
      const result = await drawOnce(prompt);
      return level > 0 && level !== ladder[0] ? { ...result, warning: `\n\n[Note: the picture was toned down to level ${level} so the image service would draw it.]` } : result;
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      if (!(err instanceof ContentBlockedError) && !looksBlocked(message)) break;
    }
  }
  console.error("Image generation failed:", lastError);
  // The provider's own message says what to fix (a ComfyUI started
  // without CORS, a missing node, a rejected key), so pass it on.
  const reason = lastError instanceof Error && lastError.message ? `: ${lastError.message.slice(0, 300)}` : " due to API error";
  return { images: [], warning: `\n\n[Warning: Image generation failed${reason}.]` };

  async function drawOnce(namedPrompt: string): Promise<ImageGenerationResult> {
    // No names go to the image model (hideNames.ts): the prompt and the
    // reference legend say "the character" or "person 1", "person 2".
    const labels = nameLabels([characterName, ...(otherRoomCharacters || []).map((c) => c.name)]);
    const derivedImagePrompt = withoutNames(namedPrompt, labels);
    const labelOf = (name: string | undefined) => (name && labels.get(name.trim())) || "the character";
    if (useSdWebui) {
      // The name still picks the face model on your own SD WebUI; it isn't
      // part of the prompt.
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
        referenceCharacters.push({ name: labelOf(characterName), images: await appendCharacterImages(characterImages) });
      }
      for (const other of otherRoomCharacters!) {
        if (!other.images || other.images.length === 0) continue;
        referenceCharacters.push({ name: labelOf(other.name), images: await appendCharacterImages(other.images) });
      }
    }

    const result = await adapter.generateImage(
      { model: imageModelName, prompt: derivedImagePrompt, referenceImages, referenceCharacters, signal, safetySettings, imageSize, aspectRatio, localImageSettings, artStyle, ...(overrides?.falLora ? { falLora: overrides.falLora } : {}) },
      imageConfig
    );
    return { images: result.images, usage: result.usage };
  }
};
