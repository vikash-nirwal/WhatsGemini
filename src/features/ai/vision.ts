// Which chat models can see an attached photo (#48). Providers don't say so
// in a way the browser can ask, so this goes by provider and model name,
// erring towards "no": a photo sent to a model that can't take images makes
// the request fail, while "no" only means it's described in words instead.

// Every current Gemini and Claude chat model accepts images.
const ALWAYS: Record<string, boolean> = { gemini: true, anthropic: true };

// Vision-capable model families by name, wherever they're served from
// (OpenAI, OpenRouter, Qwen, Kimi, GLM, Ollama).
const VISION_NAMES =
  /gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-5|chatgpt-4o|\bo[134](-mini|-pro)?\b|claude|gemini|gemma-?3|vision|[-_.]vl\b|-vl-|qvq|qwen[\d.]*-?vl|qwen-?omni|glm-4(\.\d)?v|llava|bakllava|moondream|minicpm-v|pixtral|llama-?3\.2-?(11|90)b|llama-?4|grok-(2-)?vision|grok-4|kimi-(k\d-)?vl|moonshot-v1-\w+-vision/i;

export const modelSeesImages = (provider: string, model: string): boolean => {
  if (ALWAYS[provider]) return !/gemma-?[12]\b|text-|embedding/i.test(model);
  if (provider === "deepseek") return false;
  return VISION_NAMES.test(model);
};
