import { ArtStyle } from "../types";

export const YOU = "you";
export const AI = "ai";
export const MODEL = "model";
export const USER = "user";
export const DB_NAME = "ChatAppDB";
export const CHARACTER = "character";
export const DEFAULT_TEMPRATURE = 0.7;
export const DEFAULT_OUTPUT_TOKENS = 1000;
export const DEFAULT_CHAT_LENGTH = 0;
export const DEFAULT_AI_MODEL = "gemini-2.5-flash";
export const DEFAULT_COMPRESS_THRESHOLD = 0; // Message count; 0 means do not compress automatically
export const DEFAULT_REPLY_LENGTH_LIMIT = 0; // 0 means no target length
export const DEFAULT_AUTO_SELFIE_FREQUENCY = 15; // % chance, once a character's auto-selfie is enabled
export const harmThresholds = [
    { label: "Off", value: "BLOCK_NONE" },
    { label: "Block high", value: "BLOCK_ONLY_HIGH" },
    { label: "Block medium+", value: "BLOCK_MEDIUM_AND_ABOVE" },
    { label: "Block low+", value: "BLOCK_LOW_AND_ABOVE" },
  ];
export const DEFAULT_SAFETY_SETTINGS = {
    harassment: "BLOCK_NONE",
    hate_speech: "BLOCK_NONE",
    sexual: "BLOCK_NONE",
    dangerous: "BLOCK_NONE",
};
// Text-generation models. All of the previous 1.x/2.0 lineup has been shut down by
// Google as of mid-2026 — keep this list to models that are actually live, ordered
// with the recommended default first (models[0] is the fallback if nothing is stored).
export const models = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.1-pro-preview",
];
// Image-output-capable models, offered separately in the image-generation model
// picker. Kept distinct from `models` because most text models above can't emit images.
export const imageModels = [
  "gemini-2.5-flash-image",
  "gemini-3.1-flash-lite-image",
  "gemini-3.1-flash-image",
  "gemini-3-pro-image",
];
// Fixed vocabulary for Phase 8's Emotion Portraits - closed set so the model's
// reported mood reliably maps to a generated image key, and so generating "the
// full set" is a bounded batch rather than open-ended. "neutral" can have its
// own generated portrait like any other mood (a calm/resting expression,
// still chroma-keyed for transparency); until one's generated it simply falls
// back to the character's ordinary main portrait, same as any other
// ungenerated mood (see resolveEmotionPortrait, emotionUtils.ts).
export const EMOTIONS = ["neutral", "happy", "sad", "angry", "surprised", "excited", "shy", "scared", "thinking"];

export const ART_STYLES: { value: ArtStyle; label: string }[] = [
  { value: "anime", label: "Anime" },
  { value: "realistic", label: "Realistic" },
  { value: "3d", label: "3D Animated" },
];
export const DEFAULT_ART_STYLE: ArtStyle = "anime";

// Shared prompt clause per style - single source of truth for both the
// avatar/emotion-portrait generator (aiSlice.ts's generateAvatarImage) and
// the in-chat image-prompt deriver (imageGeneration.ts's deriveImagePrompt),
// so the two never describe a given style differently.
export const ART_STYLE_CLAUSES: Record<ArtStyle, string> = {
  anime: "Anime illustration art style, clean line art, cel-shaded coloring, vibrant anime aesthetic",
  realistic: "Photorealistic style, realistic photography, natural lighting and lifelike skin/hair detail",
  "3d": "3D animated movie style, Pixar/Disney-inspired character design, smooth stylized 3D rendering, soft global illumination, expressive large eyes",
};

// Rough USD-per-1M-token rates (standard tier) used only for the in-app cost estimate
// shown next to the token counter — not billing-accurate. Simplifications: pro-tier
// models with >200k-token pricing tiers use their <=200k rate; image models blend
// text + image output into a single rate dominated by the image-token cost, since the
// SDK's usageMetadata doesn't split text vs. image tokens out separately.
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash": { input: 0.30, output: 2.50 },
  "gemini-2.5-flash-lite": { input: 0.10, output: 0.40 },
  "gemini-2.5-pro": { input: 1.25, output: 10.00 },
  "gemini-3.5-flash-lite": { input: 0.30, output: 2.50 },
  "gemini-3.5-flash": { input: 1.50, output: 9.00 },
  "gemini-3.6-flash": { input: 1.50, output: 7.50 },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.50 },
  "gemini-3.1-pro-preview": { input: 2.00, output: 12.00 },
  "gemini-2.5-flash-image": { input: 0.30, output: 30.00 },
  "gemini-3.1-flash-lite-image": { input: 0.25, output: 30.00 },
  "gemini-3.1-flash-image": { input: 0.50, output: 60.00 },
  "gemini-3-pro-image": { input: 2.00, output: 120.00 },
};
// Non-Gemini provider model pricing, namespaced by "providerId:model" so a
// same-named model from a different vendor can never collide with the bare
// Gemini keys above. Rough USD-per-1M-token estimates, same caveats as above.
export const PROVIDER_MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "openai:gpt-4.1": { input: 2.00, output: 8.00 },
  "openai:gpt-4.1-mini": { input: 0.40, output: 1.60 },
  "openai:gpt-4o": { input: 2.50, output: 10.00 },
  "openai:gpt-4o-mini": { input: 0.15, output: 0.60 },
  "openai:o4-mini": { input: 1.10, output: 4.40 },
  "anthropic:claude-opus-4-1": { input: 15.00, output: 75.00 },
  "anthropic:claude-sonnet-4-5": { input: 3.00, output: 15.00 },
  "anthropic:claude-haiku-4-5": { input: 1.00, output: 5.00 },
  "deepseek:deepseek-chat": { input: 0.28, output: 0.42 },
  "deepseek:deepseek-reasoner": { input: 0.56, output: 1.68 },
  "qwen:qwen-plus": { input: 0.40, output: 1.20 },
  "qwen:qwen-turbo": { input: 0.05, output: 0.20 },
  "qwen:qwen-max": { input: 1.60, output: 6.40 },
  "kimi:moonshot-v1-8k": { input: 0.20, output: 0.20 },
  "kimi:moonshot-v1-32k": { input: 0.40, output: 0.40 },
  "kimi:moonshot-v1-128k": { input: 1.00, output: 1.00 },
  "openai:gpt-image-1": { input: 5.00, output: 40.00 },
  "openai:dall-e-3": { input: 0, output: 40.00 },
};
// Fallback rate for a custom/unrecognized model string (e.g. hand-entered or from an
// imported settings file) so the estimate stays in a sane ballpark instead of reading $0.
export const DEFAULT_MODEL_PRICING = MODEL_PRICING["gemini-2.5-flash-lite"];

// Resolves cost-estimate pricing for any provider/model combination. Ollama is
// genuinely free/local, so it explicitly reports $0 instead of an arbitrary
// fallback rate that would misleadingly suggest a cost.
export const getModelPricing = (providerId: string, model: string): { input: number; output: number } => {
  if (providerId === "ollama") return { input: 0, output: 0 };
  if (providerId === "gemini") return MODEL_PRICING[model] || DEFAULT_MODEL_PRICING;
  return PROVIDER_MODEL_PRICING[`${providerId}:${model}`] || DEFAULT_MODEL_PRICING;
};
// Rough max-context-window sizes (in tokens) per model, used only to color-code
// the pre-send context budget indicator - not authoritative, and intentionally
// conservative for anything not explicitly listed below.
export const MODEL_CONTEXT_WINDOW: Record<string, number> = {
  "gemini-2.5-flash": 1_048_576,
  "gemini-2.5-flash-lite": 1_048_576,
  "gemini-2.5-pro": 1_048_576,
  "gemini-3.5-flash-lite": 1_048_576,
  "gemini-3.5-flash": 1_048_576,
  "gemini-3.6-flash": 1_048_576,
  "gemini-3.1-flash-lite": 1_048_576,
  "gemini-3.1-pro-preview": 1_048_576,
  "gemini-2.5-flash-image": 32_768,
  "gemini-3.1-flash-lite-image": 32_768,
  "gemini-3.1-flash-image": 32_768,
  "gemini-3-pro-image": 32_768,
};
export const PROVIDER_MODEL_CONTEXT_WINDOW: Record<string, number> = {
  "openai:gpt-4.1": 1_047_576,
  "openai:gpt-4.1-mini": 1_047_576,
  "openai:gpt-4o": 128_000,
  "openai:gpt-4o-mini": 128_000,
  "openai:o4-mini": 200_000,
  "anthropic:claude-opus-4-1": 200_000,
  "anthropic:claude-sonnet-4-5": 200_000,
  "anthropic:claude-haiku-4-5": 200_000,
  "deepseek:deepseek-chat": 64_000,
  "deepseek:deepseek-reasoner": 64_000,
  "qwen:qwen-plus": 131_072,
  "qwen:qwen-turbo": 1_000_000,
  "qwen:qwen-max": 32_768,
  "kimi:moonshot-v1-8k": 8_192,
  "kimi:moonshot-v1-32k": 32_768,
  "kimi:moonshot-v1-128k": 131_072,
};
// Fallback for a custom/unrecognized model (hand-entered Ollama model, or an
// imported settings file referencing a model not in the tables above).
export const DEFAULT_MODEL_CONTEXT_WINDOW = 32_768;

export const getModelContextWindow = (providerId: string, model: string): number => {
  if (providerId === "gemini") return MODEL_CONTEXT_WINDOW[model] || DEFAULT_MODEL_CONTEXT_WINDOW;
  if (providerId === "ollama") return DEFAULT_MODEL_CONTEXT_WINDOW;
  return PROVIDER_MODEL_CONTEXT_WINDOW[`${providerId}:${model}`] || DEFAULT_MODEL_CONTEXT_WINDOW;
};

// How many new messages accumulate in a chat before long-term memory extraction
// runs again (independent of the compression threshold, which defaults to off).
export const MEMORY_EXTRACTION_INTERVAL = 12;
// Oldest facts are trimmed once a character's memory list exceeds this size.
export const MAX_MEMORY_ENTRIES = 40;
// How many of the most recent messages are scanned for Lorebook/World Info
// keyword matches before each reply - recent-only keeps matching cheap and
// keeps lore relevant to what's actually being talked about right now.
export const LORE_SCAN_MESSAGE_COUNT = 10;

// Preset 2-color avatar gradients offered when creating/editing a character.
export const CHARACTER_SWATCHES: [string, string][] = [
  ["#10B981", "#0EA5A0"], // Emerald / Teal (default)
  ["#6366F1", "#A855F7"], // Indigo / Purple
  ["#F43F5E", "#FB7185"], // Rose / Pink
  ["#0EA5E9", "#3B82F6"], // Sky / Blue
  ["#1E293B", "#475569"], // Slate / Gray
];

// Common preset options offered by the Character Creation wizard's
// select/chip-select fields, alongside a "Custom"/free-text fallback for
// anything not in these lists.
export const RELATIONSHIP_PRESETS = [
  "Best Friend", "Girlfriend", "Boyfriend", "Wife", "Husband", "Sister", "Brother",
  "Mentor", "Student", "Boss", "Coworker", "Rival", "Enemy", "Stranger", "Assistant",
  "Roommate", "Crush", "Ex",
];
export const TAG_PRESETS = [
  "Fantasy", "Sci-Fi", "Romance", "Horror", "Comedy", "Slice of Life", "Adventure",
  "Mystery", "Drama", "Historical", "Modern", "Anime", "NSFW", "Wholesome", "Dark", "Action",
];
export const PERSONALITY_TRAIT_PRESETS = [
  "Kind", "Sarcastic", "Shy", "Confident", "Playful", "Flirty", "Cold", "Warm",
  "Mischievous", "Loyal", "Intelligent", "Naive", "Brave", "Cautious", "Funny",
  "Blunt", "Gentle", "Dominant", "Submissive", "Stoic", "Energetic", "Calm",
];

export const ROLE = "role";
export const MESSAGE = "message";
export const LIGHT = "light";
export const DARK = "dark";

// Color theme (palette), independent of the light/dark mode above - see
// ThemeContext. "cozy" is the app's existing warm terracotta look and stays
// the default; other entries add a [data-theme="x"] block to tokens.css.
export const COLOR_THEMES: { value: string; label: string; description: string }[] = [
  { value: "cozy", label: "Cozy", description: "Warm terracotta and cream - the original look" },
  { value: "neumorphic", label: "Neumorphic", description: "Soft gray-green palette with raised, pillowy surfaces" },
];
export const DEFAULT_COLOR_THEME = "cozy";

// Local storage variables
export const LS_AI_MODEL = "ai_model";
export const LS_COMPRESS_THRESHOLD = "compress_threshold";
export const LS_IMAGE_MODEL = "image_model";
export const DEFAULT_IMAGE_MODEL = "gemini-2.5-flash-image";
export const LS_IMAGE_GEN_PROMPT = "image_gen_prompt";
export const DEFAULT_IMAGE_GEN_PROMPT = "Create a high quality, detailed image.";
export const LS_MAX_OUTPUT_TOKENS = "max_output_tokens";
export const LS_REPLY_LENGTH_LIMIT = "reply_length_limit";
export const LS_MAX_CHAT_LENGTH = "max_chat_length";
export const LS_TEMPRATURE = "temperature";
export const LS_SAFETY_SETTINGS = "safety_settings";
export const LS_INITIAL_CHAT_MESSAGE = "initial_chat_message";
export const LS_GOOGLE_API_KEY = "google_api_key";
export const LS_THEME = "theme";
export const LS_COLOR_THEME = "color_theme";
export const LS_INITIAL_MESSAGES = "initial_messages";
export const LS_FONT_SIZE = "app_font_size";
export const API_KEY_STORAGE_KEY = "genAI_api_key";
export const LS_IMAGE_RESOLUTION = "image_resolution";

export const IMAGE_RESOLUTIONS = [
  "256x256",
  "512x512",
  "1024x1024"
];
export const DEFAULT_IMAGE_RESOLUTION = "512x512";

// Gemini-only image resolution tier (distinct from IMAGE_RESOLUTIONS above,
// which is SD WebUI's pixel-dimension control) - maps to Gemini 3.x image
// models' `imageConfig.imageSize`. Only the Gemini 3 family documents support
// for this; gemini-2.5-flash-image predates it, so the control is hidden for
// that model rather than sent and silently ignored.
export const LS_GEMINI_IMAGE_SIZE = "gemini_image_size";
export const GEMINI_IMAGE_SIZES = ["512", "1K", "2K", "4K"];
export const DEFAULT_GEMINI_IMAGE_SIZE = "1K";
export const GEMINI_IMAGE_SIZE_SUPPORTED_MODELS = [
  "gemini-3.1-flash-lite-image",
  "gemini-3.1-flash-image",
  "gemini-3-pro-image",
];

// Independent of the Gemini-generation-tier control above: every avatar-style
// portrait (main character portrait + emotion portraits, generated OR
// uploaded) is downscaled client-side to this size before being saved to
// disk, regardless of what resolution it came in at - avatars only ever
// render at 32-96px in the UI, so there's no reason to keep multi-megabyte
// full-resolution files around. "WxH" string, same shape as IMAGE_RESOLUTIONS.
export const LS_PORTRAIT_SAVE_SIZE = "portrait_save_size";
export const DEFAULT_PORTRAIT_SAVE_SIZE = "256x342";
export const LS_USER_PROFILE = "whatsgemini_user_profile"; // legacy single-persona shape, read only for migration
export const LS_USER_PERSONAS = "whatsgemini_user_personas";
export const LS_ACTIVE_PERSONA_ID = "whatsgemini_active_persona_id";
export const LS_USE_SD_WEBUI = "use_sd_webui";
export const LS_SD_WEBUI_API_URL = "sd_webui_api_url";
export const DEFAULT_SD_WEBUI_API_URL = "http://127.0.0.1:7860";
export const LS_SD_WEBUI_BATCH_SIZE = "sd_webui_batch_size";
export const DEFAULT_SD_WEBUI_BATCH_SIZE = 1;
export const LS_SD_WEBUI_REF_MODE = "sd_webui_ref_mode";
export const DEFAULT_SD_WEBUI_REF_MODE = "none";
export const LS_SD_WEBUI_DENOISING = "sd_webui_denoising";
export const DEFAULT_SD_WEBUI_DENOISING = 0.6;
export const LS_SD_WEBUI_CONTROLNET_MODEL = "sd_webui_controlnet_model";
export const DEFAULT_SD_WEBUI_CONTROLNET_MODEL = "ip-adapter_sd15";
export const LS_SD_WEBUI_MODELS = "sd_webui_models";
export const LS_SD_WEBUI_MODEL = "sd_webui_model";
export const DEFAULT_SD_WEBUI_MODEL = "";

// Multi-provider LLM support: which backend serves chat and which serves image
// generation are independent choices (e.g. Anthropic for chat + OpenAI for images).
export const LS_CHAT_PROVIDER = "chat_provider";
export const DEFAULT_CHAT_PROVIDER = "gemini";
export const LS_IMAGE_PROVIDER = "image_provider";
export const DEFAULT_IMAGE_PROVIDER = "gemini";
export const LS_OLLAMA_BASE_URL = "ollama_base_url";
export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1";
// Namespaced per provider id so each provider keeps its own encrypted-at-rest key,
// independent of Gemini's existing LS_GOOGLE_API_KEY.
export const LS_PROVIDER_API_KEY_PREFIX = "provider_api_key_";

// Hardcoded model choices offered per hosted chat provider. Ollama is
// intentionally omitted - its model list is whatever the user has pulled
// locally, so that provider gets a free-text field / a "fetch installed
// models" button instead of a fixed dropdown.
export const PROVIDER_CHAT_MODELS: Record<string, string[]> = {
  gemini: models,
  openai: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini", "o4-mini"],
  anthropic: ["claude-opus-4-1", "claude-sonnet-4-5", "claude-haiku-4-5"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  qwen: ["qwen-plus", "qwen-turbo", "qwen-max"],
  kimi: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
};

// Of the requested providers, only Gemini and OpenAI have real image-generation
// APIs (plus the separately-handled local SD WebUI option) - see registry.ts.
export const PROVIDER_IMAGE_MODELS: Record<string, string[]> = {
  gemini: imageModels,
  openai: ["gpt-image-1", "dall-e-3"],
};

// Auto-backup reminder: everything lives only in this browser's IndexedDB,
// so a periodic nudge is the only thing standing between a user and silent
// data loss (cleared cache, browser reinstall, etc).
export const LS_FIRST_USED_AT = "first_used_at";
export const LS_LAST_BACKUP_AT = "last_backup_at";
export const LS_BACKUP_REMINDER_SNOOZE_UNTIL = "backup_reminder_snooze_until";
export const BACKUP_REMINDER_INTERVAL_DAYS = 7;

// Bundled demo character offered on first run, so a brand-new user has
// something to click into immediately instead of a blank character list.
export const SAMPLE_CHARACTER = {
  name: "Aria",
  description: "A warm, witty, endlessly curious companion - happy to chat about anything.",
  prompt:
    "You are Aria: warm, witty, and genuinely curious about the person you're talking to. Ask real follow-up questions, share your own (fictional) opinions and small anecdotes, and keep replies conversational rather than long. You're supportive without being sycophantic, and you have a light, easy sense of humor.",
  relationship: "New Friend",
  accent: CHARACTER_SWATCHES[0],
};
