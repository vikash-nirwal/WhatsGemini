// Generation params for a single image request, either produced by the AI's own
// PARAMS derivation step or sent straight through to the SD WebUI txt2img/img2img API.
export interface SDImageParams {
  cfg_scale?: number;
  steps?: number;
  sampler_name?: string;
  width?: number;
  height?: number;
  seed?: number;
}

// A seed message pair injected at the start of a fresh chat (see LS_INITIAL_MESSAGES).
export interface InitialMessage {
  role: string;
  message: string;
}

export interface Message {
  id?: string; // uuid, assigned to every message going forward - required for branching
  timestamp?: number;
  role: "user" | "model" | string;
  txt?: string; // The markdown text
  images?: string[]; // Array of local paths or object URLs
  characterId?: number;
  isSystem?: boolean;
  isCompressionSummary?: boolean; // true for the persisted auto-compress summary message
  isImageRequest?: boolean; // True if it triggered image generation
  isImpersonated?: boolean; // role AI, but the user wrote it themselves (Impersonate mode) - not a real generation
  emotion?: string; // one of EMOTIONS, parsed from the AI's own reply when the character has emotionPortraits enabled
  imagePrompt?: string; // The derived SD prompt used to generate this image
  imageParams?: SDImageParams; // The derived SD params
  sampler_name?: string; // The specific sampler name used
}

// A single node in a chat's conversation tree - one specific message plus its
// position in the branch structure. `Chat.content` is always the flattened
// "active path" through this tree, so every existing consumer keeps reading
// a plain Message[] unchanged.
export interface MessageNode {
  id: string;
  message: Message;
  parentId: string | null;
  childIds: string[];
}

export interface ConversationTree {
  nodes: Record<string, MessageNode>;
}

export interface Chat {
  id: number;
  title: string;
  timestamp: number;
  content: Message[];
  characterId?: number | null;
  tree?: ConversationTree; // undefined until the chat's first branch action
  activeLeafId?: string | null;
  autoReply?: {
    enabled: boolean;
    minDelaySeconds: number; // random delay before a follow-up is picked from [min, max]
    maxDelaySeconds: number;
    maxFollowups: number;
    followupCount: number;
  };
  pinned?: boolean;
  authorNote?: string; // freeform per-chat note injected into every reply
  worldTags?: string[]; // short user-authored lore/setting tags for this chat
  personaId?: string; // overrides the global active persona for just this chat; unset = use the global one
  // Running totals of real provider-reported usage across this chat's whole
  // lifetime (every generateAIResponse call, plus compression/summarization
  // calls) - monotonically increasing, never recomputed from current content,
  // so compressing old messages away doesn't erase what was already spent.
  totalTokensUsed?: number;
  totalCostEstimate?: number;
}

export interface Character {
  id: number;
  name: string;
  description: string;
  prompt: string;
  scenario?: string; // current setting/plot context injected into the system prompt
  first_mes?: string; // greeting used to seed a brand-new chat, instead of the generic global initial messages
  mes_example?: string; // freeform example exchanges, given to the model purely as a style/format reference
  relationship?: string;
  appearance?: string;
  appearanceImages?: string[];
  avatar?: string;
  gallery?: string[];
  accent?: [string, string]; // two-color avatar gradient, e.g. ["#10B981", "#0EA5A0"]
  tags?: string[]; // discoverability tags, e.g. ["Fantasy", "Sci-Fi", "NSFW"]
  memory?: string[]; // durable facts about the user/relationship, extracted over time
  voiceURI?: string; // SpeechSynthesisVoice.voiceURI used to read this character's messages aloud
  autoSelfie?: {
    enabled: boolean;
    frequency: number; // 1-100, % chance each of the character's own replies spontaneously includes a selfie
  };
  // Per-emotion portraits (see EMOTIONS in utils/constants.ts) shown in place
  // of the initials avatar as the AI's reported mood shifts. "neutral" isn't
  // stored here - it's always appearanceImages[0]. Keys are a subset of
  // EMOTIONS; a reported emotion with no entry here falls back to neutral.
  emotionPortraits?: {
    enabled: boolean;
    images: Record<string, string>;
  };
}

// One user persona - "Myself", "Elven Mage", etc. The active one (see
// SettingsState.activePersonaId) is what characters see and address by
// default; a chat can override it via Chat.personaId.
export interface UserProfile {
  id: string;
  name: string;
  bio: string;
  appearance?: string; // physical description, given to image-capable models
  backstory?: string; // background/history a character might reference
}

export interface AISafetySettings {
  harassment: string;
  hate_speech: string;
  sexual: string;
  dangerous: string;
}
