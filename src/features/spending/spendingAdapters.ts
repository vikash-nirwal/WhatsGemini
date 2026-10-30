import { ChatProviderAdapter, ImageProviderAdapter, VideoProviderAdapter } from "../ai/providers/types";
import { UsageInfo } from "../ai/types";
import { estimateTokens } from "../ai/utils/tokenEstimator";
import { assertWithinBudget, recordSpend } from "./spending";
import { recordTokens, takePurpose } from "./tokenUsage";

// Wrappers that registry.ts puts around every provider adapter, like the
// prompt inspector's withRequestLog, so every paid call (chat replies,
// helper calls, image prompts, adventures, pictures, videos) is checked
// against the monthly limit and then recorded without any caller having to
// remember to.

// Some providers don't report usage on a streamed reply (OpenRouter, Kimi,
// GLM). Counting those as $0 would hide real spending, so the text length
// stands in, with the same rough 4-characters-per-token rule as the context
// meter.
const usageOrEstimate = (usage: UsageInfo | undefined, inputTexts: (string | undefined)[], output: string): UsageInfo => {
  if (usage && usage.totalTokens > 0) return usage;
  const inputTokens = inputTexts.reduce((sum, t) => sum + estimateTokens(t), 0);
  const outputTokens = estimateTokens(output);
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
};

export const withChatSpending = (adapter: ChatProviderAdapter): ChatProviderAdapter => ({
  ...adapter,
  // The purpose (tokenUsage.ts) is taken first, before anything awaits.
  generateChat: async (opts, config) => {
    const purpose = takePurpose();
    assertWithinBudget(adapter.id);
    const result = await adapter.generateChat(opts, config);
    const inputs = [opts.systemInstruction, ...opts.history.map((m) => m.text), opts.prompt];
    const usage = usageOrEstimate(result.usage, inputs, result.text);
    recordSpend({ kind: "text", providerId: adapter.id, model: opts.model, usage });
    recordTokens(purpose, usage);
    return result;
  },
  generateOnce: async (prompt, model, config, systemInstruction) => {
    const purpose = takePurpose();
    assertWithinBudget(adapter.id);
    const result = await adapter.generateOnce(prompt, model, config, systemInstruction);
    const usage = usageOrEstimate(result.usage, [systemInstruction, prompt], result.text);
    recordSpend({ kind: "text", providerId: adapter.id, model, usage });
    recordTokens(purpose, usage);
    return result;
  },
});

export const withImageSpending = (adapter: ImageProviderAdapter): ImageProviderAdapter => ({
  ...adapter,
  generateImage: async (opts, config) => {
    assertWithinBudget(adapter.id);
    const result = await adapter.generateImage(opts, config);
    if (result.images.length > 0) {
      recordSpend({ kind: "image", providerId: adapter.id, model: opts.model, usage: result.usage, count: result.images.length });
    }
    return result;
  },
});

export const withVideoSpending = (adapter: VideoProviderAdapter): VideoProviderAdapter => ({
  ...adapter,
  generateVideo: async (opts, config) => {
    assertWithinBudget(adapter.id);
    const result = await adapter.generateVideo(opts, config);
    if (result.videos.length > 0) {
      recordSpend({ kind: "video", providerId: adapter.id, model: opts.model, usage: result.usage, count: result.videos.length });
    }
    return result;
  },
});
