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
  // Which character (see Chat.characterIds) generated this AI-role message -
  // lets a multi-character room (Phase 12) know who actually said what.
  // Unset on user messages and on messages predating this field, where the
  // chat's sole/primary character (characterIds[0]) is implied instead.
  speakerId?: number;
  isSystem?: boolean;
  isCompressionSummary?: boolean; // true for the persisted auto-compress summary message
  // True for a room-membership notice (e.g. "Aria joined the chat.") added
  // when a character is invited into an existing chat. Rendered as a
  // centered, unattributed notice like isCompressionSummary - unlike
  // isSystem, it stays visible in the log since the point is to mark the
  // seam for the user, not just to prime the model quietly.
  isRoomEvent?: boolean;
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
  // Every character in this chat, in join order (not turn order). A normal
  // 1:1 chat has exactly one; a multi-character room (Phase 12) has 2+.
  // Replaces the old single `characterId` scalar (Phase 11 migration) -
  // characterIds[0] is "the primary character" wherever single-character
  // code still needs just one (headers, avatars, 1:1-chat quick-launch).
  characterIds?: number[];
  // Characters temporarily silenced in a multi-character room - excluded from
  // the round-robin/mention speaker resolution, but still full members of
  // characterIds (their history and any of their past messages stay put).
  // Meaningless for a 1:1 chat.
  mutedParticipantIds?: number[];
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

// Art style used to compose every character-related image generation prompt
// (main avatar, emotion portraits, and in-chat auto-selfies/requested images
// alike) - pins a consistent look across separate generation calls instead
// of leaving style to the model's whim per call.
export type ArtStyle = "anime" | "realistic" | "3d";

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
  artStyle?: ArtStyle;
  avatar?: string;
  gallery?: string[];
  accent?: [string, string]; // two-color avatar gradient, e.g. ["#10B981", "#0EA5A0"]
  tags?: string[]; // discoverability tags, e.g. ["Fantasy", "Sci-Fi", "NSFW"]
  memory?: string[]; // durable facts about the user/relationship, extracted over time
  autoSelfie?: {
    enabled: boolean;
    frequency: number; // 1-100, % chance each of the character's own replies spontaneously includes a selfie
  };
  // Per-emotion portraits (see EMOTIONS in utils/constants.ts) shown in place
  // of the initials avatar as the AI's reported mood shifts, "neutral"
  // included. Keys are a subset of EMOTIONS plus any of this character's own
  // customEmotions; any mood (neutral included) with no entry here falls back
  // to appearanceImages[0] instead.
  emotionPortraits?: {
    enabled: boolean;
    images: Record<string, string>;
    customEmotions?: string[]; // extra single-word moods this character can report, beyond the fixed EMOTIONS list
  };
  loreEntries?: LoreEntry[]; // keyword-triggered world info, injected into the system prompt only when relevant
  personalityTraits?: string[]; // quick-pick trait chips, folded into the system prompt alongside the main `prompt` field
}

// A single Lorebook / World Info entry - a chunk of lore that's only injected
// into the system prompt when one of its keywords actually appears in the
// recent conversation, instead of bloating every reply's context up front.
export interface LoreEntry {
  id: string;
  keywords: string[];
  content: string;
  enabled?: boolean; // defaults to true when unset
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
