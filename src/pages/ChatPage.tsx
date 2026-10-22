import { useEffect, useState, useMemo, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { fetchChatById, fetchChats, addMessage, updateMessages, updateChatTree, insertCompressionSummary, removeCompressionSummary, updateChatMessage, updateChatOptions, updateChatAutoReply, incrementChatUsage, updateChatPersona, updateChatMemory, updateChatGreeting, setPendingFollowupAt } from "../features/chatSlice";
import { fetchCharacterById, updateCharacter } from "../features/characterSlice";
import { generateAIResponse, compressChatHistory, extractCharacterMemory, autoCompressChat, generateAvatarImage, summarizeChapter, writeDiaryEntry, generateAssistText } from "../features/aiSlice";
import { parseSlashCommand, SLASH_COMMANDS } from "../features/chat/slashCommands";
import { buildStoryMarkdown, storyFileName } from "../features/chat/storyExport";
import { resolveTurnModel } from "../features/ai/modelResolution";
import { appearanceLocksFor, lockedLookFor } from "../features/ai/utils/appearanceLock";
import { useChatRecap } from "../features/chat/useChatRecap";
import { beatStamp, moveBeat } from "../features/chat/storyScript";
import { absentMemberIds, mergeState } from "../features/chat/sceneState";
import { buildOffscreenTalkSection } from "../features/chat/offscreenTalk";
import { buildLetterSection, letterReplyDraft } from "../features/character/letters";
import { browserLanguageName, buildTranslatePrompt } from "../features/chat/languagePractice";
import { buildNextIdeasPrompt } from "../features/chat/coWriting";
import { buildRelationshipPrompt, parseRelationshipReply, relationshipCheckDue } from "../features/character/relationshipEvolution";
import { addGrowth, arcCheckDue, buildArcPrompt, parseArcReply } from "../features/character/characterArc";
import { currentBlock, presenceFor, replyDelayMs } from "../features/character/schedule";
import { latestStorySummary } from "../features/chat/recap";
import { buildCelebrationDirective, datesToCelebrate } from "../features/character/importantDates";
import { buildEventDirective, drawEvent } from "../features/chat/eventDeck";
import { buildGameStartDirective, gameLabel, GameOutcome } from "../features/chat/miniGames";
import GameDialog from "../components/organisms/GameDialog";
import BranchMapDialog from "../components/organisms/BranchMapDialog";
import CallScreen from "../components/organisms/CallScreen";
import { useCall } from "../features/voice/useCall";
import { formatCallTime } from "../features/voice/callSession";
import { isRecognitionSupported } from "../features/voice/recognition";
import { isSpeechSupported } from "../features/voice/speech";
import { hasBranches } from "../features/chat/branchMap";
import StoryScriptDialog from "../components/organisms/StoryScriptDialog";
import { buildDraftReplyPrompt, cleanDraftReply, buildReplySuggestionsPrompt, parseReplySuggestions, NARRATIVE_CONTEXT_MESSAGES, SURPRISE_DIRECTIVE } from "../features/ai/utils/narrativeTools";
import { appendDiaryEntry } from "../features/ai/utils/diary";
import { parseSize, autoCoverCropToBlob, savePortraitBlob, removeChromaKeyBackground, blobToDataUrl } from "../features/ai/utils/portraitUtils";
import ChatWindow from "src/components/organisms/ChatWindow";
import MessageInput from "src/components/organisms/MessageInput";
import Header, { HeaderAction } from "src/components/organisms/Header";
import PortraitPreviewModal from "src/components/organisms/PortraitPreviewModal";
import AutoReplyModal from "src/components/organisms/AutoReplyModal";
import PersonaModal from "src/components/organisms/PersonaModal";
import { FaCompressArrowsAlt, FaDownload, FaClock, FaBolt, FaSlidersH, FaHistory, FaUserCircle, FaTimes, FaUsers, FaBookmark, FaDiceD20, FaLayerGroup, FaGamepad, FaCodeBranch, FaPhoneAlt, FaBookOpen } from "react-icons/fa";
import { Button } from "src/components/atoms/button";
import { AI, YOU, MEMORY_EXTRACTION_INTERVAL, DIARY_INTERVAL, DEFAULT_AUTO_SELFIE_FREQUENCY, getModelContextWindow } from "../utils/constants";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { Message, Chat, Character, SceneState } from "../types";
import { stripLeakedBase64 } from "../features/ai/utils/apiUtils";
import { buildSystemInstruction, buildTurnContext, AUTO_REPLY_DIRECTIVE, FOLLOWUP_CONTINUATION_PROMPT, RoomContext, SceneContext } from "../features/ai/utils/promptComposition";
import { resolveEmotionPortrait } from "../features/ai/utils/emotionUtils";
import { applyMemoryChanges, carryMemoryCategories } from "../features/ai/utils/memoryExtraction";
import { effectiveContentRating } from "../features/character/contentRating";
import { resolveNextSpeaker, parseMention, stripSpeakerPrefix, getActiveParticipants } from "../features/ai/utils/roomRouting";
import { buildNarrationPrompt, buildRelationshipNotes, buildWhoRepliesPrompt, CHAIN_DIRECTIVE, cleanNarration, everyoneAfter, MAX_CHAIN, parseWhoReplies } from "../features/ai/utils/roomTurns";
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
import { fitsVoiceNote, markVoiceNote, promptTextFor, rollVoiceNote } from "../features/voice/voiceNotes";

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
  // A phone call (#56): replies are spoken, and what you say is sent as voice messages.
  const [inCall, setInCall] = useState(false);
  // Shown while a realistic schedule (#7) holds a reply back.
  const [awayNote, setAwayNote] = useState<string | null>(null);
  // Tells the user about a new message from this chat if they're away (#43).
  const notifyIfAway = useChatNotifier(chatIdNum, roomCharacters);

  // Only built for a real room - a 1:1 chat's buildTurnContext call gets
  // `undefined` here and its prompt/history come out exactly as before
  // Phase 12. `speaker` is whoever is about to reply; every OTHER room
  // member's name goes in `otherParticipants` (that speaker's own "who else
  // is here" context), and `speakerNames` labels every participant's lines
  // in history so a reply can tell who said what.
  // The latest letter this character wrote you (#61), while it's still
  // fresh: within the last ten messages of this chat.
  const recentLetterNote = () => {
    const letter = [...(characterData?.letters || [])].reverse().find((l) => l.text && l.chatId === chatIdNum);
    if (!letter) return undefined;
    const content = currentChat?.content || [];
    const windowStart = content.length > 10 ? content[content.length - 10].timestamp || 0 : 0;
    return letter.at >= windowStart ? buildLetterSection(letter, activePersona?.name?.trim() || "the user") : undefined;
  };

  // The latest conversation members had while you were away (#58), while
  // it's still recent: within the last ten messages.
  const recentOffscreenTalk = () => {
    const talk = currentChat?.offscreenTalks?.[currentChat.offscreenTalks.length - 1];
    if (!talk || talk.lines.length === 0) return undefined;
    const content = currentChat?.content || [];
    const windowStart = content.length > 10 ? content[content.length - 10].timestamp || 0 : 0;
    if (talk.at < windowStart) return undefined;
    return buildOffscreenTalkSection(talk, Object.fromEntries(roomCharacters.map((c) => [c.id, c.name])));
  };

  const buildRoomContext = (speaker: Character): RoomContext | undefined => {
    if (!isRoom) return undefined;
    const others = roomCharacters.filter((c) => c.id !== speaker.id);
    return {
      speakerNames: Object.fromEntries(roomCharacters.map((c) => [c.id, c.name])),
      otherParticipants: others.map((c) => c.name),
      otherParticipantImages: others
        .filter((c) => c.appearanceImages && c.appearanceImages.length > 0)
        .map((c) => ({ name: c.name, images: c.appearanceImages! })),
      otherLoreEntries: others.flatMap((c) => c.loreEntries || []),
      othersAllowNsfw: others.every((c) => effectiveContentRating(c) === "nsfw"),
      groupScenario: currentChat?.scenario,
      groupMemory: currentChat?.memory,
      groupPinnedMemory: currentChat?.pinnedMemory,
      otherAppearanceLocks: appearanceLocksFor(others),
      relationshipNotes: buildRelationshipNotes(speaker.id, currentChat?.roomRelationships, Object.fromEntries(roomCharacters.map((c) => [c.id, c.name]))),
      thoughts: currentChat?.innerThoughts,
      offscreenTalk: recentOffscreenTalk(),
    };
  };

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
    authorNote: currentChat?.authorNote,
    worldTags: currentChat?.worldTags,
    hardLimits: currentChat?.hardLimits,
    intensity: currentChat?.intensity,
    roleplayStyle,
    memoryOverride: !isRoom && chatScopedMemory
      ? { memory: currentChat?.memory || [], pinned: currentChat?.pinnedMemory || [] }
      : undefined,
    storyScript: currentChat?.storyScript,
    game: currentChat?.game,
    onCall: inCall,
    sceneTracker: currentChat?.sceneTracker,
    roomNames: isRoom ? roomCharacters.map((c) => c.name) : undefined,
    language: currentChat?.language,
    coWriting: !isRoom && currentChat?.coWriting,
    sceneState: currentChat?.sceneState,
    world: currentChat?.worldId != null ? worlds.find((w) => w.id === currentChat.worldId) : undefined,
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
    () => personas.find((p) => p.id === (currentChat?.personaId || globalActivePersonaId)) || personas[0],
    [personas, currentChat?.personaId, globalActivePersonaId]
  );
  // Set here rather than in `scene` above: it needs the persona's name.
  scene.letterNote = !isRoom ? recentLetterNote() : undefined;
  const globalActivePersona = useMemo(
    () => personas.find((p) => p.id === globalActivePersonaId) || personas[0],
    [personas, globalActivePersonaId]
  );

  // "Previously on..." after a few days away (#46).
  const recap = useChatRecap(currentChat, messages, transcriptNames());

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
    const turn = buildTurnContext(messages, speaker, undefined, replyLengthLimit, activePersona, speaker ? buildRoomContext(speaker) : undefined, scene);
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

  // Every MEMORY_EXTRACTION_INTERVAL messages, distill new durable facts from
  // the recent conversation into long-term memory. Independent of the
  // compression threshold (which defaults to off) so it works for every
  // character. Best-effort/silent: a failure here shouldn't interrupt the
  // conversation. `speaker` defaults to the chat's primary character
  // (unchanged behavior for a 1:1 chat) but a room passes whichever bot
  // actually just replied - only to gate/label the extraction call, though:
  // in a room the extracted facts merge into the room's own Chat.memory, not
  // that (or any) participant's personal Character.memory, so a group
  // conversation never writes back onto a character used outside this room.
  //
  // Counted from the message count at the last extraction (per chat, this
  // session) rather than `length % interval === 0`: impersonated/silent sends,
  // follow-ups and compression all shift the count, and the modulo check
  // could step over its multiple and go quiet for dozens of messages (or
  // re-fire on every regenerate that landed on one).
  const memoryBaselineRef = useRef<Record<number, number>>({});
  const maybeExtractMemory = async (allMessages: Message[], speaker = characterData) => {
    if (!speaker || !chatIdNum || allMessages.length === 0) return;
    const count = allMessages.length;
    let baseline = memoryBaselineRef.current[chatIdNum];
    // First call this session: assume the last multiple of the interval
    // strictly below `count` was already handled, so a chat reaching exactly
    // 12, 24, ... messages still extracts right away, as it used to.
    if (baseline == null) baseline = Math.floor((count - 1) / MEMORY_EXTRACTION_INTERVAL) * MEMORY_EXTRACTION_INTERVAL;
    if (count < baseline) baseline = count; // compressed, rewound or switched to a shorter branch
    memoryBaselineRef.current[chatIdNum] = baseline;
    if (count - baseline < MEMORY_EXTRACTION_INTERVAL) return;
    memoryBaselineRef.current[chatIdNum] = count;

    try {
      const recentMessages = allMessages.slice(-Math.min(count - baseline, MEMORY_EXTRACTION_INTERVAL * 2));
      const existingMemory = chatScopedMemory ? (currentChat?.memory || []) : (speaker.memory || []);
      const pinned = chatScopedMemory ? (currentChat?.pinnedMemory || []) : (speaker.pinnedMemory || []);
      const names = transcriptNames();
      const changes = await dispatch(
        extractCharacterMemory({
          recentMessages,
          memory: existingMemory,
          pinnedMemory: pinned,
          names: { ...names, charName: isRoom ? undefined : speaker.name },
        })
      ).unwrap();

      const hasChanges = changes.added.length + changes.updated.length + changes.forgotten.length + changes.reinforced.length > 0;
      if (hasChanges) {
        // Applied to the same snapshot the model was shown, since the
        // changes refer to its facts by position.
        const merged = applyMemoryChanges(existingMemory, changes, pinned);
        if (chatScopedMemory && chatIdNum) {
          const memoryCategories = carryMemoryCategories(merged, pinned, currentChat?.memoryCategories, existingMemory, changes);
          await dispatch(updateChatMemory({ chatId: chatIdNum, memory: merged, memoryCategories: memoryCategories ?? null }));
        } else {
          // Re-read the character before writing: `speaker` was captured
          // before the extraction call, and saving it whole would undo
          // anything written meanwhile (e.g. this turn's selfie in gallery).
          const fresh = (await dispatch(fetchCharacterById(speaker.id)).unwrap().catch(() => speaker)) || speaker;
          const memoryCategories = carryMemoryCategories(merged, pinned, fresh.memoryCategories, existingMemory, changes);
          await dispatch(updateCharacter({ ...fresh, memory: merged, memoryCategories }));
        }
      }
    } catch (err) {
      console.warn("Memory extraction failed (non-fatal):", err);
      warnBackgroundFailure("memory", typeof err === "string" ? err : (err as Error)?.message);
    }
  };

  // Diary (#5): every DIARY_INTERVAL messages a character with the diary on
  // writes a private first-person entry about the recent conversation: in a
  // 1:1 chat only when it shares the character's memory, so a "this chat
  // only" what-if never reaches the diary, and in a group chat for each
  // member who keeps one. Same per-chat baseline counting as memory
  // extraction above.
  const diaryBaselineRef = useRef<Record<number, number>>({});
  const maybeWriteDiary = async (allMessages: Message[], speaker = characterData) => {
    // A group chat writes one entry per member with the diary on, each from
    // their own point of view; a 1:1 chat only when it shares the character's memory.
    const writers = isRoom
      ? roomCharacters.filter((c) => c.diaryEnabled)
      : speaker?.diaryEnabled && !chatScopedMemory ? [speaker] : [];
    if (writers.length === 0 || !chatIdNum || allMessages.length === 0) return;
    const count = allMessages.length;
    let baseline = diaryBaselineRef.current[chatIdNum];
    if (baseline == null) baseline = Math.floor((count - 1) / DIARY_INTERVAL) * DIARY_INTERVAL;
    if (count < baseline) baseline = count;
    diaryBaselineRef.current[chatIdNum] = baseline;
    if (count - baseline < DIARY_INTERVAL) return;
    diaryBaselineRef.current[chatIdNum] = count;

    const recent = trimToLatestSummary(allMessages).slice(-DIARY_INTERVAL);
    for (const writer of writers) {
      try {
        const text = await dispatch(writeDiaryEntry({
          charName: writer.name,
          userName: activePersona?.name?.trim() || "the user",
          recentMessages: recent,
          names: transcriptNames(),
          previousEntry: writer.diary?.[writer.diary.length - 1],
          others: isRoom ? roomCharacters.filter((c) => c.id !== writer.id).map((c) => c.name) : undefined,
        })).unwrap();
        if (!text) continue;
        const fresh = (await dispatch(fetchCharacterById(writer.id)).unwrap().catch(() => writer)) || writer;
        await dispatch(updateCharacter({
          ...fresh,
          diary: appendDiaryEntry(fresh.diary, { id: generateNodeId(), timestamp: Date.now(), chatId: chatIdNum, text }),
        }));
      } catch (err) {
        console.warn("Diary entry failed (non-fatal):", err);
      }
    }
  };

  // Reply suggestions (#16): three short ideas for your next message, shown
  // under the newest reply when the chat has them switched on. Kept in
  // memory only; they're for this moment, not the story.
  const [replySuggestions, setReplySuggestions] = useState<{ forMessageId: string; items: string[] } | null>(null);
  const [draftInjection, setDraftInjection] = useState<{ text: string; nonce: number } | undefined>(undefined);
  // A status reply (#8) arrives with its draft in the route state.
  const routeLocation = useLocation();
  const routeNavigate = useNavigate();
  useEffect(() => {
    const draft = (routeLocation.state as { draft?: string } | null)?.draft;
    if (!draft) return;
    setDraftInjection({ text: draft, nonce: Date.now() });
    routeNavigate(routeLocation.pathname, { replace: true, state: null });
  }, [routeLocation, routeNavigate]);
  const maybeSuggestReplies = async (allMessages: Message[], speaker = characterData) => {
    const last = allMessages[allMessages.length - 1];
    if (!currentChat?.replySuggestions || !speaker || !last?.id || last.role !== AI) return;
    const userName = activePersona?.name?.trim() || "User";
    const recent = trimToLatestSummary(allMessages).slice(-NARRATIVE_CONTEXT_MESSAGES);
    try {
      const reply = await dispatch(generateAssistText({
        instruction: buildReplySuggestionsPrompt(userName, speaker.name, formatTranscript(recent, transcriptNames())),
        background: true,
      })).unwrap();
      const items = parseReplySuggestions(reply);
      if (items.length > 0) setReplySuggestions({ forMessageId: last.id, items });
    } catch (err) {
      console.warn("Reply suggestions failed (non-fatal):", err);
    }
  };
  const handlePickSuggestion = (text: string) => setDraftInjection({ text, nonce: Date.now() });

  // After each reply: suggestions in parallel (they write nothing), then
  // memory and the diary one after the other, so their two character saves
  // can't overwrite each other.
  // Relationship that evolves (#30): every RELATIONSHIP_INTERVAL messages in
  // a 1:1 chat, the helper model may suggest a new relationship label for
  // the user to approve. The check is recorded first, so a failure or a slow
  // reply never asks twice for the same stretch.
  const maybeSuggestRelationship = async (allMessages: Message[], speaker = characterData) => {
    if (!chatIdNum || isRoom || !speaker || roleplayStyle.relationshipSuggestions === false || currentChat?.relationshipSuggestions === false || currentChat?.relationshipSuggestion) return;
    const count = allMessages.filter((m) => !m.isSystem).length;
    if (!relationshipCheckDue(count, currentChat?.relationshipCheckedAt)) return;
    await dispatch(updateChatOptions({ chatId: chatIdNum, patch: { relationshipCheckedAt: count } }));
    try {
      const recent = trimToLatestSummary(allMessages).slice(-NARRATIVE_CONTEXT_MESSAGES);
      const reply = await dispatch(generateAssistText({
        instruction: buildRelationshipPrompt(speaker.name, activePersona?.name?.trim() || "the user", speaker.relationship || "", formatTranscript(recent, transcriptNames()), latestStorySummary(allMessages)),
        background: true,
      })).unwrap();
      const to = parseRelationshipReply(reply, speaker.relationship || "");
      if (to) await dispatch(updateChatOptions({ chatId: chatIdNum, patch: { relationshipSuggestion: { from: speaker.relationship || "", to } } }));
    } catch (err) {
      console.warn("Relationship check failed (non-fatal):", err);
    }
  };
  const acceptRelationship = () => {
    const suggestion = currentChat?.relationshipSuggestion;
    if (!chatIdNum || !suggestion || !characterData) return;
    dispatch(updateCharacter({ ...characterData, relationship: suggestion.to }));
    dispatch(updateChatOptions({ chatId: chatIdNum, patch: { relationshipSuggestion: undefined } }));
    toast.success(`${characterData.name} and you: ${suggestion.to}`);
  };
  const dismissRelationship = () => {
    if (chatIdNum) dispatch(updateChatOptions({ chatId: chatIdNum, patch: { relationshipSuggestion: undefined } }));
  };

  // Character arc (#60): every ARC_INTERVAL messages in a 1:1 chat that
  // shares the character's memory, the helper may suggest a note on how
  // they've grown, for the user to approve. Recorded first, like the
  // relationship check, so a stretch is never asked about twice.
  const maybeSuggestArc = async (allMessages: Message[], speaker = characterData) => {
    if (!chatIdNum || isRoom || chatScopedMemory || !speaker || roleplayStyle.arcSuggestions === false || currentChat?.arcSuggestion) return;
    const count = allMessages.filter((m) => !m.isSystem).length;
    if (!arcCheckDue(count, currentChat?.arcCheckedAt)) return;
    await dispatch(updateChatOptions({ chatId: chatIdNum, patch: { arcCheckedAt: count } }));
    try {
      const recent = trimToLatestSummary(allMessages).slice(-NARRATIVE_CONTEXT_MESSAGES);
      const reply = await dispatch(generateAssistText({
        instruction: buildArcPrompt(speaker.name, activePersona?.name?.trim() || "the user", [speaker.description, speaker.prompt].filter(Boolean).join(" "), speaker.growth || [], speaker.memory || [], formatTranscript(recent, transcriptNames()), latestStorySummary(allMessages)),
        background: true,
      })).unwrap();
      const note = parseArcReply(reply, speaker.growth || []);
      if (note) await dispatch(updateChatOptions({ chatId: chatIdNum, patch: { arcSuggestion: note } }));
    } catch (err) {
      console.warn("Character arc check failed (non-fatal):", err);
    }
  };
  const acceptArc = async () => {
    const note = currentChat?.arcSuggestion;
    if (!chatIdNum || !note || !characterData) return;
    const fresh = (await dispatch(fetchCharacterById(characterData.id)).unwrap().catch(() => characterData)) || characterData;
    dispatch(updateCharacter({ ...fresh, growth: addGrowth(fresh.growth, note) }));
    dispatch(updateChatOptions({ chatId: chatIdNum, patch: { arcSuggestion: undefined } }));
    toast.success(`Added to how ${characterData.name} has grown`);
  };
  const dismissArc = () => {
    if (chatIdNum) dispatch(updateChatOptions({ chatId: chatIdNum, patch: { arcSuggestion: undefined } }));
  };

  const runBackgroundUpdates = async (allMessages: Message[], speaker = characterData) => {
    void maybeSuggestReplies(allMessages, speaker);
    await maybeExtractMemory(allMessages, speaker);
    await maybeWriteDiary(allMessages, speaker);
    await maybeSuggestRelationship(allMessages, speaker);
    await maybeSuggestArc(allMessages, speaker);
  };

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

  // --- Auto follow-up: the character can message first after the user goes quiet.
  // Only runs for the chat currently open in this tab - no cross-chat background
  // scanning, and nothing fires once the tab/app is closed.
  const [isAutoReplyModalOpen, setIsAutoReplyModalOpen] = useState(false);
  const [sceneOpen, setSceneOpen] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);
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
  const sendCharacterFollowup = async (forcedSpeakerId?: number, extraDirective?: string): Promise<Character | false> => {
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
    const followupPrompt = lastMessage?.role === YOU && lastMessage.txt?.trim()
      ? promptTextFor(lastMessage)
      : FOLLOWUP_CONTINUATION_PROMPT;

    const { messages: compressedFreshMessages, tokens: compressTokens, cost: compressCost, error: compressError } = await dispatch(autoCompressChat({ chatId: chatIdNum, messages: freshMessages, names: transcriptNames() })).unwrap();
    warnBackgroundFailure("compress", compressError);
    await trackUsage(compressTokens, compressCost);

    const { history, systemInstruction, postHistoryNote, characterImages, characterName, otherParticipantImages, protectedCount, appearanceLocks } = buildTurnContext(
      compressedFreshMessages,
      speaker,
      extraDirective ? [AUTO_REPLY_DIRECTIVE, extraDirective] : [AUTO_REPLY_DIRECTIVE],
      undefined,
      activePersona,
      buildRoomContext(speaker),
      scene
    );
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
    advanceStoryIfDone(payloadObj);
    saveSceneState(payloadObj);
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
        if (!(await sendCharacterFollowup(follower.id, CHAIN_DIRECTIVE))) break;
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
    if (!chatIdNum || isRoom || !characterData || aiLoading || messages.length === 0) return;
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
    sendCharacterFollowup(undefined, buildCelebrationDirective(due))
      .catch((err) => console.error("Special-date message failed:", err))
      .finally(() => { autoReplyInFlightRef.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatIdNum, isRoom, characterData, aiLoading, messages.length]);

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

  const handleSend = async (rawText: string, requestedImage?: boolean, isVideoRequest?: boolean, isImpersonated?: boolean, forcedSpeakerId?: number, silentSend?: boolean, isVoiceNote?: boolean, photos?: string[]) => {
    // A photo can go on its own, without words (#48).
    if ((!rawText.trim() && !photos?.length) || !chatIdNum) return;

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

      const resultAction = await dispatch(addMessage({ chatId: chatIdNum, role: YOU, text, images: photos && photos.length > 0 ? photos : undefined, isImageRequest, isVideoRequest, isVoiceNote }));
      const updatedMessages = resultAction.payload as Message[] || [];

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

      const { history, systemInstruction, postHistoryNote, characterImages, characterName, otherParticipantImages, protectedCount, appearanceLocks } = buildTurnContext(contextMessages, speaker, undefined, replyLengthLimit, activePersona, buildRoomContext(speaker), scene);
      const sendVoiceNote = rollReplyVoiceNote(speaker, Boolean(isImageRequest || isVideoRequest || shouldAutoSelfie));
      // Matches the "(voice note)" mark buildChatHistory puts on the same
      // message, so it's recognized as the prompt and not sent twice.
      aiPromiseRef.current = dispatch(generateAIResponse({ prompt: isVoiceNote ? markVoiceNote(text) : text, history, systemInstruction, postHistoryNote, streamKey, characterImages, characterName, artStyle: speaker?.artStyle, isImageRequest: isImageRequest || shouldAutoSelfie, isVideoRequest, isAutoSelfie: shouldAutoSelfie, customEmotions: speaker.emotionPortraits?.customEmotions, otherRoomCharacters: otherParticipantImages, protectedCount, modelOverride: speaker.modelOverride, appearanceLocks, localImageSettings: speaker.localImageSettings, promptImages: photos }));
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
          isVoiceNote: replyVoiceNote,
        }));
        notifyIfAway(speaker, notificationText(replyText, replyVoiceNote), generatedImages);

        if (generatedImages && generatedImages.length > 0) {
          dispatch(updateCharacter({ ...speaker, gallery: [...(speaker.gallery || []), ...generatedImages] }));
        }

        await saveCharacterReaction(payloadObj?.reaction, contextMessages, speaker.id);
        await saveCorrection(payloadObj?.correction, contextMessages);
        advanceStoryIfDone(payloadObj);
        saveSceneState(payloadObj);
        advanceGame(payloadObj, true);
        runBackgroundUpdates((aiAddResult.payload as Message[]) || [], speaker);

        // The rest of the room's answers (#22), then the narrator (#23).
        for (const follower of followers) {
          if (!(await sendCharacterFollowup(follower.id, CHAIN_DIRECTIVE))) break;
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

        const { history, systemInstruction, postHistoryNote, characterImages, characterName, otherParticipantImages, protectedCount, appearanceLocks } = buildTurnContext(contextUpToEdit, speaker, undefined, replyLengthLimit, activePersona, buildRoomContext(speaker), scene);
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

          advanceStoryIfDone(payloadObj);
          saveSceneState(payloadObj);
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

  const handleRegenerate = async (index: number) => {
    if (index < 0 || index >= messages.length || !chatIdNum || !currentChat) return;

    setError(null);

    try {
      const { tree, content: treeContent } = getOrBuildTree(currentChat);
      const targetMessage = treeContent[index];
      const existingImagePrompt = targetMessage?.imagePrompt;
      const existingImageParams = targetMessage?.imageParams;

      const targetNodeId = targetMessage?.id;
      if (!targetNodeId || !tree.nodes[targetNodeId]) {
        console.warn("Cannot regenerate: message not found.");
        return;
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
      if (!speaker) return;

      const { history, systemInstruction, postHistoryNote, characterImages, characterName, otherParticipantImages, protectedCount, appearanceLocks } = buildTurnContext(historyUpToTarget, speaker, extraDirectives, replyLengthLimit, activePersona, buildRoomContext(speaker), scene);
      const regenVoiceNote = rollReplyVoiceNote(speaker, Boolean(isImageRequest || isVideoRequest));
      aiPromiseRef.current = dispatch(generateAIResponse({ prompt, history, systemInstruction, postHistoryNote, streamKey, characterImages, characterName, artStyle: speaker?.artStyle, isImageRequest, isVideoRequest, isCharacterInitiated: isFollowup, existingImagePrompt, existingImageParams, customEmotions: speaker.emotionPortraits?.customEmotions, otherRoomCharacters: otherParticipantImages, protectedCount, modelOverride: speaker.modelOverride, appearanceLocks, localImageSettings: speaker.localImageSettings, promptImages: sentPhotos }));
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

        advanceStoryIfDone(payloadObj);
        saveSceneState(payloadObj);
        advanceGame(payloadObj, false);
        runBackgroundUpdates(newContent, speaker);
      }

      dispatch(fetchChats());
    } catch (err) {
      console.error("Error regenerating response:", err);
      setError("Failed to regenerate response. Please try again.");
    }
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
      const { history, systemInstruction, postHistoryNote, characterImages, characterName, protectedCount, appearanceLocks } = buildTurnContext(
        [...historyUpToTarget, targetMessage],
        speaker,
        [continueDirective],
        replyLengthLimit,
        activePersona,
        buildRoomContext(speaker),
        scene
      );

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

        advanceStoryIfDone(payloadObj);
        saveSceneState(payloadObj);
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

  // Story script (#57): saved on the chat; a reply that reports reaching the
  // current beat moves the story on to the next one.
  const saveStoryScript = (script: Chat["storyScript"]) => {
    if (chatIdNum) dispatch(updateChatOptions({ chatId: chatIdNum, patch: { storyScript: script } }));
  };
  const moveStoryBeat = (step: number) => {
    if (currentChat?.storyScript) saveStoryScript(moveBeat(currentChat.storyScript, step));
  };
  const advanceStoryIfDone = (payload: { beatDone?: boolean } | undefined) => {
    if (payload?.beatDone) moveStoryBeat(1);
  };

  // Scene state (#9): what a reply reports is merged into the chat's state.
  const saveSceneState = (payload: { sceneState?: Partial<SceneState> } | undefined) => {
    if (!chatIdNum || !currentChat?.sceneTracker || !payload?.sceneState) return;
    dispatch(updateChatOptions({ chatId: chatIdNum, patch: { sceneState: mergeState(currentChat.sceneState, payload.sceneState) } }));
  };

  // "Natural" turns (#22): who would answer, by a cheap helper call. Null
  // when the call fails, so the turn falls back to round-robin.
  const pickNaturalSpeakers = async (contextMessages: Message[], active: Character[], starter?: Character): Promise<Character[] | null> => {
    try {
      const recent = trimToLatestSummary(contextMessages).slice(-NARRATIVE_CONTEXT_MESSAGES);
      const reply = await dispatch(generateAssistText({
        instruction: buildWhoRepliesPrompt(active.map((c) => c.name), activePersona?.name?.trim() || "User", formatTranscript(recent, transcriptNames()), MAX_CHAIN, starter?.name),
        background: true,
      })).unwrap();
      return parseWhoReplies(reply, active);
    } catch (err) {
      console.warn("Picking who replies failed (non-fatal):", err);
      return null;
    }
  };

  // The room's narrator (#23): a short line of narration after each round.
  const maybeNarrate = async () => {
    if (!isRoom || !chatIdNum || !currentChat?.narrator) return;
    try {
      const fresh = await dispatch(fetchChatById(chatIdNum)).unwrap();
      const recent = trimToLatestSummary(fresh.content).slice(-NARRATIVE_CONTEXT_MESSAGES);
      const reply = await dispatch(generateAssistText({ instruction: buildNarrationPrompt(roomCharacters.map((c) => c.name), formatTranscript(recent, transcriptNames())) })).unwrap();
      const text = cleanNarration(reply);
      if (text) await dispatch(addMessage({ chatId: chatIdNum, role: YOU, text, isNarration: true }));
    } catch (err) {
      console.warn("Narration failed (non-fatal):", err);
    }
  };

  // Mini-games (#52): each reply to the user's message moves the game on a
  // turn; a reply that ends it updates the score.
  const advanceGame = (payload: { gameOver?: GameOutcome } | undefined, countTurn: boolean) => {
    const game = currentChat?.game;
    if (!chatIdNum || !game) return;
    if (payload?.gameOver) {
      const score = { user: 0, character: 0, ...currentChat?.gameScore };
      if (payload.gameOver === "user") score.user += 1;
      if (payload.gameOver === "character") score.character += 1;
      dispatch(updateChatOptions({ chatId: chatIdNum, patch: { game: undefined, gameScore: score } }));
      const label = gameLabel(game.kind);
      toast.success(payload.gameOver === "user" ? `You won ${label}!` : payload.gameOver === "character" ? `${characterData?.name || "They"} won ${label}.` : `${label} is over.`);
      return;
    }
    if (countTurn) dispatch(updateChatOptions({ chatId: chatIdNum, patch: { game: { ...game, turns: game.turns + 1 } } }));
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

  // A character's emoji reaction (#11) goes on the user message its reply
  // answered: the latest real user line in the context it was given.
  const saveCharacterReaction = async (reaction: string | undefined, answered: Message[], speakerId?: number) => {
    if (!reaction || !chatIdNum) return;
    const target = [...answered].reverse().find((m) => m.role === YOU && !m.isNarration && !m.isSystem && !m.isCompressionSummary);
    if (!target?.id) return;
    await dispatch(updateChatMessage({ chatId: chatIdNum, messageId: target.id, patch: { characterReaction: { emoji: reaction, speakerId } } }));
  };

  // Language practice (#67): the fix for your last message sits under it.
  const saveCorrection = async (correction: string | undefined, answered: Message[]) => {
    if (!correction || !chatIdNum || !currentChat?.language) return;
    const target = [...answered].reverse().find((m) => m.role === YOU && !m.isNarration && !m.isSystem && !m.isCompressionSummary);
    if (target?.id) await dispatch(updateChatMessage({ chatId: chatIdNum, messageId: target.id, patch: { correction } }));
  };

  // Co-writing mode (#68): a few ideas for what happens next, shown like
  // reply suggestions; tapping one puts it in the box to write from.
  const handleSuggestNext = async () => {
    const last = messages[messages.length - 1];
    if (!characterData || !last?.id) return;
    const story = trimToLatestSummary(messages).slice(-NARRATIVE_CONTEXT_MESSAGES).filter((m) => !m.isSystem).map((m) => m.txt || "").join("\n\n");
    try {
      const reply = await dispatch(generateAssistText({ instruction: buildNextIdeasPrompt(activePersona?.name?.trim() || "The user", characterData.name, story), background: true })).unwrap();
      const items = parseReplySuggestions(reply);
      if (items.length > 0) setReplySuggestions({ forMessageId: last.id, items });
    } catch (err) {
      toast.error(typeof err === "string" ? err : "Couldn't think of what happens next. Check your model settings.");
    }
  };

  // ...and any reply can be translated into your own language.
  const handleTranslate = async (msg: Message) => {
    if (!chatIdNum || !msg.id || !msg.txt) return;
    try {
      const into = currentChat?.language?.translateInto?.trim() || browserLanguageName();
      const translation = (await dispatch(generateAssistText({ instruction: buildTranslatePrompt(msg.txt, into), background: true })).unwrap()).trim();
      if (translation) await dispatch(updateChatMessage({ chatId: chatIdNum, messageId: msg.id, patch: { translation } }));
    } catch (err) {
      toast.error(typeof err === "string" ? err : "Couldn't translate that. Check your model settings.");
    }
  };

  // A photo the user sent (#48): what a helper saw in it is kept on their
  // message for later turns, and a photo nobody could see gets a hint.
  const savePhotoOutcome = async (payload: { photoDescription?: string; photoUnseen?: boolean } | undefined, answered: Message[]) => {
    if (payload?.photoUnseen) {
      toast.info("This model can't see photos, so the character was told there's one it can't see. Pick a vision model, or a vision-capable helper model in Settings > Text.");
    }
    if (!payload?.photoDescription || !chatIdNum) return;
    const target = [...answered].reverse().find((m) => m.role === YOU && m.images && m.images.length > 0);
    if (target?.id) await dispatch(updateChatMessage({ chatId: chatIdNum, messageId: target.id, patch: { photoDescription: payload.photoDescription } }));
  };

  // Your own reaction to a message (#11); picking the same emoji again
  // removes it.
  const handleReact = (msg: Message, emoji: string) => {
    if (!chatIdNum || !msg.id) return;
    dispatch(updateChatMessage({ chatId: chatIdNum, messageId: msg.id, patch: { reaction: msg.reaction === emoji ? undefined : emoji } }));
  };

  // Bookmarks (#21): a star on any message, listed in the Scene panel.
  const handleToggleBookmark = (msg: Message) => {
    if (!chatIdNum || !msg.id) return;
    dispatch(updateChatMessage({ chatId: chatIdNum, messageId: msg.id, patch: { bookmarked: msg.bookmarked ? undefined : true } }));
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

  const chatActions: HeaderAction[] = [
    { icon: FaBookOpen, label: "Export as story (Markdown)", onClick: handleExportStory },
    { icon: FaDownload, label: "Export chat (backup file)", onClick: handleExport },
    ...(messages.length > 0
      ? [{ icon: FaHistory, label: "Rewind last turn", onClick: handleRewindLastTurn, disabled: aiLoading, danger: true }]
      : []),
    ...(canEndChapter
      ? [{ icon: FaBookmark, label: endingChapter ? "Ending the chapter..." : "End chapter (summarize it and start the next)", onClick: handleEndChapter, disabled: aiLoading || endingChapter }]
      : []),
    ...(canCompress
      ? [{ icon: FaCompressArrowsAlt, label: "Summarize and compress older messages to save tokens", onClick: handleCompress, disabled: aiCompressing }]
      : []),
    ...(messages.length > 0
      ? [{ icon: FaBolt, label: isRoom ? "Make the next bot send a follow-up now" : `Make ${characterData?.name || "them"} send a follow-up now`, onClick: handleManualFollowup, disabled: aiLoading, primary: true, shortLabel: "follow-up" }]
      : []),
    ...(messages.length > 0
      ? [{ icon: FaDiceD20, label: "Surprise me (the next reply brings a twist)", onClick: handleSurprise, disabled: aiLoading }]
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
    ...(!isRoom && characterData
      ? [{ icon: FaGamepad, label: "Play a game", onClick: () => setGameOpen(true), disabled: aiLoading || Boolean(currentChat?.game) }]
      : []),
    { icon: FaClock, label: "Auto follow-up settings", onClick: () => setIsAutoReplyModalOpen(true), active: autoReplySettings.enabled },
    { icon: FaSlidersH, label: "Scene & chat settings", onClick: () => { setSceneOpen((v) => !v); setParticipantsOpen(false); }, active: sceneOpen, primary: true, shortLabel: "scene" },
    ...(roomCharacters.length > 0
      ? [{ icon: FaUsers, label: isRoom ? "Participants" : "Invite someone", onClick: () => { setParticipantsOpen((v) => !v); setSceneOpen(false); }, active: participantsOpen, primary: true, shortLabel: "people" }]
      : []),
    ...(personas.length > 1
      ? [{ icon: FaUserCircle, label: `Persona: ${activePersona?.name || "None"}`, onClick: () => setIsPersonaModalOpen(true), active: Boolean(currentChat?.personaId) }]
      : []),
  ];

  return (
    <div className="flex flex-col w-full h-dvh relative">
      <Header
        title={character || "Chat"}
        subtitle={isRoom ? `With ${roomCharacters.map((c) => c.name).join(", ")}` : (presence?.label || characterData?.relationship || characterData?.description)}
        online={presence ? presence.online : true}
        avatar={
          <button
            type="button"
            onClick={() => setPortraitPreviewOpen(true)}
            className="rounded-full"
            aria-label="View current portrait"
            title="View current portrait"
          >
            <CharacterAvatar name={characterData?.name || character} accent={characterData?.accent} imageSrc={headerEmotionImageSrc} size={34} />
          </button>
        }
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

      {/* Chat Messages */}
      <div className="flex-1 overflow-hidden relative">
        <ChatWindow awayNote={awayNote} coWriting={!isRoom && Boolean(currentChat?.coWriting)} onSuggestNext={handleSuggestNext} onTranslate={currentChat?.language ? handleTranslate : undefined} onReplyToLetter={(letter) => setDraftInjection({ text: letterReplyDraft(letter), nonce: Date.now() })} arcSuggestion={currentChat?.arcSuggestion} onAcceptArc={acceptArc} onDismissArc={dismissArc} relationshipSuggestion={currentChat?.relationshipSuggestion} onAcceptRelationship={acceptRelationship} onDismissRelationship={dismissRelationship} game={currentChat?.game} gameScore={currentChat?.gameScore} onEndGame={() => chatIdNum && dispatch(updateChatOptions({ chatId: chatIdNum, patch: { game: undefined } }))} storyScript={currentChat?.storyScript} onEditStory={() => setStoryOpen(true)} onMoveBeat={moveStoryBeat} recap={recap} onToggleBookmark={handleToggleBookmark} onUndoSummary={handleUndoSummary} onReact={handleReact} replySuggestions={replySuggestions} onPickSuggestion={handlePickSuggestion} bottomInset={terminal ? 0 : composerInset} characterName={character} userName={activePersona?.name} character={characterData} characters={roomCharacters} allCharacters={characters} messages={messages} tree={currentChat?.tree} onSwitchBranch={handleSwitchBranch} onDeleteBranch={handleDeleteBranch} onRegenerate={handleRegenerate} onContinue={handleContinueMessage} onClearRefusal={handleClearRefusal} onEdit={handleEditMessage} aiLoading={aiLoading} isFollowupPending={Boolean(chatIdNum && pendingFollowups[chatIdNum])} onSend={handleSend} chatId={chatIdNum ?? undefined} sceneOpen={sceneOpen} onCloseScene={() => setSceneOpen(false)} authorNote={currentChat?.authorNote} worldTags={currentChat?.worldTags} isRoom={isRoom} chatMemory={currentChat?.memory} chatPinnedMemory={currentChat?.pinnedMemory} greetingIndex={currentChat?.greetingIndex} hardLimits={currentChat?.hardLimits} intensity={currentChat?.intensity} isNsfwChat={roomCharacters.length > 0 && roomCharacters.every((c) => effectiveContentRating(c) === "nsfw")} onSelectGreeting={(index) => chatIdNum && dispatch(updateChatGreeting({ chatId: chatIdNum, greetingIndex: index }))} chatScenario={currentChat?.scenario} participantsOpen={participantsOpen} onCloseParticipants={() => setParticipantsOpen(false)} mutedParticipantIds={currentChat?.mutedParticipantIds} recordingVoiceNote={recordingVoiceNote} />
        {inCall && characterData && (
          <CallScreen
            name={characterData.name}
            initials={characterData.name.slice(0, 2).toUpperCase()}
            accent={characterData.accent}
            imageSrc={headerEmotionImageSrc || characterData.appearanceImages?.[0]}
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
        <StoryScriptDialog open={storyOpen} onOpenChange={setStoryOpen} script={currentChat?.storyScript} onSave={saveStoryScript} />
      </div>

      {/* Message Input - floats over the chat, except under terminal where it
          docks below it as a bordered prompt strip */}
      <div
        ref={composerRef}
        className={
          terminal
            ? "relative flex-none w-full px-4 md:px-[26px] pt-3.5 pb-5 border-t border-border bg-background z-20"
            : cn(
                "absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-1/2 transform -translate-x-1/2 w-full max-w-4xl px-4 z-20",
                // With a side panel open as a column (xl and up, 300px), center
                // over the chat column only instead of running under the panel.
                (sceneOpen || participantsOpen) && "xl:left-[calc(50%-150px)] xl:w-[calc(100%-300px)]"
              )
        }
      >
        <MessageInput
          placeholderText={!isRoom && currentChat?.coWriting ? "Write the next part of the story…" : undefined}
          userName={activePersona?.name}
          onSend={handleSend}
          disabled={aiLoading || Boolean(awayNote)}
          onStop={handleStopGenerating}
          onDraftActivity={handleDraftActivity}
          tokenCount={aiTokenCount}
          costEstimate={aiCostEstimate}
          characterName={characterData?.name || character}
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
      </div>
    </div>
  );
};

export default ChatPage;
