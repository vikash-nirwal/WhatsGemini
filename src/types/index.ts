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
  // Set on a summary made by "End chapter": its title and a short recap of
  // just that chapter (the summary text itself covers the whole story so far).
  chapterTitle?: string;
  chapterRecap?: string;
  episodeTeaser?: string; // an episode's "Next time on..." (#103), on its summary
  // True for a room-membership notice (e.g. "Aria joined the chat.") added
  // when a character is invited into an existing chat. Rendered as a
  // centered, unattributed notice like isCompressionSummary - unlike
  // isSystem, it stays visible in the log since the point is to mark the
  // seam for the user, not just to prime the model quietly.
  isRoomEvent?: boolean;
  isImageRequest?: boolean; // True if it triggered image generation
  isVideoRequest?: boolean; // True if it triggered video generation (mutually exclusive with isImageRequest)
  isImpersonated?: boolean; // role AI, but the user wrote it themselves (Impersonate mode) - not a real generation
  isNarration?: boolean; // a /narrate line: neither the user nor a character speaking (stored with role "you")
  bookmarked?: boolean; // starred by the user to find again (#21)
  // Heuristically detected out-of-character refusal ("I can't continue this
  // roleplay..."). Kept visible, but left out of the context sent to the
  // model, memory and summaries - otherwise one refusal teaches every later
  // reply to refuse too. The user can clear the flag if it's a false positive.
  isRefusal?: boolean;
  emotion?: string; // one of EMOTIONS, parsed from the AI's own reply when the character has emotionPortraits enabled
  thoughts?: string; // the character's hidden inner thoughts for this reply (#10), never sent back to the model
  photoDescription?: string; // what a helper model saw in a photo the user sent (#48), for later turns
  // A voice note (#44): shown as a playable bubble and spoken with the
  // speaker's voice when played. Only the text is stored; the user's own
  // reach the model as "(voice note) ...".
  isVoiceNote?: boolean;
  // A reply to a status (#117, #129), shown as a quoted card above the text.
  quotedStatus?: { owner: "you" | number; text: string; photo?: boolean };
  // A quoted reply (#119): the message this one answers, as it read then.
  replyTo?: { id?: string; text: string; from: "you" | number };
  // View-once photos (#122): opens once, then only "Opened" is left.
  viewOnce?: boolean;
  viewedOnce?: boolean;
  // Forwarded (#123): something passed along, shown as a "Forwarded" card.
  forward?: { text: string };
  // A poll in a group chat (#124), from you or a member.
  poll?: Poll;
  // A shared contact (#128): who it is, and the character made from it.
  contactCard?: { name: string; about: string; characterId?: number };
  reaction?: string; // the user's emoji reaction to this message (#11)
  // The character's emoji reaction to this (user) message (#11), and who
  // reacted in a room.
  characterReaction?: { emoji: string; speakerId?: number };
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
  secretRevealed?: boolean; // this reply told one of the character's secrets (#81)
  notes?: MessageNote[]; // small story notes under a reply: a dream, a fight, a lie caught... (#93-#100)
  swapped?: boolean; // written while you and the character had swapped roles (#105)
  // Set on the user's own next message when it was sent by tapping one of
  // the previous message's `choices` rather than typed free text - lets the
  // UI show which option was picked without guessing from text alone.
  chosenChoiceId?: string;
  // Adventures as games (#25, #26): the player's state after a narrator
  // turn, what changed in it, and a skill check rolled for a player's turn.
  gameState?: AdventureGameState;
  gameChanges?: string[];
  skillCheck?: SkillCheck;
  beat?: number; // the story-script beat (1-based) this reply was written in (#57)
  correction?: string; // language practice (#67): the fix for this message of yours
  translation?: string; // language practice (#67): this reply in your language
}

// What a story note under a reply says (#93-#100); see storyNotes.ts.
export type MessageNote = "texted-first" | "dream" | "upset" | "made-up" | "lie-caught" | "rumor";

// One tappable option offered at the end of an adventure narrator turn.
export interface AdventureChoice {
  id: string;
  label: string;
  check?: { skill?: string; dc: number }; // a skill check this action needs (#26)
}

// The player's stats, inventory and quests in an adventure (#25), kept by
// the app; the narrator only reports changes.
export interface AdventureQuest {
  title: string;
  done?: boolean;
}

export interface AdventureGameState {
  hp: number;
  maxHp: number;
  gold: number;
  items: string[];
  quests: AdventureQuest[];
}

// A d20 roll for a choice's skill check (#26).
export interface SkillCheck {
  skill?: string;
  dc: number;
  roll: number;
  modifier: number;
  total: number;
  success: boolean;
}

// One line of a persona's character sheet (#27), added to skill checks.
export interface PersonaSkill {
  name: string;
  modifier: number;
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

// A character's daily routine (#7), in hour blocks (0-24; a block can wrap
// past midnight).
export interface ScheduleBlock {
  start: number;
  end: number;
  activity: string; // "at work", "asleep"
  status: "free" | "busy" | "asleep";
}
export interface CharacterSchedule {
  blocks: ScheduleBlock[];
  realistic?: boolean; // replies wait a little while they're busy or asleep
}

// A status a character posted (#8), shown for a day.
export interface CharacterStatus {
  id: string;
  text: string;
  image?: string;
  createdAt: number;
  seen?: boolean;
  // The feed (#85): which characters liked it, whether you did, and the
  // comments under it (yours, the poster's answers and the others').
  likes?: number[];
  likedByYou?: boolean;
  mentionsYou?: boolean; // tags you as @you (#129)
  comments?: StatusComment[];
}

// A group chat poll (#124): votes carry the time they're cast, and only
// those whose time has come are shown.
export interface PollVote {
  voter: "you" | number;
  name?: string; // the member's name when they voted, for the transcript
  option: number;
  at: number;
}

export interface Poll {
  question: string;
  options: string[];
  votes: PollVote[];
}

// Channels (#127): a followed, follow-only feed from a character or a
// world, kept with its posts in the database's settings table.
export interface ChannelPost {
  id: string;
  text: string;
  at: number;
  yourReaction?: string;
}

export interface Channel {
  id: string; // "character-3", "world-2"
  kind: "character" | "world";
  refId: number;
  followedAt: number;
  posts: ChannelPost[];
  lastPostAt?: number;
  lastReadAt?: number;
}

// Your own status (#117): what you posted, and when each character saw it,
// liked it, commented or replied privately (decided when posted, with times
// a little later; only what's "happened" by now is shown).
export interface MyStatus {
  id: string;
  text: string;
  image?: string; // a shrunk data: URL
  createdAt: number;
  views?: { characterId: number; at: number }[];
  likes?: { characterId: number; at: number }[];
  comments?: StatusComment[];
  replies?: { characterId: number; text: string; at: number; sent?: boolean }[];
}

export interface StatusComment {
  id: string;
  from: number | "you"; // a character id, or you
  text: string;
  at: number;
}

// One of a character's outfits (#50).
export interface Outfit {
  id: string;
  name: string; // "Work clothes"
  description: string; // the visual description used in pictures
}

// A date that matters to a character and the user (#47).
export interface ImportantDate {
  id: string;
  label: string; // "Your birthday", "The day we met"
  month: number; // 1-12
  day: number;
  year?: number; // when known, for "26 years"
  messageOnDay: boolean; // the character reaches out first on the day
  lastCelebratedYear?: number; // so that happens once a year
}

// The scene's tracked state (#9): kept on the chat, updated by each reply.
export interface SceneState {
  location?: string;
  time?: string;
  outfit?: string;
  affection?: number; // 0-100
  trust?: number; // 0-100
  present?: string[]; // group chats (#69): which members are in the scene; unset = everyone
  meters?: Record<string, number>; // custom meters (#71), by lower-case name, 0-100
  updatedAt?: number;
}

// Ambient sound (#89): what can play behind a chat.
export type AmbientSound = "rain" | "cafe" | "fireplace" | "sea" | "city";

// A plan you and the character agreed on (#84). `date` is YYYY-MM-DD when
// it could be worked out; `when` is how it was said ("Saturday afternoon").
export interface SharedPlan {
  id: string;
  what: string;
  when?: string;
  date?: string;
  createdAt: number;
  doneAt?: number;
}

// A secret a character keeps (#81), and when it can come out.
export interface CharacterSecret {
  id: string;
  text: string;
  reveal: "stage" | "trust" | "asked";
  stage?: RelationshipStage; // reveal "stage": from this stage on
  trust?: number; // reveal "trust": from this trust (0-100) on
}

// A nickname, running joke or ritual you share with a character (#96).
export interface InsideJoke {
  id: string;
  text: string;
  at: number;
}

// The character is upset with you (#97) until you make up.
export interface ChatConflict {
  about: string;
  since: number;
}

// Something the character is dealing with in their own life (#110).
export interface Preoccupation {
  id: string;
  text: string;
  since: number;
  resolvedAt?: number;
  outcome?: string; // how it ended
}

// What a character's day has been like (#107), written once a day. Empty text
// means the model gave nothing usable; it still counts as written for the day.
export interface CharacterDayLog {
  date: string; // dayKey
  text: string;
  writtenAt: number;
}

// When a fact was learned and last came up (#109), keyed by the fact's text
// like memoryCategories.
export interface MemoryFactDates {
  learnedAt: number;
  mentionedAt?: number;
}

// A mood that carries over between replies (#106): what the character felt,
// how strongly (3 = fully, 1 = a trace), what set it off, and when it was
// last felt (it fades from there).
export interface ChatMood {
  feeling: string;
  intensity: 1 | 2 | 3;
  cause?: string;
  since: number;
  updatedAt: number;
}

// A lie the character told (#100): what they said and the truth, which the
// user only sees by asking for it.
export interface ToldLie {
  id: string;
  said: string;
  truth: string;
  at: number;
  caught?: number; // when it came out
}

// A rumor a character heard about you (#98), from another character's chat.
export interface Rumor {
  id: string;
  fromId: number; // whose chat it started in
  heard: string; // the version that reached them, a little wrong
  truth: string;
  at: number;
  raised?: number; // when they brought it up
}

// A chat that isn't the main story (#102, #104): a flashback before you met,
// or the character in another world. It keeps its own memory.
export interface WhatIfChat {
  kind: "flashback" | "universe";
  title: string; // "Childhood", "Noir"
  setting: string; // what the scene or world is
  userRole?: string; // flashbacks: who you play in it
  parentChatId?: number; // the chat it started from
  endedAt?: number;
}

// A gift between you and a character (#82).
export interface Gift {
  id: string;
  what: string;
  at: number;
  from: "you" | "character";
  chatId?: number;
}

// A photo in a character's private album (#75).
export interface AlbumPhoto {
  id: string;
  image: string; // local:/data: ref
  caption?: string;
  unlockAt?: RelationshipStage; // locked until the chat reaches this stage
  sentAt?: number; // sent to you on a special date
}

// Romance details for a character or persona (#73); every field optional.
export interface IntimacyProfile {
  loveLanguage?: string;
  likes?: string;
  dislikes?: string;
  flirting?: string;
  jealousy?: string;
  experience?: string;
}

// Relationship stages (#70), lowest first.
export type RelationshipStage = "strangers" | "flirting" | "dating" | "intimate" | "committed";

// Language practice (#67): what you're learning in a chat, and how well.
export interface ChatLanguage {
  target: string;
  level: "beginner" | "intermediate" | "advanced";
  translateInto?: string; // your own language; the browser's when unset
}

// A letter a character wrote while you were away (#61).
export interface CharacterLetter {
  id: string;
  at: number;
  text: string;
  chatId?: number;
  read?: boolean;
}

// A conversation two room members had while you were away (#58).
export interface OffscreenTalk {
  id: string;
  at: number;
  lines: { speakerId: number; text: string }[];
  seen?: boolean;
}

// How one room member feels about another (#24); only `fromId` sees it.
export interface RoomRelationship {
  fromId: number;
  toId: number;
  note: string;
}

// A mini-game being played in a chat (#52).
export type GameKind = "twenty-questions" | "would-you-rather" | "truth-or-dare";
export interface ChatGame {
  kind: GameKind;
  guesser?: "user" | "character"; // 20 Questions: who guesses
  turns: number; // replies to the user since the game started
  startedAt: number;
}

// Story script (#57): the story a chat stays inside. See storyScript.ts.
export interface StoryBeat {
  id: string;
  text: string;
}
export interface StoryScript {
  premise: string;
  beats: StoryBeat[];
  directions: string;
  ending?: string;
  // strict: nothing outside the script; loose: improvise between beats.
  mode: "strict" | "loose";
  currentBeat: number; // index into beats; beats.length once all are done
}

// A "Previously on..." recap (#46), written for the chat's last message at
// the time and reused until the story moves on.
export interface ChatRecap {
  text: string;
  forMessageId: string;
  createdAt: number;
  dismissed?: boolean;
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
  // A WhatsApp chat list (#115): when you last looked at the chat (replies
  // after it count as unread), no alerts for it, and kept out of the list.
  readAt?: number;
  muted?: boolean;
  archived?: boolean;
  leftOnReadUntil?: number; // #126: they've read it, and answer at this time
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
  memoryCategories?: Record<string, MemoryCategory>; // see Character.memoryCategories
  memoryDates?: Record<string, MemoryFactDates>; // see Character.memoryDates (#109)
  callbackAt?: number; // when a fact from a while back was last offered to a reply (#109)
  // 1:1 chats only: "chat" keeps this chat's facts in its own Chat.memory
  // (like a room), so a what-if chat doesn't leak into the character's main
  // story. Unset or "character" shares the character's memory. Rooms always
  // keep their own.
  memoryScope?: "character" | "chat";
  replySuggestions?: boolean; // show 3 tappable reply ideas after each reply (#16)
  textingMode?: boolean; // this chat's texting mode (#6); unset = the app setting
  sceneTracker?: boolean; // track location, time, outfit and two meters (#9)
  worldId?: number; // a World whose setting and lore this chat uses (#28)
  backdrop?: string; // a picture behind this chat's bubbles (#13)
  // Rooms only (#22-#24): who answers a message, a narrator between rounds,
  // and what members feel about each other.
  turnMode?: "round-robin" | "natural" | "everyone";
  narrator?: boolean;
  roomRelationships?: RoomRelationship[];
  innerThoughts?: boolean; // every member writes a hidden thought with each reply (#10)
  arcCheckedAt?: number; // message count at the last character-growth check (#60)
  arcSuggestion?: string; // a growth note waiting for the user's OK
  offscreenTalk?: boolean; // members talk among themselves while you're away (#58)
  language?: ChatLanguage; // language practice mode (#67)
  coWriting?: boolean; // write one shared story instead of chatting (#68)
  choiceMoments?: boolean; // turning points come with tappable options (#87)
  moodTint?: boolean; // the background takes a soft colour from the character's mood (#90)
  plans?: SharedPlan[]; // plans made together (#84)
  planTracking?: boolean; // a helper check notices plans in the chat (#84)
  revealedSecrets?: string[]; // ids of the character's secrets told in this chat (#81)
  insideJokes?: InsideJoke[]; // #96
  jokeTracking?: boolean; // a helper check notices inside jokes (#96)
  jokesCheckedAt?: number; // message count at the last check
  conflicts?: boolean; // fights that need making up (#97)
  conflict?: ChatConflict; // the character is upset with you now
  moodCarry?: boolean; // moods linger for a few hours and colour the next replies (#106)
  mood?: ChatMood;
  jealousy?: boolean; // the character notices time you spend in other chats (#99)
  lies?: boolean; // the character may lie (#100)
  toldLies?: ToldLie[];
  whatIf?: WhatIfChat; // a flashback or another world (#102, #104)
  pendingHook?: string; // the cliffhanger the next reply picks up (#103)
  roleSwap?: { since: number; bodySwap?: boolean }; // you play the character and the AI plays you (#105)
  ambient?: { on?: boolean; sound?: AmbientSound | "auto"; volume?: number }; // ambient sound (#89); volume 0-1
  stage?: RelationshipStage; // relationship stage (#70); unset = off
  stageCheckedAt?: number; // message count at the last stage check
  stageSuggestion?: RelationshipStage; // a stage change waiting for the user's OK
  meters?: string[]; // the scene tracker's own meters (#71), in place of affection and trust
  boldness?: 1 | 2 | 3 | 4 | 5; // how forward the character is (#72); unset = as written
  offscreenTalks?: OffscreenTalk[]; // the last few of those conversations
  // Relationship that evolves (#30): off when false; the message count at
  // the last check; and a suggestion waiting for the user.
  relationshipSuggestions?: boolean;
  relationshipCheckedAt?: number;
  relationshipSuggestion?: { from: string; to: string };
  sceneState?: SceneState;
  recap?: ChatRecap; // the cached "Previously on..." card (#46), never sent to the model
  storyScript?: StoryScript; // the story this chat follows (#57)
  game?: ChatGame; // the mini-game being played (#52)
  gameScore?: { user: number; character: number }; // games won, where there's a winner
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

export interface DiaryEntry {
  id: string;
  timestamp: number;
  chatId?: number; // the chat it was written about
  text: string;
}

// Per-character settings for local image generation (#40), used by the SD
// WebUI (and ComfyUI) instead of the app-wide ones when set.
export interface LocalImageSettings {
  seed?: number; // fixed seed, so the same prompt gives the same person
  loraName?: string; // LoRA file name without extension, e.g. "mira_v2"
  loraWeight?: number; // usually 0.6-1.0
  loraTrigger?: string; // the LoRA's trigger word(s)
  referenceMode?: "none" | "img2img" | "controlnet" | "reactor"; // how reference photos are used
  reactorFaceModel?: string; // ReActor face model name (without .safetensors)
}

// How often a character replies with a voice note (#44), decided by the
// app, not the model.
export type VoiceNoteFrequency = "off" | "sometimes" | "often";

// A character's text-to-speech voice (#12), from the browser's own Web
// Speech voices. Voices differ between devices, so the name and language are
// kept too: they pick the closest voice where the saved one doesn't exist.
// Where a character lives (#112): a city with its coordinates and time zone.
export interface CharacterHome {
  city: string;
  country?: string;
  countryCode?: string; // ISO 3166-1 alpha-2, for public holidays
  lat: number;
  lon: number;
  timeZone: string; // IANA, e.g. "Europe/Lisbon"
}

// How they write (#111): texting habits kept to in every reply.
export interface WritingStyle {
  length?: "short" | "medium" | "long";
  lowercase?: boolean;
  punctuation?: "sparse" | "normal" | "careful";
  emoji?: "none" | "rare" | "often";
  abbreviations?: boolean;
  doubleTexts?: boolean; // a thought split over several texts
}

export interface CharacterVoice {
  voiceURI?: string; // unset = the browser's default voice
  voiceName?: string;
  lang?: string;
  rate?: number; // 0.5-2, 1 when unset
  pitch?: number; // 0-2, 1 when unset
  voiceNotes?: VoiceNoteFrequency; // "off" when unset
  flatTone?: boolean; // #76: don't change rate and pitch with the reply's mood
}

// What a long-term memory fact is about.
export type MemoryCategory = "user" | "relationship" | "story";

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
  // Locked look for pictures (#34): a fixed, comma-separated list of visual
  // traits that goes into every image prompt word for word.
  visualTags?: string;
  localImageSettings?: LocalImageSettings; // #40, local generation only
  innerThoughts?: boolean; // #10: also write hidden thoughts with each reply
  growth?: string[]; // accepted notes on how they've changed (#60)
  writesLetters?: boolean; // writes you a letter after a few days away (#61)
  intimacy?: IntimacyProfile; // romance details, sent only when the scene is romantic (#73)
  knowsAbout?: number[]; // other characters whose bond with you this one knows of (#74)
  album?: AlbumPhoto[]; // private album (#75)
  gifts?: Gift[]; // given both ways, oldest first (#82)
  secrets?: CharacterSecret[]; // #81
  letters?: CharacterLetter[];
  textsFirst?: boolean; // sends a short text first after a few quiet hours (#93)
  firstTexts?: number[]; // when they did, the last few
  firstTextLimit?: number; // how many texts first in a row without an answer, 1-5 (1 when unset)
  dreams?: boolean; // now and then tells you a dream they had (#94)
  lastDreamAt?: number;
  badDays?: boolean; // some days they're off (#95)
  dayLogs?: boolean; // one account of their day, written once a day, for every prompt (#107)
  dayLog?: CharacterDayLog; // today's (or the last one written)
  textingSlips?: 1 | 2; // texting imperfections (#108): a few or plenty; unset = clean
  preoccupations?: boolean; // has things of their own going on, written weekly (#110)
  concerns?: Preoccupation[]; // open ones and the last few finished
  concernsWrittenAt?: number;
  dayMood?: { date: string; mood: string }; // today's mood picked by hand; mood "" = a good day
  spreadsRumors?: boolean; // what you tell them can get around (#98)
  rumors?: Rumor[]; // rumors they heard about you
  pastEvents?: string[]; // their past, from flashbacks (#102)
  importantDates?: ImportantDate[]; // #47
  schedule?: CharacterSchedule; // #7
  postsStatuses?: boolean; // #8: posts a status now and then
  statusPhotos?: boolean; // #118: every other status comes with a photo
  viewOncePhotos?: boolean; // #122: about half the photos they send are view-once
  // Profile changes (#125): their About line and a changed profile photo
  // (the avatar; appearanceImages stay the references for their look).
  about?: string;
  profilePhoto?: string;
  profileChanges?: boolean;
  profileChangedAt?: number;
  profileChangeCount?: number;
  leavesOnRead?: 1 | 2 | 3; // #126: sometimes, often or always reads and answers later
  statuses?: CharacterStatus[];
  wardrobe?: Outfit[]; // #50
  currentOutfitId?: string; // the outfit being worn now (#50); none = the locked look's own
  voice?: CharacterVoice; // #12/#44: how they sound when read aloud, and how often they send voice notes
  writingStyle?: WritingStyle; // how they write (#111)
  home?: CharacterHome; // where they live (#112): local time, weather and holidays
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
  // What each fact (memory or pinned, keyed by its text) is about - for
  // grouping in the Scene panel. Facts with no entry show as "Other".
  memoryCategories?: Record<string, MemoryCategory>;
  memoryDates?: Record<string, MemoryFactDates>; // when each fact was learned and last came up (#109)
  misremembers?: boolean; // now and then gets a small detail wrong and corrects themselves (#109)
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
  // Character diary (#5): when on, the character writes a short first-person
  // entry every DIARY_INTERVAL messages in chats that share its memory; the
  // latest entry goes back into its prompt.
  diaryEnabled?: boolean;
  diary?: DiaryEntry[]; // oldest first, capped at MAX_DIARY_ENTRIES
  personalityTraits?: string[]; // quick-pick trait chips, folded into the system prompt alongside the main `prompt` field
  // Per-character model (#32): this character's replies use these instead of
  // the app-wide text model settings. Every field is optional and unset falls
  // back to the app setting; see resolveTurnModel in modelResolution.ts.
  modelOverride?: {
    provider?: string; // chat provider id (a CHAT_PROVIDERS key)
    model?: string;
    temperature?: number;
    samplers?: SamplerSettings; // merged over the app's samplers key by key
  };
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
  // Advanced trigger settings (#29). Every one is optional and unset means
  // the plain behavior above, so older lorebooks match exactly as before.
  // See matchLoreEntries in loreUtils.ts for how they combine.
  priority?: number; // higher is kept first when the lore budget forces a cut; 0 when unset
  selective?: boolean; // also require `secondaryKeywords` (card spec `selective`)
  secondaryKeywords?: string[]; // checked only when `selective` is on (card spec `secondary_keys`)
  secondaryLogic?: "andAny" | "andAll" | "notAny" | "notAll"; // how secondary keywords combine; "andAny" when unset (SillyTavern `selectiveLogic`)
  sticky?: number; // stays active for this many messages after it triggers
  scanDepth?: number; // how many recent messages to scan; LORE_SCAN_MESSAGE_COUNT when unset
  probability?: number; // 0-100 chance of firing once triggered; 100 when unset
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
  about?: string; // a WhatsApp-style About line (#116); characters know it
  avatar?: string; // this persona's own display picture - a local:/data: ref, same shape as Character.appearanceImages entries
  // Extra photos of this persona, same shape/purpose as Character.appearanceImages -
  // given to image-capable models as named reference photos so a scene depicting
  // the user (e.g. "a selfie of us together") keeps their face consistent too.
  appearanceImages?: string[];
  skills?: PersonaSkill[]; // character sheet for adventure skill checks (#27)
  intimacy?: IntimacyProfile; // what you like in romance (#73)
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
  // Characters may react to the user's messages with an emoji (#11).
  characterReactions?: boolean;
  // Warn the model off phrases its recent replies keep reusing (#19); on
  // unless set to false.
  antiRepetition?: boolean;
  // Every 20 messages, suggest an updated relationship label (#30); on
  // unless set to false.
  relationshipSuggestions?: boolean;
  // Every 40 messages, suggest a note on how the character has grown (#60);
  // on unless set to false.
  arcSuggestions?: boolean;
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
  map?: WorldMap; // a picture of the world with its places pinned (#66)
}

// A place pinned on a World's map; x and y are percent of the picture.
export interface MapPin {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface WorldMap {
  image: string; // local:/data: ref, like coverImage
  pins: MapPin[];
}

export type AdventureStatus = "active" | "completed";

// Per-adventure knobs for how the narrator plays it out, separate from the
// premise/cast so the creation wizard's "tone & rules" step has somewhere to
// write without overloading `premise`.
export interface AdventureRules {
  choiceCount?: number; // how many tappable options the narrator should offer each turn; a sensible default applies when unset
  replyLengthLimit?: number; // same budget concept as Character/Chat replies
  // Things this story must never include, whatever the cast's rating - the
  // adventure equivalent of Chat.hardLimits, sent right before each reply.
  hardLimits?: string[];
  // Scene illustrations: when on, every narrator turn also gets a generated
  // picture of the scene (players can still illustrate any turn by hand when off).
  autoIllustrate?: boolean;
  artStyle?: ArtStyle; // look for scene illustrations; DEFAULT_ART_STYLE applies when unset
  trackStats?: boolean; // HP, gold, items and quests kept by the app (#25)
  startingHp?: number; // max and starting HP; 10 when unset
  startingGold?: number;
  startingItems?: string[];
  skillChecks?: boolean; // risky choices carry a check the app rolls (#26)
  memoryOff?: boolean; // long-term story memory is on unless this is set
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
  // Facts established in the story, pulled out every few turns like a
  // chat's memory, so a long adventure stays consistent.
  memory?: string[];
  storyScript?: StoryScript; // the user's own story for the narrator to follow (#57)
}
