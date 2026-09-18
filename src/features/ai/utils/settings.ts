import {
  LS_GOOGLE_API_KEY,
  LS_INITIAL_MESSAGES,
  LS_PROVIDER_API_KEY_PREFIX,
  LS_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_BASE_URL,
  LS_WAN_BASE_URL,
  DEFAULT_WAN_BASE_URL,
} from "../../../utils/constants";
import { InitialMessage } from "../../../types";
import { decryptApiKey, encryptApiKey } from "../../../utils/secureApiKeyStorage";

// Helper function to get values from localStorage with fallbacks
export const getStoredValue = <T>(key: string, defaultValue: T, parser: (val: string) => T = (val) => val as unknown as T): T => {
  try {
    const storedValue = localStorage.getItem(key);
    return storedValue !== null ? parser(storedValue) : defaultValue;
  } catch {
    return defaultValue;
  }
};

export const getInitialMessages = (): InitialMessage[] => {
  try {
    return JSON.parse(localStorage.getItem(LS_INITIAL_MESSAGES) || "[]");
  } catch (error) {
    console.error("Error parsing initial messages from localStorage:", error);
    return [];
  }
};

export const getAPIKey = async (): Promise<string | null> => {
  const stored = getStoredValue<string | null>(LS_GOOGLE_API_KEY, null);
  if (!stored) return null;
  try {
    return await decryptApiKey(stored);
  } catch {
    // Legacy plaintext key (pre-encryption-at-rest) - AuthContext re-encrypts
    // it on next app load, but callers shouldn't fail in the meantime.
    return stored;
  }
};

// Per-provider key storage, namespaced by provider id so OpenAI/Anthropic/DeepSeek/
// Qwen/Kimi each keep their own encrypted-at-rest slot. Gemini keeps using its
// original flat LS_GOOGLE_API_KEY (no migration needed for existing users).
export const getProviderApiKey = async (providerId: string): Promise<string | null> => {
  if (providerId === "gemini") return getAPIKey();
  const stored = getStoredValue<string | null>(`${LS_PROVIDER_API_KEY_PREFIX}${providerId}`, null);
  if (!stored) return null;
  try {
    return await decryptApiKey(stored);
  } catch {
    return stored;
  }
};

export const saveProviderApiKey = async (providerId: string, plaintext: string): Promise<void> => {
  const key = providerId === "gemini" ? LS_GOOGLE_API_KEY : `${LS_PROVIDER_API_KEY_PREFIX}${providerId}`;
  const encrypted = await encryptApiKey(plaintext);
  localStorage.setItem(key, encrypted);
};

export const clearProviderApiKey = (providerId: string): void => {
  const key = providerId === "gemini" ? LS_GOOGLE_API_KEY : `${LS_PROVIDER_API_KEY_PREFIX}${providerId}`;
  localStorage.removeItem(key);
};

// Only Ollama needs a base URL today (it's the only local/self-hosted provider
// on offer) - kept as a single flat key rather than per-provider-namespaced
// since there's only ever one local backend in play at a time.
export const getOllamaBaseUrl = (): string => getStoredValue(LS_OLLAMA_BASE_URL, DEFAULT_OLLAMA_BASE_URL);

// Wan (Wanxiang/DashScope) also needs a base URL - Alibaba Cloud Model Studio
// no longer exposes a fixed host, only per-workspace endpoints, so this has
// no usable default and must be pasted in from the Model Studio console.
export const getWanBaseUrl = (): string => getStoredValue(LS_WAN_BASE_URL, DEFAULT_WAN_BASE_URL);
export const saveWanBaseUrl = (url: string): void => localStorage.setItem(LS_WAN_BASE_URL, url);
