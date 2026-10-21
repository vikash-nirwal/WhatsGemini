// Loads WebLLM (#55) from jsDelivr at a pinned version, only when the
// in-browser provider is used. It's about 6 MB, too big for the app's
// service-worker precache, and nobody else should download it, so it isn't
// bundled; the model it runs is fetched from the web the first time anyway.
export const WEBLLM_URL = "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.86/+esm";

// The small part of WebLLM's API the adapter uses.
export interface WebLLMEngine {
  chat: { completions: { create: (params: Record<string, unknown>) => Promise<unknown> } };
  interruptGenerate: () => void;
}
export interface WebLLMModule {
  CreateMLCEngine: (model: string, config?: { initProgressCallback?: (report: { progress: number; text: string }) => void }) => Promise<WebLLMEngine>;
}

export const loadWebLLM = (): Promise<WebLLMModule> => import(/* webpackIgnore: true */ WEBLLM_URL);
