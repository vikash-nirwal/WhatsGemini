import { FaBan } from "react-icons/fa";
import { blockedByThem, blockedByYou, blockNotesFor, buildBlockDirective } from "../features/chat/blocking";
import { buildStickerDirective } from "../features/character/stickers";
import { buildInviteAnswerNote, buildInviteDirective } from "../features/chat/invites";
import { newPlanId } from "../features/chat/sharedPlans";
import { buildDisappearingNote, DISAPPEAR_LABEL, pruneDisappeared } from "../features/chat/disappearing";
import { useEffect, useState, useMemo, useRef } from "react";
import { avatarOf } from "../features/character/profileChanges";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { addChatNotice, setBlocked, fetchChatById, fetchChats, addMessage, updateMessages, updateChatTree, insertCompressionSummary, removeCompressionSummary, forkChat, updateChatMessage, updateChatOptions, updateChatAutoReply, incrementChatUsage, updateChatPersona, updateChatGreeting, setPendingFollowupAt, addPreparedChat, addChat } from "../features/chatSlice";
import { fetchCharacterById, updateCharacter, addCharacter } from "../features/characterSlice";
import { generateAIResponse, compressChatHistory, autoCompressChat, generateAvatarImage, summarizeChapter, generateAssistText, generateBackdropImage } from "../features/aiSlice";
import { parseSlashCommand, SLASH_COMMANDS } from "../features/chat/slashCommands";
import { buildStoryMarkdown, storyFileName } from "../features/chat/storyExport";
import { CharacterModelOverride, resolveTurnModel } from "../features/ai/modelResolution";
import { CompareDialog, ComparedReply, providerLabel } from "../components/organisms/CompareDialog";
import { lockedLookFor } from "../features/ai/utils/appearanceLock";
import { useChatRecap } from "../features/chat/useChatRecap";
import { beatStamp } from "../features/chat/storyScript";
import { absentMemberIds, mergeState } from "../features/chat/sceneState";
import { letterReplyDraft } from "../features/character/letters";
import { currentBlock, presenceFor, replyDelayMs } from "../features/character/schedule";
import { buildCelebrationDirective, datesToCelebrate } from "../features/character/importantDates";
import { buildEventDirective, drawEvent } from "../features/chat/eventDeck";
import { buildGameStartDirective } from "../features/chat/miniGames";
import GameDialog from "../components/organisms/GameDialog";
import BranchMapDialog from "../components/organisms/BranchMapDialog";
import CallScreen from "../components/organisms/CallScreen";
import { useCall } from "../features/voice/useCall";
import { formatCallTime } from "../features/voice/callSession";
import { isRecognitionSupported } from "../features/voice/recognition";
import { isSpeechSupported } from "../features/voice/speech";
import { hasBranches } from "../features/chat/branchMap";
import StoryScriptDialog from "../components/organisms/StoryScriptDialog";
import { AlbumDialog } from "../components/organisms/AlbumDialog";
import { ScenarioCardsDialog, TimeSkipDialog } from "../components/organisms/ScenarioCardsDialog";
import { buildOpeningDirective, buildTimeSkipPrompt, parseTimeSkip, ScenarioCard } from "../features/chat/scenarioCards";
import { occasionPhotoDirective, photoForOccasion } from "../features/character/album";
import { buildDraftReplyPrompt, cleanDraftReply, NARRATIVE_CONTEXT_MESSAGES, SURPRISE_DIRECTIVE } from "../features/ai/utils/narrativeTools";
import { parseSize, autoCoverCropToBlob, savePortraitBlob, removeChromaKeyBackground, blobToDataUrl, dataUrlToBlob } from "../features/ai/utils/portraitUtils";
import ChatWindow from "src/components/organisms/ChatWindow";
import { useBackgroundUpdates } from "./chat/useBackgroundUpdates";
import { useReplyEffects } from "./chat/useReplyEffects";
import { knowsNoteFor, recentLetterNote, roomContextFor } from "./chat/promptNotes";
import { tiesNoteFor } from "../features/world/worldWizard";
import { worldTalkNoteFor } from "../features/world/worldTalk";
import { buildTimePassedNote, buildTimePassedOpener, describeGap, gapDays, TimePassed, timePassedInScope, timePassedNotice, TimeUnit } from "../features/chat/passTime";
import { skipStoryTime } from "../features/world/storyTime";
import { addTruth, buildGodDirective, buildGodTruthsSection } from "../features/chat/godMode";
import { worldOf } from "../features/world/currentWorld";
import { switchWorld, updateWorld } from "../features/worldSlice";
import { buildMyStatusNote } from "../features/status/myStatuses";
import { buildForwardDirective, buildQuoteDirective, quoteTextOf } from "../features/chat/replyQuotes";
import { buildGroupDirective } from "../features/chat/groupLife";
import { buildProfileNote } from "../features/character/profileChanges";
import { buildLateReplyDirective, leftOnReadDelay } from "../features/chat/leftOnRead";
import { buildContactDirective, contactIdea } from "../features/chat/sharedContacts";
import { buildCharacterDraftPrompt, parseCharacterDraft } from "../features/character/characterDraft";
import PollDialog from "../components/organisms/PollDialog";
import { buildOnThisDayNote } from "../features/chat/onThisDay";
import { buildGiftBackPrompt, buildGiftReactionDirective, buildGiftsSection, giftBackDirective, giftMessage, newGiftId, parseGiftBack } from "../features/character/gifts";
import { factsAboutUser } from "../features/character/intimacy";
import { GiftDialog } from "../components/organisms/GiftDialog";
import { buildPlansSection } from "../features/chat/sharedPlans";
import { buildSecretsSection, secretsInPlay } from "../features/character/secrets";
import { ambientFor, ambientSceneTexts } from "../features/chat/ambientSound";
import { useAmbientSound } from "./chat/useAmbientSound";
import { buildDayMoodSection, dayMoodFor } from "../features/character/badDays";
import { buildDreamDirective, dreamDue, dreamIngredients } from "../features/character/dreams";
import { buildJokesSection } from "../features/chat/insideJokes";
import { buildConflictDirective, buildConflictSection, upsetDelayMs } from "../features/chat/conflicts";
import { buildMoodSection, fadedMood } from "../features/chat/lingeringMood";
import { buildDayLogSection, dayLogText } from "../features/character/dayLog";
import { buildConcernsSection } from "../features/character/preoccupations";
import { buildPlaceSection, cachedHolidays, cachedWeather, ensureHolidays, ensureWeather, holidaysNear } from "../features/character/realWorld";
import { buildSlipsDirective } from "../features/ai/utils/textingSlips";
import { buildCallbackDirective, callbackDue, pickCallback } from "../features/ai/utils/memoryTime";
import { dayKey } from "../features/character/badDays";
import { jealousyNoteFor } from "../features/chat/jealousy";
import { buildLiesSection } from "../features/chat/lies";
import { buildRumorSection, pendingRumors } from "../features/character/rumors";
import { buildPovPrompt, cleanPov, POV_MESSAGES, thoughtsIn } from "../features/chat/pointOfView";
import { addPastEvent, buildPastEventPrompt, buildWhatIfChat, buildWhatIfOpening, buildWhatIfSection, cleanPastEvent } from "../features/chat/whatIf";
import { buildCliffhangerDirective, buildHookSection, buildTeaserPrompt, parseTeaser } from "../features/chat/episodes";
import { buildSwapDirective, characterAsPersona, personaAsCharacter, swapEndLine, swapStartLine } from "../features/chat/roleSwap";
import { appendDiaryEntry } from "../features/ai/utils/diary";
import { PovDialog } from "../components/organisms/PovDialog";
import { WhatIfDialog } from "../components/organisms/WhatIfDialog";
import MessageInput from "src/components/organisms/MessageInput";
import Header, { HeaderAction } from "src/components/organisms/Header";
import PortraitPreviewModal from "src/components/organisms/PortraitPreviewModal";
import AutoReplyModal from "src/components/organisms/AutoReplyModal";
import PersonaModal from "src/components/organisms/PersonaModal";
import { FaCompressArrowsAlt, FaDownload, FaClock, FaBolt, FaSlidersH, FaHistory, FaUserCircle, FaTimes, FaUsers, FaBookmark, FaDiceD20, FaLayerGroup, FaGamepad, FaCodeBranch, FaPhoneAlt, FaBookOpen, FaImages, FaTheaterMasks, FaForward, FaGift, FaBalanceScale, FaEye, FaHourglassStart, FaGlobe, FaFilm, FaExchangeAlt, FaPoll } from "react-icons/fa";
import { Button } from "src/components/atoms/button";
import { AI, YOU, DEFAULT_AUTO_SELFIE_FREQUENCY, getModelContextWindow, CHARACTER_SWATCHES } from "../utils/constants";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { Message, Chat, Character, WhatIfChat } from "../types";
import { stripLeakedBase64 } from "../features/ai/utils/apiUtils";
import { buildSystemInstruction, buildTurnContext, AUTO_REPLY_DIRECTIVE, FOLLOWUP_CONTINUATION_PROMPT, RoomContext, SceneContext } from "../features/ai/utils/promptComposition";
import { resolveEmotionPortrait } from "../features/ai/utils/emotionUtils";
import { effectiveContentRating } from "../features/character/contentRating";
import { resolveNextSpeaker, parseMention, stripSpeakerPrefix, getActiveParticipants } from "../features/ai/utils/roomRouting";
import { CHAIN_DIRECTIVE, everyoneAfter, MAX_CHAIN } from "../features/ai/utils/roomTurns";
import { migrateToTree, addChildNode, flattenPath, getPathToNode, updateNodeMessage, findDefaultLeafFrom, deleteBranch, getSiblingInfo, generateNodeId } from "../features/chat/messageTree";
import { estimateTokens, estimateHistoryTokens } from "../features/ai/utils/tokenEstimator";
import { truncateHistory, trimToLatestSummary, latestSummaryIndex, countSeedMessages, buildSummaryMessages, formatTranscript, TranscriptNames } from "../features/ai/utils/chatHistoryUtils";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { Alert, AlertDescription } from "src/components/atoms/alert";
import { useModal } from "../contexts/ModalContext";
import { toast } from "sonner";
import { useColorTheme } from "../hooks/useColorTheme";
import { cn } from "../utils/cn";
import { useChatNotifier } from "../features/notifications/useNotifications";
import { fitsVoiceNote, promptTextFor, rollVoiceNote } from "../features/voice/voiceNotes";

const DEFAULT_AUTO_REPLY = { enabled: false, minDelaySeconds: 30, maxDelaySeconds: 120, maxFollowups: 2, followupCount: 0 };

// Fills in defaults, and migrates a chat's legacy single `cooldownMinutes`
// (from before follow-up delays became a random range) into an equivalent
// fixed range, so chats saved before this change keep their old timing
// instead of silently reverting to the new defaults.
const normalizeAutoReply = (raw?: Partial<typeof DEFAULT_AUTO_REPLY> & { cooldownMinutes?: number }) => {
  const legacyCooldownSeconds = raw?.cooldownMinutes ? raw.cooldownMinutes * 60 : undefined;
  return {
    enabled: raw?.enabled ?? DEFAULT_AUTO_REPLY.enabled,
    minDelaySeconds: raw?.minDelaySeconds ?? legacyCooldownSeconds ?? DEFAULT_AUTO_REPLY.minDelaySeconds,
    maxDelaySeconds: raw?.maxDelaySeconds ?? legacyCooldownSeconds ?? DEFAULT_AUTO_REPLY.maxDelaySeconds,
    maxFollowups: raw?.maxFollowups ?? DEFAULT_AUTO_REPLY.maxFollowups,
    followupCount: raw?.followupCount ?? DEFAULT_AUTO_REPLY.followupCount,
  };
};

// Returns the chat's existing tree, or lazily migrates its flat content into
// one (in-memory only - the caller persists it as part of whatever tree
// operation triggered this). Always returns `content` alongside the tree -
// when migrating, that's the ONLY copy of the messages whose `.id`s actually
// match the (freshly generated) tree node ids, so callers must index into
// this `content`, not the possibly-id-less `messages` React state, to find
// the right node.
const getOrBuildTree = (chat: Chat) => {
  if (chat.tree) {
    return { tree: chat.tree, activeLeafId: chat.activeLeafId ?? null, content: chat.content };
  }
  const migrated = migrateToTree(chat.content);
  return { tree: migrated.tree, activeLeafId: migrated.activeLeafId, content: migrated.content };
};

const ChatPage = () => {
  const { chatId } = useParams();
  const dispatch = useAppDispatch();
  const { showConfirm } = useModal();

  const chats = useAppSelector((state) => state.chat.chats);
  const pendingFollowups = useAppSelector((state) => state.chat.pendingFollowups);
  const characters = useAppSelector((state) => state.character.characters);
  const aiLoading = useAppSelector((state) => state.ai.loading);
  const aiCompressing = useAppSelector((state) => state.ai.compressing);
  const aiTokenCount = useAppSelector((state) => state.ai.tokenCount);
  const aiCostEstimate = useAppSelector((state) => state.ai.costEstimate);
  const replyLengthLimit = useAppSelector((state) => state.settings.replyLengthLimit);
  const appTextingMode = useAppSelector((state) => state.settings.textingMode);
  const chatProvider = useAppSelector((state) => state.settings.chatProvider);
  const selectedModel = useAppSelector((state) => state.settings.selectedModel);
  const maxChatLength = useAppSelector((state) => state.settings.maxChatLength);
  const roleplayStyle = useAppSelector((state) => state.settings.roleplayStyle);
  const personas = useAppSelector((state) => state.settings.personas);
  const globalActivePersonaId = useAppSelector((state) => state.settings.activePersonaId);
  const portraitSaveSize = useAppSelector((state) => state.settings.portraitSaveSize);
  const portraitResizeEnabled = useAppSelector((state) => state.settings.portraitResizeEnabled);
  const [isPersonaModalOpen, setIsPersonaModalOpen] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [character, setCharacter] = useState("");
  // const [characterData, setCharacterData] = useState<Character | null>(null);
  const [error, setError] = useState<string | null>(null);
  const aiPromiseRef = useRef<any>(null);

  // Memoize chatIdNum to avoid redundant conversions
  const chatIdNum = useMemo(() => (chatId ? Number(chatId) : null), [chatId]);
  // Tags this chat's streamed reply in the ai slice, so ChatWindow only shows
  // text streaming into the chat it belongs to.
  const streamKey = chatIdNum != null ? String(chatIdNum) : undefined;

  useEffect(() => {
    if (!chatIdNum) return;

    const fetchData = async () => {
      try {
        await dispatch(fetchChatById(chatIdNum)).unwrap();
        await dispatch(fetchChats()).unwrap();
        setError(null);
      } catch (err) {
        console.error("Error fetching chat data:", err);
        setError("Failed to load chat. Please try again.");
      }
    };

    fetchData();
  }, [dispatch, chatIdNum]);

  const currentChat = useMemo(() => chats.find((chat) => chat.id === chatIdNum), [chats, chatIdNum]);
  // The chat's primary character - characterIds[0]. Every single-character
  // feature below (header, avatar, voice, memory, auto-selfie, ...) is keyed
  // off this; a real multi-bot room UI (Phase 12) is what actually makes
  // characterIds hold more than one id day-to-day.
  const characterData = useMemo(
    () => characters.find((c) => c.id === currentChat?.characterIds?.[0]),
    [characters, currentChat]
  );
  // Every character in the chat/room, resolved for ChatWindow to attribute
  // each message's avatar/emotion/voice by its own speakerId - a plain 1:1
  // chat still just resolves to `[characterData]`.
  const roomCharacters = useMemo(
    () => (currentChat?.characterIds || []).map((id) => characters.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => Boolean(c)),
    [characters, currentChat]
  );
  const isRoom = roomCharacters.length > 1;
  // Who can't take a turn: muted members, and (#69) members the scene
  // tracker says have left. An @mention can still call on either.
  const unavailableIds = useMemo(
    () => [...(currentChat?.mutedParticipantIds || []), ...(isRoom && currentChat?.sceneTracker ? absentMemberIds(currentChat?.sceneState, roomCharacters) : [])],
    [currentChat?.mutedParticipantIds, currentChat?.sceneTracker, currentChat?.sceneState, isRoom, roomCharacters]
  );
  const worlds = useAppSelector((state) => state.world.worlds);
  const worldPersonaId = worlds.find((w) => w.id === currentChat?.worldId)?.personaId; // who you are in this chat's world (#143)
  // A chat opened from another world (a notification, a toast, a link)
  // takes you to that world (#146), so the list beside it matches.
  const currentWorldId = useAppSelector((state) => state.world.currentWorldId);
  const chatWorldId = currentChat ? worldOf(currentChat, worlds) : undefined;
  useEffect(() => {
    if (chatWorldId !== undefined && chatWorldId !== (worlds.some((w) => w.id === currentWorldId) ? currentWorldId : null)) dispatch(switchWorld(chatWorldId));
  }, [chatWorldId, currentWorldId, worlds, dispatch]);
  const myStatuses = useAppSelector((state) => state.myStatus.statuses);
  // A phone call (#56): replies are spoken, and what you say is sent as voice messages.
  const [inCall, setInCall] = useState(false);
  // Shown while a realistic schedule (#7) holds a reply back.
  const [awayNote, setAwayNote] = useState<string | null>(null);
  // Tells the user about a new message from this chat if they're away (#43).
  const notifyIfAway = useChatNotifier(chatIdNum, roomCharacters);

  // Only built for a real room - a 1:1 chat's buildTurnContext call gets
  // `undefined` here and its prompt/history come out exactly as before
  // Phase 12. See roomContextFor.
  const buildRoomContext = (speaker: Character): RoomContext | undefined =>
    isRoom ? roomContextFor(speaker, roomCharacters, currentChat) : undefined;

  // Real names for summarization/memory-extraction transcripts.
  const transcriptNames = (): TranscriptNames => ({
    userName: activePersona?.name?.trim() || undefined,
    charName: characterData?.name,
    speakerNames: isRoom ? Object.fromEntries(roomCharacters.map((c) => [c.id, c.name])) : undefined,
  });

  // Defensive cleanup for a room reply: some models imitate the "Name: "
  // format used to label history lines even after being told not to (see
  // stripSpeakerPrefix's own comment). Only applied in an actual room - a
  // 1:1 chat's reply is never touched, so there's no behavior change there.
  const finalizeSpeakerText = (rawText: string, speaker: Character): string =>
    isRoom ? stripSpeakerPrefix(rawText, speaker.name) : rawText;

  // Voice notes (#44): rolled before a reply is written, so the chat shows
  // "recording audio..." instead of the text streaming in. The reply only
  // goes out as one if it still fits (short, no pictures, not a refusal).
  const [recordingVoiceNote, setRecordingVoiceNote] = useState(false);
  const rollReplyVoiceNote = (speaker: Character, mediaRequest: boolean): boolean => {
    const rolled = rollVoiceNote(speaker.voice, { mediaRequest });
    setRecordingVoiceNote(rolled);
    return rolled;
  };
  const replyIsVoiceNote = (rolled: boolean, reply: { text?: string; images?: string[]; videos?: string[]; isRefusal?: boolean }): true | undefined =>
    rolled && fitsVoiceNote(reply) ? true : undefined;
  // What a notification says about a voice note, instead of its transcript.
  const notificationText = (text: string, isVoiceNote?: boolean) => (isVoiceNote ? "🎤 Voice message" : text);

  // Per-chat scene settings (author's note, world tags) plus the app-wide
  // roleplay style, passed to every buildTurnContext call. The author's note
  // is sent after the history (see buildPostHistoryNote), not in the system
  // prompt, so the model actually weighs it; for a room it doubles as the
  // shared scene-setting every participant sees.
  // A 1:1 chat that keeps its own memory (Chat.memoryScope) - rooms always do.
  const chatScopedMemory = isRoom || currentChat?.memoryScope === "chat";
  const scene: SceneContext = {
    // In a group with no scenario, the author's note is the
    // group's scene and goes in the system prompt instead (roomContextFor).
    authorNote: isRoom && !currentChat?.scenario ? undefined : currentChat?.authorNote,
    worldTags: currentChat?.worldTags,
    hardLimits: currentChat?.hardLimits,
    intensity: currentChat?.intensity,
    roleplayStyle,
    memoryOverride: !isRoom && chatScopedMemory
      ? { memory: currentChat?.memory || [], pinned: currentChat?.pinnedMemory || [], standing: currentChat?.memoryStanding?.text }
      : undefined,
    storyScript: currentChat?.storyScript,
    game: currentChat?.game,
    onCall: inCall,
    sceneTracker: currentChat?.sceneTracker,
    roomNames: isRoom ? roomCharacters.map((c) => c.name) : undefined,
    language: currentChat?.language,
    coWriting: !isRoom && currentChat?.coWriting,
    choiceMoments: currentChat?.choiceMoments,
    stage: !isRoom ? currentChat?.stage : undefined,
    meters: currentChat?.meters,
    boldness: !isRoom ? currentChat?.boldness : undefined,
    sceneState: currentChat?.sceneState,
    world: currentChat?.worldId != null ? worlds.find((w) => w.id === currentChat.worldId) : undefined,
    moodCarry: !isRoom && Boolean(currentChat?.moodCarry),
    // Memory with time (#109): the dates that go with the facts in use.
    memoryDates: isRoom ? currentChat?.memoryDates : chatScopedMemory ? currentChat?.memoryDates : characterData?.memoryDates,
    misremembers: !isRoom && Boolean(characterData?.misremembers),
  };

  // Which persona this chat actually speaks as: its own override if set,
  // otherwise whichever persona is globally active (Settings > Personas).
  const { is } = useColorTheme();
  const terminal = is("terminal");
  // The floating composer's footprint (its height plus the gap below it),
  // measured live so the message list can always scroll its last message
  // clear of it - however tall a multi-line draft or the mode banners make it.
  const composerRef = useRef<HTMLDivElement>(null);
  const [composerInset, setComposerInset] = useState(0);
  useEffect(() => {
    const el = composerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const parent = el.offsetParent as HTMLElement | null;
      const gapBelow = parent ? parent.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom : 0;
      setComposerInset(Math.ceil(el.offsetHeight + Math.max(0, gapBelow)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [terminal]);
  const activePersona = useMemo(
    () => personas.find((p) => p.id === (currentChat?.personaId || worldPersonaId || globalActivePersonaId)) || personas[0],
    [personas, currentChat?.personaId, worldPersonaId, globalActivePersonaId]
  );
  // Set here rather than in `scene` above: they need the persona's name.
  // A flashback or another world (#102, #104) isn't the main story, so the
  // main story's letters, gifts, secrets, plans and anniversaries stay out.
  const mainStory = !isRoom && !currentChat?.whatIf;
  const userNameForNotes = activePersona?.name?.trim() || "the user";
  const noteTime = Date.now();
  scene.letterNote = mainStory ? recentLetterNote(characterData, currentChat, chatIdNum, userNameForNotes) : undefined;
  scene.knowsNote = mainStory ? knowsNoteFor(characterData, characters, chats, userNameForNotes) : undefined;
  scene.tiesNote = mainStory ? tiesNoteFor(characterData, characters) : undefined;
  scene.worldTalkNote = mainStory ? worldTalkNoteFor(characterData, characters) : undefined;
  scene.giftsNote = mainStory && characterData ? buildGiftsSection(characterData.gifts, characterData.name, userNameForNotes) : undefined;
  scene.secretsNote = mainStory && characterData ? buildSecretsSection(characterData.name, userNameForNotes, secretsInPlay(characterData, currentChat)) : undefined;
  scene.plansNote = mainStory ? buildPlansSection(currentChat?.plans, userNameForNotes, noteTime) : undefined;
  scene.onThisDayNote = mainStory ? buildOnThisDayNote(currentChat?.content || [], userNameForNotes, noteTime) : undefined;
  scene.whatIfNote = !isRoom && characterData && currentChat?.whatIf ? buildWhatIfSection(currentChat.whatIf, characterData.name, userNameForNotes) : undefined;
  // A fact from a while back (#109), offered every couple of days and
  // steady all day; noted on the chat once a reply has had it.
  const callback = mainStory && characterData && callbackDue(currentChat, noteTime)
    ? pickCallback(chatScopedMemory ? currentChat?.memory || [] : characterData.memory || [], scene.memoryDates, noteTime, `${chatIdNum}-${dayKey(noteTime)}`)
    : undefined;
  scene.callbackNote = callback && characterData ? buildCallbackDirective(characterData.name, userNameForNotes, callback.fact, callback.learnedAt, noteTime) : undefined;
  // Texting imperfections (#108): the prompt's side, in texting mode only.
  const textingOn = Boolean(currentChat?.textingMode ?? appTextingMode);
  // Their own About line (#125).
  scene.profileNote = mainStory && characterData ? buildProfileNote(characterData.name, characterData.about) : undefined;
  // Disappearing messages (#136): the character knows they're on.
  scene.disappearingNote = !isRoom && characterData && currentChat?.disappearing ? buildDisappearingNote(currentChat.disappearing.after, characterData.name, userNameForNotes) : undefined;
  // Event invites (#134): they may send one; your last answer reaches them.
  scene.inviteNote = !isRoom && characterData && mainStory ? [buildInviteDirective(characterData.name, userNameForNotes), buildInviteAnswerNote(currentChat?.content || [], characterData.name, userNameForNotes)].filter(Boolean).join("\n") : undefined;
  // Stickers (#137): with a set drawn, now and then one instead of an emoji.
  scene.stickerNote = !isRoom && characterData?.stickers?.length ? buildStickerDirective(characterData.name, characterData.stickers.map((st) => st.mood)) : undefined;
  // Blocking (#133): a fight can end in a block; a friend of someone who
  // blocked you can patch it up; a friend asked to put in a word for
  // someone you blocked can talk it through.
  if (!isRoom && characterData && currentChat?.conflict) scene.conflictNote = [scene.conflictNote, buildBlockDirective(characterData.name, userNameForNotes)].filter(Boolean).join("\n");
  scene.blockNote = !isRoom && characterData ? blockNotesFor(characterData, characters, chats, userNameForNotes) : undefined;
  // Time passed (the user's ask): every member knows how long it's been.
  // God mode (#160): the truths of this chat's world, or of this chat.
  scene.godNote = buildGodTruthsSection([...(worlds.find((w) => w.id === currentChat?.worldId)?.godTruths || []), ...(currentChat?.godTruths || [])]);
  scene.timePassedNote = currentChat?.timePassed && timePassedInScope(currentChat.timePassed, (currentChat.content || []).length) ? buildTimePassedNote(currentChat.timePassed, userNameForNotes) : undefined;
  // Group chats (#124): members may rename the group or start a poll.
  scene.groupNote = isRoom ? buildGroupDirective(userNameForNotes) : undefined;
  // Quoted replies (#119): in texting mode they may quote an older message.
  scene.quoteNote = !isRoom && characterData && textingOn ? [buildQuoteDirective(characterData.name, userNameForNotes), buildForwardDirective(characterData.name, userNameForNotes), buildContactDirective(characterData.name, userNameForNotes)].join("\n") : undefined;
  scene.slipsNote = !isRoom && characterData && textingOn ? buildSlipsDirective(characterData.name, characterData.textingSlips, currentBlock(characterData.schedule, noteTime)?.status === "busy") : undefined;
  // Where they live (#112): what the caches hold right now; the refresher
  // keeps them fresh, and `placeTick` re-renders once a fetch lands.
  const home = mainStory ? characterData?.home : undefined;
  scene.placeNote = home && characterData
    ? buildPlaceSection(characterData.name, home, cachedWeather(home, noteTime), holidaysNear(cachedHolidays(home.countryCode, new Date(noteTime).getFullYear()), noteTime, home.timeZone), noteTime)
    : undefined;
  scene.concernsNote = mainStory && characterData ? buildConcernsSection(characterData.name, characterData.concerns, noteTime) : undefined;
  scene.dayNote = mainStory && characterData ? buildDayLogSection(characterData.name, dayLogText(characterData, noteTime)) : undefined;
  const dayMood = mainStory ? dayMoodFor(characterData, noteTime) : undefined;
  scene.dayMoodNote = dayMood && characterData ? buildDayMoodSection(characterData.name, dayMood, userNameForNotes) : undefined;
  scene.dreamNote = mainStory && characterData && dreamDue(characterData, currentChat, noteTime) ? buildDreamDirective(characterData.name, userNameForNotes, dreamIngredients(characterData, currentChat)) : undefined;
  scene.jokesNote = !isRoom && characterData ? buildJokesSection(currentChat?.insideJokes, characterData.name, userNameForNotes) : undefined;
  scene.conflictNote = !isRoom && characterData && currentChat?.conflicts
    ? currentChat.conflict ? buildConflictSection(characterData.name, userNameForNotes, currentChat.conflict, noteTime) : buildConflictDirective(characterData.name, userNameForNotes)
    : undefined;
  // A mood carried over from earlier (#106); while they're upset with you the
  // fight (#97) says it all.
  const lingering = !isRoom && currentChat?.moodCarry && !currentChat.conflict ? fadedMood(currentChat.mood, noteTime) : undefined;
  scene.moodNote = lingering && characterData ? buildMoodSection(characterData.name, lingering, userNameForNotes, noteTime) : undefined;
  scene.jealousyNote = mainStory ? jealousyNoteFor(characterData, currentChat, chats, characters, userNameForNotes, noteTime) : undefined;
  scene.liesNote = !isRoom && characterData && currentChat?.lies ? buildLiesSection(characterData.name, userNameForNotes, currentChat.toldLies) : undefined;
  scene.hookNote = currentChat?.pendingHook ? buildHookSection(currentChat.pendingHook) : undefined;
  // Your status (#117), once this character has seen it.
  scene.statusNote = mainStory ? buildMyStatusNote(userNameForNotes, myStatuses, characterData?.id, noteTime) : undefined;

  // Role reversal (#105): while swapped, a reply is built as if your persona
  // were the character and the character "the user", with only the chat's
  // own setting and boundaries from the scene.
  const swap = !isRoom && characterData && currentChat?.roleSwap ? currentChat.roleSwap : undefined;
  // Whether this turn's reply opens with a dream (#94), for its note.
  const dreamt = Boolean(scene.dreamNote) && !swap;
  // Rumors (#98): the speaker's own, wherever they're speaking.
  const rumorNoteFor = (speaker: Character): string | undefined => {
    if (currentChat?.whatIf) return undefined;
    const rumor = pendingRumors(speaker, noteTime)[0];
    const source = rumor && characters.find((c) => c.id === rumor.fromId);
    return rumor && source ? buildRumorSection(speaker.name, userNameForNotes, rumor, source.name) : undefined;
  };
  // Every reply's prompt is built here: the speaker's turn with the room's
  // context and this chat's scene, or the swapped one.
  const turnContextFor = (msgs: Message[], speaker: Character, extra?: string[], limit?: number) => {
    if (swap && characterData) {
      const swapScene: SceneContext = { authorNote: scene.authorNote, worldTags: scene.worldTags, hardLimits: scene.hardLimits, intensity: scene.intensity, roleplayStyle, world: scene.world };
      return buildTurnContext(msgs, personaAsCharacter(activePersona, characterData), [buildSwapDirective(characterData.name, activePersona?.name?.trim() || "User", swap.bodySwap), ...(extra || [])], limit, characterAsPersona(characterData), undefined, swapScene);
    }
    const rumor = rumorNoteFor(speaker);
    return buildTurnContext(msgs, speaker, rumor ? [...(extra || []), rumor] : extra, limit, activePersona, buildRoomContext(speaker), scene);
  };
  const globalActivePersona = useMemo(
    () => personas.find((p) => p.id === globalActivePersonaId) || personas[0],
    [personas, globalActivePersonaId]
  );

  // "Previously on..." after a few days away (#46).
  const recap = useChatRecap(currentChat, messages, transcriptNames());

  // Where they live (#112): fetch the weather and holidays when the chat
  // opens, and render again once they're in.
  const [, setPlaceTick] = useState(0);
  const homeKey = home ? `${home.lat},${home.lon},${home.countryCode || ""}` : "";
  useEffect(() => {
    if (!home) return;
    let alive = true;
    const now = Date.now();
    void Promise.all([ensureWeather(home, now), ensureHolidays(home.countryCode, new Date(now).getFullYear())]).then(() => {
      if (alive) setPlaceTick((t) => t + 1);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeKey]);

  // The character's most recently reported mood - drives the header avatar
  // (via resolveEmotionPortrait below) and, when that emotion has no saved
  // portrait yet, the inline "generate it now" prompt underneath the header.
  // Same "latest emotion wins" logic ChatWindow uses for its typing/follow-up
  // indicators, kept as a separate computation since the header renders
  // outside ChatWindow.
  const latestEmotion = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === AI && messages[i].emotion) return messages[i].emotion;
    }
    return undefined;
  }, [messages]);
  const headerEmotionImageSrc = resolveEmotionPortrait(characterData, latestEmotion);
  const missingEmotionPortrait =
    characterData?.emotionPortraits?.enabled && latestEmotion && !characterData.emotionPortraits.images[latestEmotion]
      ? latestEmotion
      : undefined;
  // Header avatar is only ~34px - too small to actually see the current
  // mood portrait. Clicking it opens this full-size preview instead.
  const [portraitPreviewOpen, setPortraitPreviewOpen] = useState(false);
  const [dismissedMissingEmotion, setDismissedMissingEmotion] = useState<string | null>(null);
  const [generatingMissingEmotion, setGeneratingMissingEmotion] = useState(false);
  const [missingEmotionError, setMissingEmotionError] = useState<string | null>(null);

  // One-click, uncropped generate-and-save for the currently-missing emotion,
  // reached from the inline chat prompt rather than the full Character Editor
  // - mirrors the editor's "Generate all" batch path (no interactive crop;
  // framing usually comes out reasonable from the prompt alone).
  const handleGenerateMissingEmotionPortrait = async () => {
    if (!missingEmotionPortrait || !characterData) return;
    setMissingEmotionError(null);
    setGeneratingMissingEmotion(true);
    try {
      const referenceImages = characterData.appearanceImages && characterData.appearanceImages.length > 0 ? characterData.appearanceImages : undefined;
      const result = await dispatch(generateAvatarImage({
        name: characterData.name,
        appearance: characterData.appearance,
        visualTags: lockedLookFor(characterData),
        localImageSettings: characterData.localImageSettings,
        appearanceImages: referenceImages,
        emotion: missingEmotionPortrait,
        artStyle: characterData.artStyle,
      })).unwrap();
      const dataUrl = result.images?.[0];
      if (!dataUrl) {
        setMissingEmotionError("No image was returned.");
        return;
      }
      // Same chroma-key strip the Character Editor's own emotion-generation
      // paths already apply (see portraitUtils.ts) - this quick in-chat path
      // was missed when that fix went in, and was saving an opaque
      // magenta-background PNG instead of a transparent one.
      const keyedBlob = await removeChromaKeyBackground(dataUrl);
      let blob: Blob = keyedBlob;
      if (portraitResizeEnabled) {
        const keyedDataUrl = await blobToDataUrl(keyedBlob);
        const { width, height } = parseSize(portraitSaveSize);
        blob = await autoCoverCropToBlob(keyedDataUrl, width, height);
      }
      const localRef = await savePortraitBlob(blob, `avatar_${missingEmotionPortrait}`);
      dispatch(updateCharacter({
        ...characterData,
        // Spread the existing settings so customEmotions (and anything added
        // later) survive - rebuilding the object from scratch used to drop them.
        emotionPortraits: {
          ...characterData.emotionPortraits,
          enabled: true,
          images: { ...characterData.emotionPortraits?.images, [missingEmotionPortrait]: localRef },
        },
      }));
    } catch (err: any) {
      setMissingEmotionError(typeof err === "string" ? err : "Failed to generate portrait. Check your API key and image provider in Settings.");
    } finally {
      setGeneratingMissingEmotion(false);
    }
  };

  // Pre-send context budget: estimated tokens already committed (system
  // prompt + history) plus the model's max context window, both purely
  // client-side heuristics - fed to MessageInput, which adds the live draft's
  // own estimate on top as the user types. Runs the history through the same
  // truncateHistory() cap generateAIResponse actually applies at send time,
  // so this reflects what will really be sent - not the full stored
  // conversation - once maxChatLength is set to something other than 0.
  // Built exactly like the next send (#33): the speaker who'd reply next, with
  // the room's context in a group chat, then the same trimming and protected
  // messages generateAIResponse applies - it used to skip the room parts and
  // under-count group chats.
  const contextTokenEstimate = useMemo(() => {
    const speaker = resolveNextSpeaker(roomCharacters, messages, unavailableIds) || characterData;
    const turn = speaker ? turnContextFor(messages, speaker, undefined, replyLengthLimit) : buildTurnContext(messages, speaker, undefined, replyLengthLimit, activePersona, undefined, scene);
    const effectiveHistory = truncateHistory([...turn.history], maxChatLength, turn.protectedCount);
    return estimateTokens(turn.systemInstruction) + estimateTokens(turn.postHistoryNote) + estimateHistoryTokens(effectiveHistory.map((m) => m.text));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterData, roomCharacters, replyLengthLimit, messages, maxChatLength, activePersona, currentChat?.authorNote, currentChat?.worldTags, currentChat?.hardLimits, currentChat?.intensity, currentChat?.memory, currentChat?.pinnedMemory, currentChat?.memoryScope, currentChat?.scenario, unavailableIds, roleplayStyle]);
  // The window of the model this chat's character actually replies with (#32).
  const maxContextTokens = useMemo(() => {
    const turn = resolveTurnModel({ chatProvider, selectedModel, temperature: 0, samplers: {} }, characterData);
    return getModelContextWindow(turn.provider, turn.model);
  }, [chatProvider, selectedModel, characterData]);

  useEffect(() => {
    if (currentChat) {
      let needsDbUpdate = false;
      const cleanedMessages = currentChat.content.map(msg => {
         const original = msg.txt || "";
         const text = stripLeakedBase64(original);
         if (text !== original) {
            needsDbUpdate = true;
         }
         return { ...msg, txt: text };
      });

      if (needsDbUpdate && chatIdNum) {
         if (currentChat.tree) {
           // Clean every branch's text (not just the active path) via updateChatTree,
           // since plain updateMessages would wipe the tree.
           const cleanedNodes = Object.fromEntries(
             Object.entries(currentChat.tree.nodes).map(([id, node]) => {
               const original = node.message.txt || "";
               const text = stripLeakedBase64(original);
               return [id, text !== original ? { ...node, message: { ...node.message, txt: text } } : node];
             })
           );
           const cleanedTree = { nodes: cleanedNodes };
           const cleanedContent = flattenPath(cleanedTree, currentChat.activeLeafId);
           dispatch(updateChatTree({ chatId: chatIdNum, content: cleanedContent, tree: cleanedTree, activeLeafId: currentChat.activeLeafId ?? null }));
         } else {
           dispatch(updateMessages({ chatId: chatIdNum, newMessages: cleanedMessages }));
         }
      }

      setMessages(cleanedMessages);
      setCharacter(currentChat.title);
    }
  }, [currentChat, chatIdNum, dispatch]);

  useEffect(() => {
    if (messages.length > 0) {
      // Every room member, not just the primary character - a group chat
      // needs all of them resolved (avatars, voices, personas) even though
      // only characterIds[0] necessarily got fetched by whatever navigation
      // led here.
      (currentChat?.characterIds || []).forEach((id) => dispatch(fetchCharacterById(id)));
    }
  }, [dispatch, messages, currentChat]);

  // A WhatsApp chat list (#115): a chat on screen is read. Saved only when
  // a reply came in after the last time, so it isn't written every render;
  // a chat open in a hidden tab waits until the tab is shown.
  const hasChat = Boolean(currentChat);
  const readAt = currentChat?.readAt;
  useEffect(() => {
    if (!chatIdNum || !hasChat) return;
    const mark = () => {
      if (document.visibilityState === "hidden") return;
      const latest = messages.reduce((t, m) => (m.role === AI && (m.timestamp || 0) > t ? m.timestamp || 0 : t), 0);
      if (readAt == null || latest > readAt) dispatch(updateChatOptions({ chatId: chatIdNum, patch: { readAt: Math.max(Date.now(), latest) } }));
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [chatIdNum, hasChat, messages, readAt, dispatch]);

  // Polls (#124): yours go up as a message, and the members vote.
  const [pollOpen, setPollOpen] = useState(false);
  const handleCreatePoll = async (question: string, options: string[]) => {
    if (!chatIdNum) return;
    const poll = { question, options, votes: [] };
    const content = (await dispatch(addMessage({ chatId: chatIdNum, role: YOU, text: "", poll })).unwrap().catch(() => [])) as Message[];
    const posted = [...content].reverse().find((m) => m.poll && m.role === YOU);
    if (posted?.id) void runPollVotes(posted.id, poll, getActiveParticipants(roomCharacters, unavailableIds), content);
  };

  // Shared contacts (#128): "Message" on a card drafts that person (once)
  // and opens a chat with them; they and the sender know of each other.
  const [openingContact, setOpeningContact] = useState(false);
  const openContact = async (msg: Message) => {
    const card = msg.contactCard;
    if (!card || !chatIdNum || !msg.id || openingContact) return;
    const existing = card.characterId != null ? characters.find((c) => c.id === card.characterId) : undefined;
    const sender = characters.find((c) => c.id === msg.speakerId) || characterData;
    setOpeningContact(true);
    const toastId = toast.loading(existing ? `Opening your chat with ${existing.name}…` : `Saving ${card.name}'s contact…`);
    try {
      let contact = existing;
      if (!contact && sender) {
        const request = { idea: contactIdea(card, sender), contentRating: sender.contentRating, adultsConfirmed: sender.adultsConfirmed, artStyle: sender.artStyle };
        const draft = parseCharacterDraft(await dispatch(generateAssistText({ instruction: buildCharacterDraftPrompt(request), background: true })).unwrap());
        const made: Character = await dispatch(addCharacter({
          ...draft,
          name: card.name,
          tags: [],
          contentRating: sender.contentRating,
          adultsConfirmed: sender.adultsConfirmed,
          artStyle: sender.artStyle,
          accent: CHARACTER_SWATCHES[Math.floor(Math.random() * CHARACTER_SWATCHES.length)],
          knowsAbout: [sender.id],
          appearanceImages: [],
        } as Omit<Character, "id">)).unwrap();
        contact = made;
        const madeId = made.id;
        await dispatch(updateChatMessage({ chatId: chatIdNum, messageId: msg.id, patch: { contactCard: { ...card, characterId: madeId } } }));
        const freshSender = characters.find((c) => c.id === sender.id) || sender;
        await dispatch(updateCharacter({ ...freshSender, knowsAbout: [...(freshSender.knowsAbout || []), madeId] }));
      }
      if (!contact) return;
      const found: Character = contact;
      const chat = chats.find((c) => c.characterIds?.length === 1 && c.characterIds[0] === found.id) || (await dispatch(addChat({ title: found.name, characterIds: [found.id] })).unwrap());
      toast.dismiss(toastId);
      if (chat?.id) routeNavigate(`/chat/${chat.id}`);
    } catch (err) {
      toast.error(`Couldn't save ${card.name}'s contact: ${typeof err === "string" ? err : (err as Error)?.message || "try again"}`, { id: toastId });
    } finally {
      setOpeningContact(false);
    }
  };

  // Left on read (#126): when the time comes (or when you come back to the
  // chat after it), the late reply arrives, knowing it's late.
  const leftOnReadUntil = currentChat?.leftOnReadUntil;
  const lateReplyRef = useRef(false);
  useEffect(() => {
    if (!chatIdNum || !leftOnReadUntil || !characterData) return;
    const fire = async () => {
      if (lateReplyRef.current) return;
      lateReplyRef.current = true;
      try {
        await dispatch(updateChatOptions({ chatId: chatIdNum, patch: { leftOnReadUntil: undefined } }));
        const lastYours = [...messages].reverse().find((m) => m.role === YOU);
        const minutes = lastYours?.timestamp ? (Date.now() - lastYours.timestamp) / 60_000 : 0;
        await sendCharacterFollowup(undefined, buildLateReplyDirective(characterData.name, activePersona?.name?.trim() || "the user", minutes), { answering: true });
      } finally {
        lateReplyRef.current = false;
      }
    };
    const timer = window.setTimeout(() => void fire(), Math.max(0, leftOnReadUntil - Date.now()));
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatIdNum, leftOnReadUntil, characterData?.id]);

  // Quoted replies (#119): the message your next one answers.
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  useEffect(() => setReplyingTo(null), [chatIdNum]);

  const [draftInjection, setDraftInjection] = useState<{ text: string; nonce: number } | undefined>(undefined);
  // A status reply (#8) arrives with its draft in the route state.
  const routeLocation = useLocation();
  const routeNavigate = useNavigate();
  // A status reply (#129) arrives as a quote instead.
  const [replyingToStatus, setReplyingToStatus] = useState<NonNullable<Message["quotedStatus"]> | null>(null);
  useEffect(() => {
    const state = routeLocation.state as { draft?: string; replyToStatus?: NonNullable<Message["quotedStatus"]> } | null;
    if (!state?.draft && !state?.replyToStatus) return;
    if (state.draft) setDraftInjection({ text: state.draft, nonce: Date.now() });
    if (state.replyToStatus) setReplyingToStatus(state.replyToStatus);
    routeNavigate(routeLocation.pathname, { replace: true, state: null });
  }, [routeLocation, routeNavigate]);
  const handlePickSuggestion = (text: string) => setDraftInjection({ text, nonce: Date.now() });


  // Adds a call's real usage/cost to this chat's running total - persisted,
  // never reset by compression (compression's own summarization call goes
  // through here too, so its spend is folded in rather than lost when the
  // messages it summarized disappear from view). Every write to a chat's DB
  // record (this one included) is a read-whole-object-then-put, not a
  // partial patch, so callers must `await` this before starting any other
  // write to the same chat (addMessage, updateChatTree, ...) - otherwise the
  // two full-record writes race and whichever lands second silently wins,
  // dropping the other's change.
  const trackUsage = async (tokens?: number, cost?: number) => {
    if (!chatIdNum || (!tokens && !cost)) return;
    await dispatch(incrementChatUsage({ chatId: chatIdNum, tokens: tokens || 0, cost: cost || 0 }));
  };

  // Memory extraction and auto-compression run in the background and used to
  // fail silently (e.g. a content filter rejecting the transcript), leaving
  // memory frozen or the history uncompressed with no sign why. One toast per
  // kind per chat, replaced rather than stacked when it keeps failing.
  const warnBackgroundFailure = (kind: "memory" | "compress", message?: string) => {
    if (!message || !chatIdNum) return;
    const what = kind === "memory" ? "Couldn't update long-term memory" : "Couldn't compress older messages";
    toast.warning(`${what}: ${message}`, {
      id: `${kind}-${chatIdNum}`,
      description: "Setting a separate background model (Settings, Text Generation Model) can help if your chat model's filter is blocking it.",
    });
  };

  // A failed or blocked generation used to come back as a truthy `payload`
  // (the rejection's error string) and get saved as the character's reply -
  // then resent as history on every later turn. Callers now check for
  // success explicitly; this surfaces the failure instead, and stays quiet
  // for a user-initiated stop.
  const isGenerationSuccess = (action: any): boolean => generateAIResponse.fulfilled.match(action);
  const reportGenerationFailure = (action: any) => {
    if (!action || isGenerationSuccess(action) || action.meta?.aborted) return;
    const message = typeof action.payload === "string" ? action.payload : action.error?.message;
    if (message && /abort/i.test(message)) return;
    setError(message || "The AI didn't return a reply. Please try again.");
  };

  const {
    runBackgroundUpdates,
    replySuggestions,
    setReplySuggestions,
    acceptRelationship,
    dismissRelationship,
    acceptArc,
    dismissArc,
    acceptStage,
    dismissStage,
  } = useBackgroundUpdates({ chatIdNum, currentChat, characterData, roomCharacters, isRoom, chatScopedMemory, activePersona, roleplayStyle, transcriptNames, warnBackgroundFailure });
  const {
    saveStoryScript,
    moveStoryBeat,
    advanceStoryIfDone,
    applyReplyQuote,
    markViewOnce,
    runPollVotes,
    applyGroupTags,
    votePoll,
    openViewOnce,
    revealedSecretFor,
    noteSecretRevealed,
    replyNotes,
    noteStoryTags,
    carryMood,
    noteCallback,
    saveSceneState,
    pickNaturalSpeakers,
    maybeNarrate,
    advanceGame,
    saveCharacterReaction,
    saveCorrection,
    handleSuggestNext,
    handleTranslate,
    savePhotoOutcome,
    handleReact,
    handleToggleBookmark,
  } = useReplyEffects({ chatIdNum, currentChat, characterData, roomCharacters, isRoom, activePersona, messages, transcriptNames, setReplySuggestions });

  // --- Auto follow-up: the character can message first after the user goes quiet.
  // Only runs for the chat currently open in this tab - no cross-chat background
  // scanning, and nothing fires once the tab/app is closed.
  const [isAutoReplyModalOpen, setIsAutoReplyModalOpen] = useState(false);
  const [sceneOpen, setSceneOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  // Disappearing messages (#136): expired ones leave the chat while it's
  // open, checked every minute (and when it opens).
  useEffect(() => {
    if (!currentChat?.disappearing || chatIdNum == null) return;
    const prune = () => {
      const result = pruneDisappeared(currentChat, Date.now());
      if (!result) return;
      if (result.tree) dispatch(updateChatTree({ chatId: chatIdNum, content: result.content, tree: result.tree, activeLeafId: result.activeLeafId ?? null }));
      else dispatch(updateMessages({ chatId: chatIdNum, newMessages: result.content }));
    };
    prune();
    const timer = window.setInterval(prune, 60_000);
    return () => window.clearInterval(timer);
  }, [currentChat, chatIdNum, dispatch]);
  const [storyOpen, setStoryOpen] = useState(false);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [timeSkipOpen, setTimeSkipOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  // Ambient sound (#89), while this chat is open.
  useAmbientSound(ambientFor(currentChat?.ambient, ...ambientSceneTexts(currentChat, isRoom ? undefined : characterData)), currentChat?.ambient?.volume);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareBusy, setCompareBusy] = useState(false);
  const [compareResult, setCompareResult] = useState<{ current: ComparedReply; other: ComparedReply } | null>(null);
  const [gameOpen, setGameOpen] = useState(false);
  const [branchMapOpen, setBranchMapOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const autoReplySettings = normalizeAutoReply(currentChat?.autoReply);
  const autoReplyInFlightRef = useRef(false);
  const [lastTypingActivityAt, setLastTypingActivityAt] = useState<number | null>(null);
  const lastTypingActivityDispatchRef = useRef(0);
  // Throttled so a keystroke burst doesn't cause a render per keystroke -
  // only cares about "the user is still around", not exact timing.
  const handleDraftActivity = () => {
    const now = Date.now();
    if (now - lastTypingActivityDispatchRef.current < 2000) return;
    lastTypingActivityDispatchRef.current = now;
    setLastTypingActivityAt(now);
  };
  const followupDelayRef = useRef<{ key: string; delayMs: number } | null>(null);

  const handleAutoReplyChange = (patch: Partial<typeof DEFAULT_AUTO_REPLY>) => {
    if (!chatIdNum) return;
    dispatch(updateChatAutoReply({ chatId: chatIdNum, autoReply: { ...autoReplySettings, ...patch } }));
  };

  // personaId undefined clears this chat's override, falling back to whichever
  // persona is globally active.
  const handleSelectPersona = (personaId?: string) => {
    if (!chatIdNum) return;
    dispatch(updateChatPersona({ chatId: chatIdNum, personaId }));
    setIsPersonaModalOpen(false);
  };

  // Generates and appends one character-initiated follow-up message. Shared by
  // the automatic scheduler, the manual "follow up now" button, and a room's
  // participant strip (forcing a specific bot to speak up) - neither of the
  // first two touch followupCount, so a manual click never eats into the
  // automatic streak's budget. `forcedSpeakerId` is the participant-strip
  // path; omitted, it round-robins like a normal turn would.
  // `extraDirective`: a one-turn instruction riding along with this reply
  // ("Surprise me" uses it for a plot twist).
  // Resolves to the character who spoke, or false when nothing was sent.
  // `answering`: this reply answers what was just said (the next member in a
  // group round, or a late reply after leaving you on read), so it doesn't
  // get the "unprompted follow-up" framing; in a group its prompt is the
  // last line said, not a stand-in "continue".
  const sendCharacterFollowup = async (forcedSpeakerId?: number, extraDirective?: string, { answering = false }: { answering?: boolean } = {}): Promise<Character | false> => {
    if (!chatIdNum || !currentChat || roomCharacters.length === 0) return false;

    // Read the chat fresh from the DB rather than trusting the component's local
    // `messages` state, which lags behind by a render cycle right after actions
    // like send/regenerate (their dispatch -> redux update -> effect -> setMessages
    // chain hasn't necessarily settled yet). Computing the "first follow-up after
    // an image-toggled user turn" check below off a stale/orphaned copy of
    // `messages` was silently skipping the image bonus.
    const freshChat = await dispatch(fetchChatById(chatIdNum)).unwrap();
    const { content: freshMessages } = getOrBuildTree(freshChat);

    const speaker = (forcedSpeakerId != null ? roomCharacters.find((c) => c.id === forcedSpeakerId) : undefined)
      || resolveNextSpeaker(roomCharacters, freshMessages, unavailableIds)
      || characterData;
    if (!speaker) return false;

    // Only the first follow-up after an image-toggled user turn also carries a
    // picture - once a follow-up (auto or manual) has already fired since that
    // user message, later ones go back to text-only.
    const lastUserIndex = freshMessages.map((m) => m.role).lastIndexOf(YOU);
    const aiMessagesSinceLastUser = lastUserIndex >= 0 ? freshMessages.slice(lastUserIndex + 1).filter((m) => m.role === AI).length : 0;
    const echoesUserImage = lastUserIndex >= 0 && Boolean(freshMessages[lastUserIndex].isImageRequest) && aiMessagesSinceLastUser === 1;
    const echoesUserVideo = lastUserIndex >= 0 && Boolean(freshMessages[lastUserIndex].isVideoRequest) && aiMessagesSinceLastUser === 1;

    const autoSelfieCfg = speaker.autoSelfie;
    const shouldAutoSelfie = !echoesUserImage && !echoesUserVideo && !!autoSelfieCfg?.enabled &&
      Math.random() * 100 < (autoSelfieCfg.frequency ?? DEFAULT_AUTO_SELFIE_FREQUENCY);
    const includeImage = echoesUserImage || shouldAutoSelfie;
    const includeVideo = echoesUserVideo;

    // generateAIResponse's history prep (trimTrailingUserMessages) always pops
    // a trailing user turn off `history` before the call, since the API needs
    // history to end on an assistant turn right before the new prompt turn.
    // handleSend relies on that being a no-op: its prompt IS that same trailing
    // message, already deduped out of history by buildValidHistory, so nothing
    // is lost. A follow-up's prompt used to be a bare generic nudge instead -
    // if the room's most recent message was still an unanswered user turn (the
    // exact moment someone reaches for the participant strip's "reply as X" to
    // redirect the reply), that real message got silently dropped from context
    // entirely, leaving the forced speaker with nothing to go on. Threading it
    // through as the prompt here mirrors handleSend and keeps it in context.
    const lastMessage = freshMessages[freshMessages.length - 1];
    let followupPrompt = lastMessage?.role === YOU && lastMessage.txt?.trim()
      ? promptTextFor(lastMessage)
      : FOLLOWUP_CONTINUATION_PROMPT;

    const { messages: compressedFreshMessages, tokens: compressTokens, cost: compressCost, error: compressError } = await dispatch(autoCompressChat({ chatId: chatIdNum, messages: freshMessages, names: transcriptNames() })).unwrap();
    warnBackgroundFailure("compress", compressError);
    await trackUsage(compressTokens, compressCost);

    const { history, systemInstruction, postHistoryNote, characterImages, characterName, otherParticipantImages, protectedCount, appearanceLocks } = turnContextFor(
      compressedFreshMessages,
      speaker,
      answering ? (extraDirective ? [extraDirective] : []) : extraDirective ? [AUTO_REPLY_DIRECTIVE, extraDirective] : [AUTO_REPLY_DIRECTIVE]
    );
    // Answering another member: the last labeled line in the history is what
    // they're answering, sent as the prompt (buildValidHistory drops the copy).
    const lastLine = history[history.length - 1];
    if (answering && followupPrompt === FOLLOWUP_CONTINUATION_PROMPT && lastLine?.role === "user" && lastLine.text?.trim()) followupPrompt = lastLine.text;
    const followupVoiceNote = rollReplyVoiceNote(speaker, includeImage || includeVideo);
    const aiResponse = await dispatch(generateAIResponse({
      prompt: followupPrompt,
      history, systemInstruction, postHistoryNote, streamKey, characterImages, characterName, artStyle: speaker?.artStyle,
      isImageRequest: includeImage, isVideoRequest: includeVideo, isCharacterInitiated: true, isAutoSelfie: shouldAutoSelfie,
      customEmotions: speaker.emotionPortraits?.customEmotions, otherRoomCharacters: otherParticipantImages, protectedCount, modelOverride: speaker.modelOverride, appearanceLocks, localImageSettings: speaker.localImageSettings,
    }));
    setRecordingVoiceNote(false);

    if (!isGenerationSuccess(aiResponse)) {
      reportGenerationFailure(aiResponse);
      return false;
    }

    const payloadObj = aiResponse.payload as any;
    await trackUsage(payloadObj?.tokenCount, payloadObj?.costEstimate);
    const generatedImages = payloadObj?.images || undefined;
    const generatedVideos = payloadObj?.videos || undefined;
    const followupText = finalizeSpeakerText(typeof payloadObj?.text === 'string' ? payloadObj.text : (payloadObj as string), speaker);
    const followupIsVoiceNote = replyIsVoiceNote(followupVoiceNote, { text: followupText, images: generatedImages, videos: generatedVideos, isRefusal: payloadObj?.isRefusal });
    const aiAddResult = await dispatch(addMessage({
      chatId: chatIdNum,
      role: AI,
      text: followupText,
      images: generatedImages,
      isImageRequest: Boolean(generatedImages && generatedImages.length > 0),
      videos: generatedVideos,
      isVideoRequest: Boolean(generatedVideos && generatedVideos.length > 0),
      videoPrompt: payloadObj?.videoPrompt,
      emotion: payloadObj?.emotion,
      thoughts: payloadObj?.thoughts,
          isRefusal: payloadObj?.isRefusal || undefined,
      imagePrompt: payloadObj?.imagePrompt,
      imageParams: payloadObj?.imageParams,
      speakerId: speaker.id,
      ...beatStamp(currentChat?.storyScript),
      choices: payloadObj?.choices,
      secretRevealed: revealedSecretFor(payloadObj) ? true : undefined,
      notes: replyNotes(payloadObj, speaker, dreamt),
      swapped: swap ? true : undefined,
      isVoiceNote: followupIsVoiceNote,
    }));
    // Manual follow-ups go through here too, but they start from a click in
    // a visible tab, so they only notify if the user has left meanwhile.
    notifyIfAway(speaker, notificationText(followupText, followupIsVoiceNote), generatedImages);

    // Await the refresh before the caller can act on it (e.g. bump followupCount) -
    // otherwise the scheduling effect below can still be looking at the previous
    // AI message's (already-elapsed) timestamp when the count changes, and fire
    // the next follow-up immediately instead of waiting the full cooldown.
    await dispatch(fetchChats());

    if (generatedImages && generatedImages.length > 0) {
      dispatch(updateCharacter({ ...speaker, gallery: [...(speaker.gallery || []), ...generatedImages] }));
    }

    await saveCharacterReaction(payloadObj?.reaction, compressedFreshMessages, speaker.id);
    advanceStoryIfDone(payloadObj, (aiAddResult.payload as Message[]) || []);
    applyReplyQuote(payloadObj, (aiAddResult.payload as Message[]) || []);
    markViewOnce(payloadObj, (aiAddResult.payload as Message[]) || [], speaker);
    applyGroupTags(payloadObj, (aiAddResult.payload as Message[]) || [], speaker);
    noteSecretRevealed(payloadObj);
    void noteStoryTags(payloadObj, speaker, dreamt);
    saveSceneState(payloadObj);
    carryMood(payloadObj, compressedFreshMessages);
    noteCallback(Boolean(callback));
    advanceGame(payloadObj, false);
    runBackgroundUpdates((aiAddResult.payload as Message[]) || [], speaker);
    return speaker;
  };

  // A room message a character started on their own gets the same round a
  // message of yours does (#22, #23): the others answer by the turn mode,
  // then the narrator. `chain` is off when you picked who replies.
  const finishRoomRound = async (starter: Character | false, chain = true) => {
    if (!isRoom || !starter) return;
    if (chain && chatIdNum) {
      const active = getActiveParticipants(roomCharacters, unavailableIds);
      const others = active.filter((c) => c.id !== starter.id);
      let followers: Character[] = [];
      if (currentChat?.turnMode === "everyone") {
        followers = everyoneAfter(active, starter.id);
      } else if (currentChat?.turnMode === "natural" && others.length > 0) {
        const fresh = await dispatch(fetchChatById(chatIdNum)).unwrap();
        followers = ((await pickNaturalSpeakers(getOrBuildTree(fresh).content, others, starter)) || []).slice(0, MAX_CHAIN - 1);
      }
      for (const follower of followers) {
        if (!(await sendCharacterFollowup(follower.id, CHAIN_DIRECTIVE, { answering: true }))) break;
      }
    }
    await maybeNarrate();
  };

  const triggerAutoFollowup = async () => {
    if (!chatIdNum) return;
    try {
      const sent = await sendCharacterFollowup();
      if (sent) {
        await dispatch(updateChatAutoReply({
          chatId: chatIdNum,
          autoReply: { ...autoReplySettings, followupCount: autoReplySettings.followupCount + 1 },
        }));
      }
      await finishRoomRound(sent);
    } catch (err) {
      console.error("Auto follow-up failed (non-fatal):", err);
    }
  };

  const handleManualFollowup = async () => {
    if (autoReplyInFlightRef.current || aiLoading) return;
    autoReplyInFlightRef.current = true;
    try {
      await finishRoomRound(await sendCharacterFollowup());
    } catch (err) {
      console.error("Manual follow-up failed:", err);
    } finally {
      autoReplyInFlightRef.current = false;
    }
  };

  // "Surprise me" (#18): the next character reply brings in an unexpected but
  // fitting development, so you don't have to write the twist yourself.
  // Scenario cards (#79): a narration line sets the scene, the tracker's
  // place, time and outfit follow, a backdrop is drawn if asked, and the
  // character opens it.
  const handleStartScenario = async (card: ScenarioCard, drawBackdrop: boolean) => {
    if (!chatIdNum || autoReplyInFlightRef.current || aiLoading) return;
    setScenarioOpen(false);
    autoReplyInFlightRef.current = true;
    try {
      await dispatch(addMessage({ chatId: chatIdNum, role: YOU, text: card.setting, isNarration: true }));
      if (currentChat?.sceneTracker) {
        await dispatch(updateChatOptions({ chatId: chatIdNum, patch: { sceneState: mergeState(currentChat.sceneState, { location: card.place, time: card.time, outfit: card.outfit }) } }));
      }
      if (drawBackdrop) {
        dispatch(generateBackdropImage({ setting: card.setting, artStyle: characterData?.artStyle }))
          .unwrap()
          .then(async (image) => {
            const saved = await savePortraitBlob(await dataUrlToBlob(image), "chat_bg").catch(() => image);
            await dispatch(updateChatOptions({ chatId: chatIdNum, patch: { backdrop: saved } }));
          })
          .catch((err) => toast.error(typeof err === "string" ? err : "Couldn't draw the backdrop."));
      }
      await finishRoomRound(await sendCharacterFollowup(undefined, buildOpeningDirective(card)));
    } catch (err) {
      console.error("Scenario card failed:", err);
    } finally {
      autoReplyInFlightRef.current = false;
    }
  };

  // Time skips (#80): a helper writes the transition, the tracker moves on,
  // and the story carries on from there.
  const handleTimeSkip = async (skip: string) => {
    if (!chatIdNum || autoReplyInFlightRef.current || aiLoading) return;
    setTimeSkipOpen(false);
    autoReplyInFlightRef.current = true;
    try {
      const recent = trimToLatestSummary(messages).slice(-NARRATIVE_CONTEXT_MESSAGES);
      const reply = await dispatch(generateAssistText({ instruction: buildTimeSkipPrompt(skip, formatTranscript(recent, transcriptNames()), { time: currentChat?.sceneState?.time, location: currentChat?.sceneState?.location }) })).unwrap();
      const { narration, time, place } = parseTimeSkip(reply, skip);
      await dispatch(addMessage({ chatId: chatIdNum, role: YOU, text: narration, isNarration: true }));
      if (currentChat?.sceneTracker && (time || place)) {
        await dispatch(updateChatOptions({ chatId: chatIdNum, patch: { sceneState: mergeState(currentChat.sceneState, { ...(time ? { time } : {}), ...(place ? { location: place } : {}) }) } }));
      }
      await finishRoomRound(await sendCharacterFollowup(undefined, `${skip}: the story has moved on (see the narration). Pick it up from there, naturally.`));
    } catch (err) {
      toast.error(typeof err === "string" ? err : "Couldn't skip ahead. Check your model settings.");
    } finally {
      autoReplyInFlightRef.current = false;
    }
  };

  // God mode (#160): it becomes true - kept on the world (or, outside one,
  // this chat), shown as a line in the chat, and the story carries on in it.
  const handleGodChange = async (text: string) => {
    if (!chatIdNum || autoReplyInFlightRef.current || aiLoading) return;
    autoReplyInFlightRef.current = true;
    try {
      const chatWorld = worlds.find((w) => w.id === currentChat?.worldId);
      if (chatWorld) await dispatch(updateWorld({ ...chatWorld, godTruths: addTruth(chatWorld.godTruths, text) }));
      else await dispatch(updateChatOptions({ chatId: chatIdNum, patch: { godTruths: addTruth(currentChat?.godTruths, text) } }));
      await dispatch(addMessage({ chatId: chatIdNum, role: YOU, text: text.trim(), isNarration: true, godMode: true }));
      await finishRoomRound(await sendCharacterFollowup(undefined, buildGodDirective(text)));
    } catch (err) {
      toast.error(typeof err === "string" ? err : "Couldn't make that true. Check your model settings.");
    } finally {
      autoReplyInFlightRef.current = false;
    }
  };

  // Pass the time (the user's ask): a marker in the chat, replies told how
  // long it's been for a few exchanges, the world's calendar moved on, and -
  // if you like - them texting first after the gap.
  const handlePassTime = async ({ amount, unit, note, theyTextFirst }: { amount: number; unit: TimeUnit; note: string; theyTextFirst: boolean }) => {
    if (!chatIdNum || autoReplyInFlightRef.current || aiLoading) return;
    setTimeSkipOpen(false);
    autoReplyInFlightRef.current = true;
    try {
      const passed: TimePassed = { gap: describeGap(amount, unit), days: gapDays(amount, unit), ...(note ? { note } : {}), at: Date.now(), fromMessage: (currentChat?.content || []).length + 1 };
      await dispatch(addChatNotice({ chatId: chatIdNum, text: timePassedNotice(passed) }));
      await dispatch(updateChatOptions({ chatId: chatIdNum, patch: { timePassed: passed } }));
      const chatWorld = worlds.find((w) => w.id === currentChat?.worldId);
      if (chatWorld?.storyTime && passed.days >= 1) await dispatch(updateWorld({ ...chatWorld, storyTime: skipStoryTime(chatWorld.storyTime, Math.round(passed.days), Date.now()) }));
      if (theyTextFirst) await finishRoomRound(await sendCharacterFollowup(undefined, buildTimePassedOpener(passed, activePersona?.name?.trim() || "the user")));
    } catch (err) {
      toast.error(typeof err === "string" ? err : "Couldn't pass the time. Check your model settings.");
    } finally {
      autoReplyInFlightRef.current = false;
    }
  };

  // Gifts (#82): kept on the character, shown in the chat as your action,
  // and the character's next reply reacts to it.
  const handleGiveGift = async (what: string) => {
    if (!chatIdNum || !characterData || autoReplyInFlightRef.current || aiLoading) return;
    setGiftOpen(false);
    autoReplyInFlightRef.current = true;
    try {
      await dispatch(updateCharacter({ ...characterData, gifts: [...(characterData.gifts || []), { id: newGiftId(), what, at: Date.now(), from: "you", chatId: chatIdNum }] }));
      await dispatch(addMessage({ chatId: chatIdNum, role: YOU, text: giftMessage(what) }));
      await sendCharacterFollowup(undefined, buildGiftReactionDirective(what, activePersona?.name?.trim() || "The user"));
    } catch (err) {
      toast.error(typeof err === "string" ? err : "Couldn't give the gift. Check your model settings.");
    } finally {
      autoReplyInFlightRef.current = false;
    }
  };

  const handleSurprise = async () => {
    if (autoReplyInFlightRef.current || aiLoading) return;
    autoReplyInFlightRef.current = true;
    try {
      await finishRoomRound(await sendCharacterFollowup(undefined, SURPRISE_DIRECTIVE));
    } catch (err) {
      console.error("Surprise reply failed:", err);
    } finally {
      autoReplyInFlightRef.current = false;
    }
  };

  // Dates that matter (#47): on the day, the character messages first, once
  // a year per date. Marked as celebrated before the call, so a failure or a
  // reload doesn't send it twice.
  const celebratedRef = useRef<string | null>(null);
  useEffect(() => {
    // Waits for the chat and its members as well: sendCharacterFollowup
    // needs both, and the date is marked celebrated before it's called.
    if (!chatIdNum || isRoom || !characterData || !currentChat || roomCharacters.length === 0 || aiLoading || messages.length === 0) return;
    const now = Date.now();
    const due = datesToCelebrate(characterData.importantDates || [], now);
    const key = `${chatIdNum}-${new Date(now).toDateString()}`;
    if (due.length === 0 || celebratedRef.current === key || autoReplyInFlightRef.current) return;
    celebratedRef.current = key;
    const year = new Date(now).getFullYear();
    dispatch(updateCharacter({
      ...characterData,
      importantDates: (characterData.importantDates || []).map((d) => (due.some((x) => x.id === d.id) ? { ...d, lastCelebratedYear: year } : d)),
    }));
    autoReplyInFlightRef.current = true;
    // A private album photo (#75) comes along as a gift, if one is ready.
    const gift = photoForOccasion(characterData.album, currentChat?.stage);
    // Otherwise, once you've given them something, they may give you a gift
    // back (#82); the helper picks it, so it can be recorded as given.
    const userName = activePersona?.name?.trim() || "the user";
    const fromYou = (characterData.gifts || []).filter((g) => g.from === "you");
    const pickGiftBack = async (): Promise<string | undefined> => {
      if (gift || fromYou.length === 0) return undefined;
      const occasion = due.map((d) => d.label.toLowerCase()).join(" and ");
      const instruction = buildGiftBackPrompt(characterData.name, userName, occasion, factsAboutUser(characterData.memory, characterData.memoryCategories), fromYou);
      return parseGiftBack(await dispatch(generateAssistText({ instruction, background: true })).unwrap().catch(() => ""));
    };
    pickGiftBack()
      .then((giftBack) => {
        const base = gift ? `${buildCelebrationDirective(due)}\n${occasionPhotoDirective(gift)}` : buildCelebrationDirective(due);
        return sendCharacterFollowup(undefined, giftBack ? `${base}\n${giftBackDirective(giftBack)}` : base).then((sent) => ({ sent, giftBack }));
      })
      .then(async ({ sent, giftBack }) => {
        if (sent && giftBack) {
          const latest: Character = (await dispatch(fetchCharacterById(characterData.id)).unwrap().catch(() => characterData)) || characterData;
          await dispatch(updateCharacter({ ...latest, gifts: [...(latest.gifts || []), { id: newGiftId(), what: giftBack, at: Date.now(), from: "character", chatId: chatIdNum || undefined }] }));
        }
        if (!sent || !gift || !chatIdNum) return;
        const fresh = await dispatch(fetchChatById(chatIdNum)).unwrap();
        const reply = [...getOrBuildTree(fresh).content].reverse().find((m) => m.role === AI);
        if (reply?.id) await dispatch(updateChatMessage({ chatId: chatIdNum, messageId: reply.id, patch: { images: [...(reply.images || []), gift.image] } }));
        const latest: Character = (await dispatch(fetchCharacterById(characterData.id)).unwrap().catch(() => characterData)) || characterData;
        await dispatch(updateCharacter({ ...latest, album: (latest.album || []).map((p) => (p.id === gift.id ? { ...p, sentAt: Date.now() } : p)) }));
      })
      .catch((err) => console.error("Special-date message failed:", err))
      .finally(() => { autoReplyInFlightRef.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatIdNum, isRoom, characterData, Boolean(currentChat), roomCharacters.length, aiLoading, messages.length]);

  // Event deck (#49): draw a random event from the deck, and the next
  // character reply works it into the scene.
  const handleDrawEvent = async () => {
    if (autoReplyInFlightRef.current || aiLoading) return;
    const event = drawEvent();
    toast.info(`You drew: ${event}`);
    autoReplyInFlightRef.current = true;
    try {
      await finishRoomRound(await sendCharacterFollowup(undefined, buildEventDirective(event)));
    } catch (err) {
      console.error("Event reply failed:", err);
    } finally {
      autoReplyInFlightRef.current = false;
    }
  };

  // "Write my reply" (#15): an AI draft of your next message in your
  // persona's voice, for the composer to show and you to edit.
  const handleDraftReply = async (): Promise<string | null> => {
    if (!characterData) return null;
    const userName = activePersona?.name?.trim() || "User";
    const recent = trimToLatestSummary(messages).slice(-NARRATIVE_CONTEXT_MESSAGES);
    const instruction = buildDraftReplyPrompt({
      userName,
      userBio: [activePersona?.bio, activePersona?.backstory].filter(Boolean).join(" "),
      charName: isRoom ? roomCharacters.map((c) => c.name).join(" and ") : characterData.name,
      transcript: formatTranscript(recent, transcriptNames()),
      style: roleplayStyle,
    });
    try {
      const draft = await dispatch(generateAssistText({ instruction })).unwrap();
      return cleanDraftReply(draft, userName) || null;
    } catch (err) {
      toast.error(typeof err === "string" ? err : "Couldn't write a draft. Check your model settings.");
      return null;
    }
  };

  // Participant strip's manual override (Phase 12) - clicking a bot's avatar
  // forces them to speak up next, bypassing the round-robin pick. Shares the
  // same in-flight guard as the regular manual follow-up so the two can't
  // both fire generations at once.
  const handleForceReply = async (characterId: number) => {
    if (autoReplyInFlightRef.current || aiLoading) return;
    autoReplyInFlightRef.current = true;
    try {
      // You picked who replies, so nobody else chimes in; the narrator still does.
      await finishRoomRound(await sendCharacterFollowup(characterId), false);
    } catch (err) {
      console.error("Forced reply failed:", err);
    } finally {
      autoReplyInFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (!autoReplySettings.enabled || !chatIdNum || !characterData || aiLoading) return;
    if (autoReplySettings.followupCount >= autoReplySettings.maxFollowups) return;
    const content = currentChat?.content || [];
    if (content.length === 0) return;

    const lastMessage = content[content.length - 1];
    if (lastMessage.role !== AI) return;

    const lastTimestamp = lastMessage.timestamp || currentChat?.timestamp || Date.now();

    // Pick the random wait once per (chat, message, settings) combination,
    // not on every render, so the countdown doesn't jitter as other state
    // changes cause re-renders.
    const delayKey = `${chatIdNum}-${lastTimestamp}-${autoReplySettings.minDelaySeconds}-${autoReplySettings.maxDelaySeconds}`;
    if (followupDelayRef.current?.key !== delayKey) {
      const { minDelaySeconds, maxDelaySeconds } = autoReplySettings;
      const span = Math.max(0, maxDelaySeconds - minDelaySeconds);
      followupDelayRef.current = { key: delayKey, delayMs: (minDelaySeconds + Math.random() * span) * 1000 };
    }

    // Typing counts as activity too - it pushes the wait out from whenever
    // the user last typed, so a follow-up doesn't fire out from under a
    // half-written reply.
    const activitySince = Math.max(lastTimestamp, lastTypingActivityAt || 0);
    const dueAt = activitySince + followupDelayRef.current.delayMs;
    const dueInMs = dueAt - Date.now();

    const fire = () => {
      if (autoReplyInFlightRef.current) return;
      autoReplyInFlightRef.current = true;
      dispatch(setPendingFollowupAt({ chatId: chatIdNum, dueAt: null }));
      triggerAutoFollowup().finally(() => { autoReplyInFlightRef.current = false; });
    };

    if (dueInMs <= 0) {
      fire();
      return;
    }

    dispatch(setPendingFollowupAt({ chatId: chatIdNum, dueAt }));
    const timer = setTimeout(fire, dueInMs);
    return () => {
      clearTimeout(timer);
      dispatch(setPendingFollowupAt({ chatId: chatIdNum, dueAt: null }));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoReplySettings.enabled, autoReplySettings.minDelaySeconds, autoReplySettings.maxDelaySeconds, autoReplySettings.maxFollowups, autoReplySettings.followupCount, chatIdNum, characterData, currentChat?.content, aiLoading, lastTypingActivityAt]);

  const handleSend = async (rawText: string, requestedImage?: boolean, isVideoRequest?: boolean, isImpersonated?: boolean, forcedSpeakerId?: number, silentSend?: boolean, isVoiceNote?: boolean, photos?: string[], isGod?: boolean) => {
    // A photo can go on its own, without words (#48).
    if ((!rawText.trim() && !photos?.length) || !chatIdNum) return;
    if (isGod) {
      await handleGodChange(rawText);
      return;
    }

    setError(null);

    // Slash commands (#14): most become an out-of-character direction sent
    // like a normal message; a few act right here instead.
    let text = rawText;
    let isImageRequest = requestedImage;
    // A voice note is what you said, never a command.
    const command = isVoiceNote ? null : parseSlashCommand(rawText);
    if (command) {
      if (command.kind === "error") { toast.error(command.message); return; }
      if (command.kind === "help") {
        toast.message("Commands", { description: SLASH_COMMANDS.map((c) => `${c.usage} - ${c.description}`).join("\n"), duration: 12000 });
        return;
      }
      if (command.kind === "summarize") { await handleCompress(); return; }
      if (command.kind === "narrate") {
        await dispatch(addMessage({ chatId: chatIdNum, role: YOU, text: command.text, isNarration: true }));
        dispatch(fetchChats());
        return;
      }
      text = command.text;
      isImageRequest = isImageRequest || command.isImageRequest;
    }

    try {
      if (isImpersonated) {
        // The user is speaking as the character (Impersonate mode) - append it
        // as the character's own turn and stop. No generation to trigger; the
        // next real AI reply, whenever it comes, just reads this as part of its
        // own history (buildChatHistory only special-cases the YOU role).
        // In a room, write as whoever was picked in the composer's speaker
        // picker; only fall back to the primary character when nobody was.
        const impersonatedSpeaker = (forcedSpeakerId != null ? roomCharacters.find((c) => c.id === forcedSpeakerId) : undefined) || characterData;
        await dispatch(addMessage({ chatId: chatIdNum, role: AI, text, isImpersonated: true, speakerId: impersonatedSpeaker?.id }));
        dispatch(fetchChats());
        return;
      }

      const replyTo: Message["replyTo"] = replyingTo?.id
        ? { id: replyingTo.id, text: quoteTextOf(replyingTo), from: replyingTo.role === YOU ? "you" : replyingTo.speakerId ?? characterData?.id ?? 0 }
        : undefined;
      if (replyTo) setReplyingTo(null);
      const quotedStatus = replyingToStatus || undefined;
      if (quotedStatus) setReplyingToStatus(null);
      const resultAction = await dispatch(addMessage({ chatId: chatIdNum, role: YOU, text, images: photos && photos.length > 0 ? photos : undefined, isImageRequest, isVideoRequest, isVoiceNote, swapped: swap ? true : undefined, replyTo, quotedStatus }));
      const updatedMessages = resultAction.payload as Message[] || [];

      // Left on read (#126): they've seen it and will answer later; while
      // that's pending, more messages just pile up, read and unanswered.
      if (!isRoom && !swap && characterData?.leavesOnRead && !silentSend) {
        const pending = (currentChat?.leftOnReadUntil || 0) > Date.now();
        const delay = pending ? 0 : leftOnReadDelay(characterData, currentChat, Date.now());
        if (pending || delay > 0) {
          if (delay > 0) await dispatch(updateChatOptions({ chatId: chatIdNum, patch: { leftOnReadUntil: Date.now() + delay } }));
          dispatch(fetchChats());
          return;
        }
      }

      // Blocked by them (#133): it goes out with one grey tick, no reply.
      if (!isRoom && blockedByThem(currentChat)) {
        dispatch(fetchChats());
        return;
      }

      if (silentSend) {
        // Add the user's own turn but stop there - no AI reply this time,
        // so the next send (typically an impersonated one) can supply the
        // character's side instead of the API.
        dispatch(fetchChats());
        return;
      }

      const { messages: contextMessages, tokens: compressTokens, cost: compressCost, error: compressError } = await dispatch(autoCompressChat({ chatId: chatIdNum, messages: updatedMessages, names: transcriptNames() })).unwrap();
      warnBackgroundFailure("compress", compressError);
      await trackUsage(compressTokens, compressCost);

      // Who replies: a speaker explicitly picked from the composer's room
      // picker (while this message was being typed) wins outright, then an
      // @mention, otherwise round-robin to whoever's turn it is among
      // unmuted participants. A plain 1:1 chat has exactly one active
      // participant, so this always resolves to characterData there -
      // unchanged behavior. @mention checks the FULL room (not just active
      // participants) - muting only sits someone out of the automatic
      // rotation, an explicit @mention can still call on them deliberately.
      const mentioned = isRoom ? parseMention(text, roomCharacters) : undefined;
      let speaker = (forcedSpeakerId != null ? roomCharacters.find((c) => c.id === forcedSpeakerId) : undefined)
        || mentioned
        || resolveNextSpeaker(roomCharacters, contextMessages, unavailableIds)
        || characterData;
      if (!speaker) return;

      // Group chats (#22): who else answers this message. "Natural" asks a
      // helper who would reply (maybe nobody); "everyone" lets each active
      // member answer in turn. A picked speaker or an @mention stays as is.
      let followers: Character[] = [];
      const turnMode = isRoom ? currentChat?.turnMode || "round-robin" : "round-robin";
      const active = isRoom ? getActiveParticipants(roomCharacters, unavailableIds) : [];
      if (forcedSpeakerId == null && !mentioned && turnMode === "natural" && active.length > 1) {
        const picked = await pickNaturalSpeakers(contextMessages, active);
        if (picked && picked.length === 0) {
          toast.info("Nobody jumped in. Say something else, or pick who replies.");
          dispatch(fetchChats());
          return;
        }
        if (picked) {
          speaker = picked[0];
          followers = picked.slice(1);
        }
      } else if (forcedSpeakerId == null && !mentioned && turnMode === "everyone") {
        followers = everyoneAfter(active, speaker.id);
      }

      const autoSelfieCfg = speaker.autoSelfie;
      const shouldAutoSelfie = !isImageRequest && !isVideoRequest && !!autoSelfieCfg?.enabled &&
        Math.random() * 100 < (autoSelfieCfg.frequency ?? DEFAULT_AUTO_SELFIE_FREQUENCY);

      // A realistic routine (#7): busy or asleep, they take a while to see it.
      const wait = replyDelayMs(speaker.schedule, Date.now());
      if (wait > 0) {
        setAwayNote(`${speaker.name} is ${currentBlock(speaker.schedule, Date.now())?.activity || "busy"} and will reply in a bit`);
        await new Promise((resolve) => window.setTimeout(resolve, wait));
        setAwayNote(null);
      }
      // Upset with you (#97): they take a little longer to answer.
      if (!isRoom && currentChat?.conflict && !swap) {
        setAwayNote(`${speaker.name} saw your message`);
        await new Promise((resolve) => window.setTimeout(resolve, upsetDelayMs()));
        setAwayNote(null);
      }

      const { history, systemInstruction, postHistoryNote, characterImages, characterName, otherParticipantImages, protectedCount, appearanceLocks } = turnContextFor(contextMessages, speaker, undefined, replyLengthLimit);
      const sendVoiceNote = rollReplyVoiceNote(speaker, Boolean(isImageRequest || isVideoRequest || shouldAutoSelfie));
      // Matches the "(voice note)" mark buildChatHistory puts on the same
      // message, so it's recognized as the prompt and not sent twice.
      aiPromiseRef.current = dispatch(generateAIResponse({ prompt: promptTextFor({ role: YOU, txt: text, isVoiceNote, replyTo, quotedStatus }), history, systemInstruction, postHistoryNote, streamKey, characterImages, characterName, artStyle: speaker?.artStyle, isImageRequest: isImageRequest || shouldAutoSelfie, isVideoRequest, isAutoSelfie: shouldAutoSelfie, customEmotions: speaker.emotionPortraits?.customEmotions, otherRoomCharacters: otherParticipantImages, protectedCount, modelOverride: speaker.modelOverride, appearanceLocks, localImageSettings: speaker.localImageSettings, promptImages: photos }));
      const aiResponse = await aiPromiseRef.current;
      setRecordingVoiceNote(false);
      aiPromiseRef.current = null;
      reportGenerationFailure(aiResponse);

      if (isGenerationSuccess(aiResponse)) {
        const payloadObj = aiResponse.payload as any;
        await savePhotoOutcome(payloadObj, contextMessages);
        await trackUsage(payloadObj?.tokenCount, payloadObj?.costEstimate);
        const generatedImages = payloadObj?.images || undefined;
        const generatedVideos = payloadObj?.videos || undefined;
        const replyText = finalizeSpeakerText(typeof payloadObj?.text === 'string' ? payloadObj.text : (payloadObj as string), speaker);
        const replyVoiceNote = replyIsVoiceNote(sendVoiceNote, { text: replyText, images: generatedImages, videos: generatedVideos, isRefusal: payloadObj?.isRefusal });
        const aiAddResult = await dispatch(addMessage({
          chatId: chatIdNum,
          role: AI,
          text: replyText,
          images: generatedImages,
          videos: generatedVideos,
          videoPrompt: payloadObj?.videoPrompt,
          emotion: payloadObj?.emotion,
          thoughts: payloadObj?.thoughts,
          isRefusal: payloadObj?.isRefusal || undefined,
          imagePrompt: payloadObj?.imagePrompt,
          imageParams: payloadObj?.imageParams,
          speakerId: speaker.id,
          ...beatStamp(currentChat?.storyScript),
          choices: payloadObj?.choices,
          secretRevealed: revealedSecretFor(payloadObj) ? true : undefined,
          notes: replyNotes(payloadObj, speaker, dreamt),
          swapped: swap ? true : undefined,
          isVoiceNote: replyVoiceNote,
        }));
        notifyIfAway(speaker, notificationText(replyText, replyVoiceNote), generatedImages);

        if (generatedImages && generatedImages.length > 0) {
          dispatch(updateCharacter({ ...speaker, gallery: [...(speaker.gallery || []), ...generatedImages] }));
        }

        await saveCharacterReaction(payloadObj?.reaction, contextMessages, speaker.id);
        await saveCorrection(payloadObj?.correction, contextMessages);
        advanceStoryIfDone(payloadObj, (aiAddResult.payload as Message[]) || []);
        applyReplyQuote(payloadObj, (aiAddResult.payload as Message[]) || []);
        markViewOnce(payloadObj, (aiAddResult.payload as Message[]) || [], speaker);
        applyGroupTags(payloadObj, (aiAddResult.payload as Message[]) || [], speaker);
        noteSecretRevealed(payloadObj);
        void noteStoryTags(payloadObj, speaker, dreamt);
        saveSceneState(payloadObj);
        carryMood(payloadObj, contextMessages);
        noteCallback(Boolean(callback));
        advanceGame(payloadObj, true);
        runBackgroundUpdates((aiAddResult.payload as Message[]) || [], speaker);

        // The rest of the room's answers (#22), then the narrator (#23).
        for (const follower of followers) {
          if (!(await sendCharacterFollowup(follower.id, CHAIN_DIRECTIVE, { answering: true }))) break;
        }
        await maybeNarrate();
      }

      dispatch(fetchChats());
    } catch (err) {
      console.error("Error sending message:", err);
      setError("Failed to send message. Please try again.");
    }
  };

  const handleEditMessage = async (index: number, newText: string, isImageRequest?: boolean, isVideoRequest?: boolean) => {
    if (!newText.trim() || !chatIdNum || !currentChat) return;

    setError(null);

    try {
      const isLastUserMessage = messages[index].role === YOU && messages.slice(index + 1).every(m => m.role !== YOU);
      const { tree, activeLeafId: currentActiveLeafId, content: treeContent } = getOrBuildTree(currentChat);
      const targetNodeId = treeContent[index]?.id;

      if (!targetNodeId || !tree.nodes[targetNodeId]) {
        console.warn("Cannot edit: message not found.");
        return;
      }

      if (isLastUserMessage) {
        // Branch: the edited text becomes a new sibling of the original message
        // (both children of the same parent), then generate a reply as its child.
        const parentId = tree.nodes[targetNodeId].parentId;
        // A photo you sent (#48) stays with the edited message, along with
        // what a helper saw in it.
        const original = tree.nodes[targetNodeId].message;
        const sentPhotos = original.images && original.images.length > 0 ? original.images : undefined;
        const editedUserMsg: Message = { role: YOU, txt: newText, isImageRequest, isVideoRequest, images: sentPhotos, photoDescription: sentPhotos ? original.photoDescription : undefined, timestamp: Date.now() };
        const { tree: treeWithEdit, nodeId: editedNodeId } = addChildNode(tree, parentId, editedUserMsg);
        const contentUpToEdit = flattenPath(treeWithEdit, editedNodeId);

        // Persist the branch point immediately so it survives even if generation fails.
        await dispatch(updateChatTree({ chatId: chatIdNum, content: contentUpToEdit, tree: treeWithEdit, activeLeafId: editedNodeId }));

        // Same auto-compression handleSend runs. It may splice a summary into
        // the tree, so the reply below is added to the tree as saved after
        // that, not to treeWithEdit.
        const { messages: contextUpToEdit, tokens: compressTokens, cost: compressCost, error: compressError } = await dispatch(autoCompressChat({ chatId: chatIdNum, messages: contentUpToEdit, names: transcriptNames() })).unwrap();
        warnBackgroundFailure("compress", compressError);
        await trackUsage(compressTokens, compressCost);
        const treeForReply = contextUpToEdit === contentUpToEdit
          ? treeWithEdit
          : (await dispatch(fetchChatById(chatIdNum)).unwrap()).tree || treeWithEdit;

        const speaker = (isRoom ? parseMention(newText, roomCharacters) : undefined)
          || resolveNextSpeaker(roomCharacters, contextUpToEdit, unavailableIds)
          || characterData;
        if (!speaker) return;

        const { history, systemInstruction, postHistoryNote, characterImages, characterName, otherParticipantImages, protectedCount, appearanceLocks } = turnContextFor(contextUpToEdit, speaker, undefined, replyLengthLimit);
        const editVoiceNote = rollReplyVoiceNote(speaker, Boolean(isImageRequest || isVideoRequest));
        aiPromiseRef.current = dispatch(generateAIResponse({ prompt: newText, history, systemInstruction, postHistoryNote, streamKey, characterImages, characterName, artStyle: speaker?.artStyle, isImageRequest, isVideoRequest, customEmotions: speaker.emotionPortraits?.customEmotions, otherRoomCharacters: otherParticipantImages, protectedCount, modelOverride: speaker.modelOverride, appearanceLocks, localImageSettings: speaker.localImageSettings, promptImages: sentPhotos }));
        const aiResponse = await aiPromiseRef.current;
        setRecordingVoiceNote(false);
        aiPromiseRef.current = null;
        reportGenerationFailure(aiResponse);

        if (isGenerationSuccess(aiResponse)) {
          const payloadObj = aiResponse.payload as any;
          await trackUsage(payloadObj?.tokenCount, payloadObj?.costEstimate);
          const generatedImages = payloadObj?.images || undefined;
          const generatedVideos = payloadObj?.videos || undefined;
          const editReplyText = finalizeSpeakerText(typeof payloadObj?.text === 'string' ? payloadObj.text : (payloadObj as string), speaker);
          const newAiMsg: Message = {
            role: AI,
            txt: editReplyText,
            isVoiceNote: replyIsVoiceNote(editVoiceNote, { text: editReplyText, images: generatedImages, videos: generatedVideos, isRefusal: payloadObj?.isRefusal }),
            images: generatedImages,
            videos: generatedVideos,
            videoPrompt: payloadObj?.videoPrompt,
            emotion: payloadObj?.emotion,
            thoughts: payloadObj?.thoughts,
            isRefusal: payloadObj?.isRefusal || undefined,
            // Kept like handleSend/handleRegenerate do, so "redraw" on this
            // reply reuses its scene prompt instead of deriving a new one.
            imagePrompt: payloadObj?.imagePrompt,
            imageParams: payloadObj?.imageParams,
            speakerId: speaker.id,
            ...beatStamp(currentChat?.storyScript),
            choices: payloadObj?.choices,
            secretRevealed: revealedSecretFor(payloadObj) ? true : undefined,
            notes: replyNotes(payloadObj, speaker),
            swapped: swap ? true : undefined,
            timestamp: Date.now(),
          };
          // The character's reaction (#11) and a language correction (#67)
          // go on the edited message itself.
          const editedPatch = {
            ...(payloadObj?.reaction ? { characterReaction: { emoji: payloadObj.reaction, speakerId: speaker.id } } : {}),
            ...(payloadObj?.correction && currentChat?.language ? { correction: payloadObj.correction } : {}),
          };
          const treeWithReaction = Object.keys(editedPatch).length > 0 && treeForReply.nodes[editedNodeId]
            ? updateNodeMessage(treeForReply, editedNodeId, { ...treeForReply.nodes[editedNodeId].message, ...editedPatch })
            : treeForReply;
          const { tree: finalTree, nodeId: aiNodeId } = addChildNode(treeWithReaction, editedNodeId, newAiMsg);
          const finalContent = flattenPath(finalTree, aiNodeId);
          await dispatch(updateChatTree({ chatId: chatIdNum, content: finalContent, tree: finalTree, activeLeafId: aiNodeId }));

          if (generatedImages && generatedImages.length > 0) {
            dispatch(updateCharacter({ ...speaker, gallery: [...(speaker.gallery || []), ...generatedImages] }));
          }

          advanceStoryIfDone(payloadObj, finalContent);

          applyReplyQuote(payloadObj, finalContent);

          markViewOnce(payloadObj, finalContent, speaker);

          applyGroupTags(payloadObj, finalContent, speaker);

          noteSecretRevealed(payloadObj);
          void noteStoryTags(payloadObj, speaker);
          saveSceneState(payloadObj);
          carryMood(payloadObj);
          advanceGame(payloadObj, false);
          runBackgroundUpdates(finalContent, speaker);
        }
      } else {
        // Mid-conversation edit: update this node's text in place, no branch, no regeneration.
        const updatedTree = updateNodeMessage(tree, targetNodeId, { ...tree.nodes[targetNodeId].message, txt: newText });
        const updatedContent = flattenPath(updatedTree, currentActiveLeafId);
        await dispatch(updateChatTree({ chatId: chatIdNum, content: updatedContent, tree: updatedTree, activeLeafId: currentActiveLeafId }));
      }

      dispatch(fetchChats());
    } catch (err) {
      console.error("Error editing message:", err);
      setError("Failed to edit message. Please try again.");
    }
  };

  // `override`: another model for this one reply (compare two models, #88).
  // Resolves to the new variant, when one was made.
  const handleRegenerate = async (index: number, override?: CharacterModelOverride): Promise<{ id: string; text: string } | undefined> => {
    if (index < 0 || index >= messages.length || !chatIdNum || !currentChat) return undefined;

    setError(null);

    try {
      const { tree, content: treeContent } = getOrBuildTree(currentChat);
      const targetMessage = treeContent[index];
      const existingImagePrompt = targetMessage?.imagePrompt;
      const existingImageParams = targetMessage?.imageParams;

      const targetNodeId = targetMessage?.id;
      if (!targetNodeId || !tree.nodes[targetNodeId]) {
        console.warn("Cannot regenerate: message not found.");
        return undefined;
      }
      const parentId = tree.nodes[targetNodeId].parentId;
      const historyUpToTarget = getPathToNode(tree, targetNodeId);
      const precedingMessage = historyUpToTarget[historyUpToTarget.length - 1];

      // A character-initiated follow-up (auto or manual) has no user message
      // right before it by design - regenerate it the same way it was first
      // generated, instead of requiring a user prompt that doesn't exist.
      const isFollowup = !precedingMessage || precedingMessage.role !== YOU;

      const prompt = isFollowup
        ? FOLLOWUP_CONTINUATION_PROMPT
        : promptTextFor(precedingMessage);
      // For a followup, whether it had a picture is recorded on the followup
      // message itself (no preceding user turn to read it off of).
      const isImageRequest = isFollowup ? (targetMessage?.isImageRequest || false) : (precedingMessage.isImageRequest || false);
      const isVideoRequest = isFollowup ? (targetMessage?.isVideoRequest || false) : (precedingMessage.isVideoRequest || false);
      const extraDirectives = isFollowup ? [AUTO_REPLY_DIRECTIVE] : undefined;
      // The photo you sent with the message (#48) goes to the model again.
      const sentPhotos = !isFollowup && precedingMessage.images && precedingMessage.images.length > 0 ? precedingMessage.images : undefined;

      // Regenerating replies as whoever originally said it - not a fresh
      // round-robin pick - so "regenerate" reliably means "a different
      // answer from this same bot", never "let someone else answer instead".
      // Falls back to round-robin only for a message with no recorded
      // speaker (predates this field).
      const speaker = roomCharacters.find((c) => c.id === targetMessage?.speakerId)
        || resolveNextSpeaker(roomCharacters, historyUpToTarget, unavailableIds)
        || characterData;
      if (!speaker) return undefined;

      const { history, systemInstruction, postHistoryNote, characterImages, characterName, otherParticipantImages, protectedCount, appearanceLocks } = turnContextFor(historyUpToTarget, speaker, extraDirectives, replyLengthLimit);
      const regenVoiceNote = rollReplyVoiceNote(speaker, Boolean(isImageRequest || isVideoRequest));
      aiPromiseRef.current = dispatch(generateAIResponse({ prompt, history, systemInstruction, postHistoryNote, streamKey, characterImages, characterName, artStyle: speaker?.artStyle, isImageRequest, isVideoRequest, isCharacterInitiated: isFollowup, existingImagePrompt, existingImageParams, customEmotions: speaker.emotionPortraits?.customEmotions, otherRoomCharacters: otherParticipantImages, protectedCount, modelOverride: override || speaker.modelOverride, appearanceLocks, localImageSettings: speaker.localImageSettings, promptImages: sentPhotos }));
      const aiResponse = await aiPromiseRef.current;
      setRecordingVoiceNote(false);
      aiPromiseRef.current = null;
      reportGenerationFailure(aiResponse);

      if (isGenerationSuccess(aiResponse)) {
        const payloadObj = aiResponse.payload as any;
        await trackUsage(payloadObj?.tokenCount, payloadObj?.costEstimate);
        const generatedImages = payloadObj?.images || undefined;
        const generatedVideos = payloadObj?.videos || undefined;
        const regenText = finalizeSpeakerText(typeof payloadObj?.text === 'string' ? payloadObj.text : (payloadObj as string), speaker);
        const newMessage: Message = {
          role: AI,
          txt: regenText,
          isVoiceNote: replyIsVoiceNote(regenVoiceNote, { text: regenText, images: generatedImages, videos: generatedVideos, isRefusal: payloadObj?.isRefusal }),
          images: generatedImages,
          isImageRequest: isFollowup ? Boolean(generatedImages && generatedImages.length > 0) : undefined,
          videos: generatedVideos,
          isVideoRequest: isFollowup ? Boolean(generatedVideos && generatedVideos.length > 0) : undefined,
          videoPrompt: payloadObj?.videoPrompt,
          emotion: payloadObj?.emotion,
          thoughts: payloadObj?.thoughts,
          isRefusal: payloadObj?.isRefusal || undefined,
          imagePrompt: payloadObj?.imagePrompt,
          imageParams: payloadObj?.imageParams,
          speakerId: speaker.id,
          ...beatStamp(currentChat?.storyScript),
          choices: payloadObj?.choices,
          secretRevealed: revealedSecretFor(payloadObj) ? true : undefined,
          notes: replyNotes(payloadObj, speaker),
          swapped: swap ? true : undefined,
          timestamp: Date.now(),
        };
        // A new answer brings its own reaction (#11), or none.
        const treeWithReaction = !isFollowup && parentId && tree.nodes[parentId]
          ? updateNodeMessage(tree, parentId, { ...tree.nodes[parentId].message, characterReaction: payloadObj?.reaction ? { emoji: payloadObj.reaction, speakerId: speaker.id } : undefined })
          : tree;
        const { tree: newTree, nodeId: newNodeId } = addChildNode(treeWithReaction, parentId, newMessage);
        const newContent = flattenPath(newTree, newNodeId);
        await dispatch(updateChatTree({ chatId: chatIdNum, content: newContent, tree: newTree, activeLeafId: newNodeId }));

        if (generatedImages && generatedImages.length > 0) {
          dispatch(updateCharacter({ ...speaker, gallery: [...(speaker.gallery || []), ...generatedImages] }));
        }

        advanceStoryIfDone(payloadObj, newContent);

        applyReplyQuote(payloadObj, newContent);

        markViewOnce(payloadObj, newContent, speaker);

        applyGroupTags(payloadObj, newContent, speaker);

        noteSecretRevealed(payloadObj);
        void noteStoryTags(payloadObj, speaker);
        saveSceneState(payloadObj);
        carryMood(payloadObj);
        advanceGame(payloadObj, false);
        runBackgroundUpdates(newContent, speaker);
        dispatch(fetchChats());
        return { id: newNodeId, text: regenText };
      }

      dispatch(fetchChats());
    } catch (err) {
      console.error("Error regenerating response:", err);
      setError("Failed to regenerate response. Please try again.");
    }
    return undefined;
  };

  // Compare two models (#88): the latest reply again from another model, as
  // a variant; the one you keep stays and the other is deleted.
  const handleCompare = async (override: CharacterModelOverride) => {
    const index = messages.length - 1;
    const current = messages[index];
    if (!current?.id || current.role !== AI || !characterData) return;
    setCompareBusy(true);
    try {
      const made = await handleRegenerate(index, override);
      if (!made) return;
      const turn = resolveTurnModel({ chatProvider, selectedModel, temperature: 0, samplers: {} }, characterData);
      setCompareResult({
        current: { id: current.id, label: `${providerLabel(turn.provider)} / ${turn.model}`, text: current.txt || "" },
        other: { id: made.id, label: `${providerLabel(override.provider || chatProvider)} / ${override.model}`, text: made.text },
      });
    } finally {
      setCompareBusy(false);
    }
  };
  const handleKeepCompared = async (keepId: string, dropId: string) => {
    setCompareOpen(false);
    setCompareResult(null);
    if (!chatIdNum) return;
    const fresh = await dispatch(fetchChatById(chatIdNum)).unwrap().catch(() => currentChat);
    if (!fresh) return;
    const { tree } = getOrBuildTree(fresh);
    if (!tree.nodes[keepId] || !tree.nodes[dropId]) return;
    const { tree: newTree } = deleteBranch(tree, dropId);
    const leafId = findDefaultLeafFrom(newTree, keepId);
    await dispatch(updateChatTree({ chatId: chatIdNum, content: flattenPath(newTree, leafId), tree: newTree, activeLeafId: leafId }));
  };

  // Switches which sibling variant is displayed for a branched message - pure
  // navigation, no API call. Only reachable via the pager, which only renders
  // once a chat already has a tree, so no lazy-migration needed here.
  const handleSwitchBranch = async (nodeId: string) => {
    if (!chatIdNum || !currentChat?.tree || !currentChat.tree.nodes[nodeId]) return;
    const tree = currentChat.tree;
    const leafId = findDefaultLeafFrom(tree, nodeId);
    const newContent = flattenPath(tree, leafId);
    await dispatch(updateChatTree({ chatId: chatIdNum, content: newContent, tree, activeLeafId: leafId }));
  };

  // Deletes a message node and everything generated after it. When the node
  // has sibling variants this is just "delete this variant" (the counterpart
  // to the pager's switch action); when it doesn't, it's a plain "delete this
  // message" that rewinds the conversation back to whatever preceded it -
  // deleteBranch already removes the node's entire descendant subtree either
  // way, so both cases share this one handler.
  // Undo compression: the summary goes, and the messages it covered are
  // read by the AI again. Nothing else in the chat changes.
  // Fork into a new chat (#86): the conversation up to here, in a new chat.
  const handleFork = async (msg: Message) => {
    if (!chatIdNum || !msg.id) return;
    try {
      const fork = await dispatch(forkChat({ chatId: chatIdNum, upToMessageId: msg.id, character: isRoom ? undefined : characterData })).unwrap();
      routeNavigate(`/chat/${fork.id}`);
      toast.success("New chat started from that message. The original is unchanged.");
    } catch (err) {
      toast.error(typeof err === "string" ? err : "Couldn't start a new chat from there.");
    }
  };

  // Their point of view (#101): the recent scene as the character's own
  // account, in a dialog to copy or keep in their diary.
  const [povOpen, setPovOpen] = useState(false);
  const [povText, setPovText] = useState<string | null>(null);
  const handlePov = async () => {
    if (!characterData) return;
    setPovText(null);
    setPovOpen(true);
    try {
      const recent = trimToLatestSummary(messages).filter((m) => !m.isSystem).slice(-POV_MESSAGES);
      const about = [characterData.description, characterData.prompt].filter(Boolean).join(" ");
      const reply = await dispatch(generateAssistText({ instruction: buildPovPrompt(characterData.name, activePersona?.name?.trim() || "the user", about, formatTranscript(recent, transcriptNames()), thoughtsIn(recent)) })).unwrap();
      const text = cleanPov(reply);
      if (!text) throw new Error("Nothing came back. Try again.");
      setPovText(text);
    } catch (err) {
      setPovOpen(false);
      toast.error(typeof err === "string" ? err : "Couldn't tell their side. Check your model settings.");
    }
  };
  const handleKeepPov = async (text: string) => {
    if (!characterData) return;
    const fresh: Character = (await dispatch(fetchCharacterById(characterData.id)).unwrap().catch(() => characterData)) || characterData;
    await dispatch(updateCharacter({ ...fresh, diary: appendDiaryEntry(fresh.diary, { id: generateNodeId(), timestamp: Date.now(), chatId: chatIdNum || undefined, text }) }));
    setPovOpen(false);
    toast.success(`Kept in ${characterData.name}'s diary`);
  };

  // Flashbacks and what-if universes (#102, #104): a new chat with its own
  // memory, which opens with the character setting the scene.
  const [whatIfKind, setWhatIfKind] = useState<WhatIfChat["kind"] | null>(null);
  const handleStartWhatIf = async (whatIf: WhatIfChat) => {
    if (!characterData) return;
    setWhatIfKind(null);
    try {
      const chat = await dispatch(addPreparedChat(buildWhatIfChat(whatIf, characterData, currentChat))).unwrap();
      routeNavigate(`/chat/${chat.id}`, { state: { openScene: true } });
    } catch (err) {
      toast.error(typeof err === "string" ? err : "Couldn't start that chat.");
    }
  };
  // Starred messages (#120): opened at the message you tapped.
  const jumpTo = (routeLocation.state as { jumpTo?: string } | null)?.jumpTo;
  const jumpedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!jumpTo || jumpedRef.current === jumpTo || !messages.some((m) => m.id === jumpTo)) return;
    jumpedRef.current = jumpTo;
    window.setTimeout(() => document.querySelector(`[data-message-id="${CSS.escape(jumpTo)}"]`)?.scrollIntoView({ block: "center" }), 300);
  }, [jumpTo, messages]);
  const openSceneRef = useRef<number | null>(null);
  useEffect(() => {
    if (!(routeLocation.state as { openScene?: boolean } | null)?.openScene || !chatIdNum) return;
    openSceneRef.current = chatIdNum;
    routeNavigate(routeLocation.pathname, { replace: true, state: null });
  }, [routeLocation, routeNavigate, chatIdNum]);
  useEffect(() => {
    const whatIf = currentChat?.whatIf;
    if (openSceneRef.current !== chatIdNum || !whatIf || !characterData || aiLoading || autoReplyInFlightRef.current) return;
    openSceneRef.current = null;
    autoReplyInFlightRef.current = true;
    sendCharacterFollowup(undefined, buildWhatIfOpening(whatIf, characterData.name))
      .catch((err) => console.error("Opening the scene failed:", err))
      .finally(() => { autoReplyInFlightRef.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatIdNum, currentChat?.whatIf, characterData, aiLoading]);

  // Ending a flashback (#102): what happened becomes part of their past,
  // and the chat it started from gets a note.
  const [endingFlashback, setEndingFlashback] = useState(false);
  const handleEndFlashback = async () => {
    const whatIf = currentChat?.whatIf;
    if (!chatIdNum || !characterData || whatIf?.kind !== "flashback" || whatIf.endedAt || endingFlashback) return;
    setEndingFlashback(true);
    try {
      const recent = trimToLatestSummary(messages).filter((m) => !m.isSystem).slice(-30);
      const event = cleanPastEvent(await dispatch(generateAssistText({ instruction: buildPastEventPrompt(characterData.name, whatIf, formatTranscript(recent, transcriptNames())) })).unwrap());
      if (!event) throw new Error("Nothing came back. Try again.");
      const fresh: Character = (await dispatch(fetchCharacterById(characterData.id)).unwrap().catch(() => characterData)) || characterData;
      await dispatch(updateCharacter({ ...fresh, pastEvents: addPastEvent(fresh.pastEvents, event) }));
      await dispatch(updateChatOptions({ chatId: chatIdNum, patch: { whatIf: { ...whatIf, endedAt: Date.now() } } }));
      await dispatch(addMessage({ chatId: chatIdNum, role: YOU, text: `End of the flashback. ${event}`, isNarration: true }));
      if (whatIf.parentChatId != null && chats.some((c) => c.id === whatIf.parentChatId)) {
        await dispatch(addMessage({ chatId: whatIf.parentChatId, role: YOU, text: `Flashback, ${whatIf.title.toLowerCase()}: ${event}`, isNarration: true }));
      }
      dispatch(fetchChats());
      toast.success(`Added to ${characterData.name}'s past`);
    } catch (err) {
      toast.error(typeof err === "string" ? err : (err as Error)?.message || "Couldn't end the flashback.");
    } finally {
      setEndingFlashback(false);
    }
  };

  // Role reversal (#105): narration lines mark each switch.
  const handleStartSwap = async (bodySwap: boolean) => {
    if (!chatIdNum || !characterData) return;
    const userName = activePersona?.name?.trim() || "You";
    await dispatch(updateChatOptions({ chatId: chatIdNum, patch: { roleSwap: { since: Date.now(), ...(bodySwap ? { bodySwap } : {}) } } }));
    await dispatch(addMessage({ chatId: chatIdNum, role: YOU, text: swapStartLine(characterData.name, userName, bodySwap), isNarration: true }));
    dispatch(fetchChats());
  };
  const handleEndSwap = async () => {
    if (!chatIdNum || !characterData || !currentChat?.roleSwap) return;
    const userName = activePersona?.name?.trim() || "You";
    const { bodySwap } = currentChat.roleSwap;
    await dispatch(updateChatOptions({ chatId: chatIdNum, patch: { roleSwap: undefined } }));
    await dispatch(addMessage({ chatId: chatIdNum, role: YOU, text: swapEndLine(characterData.name, userName, bodySwap), isNarration: true }));
    dispatch(fetchChats());
  };

  const handleUndoSummary = async (msg: Message) => {
    if (!chatIdNum || !msg.id) return;
    const confirmed = await showConfirm(
      msg.chapterTitle ? "Undo this chapter" : "Undo compression",
      `Remove this ${msg.chapterTitle ? "chapter's " : ""}summary? The messages it covered go back into what the AI reads, which makes each reply a little longer and costlier. Your messages stay as they are.`
    );
    if (!confirmed) return;
    try {
      await dispatch(removeCompressionSummary({ chatId: chatIdNum, summaryId: msg.id })).unwrap();
      toast.success(msg.chapterTitle ? "Chapter removed" : "Compression undone");
    } catch (err) {
      toast.error(typeof err === "string" ? err : "Couldn't undo the summary.");
    }
  };

  const handleDeleteBranch = async (nodeId: string) => {
    if (!chatIdNum || !currentChat) return;
    const { tree } = getOrBuildTree(currentChat);
    if (!tree.nodes[nodeId]) return;

    const { siblingIds } = getSiblingInfo(tree, nodeId);
    const hasSiblings = siblingIds.length > 1;

    const confirmed = await showConfirm(
      "Delete Message",
      hasSiblings
        ? "Delete this variant and everything that came after it in this branch? This can't be undone."
        : "Delete this message and everything that came after it in the conversation? This can't be undone."
    );
    if (!confirmed) return;

    const { tree: newTree, parentId } = deleteBranch(tree, nodeId);

    let newLeafId: string | null = null;
    if (hasSiblings) {
      const remainingSiblingIds = siblingIds.filter((id) => id !== nodeId);
      // Land on whichever remaining variant was closest to the one just deleted.
      const deletedIndex = siblingIds.indexOf(nodeId);
      const fallbackId = remainingSiblingIds[Math.min(deletedIndex, remainingSiblingIds.length - 1)];
      newLeafId = findDefaultLeafFrom(newTree, fallbackId);
    } else if (parentId && newTree.nodes[parentId]) {
      newLeafId = findDefaultLeafFrom(newTree, parentId);
    }

    const newContent = newLeafId ? flattenPath(newTree, newLeafId) : [];
    await dispatch(updateChatTree({ chatId: chatIdNum, content: newContent, tree: newTree, activeLeafId: newLeafId }));
    dispatch(fetchChats());
  };

  // "Rewind" - a chat-level shortcut for the same delete primitive above,
  // targeting the last user turn (and everything the character said after
  // it) so a bad exchange can be quickly undone without hunting for the
  // right message. Falls back to the very last message if the active path
  // has no user turn at all (e.g. it ends on a character-initiated follow-up).
  const handleRewindLastTurn = async () => {
    if (!chatIdNum || !currentChat) return;
    const { content: treeContent } = getOrBuildTree(currentChat);
    if (treeContent.length === 0) return;

    let targetIndex = treeContent.length - 1;
    for (let i = treeContent.length - 1; i >= 0; i--) {
      // A compression summary is stored as a user turn, but rewinding to it
      // would delete everything after it.
      if (treeContent[i].role === YOU && !treeContent[i].isCompressionSummary) {
        targetIndex = i;
        break;
      }
    }
    const targetNodeId = treeContent[targetIndex]?.id;
    if (targetNodeId) {
      await handleDeleteBranch(targetNodeId);
    }
  };

  // "Continue" - re-invokes the model on a truncated/short AI reply instead
  // of requiring a new user turn. History includes the partial message
  // itself as the trailing assistant turn so the model can see what it
  // already said; the completion is appended (not branched) onto the same
  // node via updateNodeMessage, so it reads as one continued reply.
  const handleContinueMessage = async (index: number) => {
    if (index < 0 || index >= messages.length || !chatIdNum || !currentChat) return;

    setError(null);

    try {
      const { tree, activeLeafId: currentActiveLeafId, content: treeContent } = getOrBuildTree(currentChat);
      const targetMessage = treeContent[index];
      const targetNodeId = targetMessage?.id;
      if (!targetNodeId || !tree.nodes[targetNodeId] || targetMessage.role !== AI) {
        console.warn("Cannot continue: message not found or not an AI message.");
        return;
      }

      const historyUpToTarget = getPathToNode(tree, targetNodeId);
      // Continuing is always the same character finishing their own
      // sentence - never a fresh speaker pick.
      const speaker = roomCharacters.find((c) => c.id === targetMessage.speakerId) || characterData;
      if (!speaker) return;
      const continueDirective =
        "The previous assistant message got cut off before finishing. Continue writing directly from exactly where it left off - do not repeat any earlier text, do not restart the sentence, and add no preamble or acknowledgement. Keep going in the same voice, tone, and format.";
      const { history, systemInstruction, postHistoryNote, characterImages, characterName, protectedCount, appearanceLocks } = turnContextFor([...historyUpToTarget, targetMessage], speaker, [continueDirective], replyLengthLimit);

      aiPromiseRef.current = dispatch(generateAIResponse({ prompt: "Continue.", history, systemInstruction, postHistoryNote, streamKey, characterImages, characterName, artStyle: speaker.artStyle, customEmotions: speaker.emotionPortraits?.customEmotions, protectedCount, modelOverride: speaker.modelOverride, appearanceLocks, localImageSettings: speaker.localImageSettings }));
      const aiResponse = await aiPromiseRef.current;
      aiPromiseRef.current = null;
      reportGenerationFailure(aiResponse);

      if (isGenerationSuccess(aiResponse)) {
        const payloadObj = aiResponse.payload as any;
        await trackUsage(payloadObj?.tokenCount, payloadObj?.costEstimate);
        const continuationText = finalizeSpeakerText(typeof payloadObj?.text === "string" ? payloadObj.text : (payloadObj as string), speaker);
        const existingText = targetMessage.txt || "";

        // A trailing "[Image Context: ...]" tag must stay at the very end -
        // stripImageContextTag only strips it when it's anchored there for
        // display - so splice the continuation in before it rather than after.
        const imageContextMatch = existingText.match(/\n*\[Image Context:[\s\S]*?\]\s*$/i);
        const tag = imageContextMatch?.[0] || "";
        const base = tag ? existingText.slice(0, existingText.length - tag.length) : existingText;
        const separator = base && !/\s$/.test(base) ? " " : "";
        const thoughts = [targetMessage.thoughts, payloadObj?.thoughts].filter(Boolean).join(" ") || undefined;
        const mergedMessage: Message = { ...targetMessage, txt: base + separator + continuationText + tag, thoughts };

        const updatedTree = updateNodeMessage(tree, targetNodeId, mergedMessage);
        const updatedContent = flattenPath(updatedTree, currentActiveLeafId);
        await dispatch(updateChatTree({ chatId: chatIdNum, content: updatedContent, tree: updatedTree, activeLeafId: currentActiveLeafId }));

        advanceStoryIfDone(payloadObj, updatedContent);

        applyReplyQuote(payloadObj, updatedContent);

        markViewOnce(payloadObj, updatedContent, speaker);

        applyGroupTags(payloadObj, updatedContent, speaker);

        noteSecretRevealed(payloadObj);
        void noteStoryTags(payloadObj, speaker);
        saveSceneState(payloadObj);
        carryMood(payloadObj);
        runBackgroundUpdates(updatedContent, speaker);
      }

      dispatch(fetchChats());
    } catch (err) {
      console.error("Error continuing response:", err);
      setError("Failed to continue response. Please try again.");
    }
  };

  // "Not a refusal" on a falsely flagged reply: clears the flag so the
  // message goes back into the context sent to the model.
  const handleClearRefusal = async (index: number) => {
    if (!chatIdNum || !currentChat) return;
    const { tree, activeLeafId: currentActiveLeafId, content: treeContent } = getOrBuildTree(currentChat);
    const nodeId = treeContent[index]?.id;
    if (!nodeId || !tree.nodes[nodeId]) return;
    const updatedTree = updateNodeMessage(tree, nodeId, { ...tree.nodes[nodeId].message, isRefusal: undefined });
    await dispatch(updateChatTree({ chatId: chatIdNum, content: flattenPath(updatedTree, currentActiveLeafId), tree: updatedTree, activeLeafId: currentActiveLeafId }));
  };

  const handleStopGenerating = () => {
    if (aiPromiseRef.current) {
      aiPromiseRef.current.abort();
      aiPromiseRef.current = null;
    }
  };

  // Where the part of the chat the model still sees begins (after the seed,
  // or at the latest summary) - manual compression only summarizes from
  // there, and is only offered once there's something worth summarizing.
  const compressibleStart = useMemo(() => {
    const latest = latestSummaryIndex(messages);
    return latest >= 0 ? latest : countSeedMessages(messages);
  }, [messages]);
  const canCompress = messages.length - compressibleStart > 4;

  const handleCompress = async () => {
    if (!canCompress || !chatIdNum) return;

    setError(null);
    try {
      // Summarize everything the model still sees except the last 2 messages.
      // The summary goes right after the last summarized message; nothing is
      // deleted, so the history and its branches stay readable.
      const cutoff = messages.length - 2;
      const msgsToCompress = messages.slice(compressibleStart, cutoff);
      const { text: systemInstructionText } = buildSystemInstruction(characterData, undefined, undefined, activePersona);

      const { summary, tokens: compressTokens, cost: compressCost } = await dispatch(compressChatHistory({ messages: msgsToCompress, names: transcriptNames(), systemInstruction: systemInstructionText })).unwrap();
      await trackUsage(compressTokens, compressCost);

      if (summary) {
        const lastCovered = messages[cutoff - 1];
        await dispatch(insertCompressionSummary({
          chatId: chatIdNum,
          afterMessageId: lastCovered.id,
          afterIndex: cutoff - 1,
          summaryMessages: buildSummaryMessages(summary, lastCovered.timestamp),
        })).unwrap();
        dispatch(fetchChats());
      }
    } catch (err) {
      console.error("Error compressing chat:", err);
      setError("Failed to compress conversation. It might be too short or an API error occurred.");
    }
  };

  // "End chapter": everything since the last summary becomes a titled
  // chapter, placed at the end of the conversation like a compression
  // summary, so the next reply starts fresh from it (nothing is deleted).
  const [endingChapter, setEndingChapter] = useState(false);
  const chapterCount = useMemo(() => messages.filter((m) => m.chapterTitle).length, [messages]);
  const canEndChapter = messages.length - compressibleStart >= 2 && !messages[messages.length - 1]?.isSystem;
  const handleEndChapter = async () => {
    if (!chatIdNum || !canEndChapter || endingChapter) return;
    setError(null);
    setEndingChapter(true);
    try {
      const covered = messages.slice(compressibleStart);
      const lastCovered = messages[messages.length - 1];
      const { text: systemInstructionText } = buildSystemInstruction(characterData, undefined, undefined, activePersona);
      const chapter = await dispatch(summarizeChapter({ messages: covered, names: transcriptNames(), systemInstruction: systemInstructionText })).unwrap();
      await trackUsage(chapter.tokens, chapter.cost);
      const title = chapter.title || `Chapter ${chapterCount + 1}`;
      await dispatch(insertCompressionSummary({
        chatId: chatIdNum,
        afterMessageId: lastCovered.id,
        afterIndex: messages.length - 1,
        summaryMessages: buildSummaryMessages(chapter.summary, lastCovered.timestamp, { title, recap: chapter.recap }),
      })).unwrap();
      dispatch(fetchChats());
      toast.success(`Chapter ${chapterCount + 1} ended: ${title}`);
    } catch (err) {
      setError(typeof err === "string" ? err : "Couldn't end the chapter. Check your model settings and try again.");
    } finally {
      setEndingChapter(false);
    }
  };

  // Episodes and cliffhangers (#103): the character ends the scene on a
  // cliffhanger, then it closes like a chapter with a "Next time on…"
  // teaser, and the next reply has to pick up the hook.
  const [endingEpisode, setEndingEpisode] = useState(false);
  const handleEndEpisode = async () => {
    if (!chatIdNum || !characterData || endingEpisode || autoReplyInFlightRef.current || aiLoading) return;
    setError(null);
    setEndingEpisode(true);
    autoReplyInFlightRef.current = true;
    try {
      if (!(await sendCharacterFollowup(undefined, buildCliffhangerDirective(characterData.name)))) return;
      const { content } = getOrBuildTree(await dispatch(fetchChatById(chatIdNum)).unwrap());
      const latest = latestSummaryIndex(content);
      const covered = content.slice(latest >= 0 ? latest : countSeedMessages(content));
      const lastCovered = content[content.length - 1];
      const { text: systemInstructionText } = buildSystemInstruction(characterData, undefined, undefined, activePersona);
      const chapter = await dispatch(summarizeChapter({ messages: covered, names: transcriptNames(), systemInstruction: systemInstructionText })).unwrap();
      await trackUsage(chapter.tokens, chapter.cost);
      const recent = covered.filter((m) => !m.isSystem && !m.isCompressionSummary).slice(-12);
      const teaserReply = await dispatch(generateAssistText({ instruction: buildTeaserPrompt(characterData.name, activePersona?.name?.trim() || "the user", formatTranscript(recent, transcriptNames())), background: true })).unwrap().catch(() => "");
      const { teaser, hook } = parseTeaser(teaserReply);
      const title = chapter.title || `Episode ${chapterCount + 1}`;
      await dispatch(insertCompressionSummary({
        chatId: chatIdNum,
        afterMessageId: lastCovered.id,
        afterIndex: content.length - 1,
        summaryMessages: buildSummaryMessages(chapter.summary, lastCovered.timestamp, { title, recap: chapter.recap, teaser }),
      })).unwrap();
      if (hook) await dispatch(updateChatOptions({ chatId: chatIdNum, patch: { pendingHook: hook } }));
      dispatch(fetchChats());
      toast.success(`Episode ended: ${title}`);
    } catch (err) {
      setError(typeof err === "string" ? err : "Couldn't end the episode. Check your model settings and try again.");
    } finally {
      autoReplyInFlightRef.current = false;
      setEndingEpisode(false);
    }
  };

  // "Export as story" (#20): the active branch as readable Markdown.
  const handleExportStory = () => {
    if (!currentChat) return;
    const markdown = buildStoryMarkdown({
      title: currentChat.title || characterData?.name || "Story",
      userName: activePersona?.name?.trim() || "You",
      speakerNames: Object.fromEntries(roomCharacters.map((c) => [c.id, c.name])),
      primaryName: characterData?.name || "Character",
      messages,
    });
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = storyFileName(currentChat.title || characterData?.name || "story");
    a.click();
    URL.revokeObjectURL(url);
  };

  const startGame = async (kind: NonNullable<Chat["game"]>["kind"], guesser: "user" | "character") => {
    if (!chatIdNum || autoReplyInFlightRef.current || aiLoading) return;
    const game = { kind, guesser: kind === "twenty-questions" ? guesser : undefined, turns: 0, startedAt: Date.now() };
    await dispatch(updateChatOptions({ chatId: chatIdNum, patch: { game } }));
    autoReplyInFlightRef.current = true;
    try {
      // The game's rules ride on this opening reply's direction, since the
      // scene built for it was read before the game was saved.
      await sendCharacterFollowup(undefined, buildGameStartDirective(game, characterData?.name || "the character"));
    } catch (err) {
      console.error("Starting the game failed:", err);
    } finally {
      autoReplyInFlightRef.current = false;
    }
  };

  const handleExport = () => {
    if (!chatIdNum || !chats) return;
    const currentChat = chats.find((c) => c.id === chatIdNum);
    if (!currentChat) return;

    const { id, ...exportData } = currentChat;

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-${chatIdNum}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Described once so Header can render these both as tooltipped icon
  // buttons on desktop and as labeled rows in the mobile "more" menu.
  // Phone call (#56): what you say goes in as a voice message, and the
  // character's newest reply is spoken back.
  const lastCharacterMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === AI && !messages[i].isSystem) return messages[i];
    return undefined;
  }, [messages]);
  const call = useCall({
    active: inCall,
    onSend: (text) => void handleSend(text, false, false, false, undefined, false, true),
    aiLoading,
    lastReply: lastCharacterMessage,
    voice: characterData?.voice,
  });
  const endCall = () => {
    setInCall(false);
    if (call.seconds > 0) toast.info(`Call ended · ${formatCallTime(call.seconds)}`);
  };

  // Schedule and presence (#7): "online", or what they're doing and when
  // they last wrote; refreshed every minute so it changes with the clock.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (!characterData?.schedule) return;
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [characterData?.schedule]);
  const presence = !isRoom ? presenceFor(characterData?.schedule, clock, lastCharacterMessage?.timestamp) : undefined;

  // Event invites (#134): your answer is kept on the card; accepting makes
  // it a shared plan (#84), with a notice in the chat.
  const answerInvite = (msg: Message, answer: "accepted" | "declined") => {
    if (!chatIdNum || !msg.id || !msg.invite || msg.invite.answer) return;
    const planId = answer === "accepted" ? newPlanId() : undefined;
    void dispatch(updateChatMessage({ chatId: chatIdNum, messageId: msg.id, patch: { invite: { ...msg.invite, answer, ...(planId ? { planId } : {}) } } }));
    if (planId) {
      const plan = { id: planId, what: msg.invite.what, ...(msg.invite.when ? { when: msg.invite.when } : {}), createdAt: Date.now() };
      void dispatch(updateChatOptions({ chatId: chatIdNum, patch: { plans: [...(currentChat?.plans || []), plan] } }))
        .then(() => dispatch(addChatNotice({ chatId: chatIdNum, text: `Added to Story › Plans together: ${msg.invite!.what}` })));
    }
  };

  // Blocking (#133): yours to set and lift; theirs only a friend can patch up.
  const blockCharacter = async () => {
    if (!chatIdNum || !characterData) return;
    const name = characterData.name;
    const confirmed = await showConfirm(
      `Block ${name}?`,
      `${name} can't text you, and their statuses stop reaching you. They aren't told, but friends you share may notice and bring it up.`
    );
    if (!confirmed) return;
    await dispatch(setBlocked({ chatId: chatIdNum, blocked: { by: "you", at: Date.now() }, notice: `You blocked ${name}` }));
  };
  const unblockCharacter = () => {
    if (!chatIdNum || !characterData) return;
    void dispatch(setBlocked({ chatId: chatIdNum, blocked: null, notice: `You unblocked ${characterData.name}` }));
  };

  const chatActions: HeaderAction[] = [
    { icon: FaBookOpen, label: "Export as story (Markdown)", onClick: handleExportStory },
    ...(!isRoom && characterData ? [{ icon: FaImages, label: `${characterData.name}'s album`, onClick: () => setAlbumOpen(true) }] : []),
    { icon: FaDownload, label: "Export chat (backup file)", onClick: handleExport },
    ...(messages.length > 0
      ? [{ icon: FaHistory, label: "Rewind last turn", onClick: handleRewindLastTurn, disabled: aiLoading, danger: true }]
      : []),
    ...(canEndChapter
      ? [{ icon: FaBookmark, label: endingChapter ? "Ending the chapter..." : "End chapter (summarize it and start the next)", onClick: handleEndChapter, disabled: aiLoading || endingChapter }]
      : []),
    ...(canEndChapter && !isRoom && characterData
      ? [{ icon: FaFilm, label: endingEpisode ? "Ending the episode..." : "End episode (on a cliffhanger)", onClick: handleEndEpisode, disabled: aiLoading || endingEpisode }]
      : []),
    ...(!isRoom && characterData && messages.filter((m) => !m.isSystem).length > 2
      ? [{ icon: FaEye, label: `${characterData.name}'s side of the story`, onClick: handlePov, disabled: aiLoading || (povOpen && !povText) }]
      : []),
    ...(mainStory && characterData
      ? [
          { icon: FaHourglassStart, label: "Flashback (a scene from their past)", onClick: () => setWhatIfKind("flashback") },
          { icon: FaGlobe, label: "What-if universe", onClick: () => setWhatIfKind("universe") },
        ]
      : []),
    ...(currentChat?.whatIf?.kind === "flashback" && !currentChat.whatIf.endedAt && messages.length > 2
      ? [{ icon: FaHourglassStart, label: endingFlashback ? "Ending the flashback..." : "End flashback (add it to their past)", onClick: handleEndFlashback, disabled: aiLoading || endingFlashback }]
      : []),
    ...(!isRoom && characterData && messages.length > 0
      ? currentChat?.roleSwap
        ? [{ icon: FaExchangeAlt, label: "Swap back", onClick: handleEndSwap, active: true }]
        : [
            { icon: FaExchangeAlt, label: `Swap roles (you write as ${characterData.name})`, onClick: () => handleStartSwap(false), disabled: aiLoading },
            { icon: FaExchangeAlt, label: "Body swap (in the story)", onClick: () => handleStartSwap(true), disabled: aiLoading },
          ]
      : []),
    ...(canCompress
      ? [{ icon: FaCompressArrowsAlt, label: "Summarize and compress older messages to save tokens", onClick: handleCompress, disabled: aiCompressing }]
      : []),
    ...(messages.length > 0
      ? [{ icon: FaBolt, label: isRoom ? "Make the next bot send a follow-up now" : `Make ${characterData?.name || "them"} send a follow-up now`, onClick: handleManualFollowup, disabled: aiLoading, shortLabel: "follow-up" }]
      : []),
    ...(messages.length > 0
      ? [
          { icon: FaDiceD20, label: "Surprise me (the next reply brings a twist)", onClick: handleSurprise, disabled: aiLoading },
          { icon: FaTheaterMasks, label: "Scenario cards", onClick: () => setScenarioOpen(true), disabled: aiLoading },
          { icon: FaForward, label: "Pass the time", onClick: () => setTimeSkipOpen(true), disabled: aiLoading },
        ]
      : []),
    ...(!isRoom && characterData && messages.length > 0
      ? [{ icon: FaGift, label: `Give ${characterData.name} a gift`, onClick: () => setGiftOpen(true) }]
      : []),
    ...(!isRoom && characterData && messages[messages.length - 1]?.role === AI
      ? [{ icon: FaBalanceScale, label: "Compare two models (the latest reply)", onClick: () => { setCompareResult(null); setCompareOpen(true); }, disabled: aiLoading }]
      : []),
    ...(messages.length > 0
      ? [{ icon: FaLayerGroup, label: "Draw an event card (a random event happens)", onClick: handleDrawEvent, disabled: aiLoading }]
      : []),
    ...(!isRoom && characterData && isRecognitionSupported() && isSpeechSupported()
      ? [{ icon: FaPhoneAlt, label: `Call ${characterData.name}`, onClick: () => setInCall(true), disabled: aiLoading || inCall }]
      : []),
    ...(hasBranches(currentChat?.tree)
      ? [{ icon: FaCodeBranch, label: "Branch map (every storyline in this chat)", onClick: () => setBranchMapOpen(true) }]
      : []),
    ...(isRoom
      ? [{ icon: FaPoll, label: "Create poll", onClick: () => setPollOpen(true), disabled: aiLoading }]
      : []),
    ...(!isRoom && characterData
      ? [{ icon: FaGamepad, label: "Play a game", onClick: () => setGameOpen(true), disabled: aiLoading || Boolean(currentChat?.game) }]
      : []),
    { icon: FaClock, label: "Auto follow-up settings", onClick: () => setIsAutoReplyModalOpen(true), active: autoReplySettings.enabled },
    // #151: the header keeps three things - the title (Contact info), this
    // and "more"; the rest of these live in the more menu.
    { icon: FaSlidersH, label: "Scene & story", onClick: () => { setSceneOpen((v) => !v); setParticipantsOpen(false); setContactOpen(false); }, active: sceneOpen, primary: true, labelled: true, shortLabel: "scene" },
    ...(roomCharacters.length > 0
      ? [{ icon: FaUsers, label: isRoom ? "Participants" : "Invite someone", onClick: () => { setParticipantsOpen((v) => !v); setSceneOpen(false); setContactOpen(false); }, active: participantsOpen, shortLabel: "people" }]
      : []),
    ...(characterData
      ? [{ icon: FaUserCircle, label: "View current portrait", onClick: () => setPortraitPreviewOpen(true) }]
      : []),
    ...(!isRoom && characterData && !blockedByThem(currentChat)
      ? [blockedByYou(currentChat)
          ? { icon: FaBan, label: `Unblock ${characterData.name}`, onClick: unblockCharacter }
          : { icon: FaBan, label: `Block ${characterData.name}`, onClick: () => void blockCharacter(), danger: true }]
      : []),
    ...(personas.length > 1
      ? [{ icon: FaUserCircle, label: `Persona: ${activePersona?.name || "None"}`, onClick: () => setIsPersonaModalOpen(true), active: Boolean(currentChat?.personaId) }]
      : []),
  ];

  return (
    <div className="flex flex-col w-full h-dvh relative overflow-clip">
      <Header
        title={character || "Chat"}
        subtitle={isRoom ? `With ${roomCharacters.map((c) => c.name).join(", ")}` : blockedByYou(currentChat) ? "Blocked" : blockedByThem(currentChat) ? undefined : currentChat?.disappearing ? `Disappearing · ${DISAPPEAR_LABEL[currentChat.disappearing.after]}` : (presence?.label || characterData?.relationship || characterData?.description)}
        online={blockedByThem(currentChat) ? false : presence ? presence.online : true}
        avatar={
          // A group shows its members' faces, so nobody's stands for all of
          // them (#151, the "GG" bug's header half).
          isRoom ? (
            <span className="flex flex-shrink-0 -space-x-3">
              {roomCharacters.slice(0, 3).map((c) => (
                <CharacterAvatar key={c.id} name={c.name} accent={c.accent} imageSrc={avatarOf(c)} size={34} className="ring-2 ring-surface" />
              ))}
            </span>
          ) : (
            // They blocked you (#133): their photo is gone for you.
            <CharacterAvatar name={characterData?.name || character} accent={blockedByThem(currentChat) ? undefined : characterData?.accent} imageSrc={blockedByThem(currentChat) ? undefined : headerEmotionImageSrc} size={40} />
          )
        }
        onTitleClick={isRoom ? () => { setParticipantsOpen(true); setSceneOpen(false); setContactOpen(false); } : characterData ? () => { setContactOpen((v) => !v); setSceneOpen(false); setParticipantsOpen(false); } : undefined}
        titleLabel={isRoom ? "Open the group's members" : `Open ${characterData ? `${characterData.name}'s` : "their"} contact info`}
        actionGroups={[chatActions]}
      />

      <PortraitPreviewModal
        isOpen={portraitPreviewOpen}
        onClose={() => setPortraitPreviewOpen(false)}
        characterName={characterData?.name || character}
        accent={characterData?.accent}
        emotion={latestEmotion}
        imageSrc={headerEmotionImageSrc}
      />

      <AutoReplyModal
        isOpen={isAutoReplyModalOpen}
        onClose={() => setIsAutoReplyModalOpen(false)}
        settings={autoReplySettings}
        onChange={handleAutoReplyChange}
      />

      <PersonaModal
        isOpen={isPersonaModalOpen}
        onClose={() => setIsPersonaModalOpen(false)}
        characterName={characterData?.name}
        personas={personas}
        selectedPersonaId={currentChat?.personaId}
        globalDefaultPersonaName={globalActivePersona?.name}
        onSelectPersona={handleSelectPersona}
      />

      {/* Error Message */}
      {error && (
        <div className="absolute top-16 w-full z-20 px-4 flex justify-center">
          <Alert variant="destructive" className="max-w-md flex items-start gap-2">
            <AlertDescription className="flex-1">{error}</AlertDescription>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss error" className="opacity-70 hover:opacity-100 mt-0.5">
              <FaTimes size={12} />
            </button>
          </Alert>
        </div>
      )}

      {/* Missing emotion portrait prompt */}
      {missingEmotionPortrait && dismissedMissingEmotion !== missingEmotionPortrait && (
        <div className="absolute top-16 w-full z-20 px-4 flex justify-center">
          <div className="max-w-md w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-card border border-border shadow-soft text-sm">
            <span className="flex-1 text-foreground">
              {characterData?.name || "This character"} looks <span className="font-semibold capitalize">{missingEmotionPortrait}</span> - generate a portrait for this mood?
              {missingEmotionError && <span className="block text-destructive text-xs mt-1">{missingEmotionError}</span>}
            </span>
            <Button
              type="button"
              size="sm"
              onClick={handleGenerateMissingEmotionPortrait}
              disabled={generatingMissingEmotion}
              className="h-auto px-3 py-1.5 text-xs font-semibold flex-shrink-0"
            >
              {generatingMissingEmotion ? "Generating..." : "Generate"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setDismissedMissingEmotion(missingEmotionPortrait)}
              className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              <FaTimes size={11} />
            </Button>
          </div>
        </div>
      )}

      {/* Chat Messages. min-h-0 keeps it the screen's height: without it a
          tall side panel (Contact info) stretched it past the bottom, and
          each new message scrolled the whole chat up, leaving a blank strip.
          Clipped, not hidden, so nothing inside can scroll it either. */}
      <div className="flex-1 min-h-0 overflow-clip relative">
        {/* Upset with you (#97), until you make up. */}
        {!isRoom && characterData && currentChat?.conflict && (
          <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 z-10 max-w-[90%]">
            <div role="status" className="truncate rounded-full border border-destructive/30 bg-card/95 px-3 py-1 text-[12px] text-foreground shadow-soft" title={currentChat.conflict.about}>
              <span aria-hidden>😠 </span>{characterData.name} is upset with you · {currentChat.conflict.about}
            </div>
          </div>
        )}
        <ChatWindow awayNote={awayNote} onFork={handleFork} stageSuggestion={currentChat?.stage && currentChat.stageSuggestion ? { from: currentChat.stage, to: currentChat.stageSuggestion } : undefined} onAcceptStage={acceptStage} onDismissStage={dismissStage} coWriting={!isRoom && Boolean(currentChat?.coWriting)} onSuggestNext={handleSuggestNext} onTranslate={currentChat?.language ? handleTranslate : undefined} onReplyToLetter={(letter) => setDraftInjection({ text: letterReplyDraft(letter), nonce: Date.now() })} arcSuggestion={currentChat?.arcSuggestion} onAcceptArc={acceptArc} onDismissArc={dismissArc} relationshipSuggestion={currentChat?.relationshipSuggestion} onAcceptRelationship={acceptRelationship} onDismissRelationship={dismissRelationship} game={currentChat?.game} gameScore={currentChat?.gameScore} onEndGame={() => chatIdNum && dispatch(updateChatOptions({ chatId: chatIdNum, patch: { game: undefined } }))} storyScript={currentChat?.storyScript} onEditStory={() => setStoryOpen(true)} onMoveBeat={moveStoryBeat} onReply={(m) => setReplyingTo(m)} onViewOnce={openViewOnce} onVote={votePoll} onOpenContact={(m) => void openContact(m)} onAnswerInvite={answerInvite} recap={recap} onToggleBookmark={handleToggleBookmark} onUndoSummary={handleUndoSummary} onReact={handleReact} replySuggestions={replySuggestions} onPickSuggestion={handlePickSuggestion} bottomInset={terminal ? 0 : composerInset} characterName={character} userName={activePersona?.name} character={characterData} characters={roomCharacters} allCharacters={characters} messages={messages} tree={currentChat?.tree} onSwitchBranch={handleSwitchBranch} onDeleteBranch={handleDeleteBranch} onRegenerate={handleRegenerate} onContinue={handleContinueMessage} onClearRefusal={handleClearRefusal} onEdit={handleEditMessage} aiLoading={aiLoading} isFollowupPending={Boolean(chatIdNum && pendingFollowups[chatIdNum])} onSend={handleSend} chatId={chatIdNum ?? undefined} sceneOpen={sceneOpen} onCloseScene={() => setSceneOpen(false)} contactOpen={contactOpen} onCloseContact={() => setContactOpen(false)} authorNote={currentChat?.authorNote} worldTags={currentChat?.worldTags} isRoom={isRoom} chatMemory={currentChat?.memory} chatPinnedMemory={currentChat?.pinnedMemory} greetingIndex={currentChat?.greetingIndex} hardLimits={currentChat?.hardLimits} intensity={currentChat?.intensity} isNsfwChat={roomCharacters.length > 0 && roomCharacters.every((c) => effectiveContentRating(c) === "nsfw")} onSelectGreeting={(index) => chatIdNum && dispatch(updateChatGreeting({ chatId: chatIdNum, greetingIndex: index }))} chatScenario={currentChat?.scenario} participantsOpen={participantsOpen} onCloseParticipants={() => setParticipantsOpen(false)} mutedParticipantIds={currentChat?.mutedParticipantIds} recordingVoiceNote={recordingVoiceNote} />
        {inCall && characterData && (
          <CallScreen
            name={characterData.name}
            initials={characterData.name.slice(0, 2).toUpperCase()}
            accent={characterData.accent}
            imageSrc={headerEmotionImageSrc || avatarOf(characterData)}
            call={call}
            onEnd={endCall}
          />
        )}
        <BranchMapDialog
          open={branchMapOpen}
          onOpenChange={setBranchMapOpen}
          tree={currentChat?.tree}
          activeLeafId={currentChat?.activeLeafId}
          onJump={(leafId) => {
            if (!chatIdNum || !currentChat?.tree) return;
            dispatch(updateChatTree({ chatId: chatIdNum, content: flattenPath(currentChat.tree, leafId), tree: currentChat.tree, activeLeafId: leafId }));
          }}
        />
        <GameDialog open={gameOpen} onOpenChange={setGameOpen} characterName={characterData?.name || "them"} onStart={startGame} />
        <PollDialog open={pollOpen} onOpenChange={setPollOpen} onCreate={(q, o) => void handleCreatePoll(q, o)} />
        <StoryScriptDialog open={storyOpen} onOpenChange={setStoryOpen} script={currentChat?.storyScript} onSave={saveStoryScript} />
        <ScenarioCardsDialog open={scenarioOpen} onOpenChange={setScenarioOpen} onStart={handleStartScenario} />
        <TimeSkipDialog open={timeSkipOpen} onOpenChange={setTimeSkipOpen} onSkip={handleTimeSkip} onPassTime={(pass) => void handlePassTime(pass)} />
        {!isRoom && characterData && (
          <CompareDialog
            open={compareOpen}
            onOpenChange={(o) => { setCompareOpen(o); if (!o) setCompareResult(null); }}
            currentProvider={characterData.modelOverride?.provider || chatProvider}
            busy={compareBusy}
            result={compareResult}
            onCompare={handleCompare}
            onKeep={handleKeepCompared}
          />
        )}
        {!isRoom && characterData && (
          <GiftDialog open={giftOpen} onOpenChange={setGiftOpen} characterName={characterData.name} gifts={characterData.gifts || []} disabled={aiLoading} onGive={handleGiveGift} />
        )}
        {!isRoom && characterData && <AlbumDialog open={albumOpen} onOpenChange={setAlbumOpen} character={characterData} stage={currentChat?.stage} />}
        {!isRoom && characterData && <PovDialog open={povOpen} onOpenChange={setPovOpen} characterName={characterData.name} text={povText} onKeep={handleKeepPov} />}
        {characterData && <WhatIfDialog kind={whatIfKind} onOpenChange={(o) => !o && setWhatIfKind(null)} characterName={characterData.name} onStart={handleStartWhatIf} />}
      </div>

      {/* Message Input - floats over the chat, except under terminal where it
          docks below it as a bordered prompt strip */}
      <div
        ref={composerRef}
        className={
          terminal
            ? "relative flex-none w-full px-4 md:px-[26px] pt-3.5 pb-5 border-t border-border bg-background z-20"
            : cn(
                // #149: as wide as the message lane (ChatWindow), with its gutters.
                "absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 transform -translate-x-1/2 w-full max-w-[824px] px-3 md:px-8 z-20",
                // With a side panel open as a column (from 1360px, 392px), center
                // over the chat column only instead of running under the panel.
                (sceneOpen || participantsOpen || contactOpen) && "min-[1360px]:left-[calc(50%-196px)] min-[1360px]:w-[calc(100%-392px)]"
              )
        }
      >
{blockedByYou(currentChat) && characterData ? (
          // You blocked them (#133): no composer, just the way back.
          <div role="status" data-slot="blocked-bar" className="flex flex-col items-center gap-3 rounded-card bg-surface px-4 py-3 text-center shadow-popover ring-1 ring-inset ring-border">
            <p className="text-[13.5px] text-muted-foreground">You blocked {characterData.name}. They can't message you, and you can't message them.</p>
            <Button type="button" onClick={unblockCharacter} className="h-10 rounded-[10px] px-5">Unblock</Button>
          </div>
        ) : (
                <MessageInput
          replyPreview={replyingToStatus ? { name: `${roomCharacters.find((c) => c.id === replyingToStatus.owner)?.name || characterData?.name || "Their"} · Status`, text: `${replyingToStatus.photo ? "📷 " : ""}${replyingToStatus.text || "Photo"}` } : replyingTo ? { name: replyingTo.role === YOU ? "You" : roomCharacters.find((c) => c.id === replyingTo.speakerId)?.name || characterData?.name || "Them", text: quoteTextOf(replyingTo) } : undefined}
          onCancelReply={() => { setReplyingTo(null); setReplyingToStatus(null); }}
          placeholderText={swap && characterData ? `Write as ${characterData.name}…` : !isRoom && currentChat?.coWriting ? "Write the next part of the story…" : undefined}
          userName={activePersona?.name}
          onSend={handleSend}
          disabled={aiLoading || Boolean(awayNote)}
          onStop={handleStopGenerating}
          onDraftActivity={handleDraftActivity}
          tokenCount={aiTokenCount}
          costEstimate={aiCostEstimate}
          // A group's composer names the group, not its first member (#151).
          characterName={isRoom ? "the group" : characterData?.name || character}
          contextTokens={contextTokenEstimate}
          maxContextTokens={maxContextTokens}
          totalChatTokens={currentChat?.totalTokensUsed}
          totalChatCost={currentChat?.totalCostEstimate}
          roomCharacters={roomCharacters}
          mutedParticipantIds={currentChat?.mutedParticipantIds}
          onForceReply={handleForceReply}
          onDraftReply={characterData ? handleDraftReply : undefined}
          draftInjection={draftInjection}
        />
        )}
      </div>
    </div>
  );
};

export default ChatPage;
