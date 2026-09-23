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
  videos?: string[]; // Array of data: URLs (or provider URLs when not convertible) from video generation
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
  isVideoRequest?: boolean; // True if it triggered video generation (mutually exclusive with isImageRequest)
  isImpersonated?: boolean; // role AI, but the user wrote it themselves (Impersonate mode) - not a real generation
  // Heuristically detected out-of-character refusal ("I can't continue this
  // roleplay..."). Kept visible, but left out of the context sent to the
  // model, memory and summaries - otherwise one refusal teaches every later
  // reply to refuse too. The user can clear the flag if it's a false positive.
  isRefusal?: boolean;
  emotion?: string; // one of EMOTIONS, parsed from the AI's own reply when the character has emotionPortraits enabled
  castEmotions?: Record<number, string>; // adventure narrator turns: character id -> mood for each NPC in the scene
  imagePrompt?: string; // The derived SD prompt used to generate this image
  videoPrompt?: string; // The derived prompt used to generate this video
  imageFullCast?: boolean; // Whether imagePrompt was written to include the whole adventure cast (reused on redraw only while this still matches)
  imageArtStyle?: ArtStyle; // Style baked into imagePrompt (adventure scenes) - a redraw only reuses the prompt while this still matches
  imageParams?: SDImageParams; // The derived SD params
  sampler_name?: string; // The specific sampler name used
  // Adventure mode only: the tappable options parsed out of the model's
  // trailing <<<CHOICES block on this message (and stripped from `txt`
  // before display) - undefined for every ordinary chat message.
  choices?: AdventureChoice[];
  // Set on the user's own next message when it was sent by tapping one of
  // the previous message's `choices` rather than typed free text - lets the
  // UI show which option was picked without guessing from text alone.
  chosenChoiceId?: string;
}

// One tappable option offered at the end of an adventure narrator turn.
export interface AdventureChoice {
  id: string;
  label: string;
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
  // Group-room-only equivalents of Character.scenario/memory (see there) -
  // scoped to this chat instead of any one participant, so a room's plot
  // context and facts learned during it die with the room and never leak
  // into a character's own 1:1 chats. Unset/unused for a 1:1 chat, where
  // the primary character's own scenario/memory apply instead.
  scenario?: string;
  memory?: string[];
  pinnedMemory?: string[]; // room equivalent of Character.pinnedMemory
  personaId?: string; // overrides the global active persona for just this chat; unset = use the global one
  // Per-chat boundaries, sent right before each reply (see buildPostHistoryNote).
  hardLimits?: string[]; // things the story must never include, whatever the rating
  intensity?: Intensity; // how explicit an NSFW chat gets; ignored unless the chat is effectively NSFW
  // Which opening greeting seeds this chat, as an index into getGreetings()
  // (first_mes, then alternateGreetings). Only read while the chat is still
  // empty - picked from the empty-state preview.
  greetingIndex?: number;
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

export type ContentRating = "sfw" | "nsfw";

export type Intensity = "fade" | "suggestive" | "explicit";

// Device-level privacy options. The PIN lock is a privacy screen, not
// encryption: chats stay readable in the browser's storage.
export interface PrivacySettings {
  blurNsfwMedia: boolean; // blur NSFW characters' images until tapped
  discreetMode: boolean; // hide NSFW chats' previews in the chat list
  pinHash?: string; // PBKDF2 hash of the lock PIN; unset = no lock
  pinSalt?: string;
  lockAfterMinutes: number; // re-lock after the app has been in the background this long
}

export interface Character {
  id: number;
  name: string;
  description: string;
  prompt: string;
  scenario?: string; // current setting/plot context injected into the system prompt
  first_mes?: string; // greeting used to seed a brand-new chat, instead of the generic global initial messages
  alternateGreetings?: string[]; // extra opening scenes (card spec `alternate_greetings`), pickable instead of first_mes
  // Card spec `post_history_instructions`: sent after the conversation history,
  // right before the model writes, where instructions carry the most weight.
  postHistoryInstructions?: string;
  creatorNotes?: string; // card spec `creator_notes`: notes for the human, never sent to the model
  mes_example?: string; // freeform example exchanges, given to the model purely as a style/format reference
  relationship?: string;
  appearance?: string;
  appearanceImages?: string[];
  artStyle?: ArtStyle;
  avatar?: string;
  gallery?: string[];
  accent?: [string, string]; // two-color avatar gradient, e.g. ["#10B981", "#0EA5A0"]
  tags?: string[]; // discoverability tags, e.g. ["Fantasy", "Sci-Fi", "NSFW"]
  // Whether explicit content is allowed with this character. "nsfw" only takes
  // effect once adultsConfirmed is set and no minor indicators are found in
  // the card text (see effectiveContentRating); unset = no content rule sent.
  contentRating?: ContentRating;
  adultsConfirmed?: boolean; // author confirmed every character in the card is 18+
  memory?: string[]; // durable facts about the user/relationship, extracted over time
  pinnedMemory?: string[]; // facts the user pinned: always injected, never evicted by the MAX_MEMORY_ENTRIES cap
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
  constant?: boolean; // always injected, keywords or not (card spec `constant`)
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
  avatar?: string; // this persona's own display picture - a local:/data: ref, same shape as Character.appearanceImages entries
  // Extra photos of this persona, same shape/purpose as Character.appearanceImages -
  // given to image-capable models as named reference photos so a scene depicting
  // the user (e.g. "a selfie of us together") keeps their face consistent too.
  appearanceImages?: string[];
}

// Optional sampling knobs beyond temperature. Unset means "don't send it" -
// the provider's own default applies. Not every provider/model accepts every
// knob (Anthropic has no penalties; some Gemini models reject them), so each
// adapter only forwards what its API supports.
export interface SamplerSettings {
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export type RoleplayPov = "auto" | "first" | "second" | "third";

// App-wide roleplay rules folded into every chat character's system prompt,
// so users don't have to repeat them in each character's own prompt.
export interface RoleplayStyle {
  pov: RoleplayPov;
  actionsInAsterisks: boolean;
  neverSpeakForUser: boolean;
  // Tells the model the real current date/time and how long since the last
  // message, so it can react to the user having been away.
  timeAwareness: boolean;
  customInstructions: string;
}

export interface AISafetySettings {
  harassment: string;
  hate_speech: string;
  sexual: string;
  dangerous: string;
}

// A reusable setting/universe a story can be played out in - the Adventure
// equivalent of a Character, but describing a place instead of a person.
// Saved independently so several Adventures can be set in the same world
// without copy-pasting its premise/lore into each one.
export interface World {
  id: number;
  name: string;
  premise: string; // short pitch/summary of the setting, always in scope
  settingDetails?: string; // longer freeform description - history, rules, factions, etc.
  tone?: string; // freeform, e.g. "Grimdark fantasy" - not an enum, matching Character.tags' freedom
  loreEntries?: LoreEntry[]; // reuses the same keyword-triggered world info mechanism as Character.loreEntries
  coverImage?: string; // local:/data: ref, same shape as Character.avatar
  tags?: string[]; // discoverability tags, mirrors Character.tags
}

export type AdventureStatus = "active" | "completed";

// Per-adventure knobs for how the narrator plays it out, separate from the
// premise/cast so the creation wizard's "tone & rules" step has somewhere to
// write without overloading `premise`.
export interface AdventureRules {
  choiceCount?: number; // how many tappable options the narrator should offer each turn; a sensible default applies when unset
  replyLengthLimit?: number; // same budget concept as Character/Chat replies
  safetySettings?: AISafetySettings; // per-adventure override of the global safety settings
  // Scene illustrations: when on, every narrator turn also gets a generated
  // picture of the scene (players can still illustrate any turn by hand when off).
  autoIllustrate?: boolean;
  artStyle?: ArtStyle; // look for scene illustrations; DEFAULT_ART_STYLE applies when unset
}

// A roleplay adventure/story session - deliberately its own entity rather
// than a Chat: an adventure has exactly one narrator voice (never a
// multi-character room), always plays out in a World, and every turn carries
// tappable choices alongside free text. It still reuses Message/
// ConversationTree wholesale, so branching/regenerate work unchanged.
export interface Adventure {
  id: number;
  title: string;
  timestamp: number;
  worldId?: number; // World this adventure is set in; unset = freeform/worldless adventure
  characterIds: number[]; // existing Characters pulled in as NPCs, voiced by the single narrator - never independent speakers
  personaId?: string; // which UserProfile the player is playing as; unset = use the global active persona
  premise?: string; // the opening premise from the creation wizard, on top of the World's own premise
  rules?: AdventureRules;
  status: AdventureStatus;
  content: Message[]; // flattened active path, same shape as Chat.content
  tree?: ConversationTree;
  activeLeafId?: string | null;
  totalTokensUsed?: number;
  totalCostEstimate?: number;
}
