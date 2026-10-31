import { UsageInfo } from "../types";
import { ProviderRuntimeConfig, VideoProviderAdapter } from "../providers/types";
import { VIDEO_PROVIDERS } from "../providers/registry";
import { nameLabels, namesIn, withoutNames } from "./hideNames";

export interface VideoGenerationResult {
  videos: string[];
  warning?: string;
  usage?: UsageInfo;
}

// Mirrors imageGeneration.ts's generateImage - never throws, generation
// failures come back as a warning so the text reply can still be saved.
export const generateVideo = async (
  videoProvider: string,
  videoConfig: ProviderRuntimeConfig,
  videoModelName: string,
  derivedPrompt: string,
  signal?: AbortSignal,
  // Everyone the prompt may name. A video model gets no names either
  // (hideNames.ts); there are no references, so only the ones it mentions
  // are labelled.
  names: (string | undefined)[] = []
): Promise<VideoGenerationResult> => {
  try {
    const adapter: VideoProviderAdapter = VIDEO_PROVIDERS[videoProvider] || VIDEO_PROVIDERS.wan;
    const prompt = withoutNames(derivedPrompt, nameLabels(namesIn(derivedPrompt, names)));
    const result = await adapter.generateVideo({ model: videoModelName, prompt, signal }, videoConfig);
    return { videos: result.videos, usage: result.usage };
  } catch (err) {
    console.error("Video generation failed:", err);
    return { videos: [], warning: "\n\n[Warning: Video generation failed due to API error.]" };
  }
};
