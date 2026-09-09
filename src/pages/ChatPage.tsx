import React, { useEffect, useState, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { fetchChatById, fetchChats, addMessage, updateMessages, updateChatTree, updateChatAutoReply, incrementChatUsage, updateChatPersona, setPendingFollowupAt } from "../features/chatSlice";
import { fetchCharacterById, updateCharacter } from "../features/characterSlice";
import { generateAIResponse, compressChatHistory, extractCharacterMemory, autoCompressChat, generateAvatarImage } from "../features/aiSlice";
import { parseSize, autoCoverCropToBlob, savePortraitBlob } from "../features/ai/utils/portraitUtils";
import ChatWindow from "../components/ChatWindow";
import MessageInput from "../components/MessageInput";
import Header, { HeaderAction } from "../components/Header";
import Modal from "../components/Modal";
import ToggleSwitch from "../components/ToggleSwitch";
import { TextInput, FieldLabel } from "../components/ui/FormControls";
import { FaCompressArrowsAlt, FaDownload, FaClock, FaBolt, FaBookOpen, FaHistory, FaUserCircle, FaCheck, FaTimes } from "react-icons/fa";
import { Button } from "../components/ui/button";
import { cn } from "../utils/cn";
import { AI, YOU, MEMORY_EXTRACTION_INTERVAL, DEFAULT_AUTO_SELFIE_FREQUENCY, getModelContextWindow } from "../utils/constants";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { Message, Chat } from "../types";
import { stripLeakedBase64 } from "../features/ai/utils/apiUtils";
import { buildChatHistory, buildSystemInstruction, buildTurnContext, AUTO_REPLY_DIRECTIVE } from "../features/ai/utils/promptComposition";
import { resolveEmotionPortrait } from "../features/ai/utils/emotionUtils";
import { mergeMemory } from "../features/ai/utils/memoryExtraction";
import { migrateToTree, addChildNode, flattenPath, getPathToNode, updateNodeMessage, findDefaultLeafFrom, deleteBranch, getSiblingInfo } from "../features/chat/messageTree";
import { estimateTokens, estimateHistoryTokens } from "../features/ai/utils/tokenEstimator";
import { truncateHistory } from "../features/ai/utils/chatHistoryUtils";
import { CharacterAvatar } from "../components/ui/CharacterAvatar";
import { DisplayImage } from "../components/DisplayImage";
import { Alert, AlertDescription } from "../components/ui/alert";
import { useModal } from "../contexts/ModalContext";

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
  const personas = useAppSelector((state) => state.settings.personas);
  const globalActivePersonaId = useAppSelector((state) => state.settings.activePersonaId);
  const portraitSaveSize = useAppSelector((state) => state.settings.portraitSaveSize);
  const [isPersonaModalOpen, setIsPersonaModalOpen] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [character, setCharacter] = useState("");
  // const [characterData, setCharacterData] = useState<Character | null>(null);
  const [error, setError] = useState<string | null>(null);
  const aiPromiseRef = useRef<any>(null);

  // Memoize chatIdNum to avoid redundant conversions
  const chatIdNum = useMemo(() => (chatId ? Number(chatId) : null), [chatId]);

  useEffect(() => {
    if (!chatIdNum) return;

    const fetchData = async () => {
      try {
        await dispatch(fetchChatById(chatIdNum)).unwrap();
        await dispatch(fetchChats()).unwrap();
      } catch (err) {
        console.error("Error fetching chat data:", err);
        setError("Failed to load chat. Please try again.");
      }
    };

    fetchData();
  }, [dispatch, chatIdNum]);

  const currentChat = useMemo(() => chats.find((chat) => chat.id === chatIdNum), [chats, chatIdNum]);
  const characterData = useMemo(
    () => characters.find((c) => c.id === currentChat?.characterId),
    [characters, currentChat]
  );

  // Which persona this chat actually speaks as: its own override if set,
  // otherwise whichever persona is globally active (Settings > Personas).
  const activePersona = useMemo(
    () => personas.find((p) => p.id === (currentChat?.personaId || globalActivePersonaId)) || personas[0],
    [personas, currentChat?.personaId, globalActivePersonaId]
  );
  const globalActivePersona = useMemo(
    () => personas.find((p) => p.id === globalActivePersonaId) || personas[0],
    [personas, globalActivePersonaId]
  );

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
    characterData?.emotionPortraits?.enabled && latestEmotion && latestEmotion !== "neutral" && !characterData.emotionPortraits.images[latestEmotion]
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
        appearanceImages: referenceImages,
        emotion: missingEmotionPortrait,
        artStyle: characterData.artStyle,
      })).unwrap();
      const dataUrl = result.images?.[0];
      if (!dataUrl) {
        setMissingEmotionError("No image was returned.");
        return;
      }
      const { width, height } = parseSize(portraitSaveSize);
      const blob = await autoCoverCropToBlob(dataUrl, width, height);
      const localRef = await savePortraitBlob(blob, `avatar_${missingEmotionPortrait}`);
      dispatch(updateCharacter({
        ...characterData,
        emotionPortraits: {
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
  const contextTokenEstimate = useMemo(() => {
    const { text: systemInstructionText } = buildSystemInstruction(characterData, undefined, replyLengthLimit, activePersona);
    const effectiveHistory = truncateHistory(buildChatHistory(messages), maxChatLength);
    return estimateTokens(systemInstructionText) + estimateHistoryTokens(effectiveHistory.map((m) => m.text));
  }, [characterData, replyLengthLimit, messages, maxChatLength, activePersona]);
  const maxContextTokens = useMemo(
    () => getModelContextWindow(chatProvider, selectedModel),
    [chatProvider, selectedModel]
  );

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
      if (currentChat?.characterId) {
        dispatch(fetchCharacterById(currentChat.characterId as number));
      }
    }
  }, [dispatch, messages, currentChat]);

  // Every MEMORY_EXTRACTION_INTERVAL messages, distill new durable facts from the
  // recent conversation into the character's long-term memory. Independent of the
  // compression threshold (which defaults to off) so it works for every character.
  // Best-effort/silent: a failure here shouldn't interrupt the conversation.
  const maybeExtractMemory = async (allMessages: Message[]) => {
    if (!characterData || allMessages.length === 0 || allMessages.length % MEMORY_EXTRACTION_INTERVAL !== 0) return;

    try {
      const recentMessages = allMessages.slice(-MEMORY_EXTRACTION_INTERVAL);
      const newFacts = await dispatch(
        extractCharacterMemory({ recentMessages, existingMemory: characterData.memory || [] })
      ).unwrap();

      if (newFacts && newFacts.length > 0) {
        const merged = mergeMemory(characterData.memory, newFacts);
        dispatch(updateCharacter({ ...characterData, memory: merged }));
      }
    } catch (err) {
      console.warn("Memory extraction failed (non-fatal):", err);
    }
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

  // --- Auto follow-up: the character can message first after the user goes quiet.
  // Only runs for the chat currently open in this tab - no cross-chat background
  // scanning, and nothing fires once the tab/app is closed.
  const [isAutoReplyModalOpen, setIsAutoReplyModalOpen] = useState(false);
  const [sceneOpen, setSceneOpen] = useState(false);
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
  // the automatic scheduler and the manual "follow up now" button - neither
  // touches followupCount itself, so a manual click never eats into the
  // automatic streak's budget.
  const sendCharacterFollowup = async (): Promise<boolean> => {
    if (!chatIdNum || !characterData || !currentChat) return false;

    // Read the chat fresh from the DB rather than trusting the component's local
    // `messages` state, which lags behind by a render cycle right after actions
    // like send/regenerate (their dispatch -> redux update -> effect -> setMessages
    // chain hasn't necessarily settled yet). Computing the "first follow-up after
    // an image-toggled user turn" check below off a stale/orphaned copy of
    // `messages` was silently skipping the image bonus.
    const freshChat = await dispatch(fetchChatById(chatIdNum)).unwrap();
    const { content: freshMessages } = getOrBuildTree(freshChat);

    // Only the first follow-up after an image-toggled user turn also carries a
    // picture - once a follow-up (auto or manual) has already fired since that
    // user message, later ones go back to text-only.
    const lastUserIndex = freshMessages.map((m) => m.role).lastIndexOf(YOU);
    const aiMessagesSinceLastUser = lastUserIndex >= 0 ? freshMessages.slice(lastUserIndex + 1).filter((m) => m.role === AI).length : 0;
    const echoesUserImage = lastUserIndex >= 0 && Boolean(freshMessages[lastUserIndex].isImageRequest) && aiMessagesSinceLastUser === 1;

    const autoSelfieCfg = characterData?.autoSelfie;
    const shouldAutoSelfie = !echoesUserImage && !!autoSelfieCfg?.enabled &&
      Math.random() * 100 < (autoSelfieCfg.frequency ?? DEFAULT_AUTO_SELFIE_FREQUENCY);
    const includeImage = echoesUserImage || shouldAutoSelfie;

    const { messages: compressedFreshMessages, tokens: compressTokens, cost: compressCost } = await dispatch(autoCompressChat({ chatId: chatIdNum, messages: freshMessages })).unwrap();
    await trackUsage(compressTokens, compressCost);

    const { history, systemInstruction, characterImages, characterName } = buildTurnContext(
      compressedFreshMessages,
      characterData,
      [AUTO_REPLY_DIRECTIVE],
      undefined,
      activePersona
    );
    const aiResponse = await dispatch(generateAIResponse({
      prompt: "Please continue the conversation naturally, as if reaching out again.",
      history, systemInstruction, characterImages, characterName,
      isImageRequest: includeImage, isCharacterInitiated: true, isAutoSelfie: shouldAutoSelfie,
    }));

    if (!aiResponse.payload) return false;

    const payloadObj = aiResponse.payload as any;
    await trackUsage(payloadObj?.tokenCount, payloadObj?.costEstimate);
    const generatedImages = payloadObj?.images || undefined;
    const aiAddResult = await dispatch(addMessage({
      chatId: chatIdNum,
      role: AI,
      text: typeof payloadObj?.text === 'string' ? payloadObj.text : (payloadObj as string),
      images: generatedImages,
      isImageRequest: Boolean(generatedImages && generatedImages.length > 0),
      emotion: payloadObj?.emotion,
      imagePrompt: payloadObj?.imagePrompt,
      imageParams: payloadObj?.imageParams,
    }));

    // Await the refresh before the caller can act on it (e.g. bump followupCount) -
    // otherwise the scheduling effect below can still be looking at the previous
    // AI message's (already-elapsed) timestamp when the count changes, and fire
    // the next follow-up immediately instead of waiting the full cooldown.
    await dispatch(fetchChats());

    if (generatedImages && generatedImages.length > 0) {
      dispatch(updateCharacter({ ...characterData, gallery: [...(characterData.gallery || []), ...generatedImages] }));
    }

    maybeExtractMemory((aiAddResult.payload as Message[]) || []);
    return true;
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
    } catch (err) {
      console.error("Auto follow-up failed (non-fatal):", err);
    }
  };

  const handleManualFollowup = async () => {
    if (autoReplyInFlightRef.current || aiLoading) return;
    autoReplyInFlightRef.current = true;
    try {
      await sendCharacterFollowup();
    } catch (err) {
      console.error("Manual follow-up failed:", err);
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

  const handleSend = async (text: string, isImageRequest?: boolean, isImpersonated?: boolean) => {
    if (!text.trim() || !chatIdNum) return;

    setError(null);

    try {
      if (isImpersonated) {
        // The user is speaking as the character (Impersonate mode) - append it
        // as the character's own turn and stop. No generation to trigger; the
        // next real AI reply, whenever it comes, just reads this as part of its
        // own history (buildChatHistory only special-cases the YOU role).
        await dispatch(addMessage({ chatId: chatIdNum, role: AI, text, isImpersonated: true }));
        dispatch(fetchChats());
        return;
      }

      const resultAction = await dispatch(addMessage({ chatId: chatIdNum, role: YOU, text, isImageRequest }));
      const updatedMessages = resultAction.payload as Message[] || [];
      const { messages: contextMessages, tokens: compressTokens, cost: compressCost } = await dispatch(autoCompressChat({ chatId: chatIdNum, messages: updatedMessages })).unwrap();
      await trackUsage(compressTokens, compressCost);

      const autoSelfieCfg = characterData?.autoSelfie;
      const shouldAutoSelfie = !isImageRequest && !!autoSelfieCfg?.enabled &&
        Math.random() * 100 < (autoSelfieCfg.frequency ?? DEFAULT_AUTO_SELFIE_FREQUENCY);

      const { history, systemInstruction, characterImages, characterName } = buildTurnContext(contextMessages, characterData, undefined, replyLengthLimit, activePersona);
      aiPromiseRef.current = dispatch(generateAIResponse({ prompt: text, history, systemInstruction, characterImages, characterName, isImageRequest: isImageRequest || shouldAutoSelfie, isAutoSelfie: shouldAutoSelfie }));
      const aiResponse = await aiPromiseRef.current;
      aiPromiseRef.current = null;

      if (aiResponse.payload) {
        const payloadObj = aiResponse.payload as any;
        await trackUsage(payloadObj?.tokenCount, payloadObj?.costEstimate);
        const generatedImages = payloadObj?.images || undefined;
        const aiAddResult = await dispatch(addMessage({
          chatId: chatIdNum,
          role: AI,
          text: typeof payloadObj?.text === 'string' ? payloadObj.text : (payloadObj as string),
          images: generatedImages,
          emotion: payloadObj?.emotion,
          imagePrompt: payloadObj?.imagePrompt,
          imageParams: payloadObj?.imageParams
        }));

        if (generatedImages && generatedImages.length > 0 && currentChat?.characterId) {
          const charToUpdate = characters.find(c => c.id === currentChat.characterId);
          if (charToUpdate) {
            dispatch(updateCharacter({ ...charToUpdate, gallery: [...(charToUpdate.gallery || []), ...generatedImages] }));
          }
        }

        maybeExtractMemory((aiAddResult.payload as Message[]) || []);
      }

      dispatch(fetchChats());
    } catch (err) {
      console.error("Error sending message:", err);
      setError("Failed to send message. Please try again.");
    }
  };

  const handleEditMessage = async (index: number, newText: string, isImageRequest?: boolean) => {
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
        const editedUserMsg: Message = { role: YOU, txt: newText, isImageRequest, timestamp: Date.now() };
        const { tree: treeWithEdit, nodeId: editedNodeId } = addChildNode(tree, parentId, editedUserMsg);
        const contentUpToEdit = flattenPath(treeWithEdit, editedNodeId);

        // Persist the branch point immediately so it survives even if generation fails.
        await dispatch(updateChatTree({ chatId: chatIdNum, content: contentUpToEdit, tree: treeWithEdit, activeLeafId: editedNodeId }));

        const { history, systemInstruction, characterImages, characterName } = buildTurnContext(contentUpToEdit, characterData, undefined, replyLengthLimit, activePersona);
        aiPromiseRef.current = dispatch(generateAIResponse({ prompt: newText, history, systemInstruction, characterImages, characterName, isImageRequest }));
        const aiResponse = await aiPromiseRef.current;
        aiPromiseRef.current = null;

        if (aiResponse.payload) {
          const payloadObj = aiResponse.payload as any;
          await trackUsage(payloadObj?.tokenCount, payloadObj?.costEstimate);
          const generatedImages = payloadObj?.images || undefined;
          const newAiMsg: Message = {
            role: AI,
            txt: typeof payloadObj?.text === 'string' ? payloadObj.text : (payloadObj as string),
            images: generatedImages,
            emotion: payloadObj?.emotion,
            timestamp: Date.now(),
          };
          const { tree: finalTree, nodeId: aiNodeId } = addChildNode(treeWithEdit, editedNodeId, newAiMsg);
          const finalContent = flattenPath(finalTree, aiNodeId);
          await dispatch(updateChatTree({ chatId: chatIdNum, content: finalContent, tree: finalTree, activeLeafId: aiNodeId }));

          if (generatedImages && generatedImages.length > 0 && currentChat?.characterId) {
            const charToUpdate = characters.find(c => c.id === currentChat.characterId);
            if (charToUpdate) {
              dispatch(updateCharacter({ ...charToUpdate, gallery: [...(charToUpdate.gallery || []), ...generatedImages] }));
            }
          }

          maybeExtractMemory(finalContent);
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
        ? "Please continue the conversation naturally, as if reaching out again."
        : precedingMessage.txt || "";
      // For a followup, whether it had a picture is recorded on the followup
      // message itself (no preceding user turn to read it off of).
      const isImageRequest = isFollowup ? (targetMessage?.isImageRequest || false) : (precedingMessage.isImageRequest || false);
      const extraDirectives = isFollowup ? [AUTO_REPLY_DIRECTIVE] : undefined;

      const { history, systemInstruction, characterImages, characterName } = buildTurnContext(historyUpToTarget, characterData, extraDirectives, replyLengthLimit, activePersona);
      aiPromiseRef.current = dispatch(generateAIResponse({ prompt, history, systemInstruction, characterImages, characterName, isImageRequest, isCharacterInitiated: isFollowup, existingImagePrompt, existingImageParams }));
      const aiResponse = await aiPromiseRef.current;
      aiPromiseRef.current = null;

      if (aiResponse.payload) {
        const payloadObj = aiResponse.payload as any;
        await trackUsage(payloadObj?.tokenCount, payloadObj?.costEstimate);
        const generatedImages = payloadObj?.images || undefined;
        const newMessage: Message = {
          role: AI,
          txt: typeof payloadObj?.text === 'string' ? payloadObj.text : (payloadObj as string),
          images: generatedImages,
          isImageRequest: isFollowup ? Boolean(generatedImages && generatedImages.length > 0) : undefined,
          emotion: payloadObj?.emotion,
          imagePrompt: payloadObj?.imagePrompt,
          imageParams: payloadObj?.imageParams,
          timestamp: Date.now(),
        };
        const { tree: newTree, nodeId: newNodeId } = addChildNode(tree, parentId, newMessage);
        const newContent = flattenPath(newTree, newNodeId);
        await dispatch(updateChatTree({ chatId: chatIdNum, content: newContent, tree: newTree, activeLeafId: newNodeId }));

        if (generatedImages && generatedImages.length > 0 && currentChat?.characterId) {
          const charToUpdate = characters.find(c => c.id === currentChat.characterId);
          if (charToUpdate) {
            dispatch(updateCharacter({ ...charToUpdate, gallery: [...(charToUpdate.gallery || []), ...generatedImages] }));
          }
        }

        maybeExtractMemory(newContent);
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
      if (treeContent[i].role === YOU) {
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
      const continueDirective =
        "The previous assistant message got cut off before finishing. Continue writing directly from exactly where it left off - do not repeat any earlier text, do not restart the sentence, and add no preamble or acknowledgement. Keep going in the same voice, tone, and format.";
      const { history, systemInstruction, characterImages, characterName } = buildTurnContext(
        [...historyUpToTarget, targetMessage],
        characterData,
        [continueDirective],
        replyLengthLimit,
        activePersona
      );

      aiPromiseRef.current = dispatch(generateAIResponse({ prompt: "Continue.", history, systemInstruction, characterImages, characterName }));
      const aiResponse = await aiPromiseRef.current;
      aiPromiseRef.current = null;

      if (aiResponse.payload) {
        const payloadObj = aiResponse.payload as any;
        await trackUsage(payloadObj?.tokenCount, payloadObj?.costEstimate);
        const continuationText = typeof payloadObj?.text === "string" ? payloadObj.text : (payloadObj as string);
        const existingText = targetMessage.txt || "";

        // A trailing "[Image Context: ...]" tag must stay at the very end -
        // stripImageContextTag only strips it when it's anchored there for
        // display - so splice the continuation in before it rather than after.
        const imageContextMatch = existingText.match(/\n*\[Image Context:[\s\S]*?\]\s*$/i);
        const tag = imageContextMatch?.[0] || "";
        const base = tag ? existingText.slice(0, existingText.length - tag.length) : existingText;
        const separator = base && !/\s$/.test(base) ? " " : "";
        const mergedMessage: Message = { ...targetMessage, txt: base + separator + continuationText + tag };

        const updatedTree = updateNodeMessage(tree, targetNodeId, mergedMessage);
        const updatedContent = flattenPath(updatedTree, currentActiveLeafId);
        await dispatch(updateChatTree({ chatId: chatIdNum, content: updatedContent, tree: updatedTree, activeLeafId: currentActiveLeafId }));

        maybeExtractMemory(updatedContent);
      }

      dispatch(fetchChats());
    } catch (err) {
      console.error("Error continuing response:", err);
      setError("Failed to continue response. Please try again.");
    }
  };

  const handleStopGenerating = () => {
    if (aiPromiseRef.current) {
      aiPromiseRef.current.abort();
      aiPromiseRef.current = null;
    }
  };

  const handleCompress = async () => {
    if (messages.length <= 4 || !chatIdNum) return;

    setError(null);
    try {
      // Keep only the last 2 messages uncompressed if possible, but summarize everything before
      const cutoff = Math.max(messages.length - 2, 2);
      const msgsToCompress = messages.slice(0, cutoff);
      const historyToCompress = buildChatHistory(msgsToCompress);
      const { text: systemInstructionText } = buildSystemInstruction(characterData, undefined, undefined, activePersona);

      const { summary, tokens: compressTokens, cost: compressCost } = await dispatch(compressChatHistory({ history: historyToCompress, systemInstruction: systemInstructionText })).unwrap();
      await trackUsage(compressTokens, compressCost);

      if (summary) {
        const retainedMsgs = messages.slice(cutoff);

        // Create new memory initialization format messages
        const newMessages: Message[] = [
          { role: YOU, txt: "[SYSTEM DIRECTIVE]: I will provide you with a summary of our conversation so far. Treat this summary as the exact events that have already occurred between us. Please strictly maintain the language (e.g. Hinglish, informal English, etc.), tone, and emotional feeling indicated in the summary as we continue.\n\nSummary:\n" + summary },
          { role: AI, txt: "Understood. I will remember our history and continue speaking in the exact same language, tone, and emotional state as before." },
          ...retainedMsgs
        ];

        // Ensure characterId and timestamp propagates safely if needed on the slice update
        // We do a full DB overwrite of the chat's content
        await dispatch(updateMessages({ chatId: chatIdNum, newMessages }));
        dispatch(fetchChats());
      }
    } catch (err) {
      console.error("Error compressing chat:", err);
      setError("Failed to compress conversation. It might be too short or an API error occurred.");
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
  const chatActions: HeaderAction[] = [
    { icon: FaDownload, label: "Export chat", onClick: handleExport },
    ...(messages.length > 0
      ? [{ icon: FaHistory, label: "Rewind last turn", onClick: handleRewindLastTurn, disabled: aiLoading, danger: true }]
      : []),
    ...(messages.length > 4
      ? [{ icon: FaCompressArrowsAlt, label: "Summarize and compress older messages to save tokens", onClick: handleCompress, disabled: aiCompressing }]
      : []),
    ...(messages.length > 0
      ? [{ icon: FaBolt, label: `Make ${characterData?.name || "them"} send a follow-up now`, onClick: handleManualFollowup, disabled: aiLoading }]
      : []),
    { icon: FaClock, label: "Auto follow-up settings", onClick: () => setIsAutoReplyModalOpen(true), active: autoReplySettings.enabled },
    { icon: FaBookOpen, label: "Scene panel", onClick: () => setSceneOpen((v) => !v), active: sceneOpen },
    ...(personas.length > 1
      ? [{ icon: FaUserCircle, label: `Persona: ${activePersona?.name || "None"}`, onClick: () => setIsPersonaModalOpen(true), active: Boolean(currentChat?.personaId) }]
      : []),
  ];

  return (
    <div className="flex flex-col w-full h-screen bg-background relative">
      <Header
        title={character || "Chat"}
        subtitle={characterData?.relationship || characterData?.description}
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

      <Modal
        isOpen={portraitPreviewOpen}
        onClose={() => setPortraitPreviewOpen(false)}
        title={characterData?.name || character || "Portrait"}
        subtitle={latestEmotion && latestEmotion !== "neutral" ? `Current mood: ${latestEmotion}` : undefined}
      >
        <div className="w-full max-w-[280px] mx-auto aspect-[3/4] rounded-xl overflow-hidden bg-muted">
          {headerEmotionImageSrc ? (
            <DisplayImage
              srcContext={headerEmotionImageSrc}
              alt={`${characterData?.name || "Character"} portrait`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <CharacterAvatar name={characterData?.name || character} accent={characterData?.accent} size={120} />
            </div>
          )}
        </div>
      </Modal>

      <Modal isOpen={isAutoReplyModalOpen} onClose={() => setIsAutoReplyModalOpen(false)} title="Auto Follow-up">
        <ToggleSwitch
          checked={autoReplySettings.enabled}
          onChange={(val) => handleAutoReplyChange({ enabled: val })}
          label="Let the character follow up on their own"
        />
        <div className="flex gap-3">
          <div className="flex-1">
            <FieldLabel hint="Shortest wait after their last message before following up.">Min delay (seconds)</FieldLabel>
            <TextInput
              type="number"
              min="5"
              max={autoReplySettings.maxDelaySeconds}
              value={autoReplySettings.minDelaySeconds}
              onChange={(e) => {
                const val = Math.max(5, Number(e.target.value));
                handleAutoReplyChange({
                  minDelaySeconds: val,
                  maxDelaySeconds: Math.max(val, autoReplySettings.maxDelaySeconds),
                });
              }}
            />
          </div>
          <div className="flex-1">
            <FieldLabel hint="Longest wait - the actual delay is randomized between min and max each time.">Max delay (seconds)</FieldLabel>
            <TextInput
              type="number"
              min={autoReplySettings.minDelaySeconds}
              max="600"
              value={autoReplySettings.maxDelaySeconds}
              onChange={(e) => {
                const val = Math.max(autoReplySettings.minDelaySeconds, Number(e.target.value));
                handleAutoReplyChange({ maxDelaySeconds: val });
              }}
            />
          </div>
        </div>
        <div>
          <FieldLabel hint="Stops following up on its own after this many messages, until you reply again.">Max follow-ups</FieldLabel>
          <TextInput
            type="number"
            min="1"
            max="10"
            value={autoReplySettings.maxFollowups}
            onChange={(e) => handleAutoReplyChange({ maxFollowups: Math.max(1, Number(e.target.value)) })}
          />
        </div>
        {autoReplySettings.enabled && (
          <p className="text-xs text-ink-faint">
            {autoReplySettings.followupCount}/{autoReplySettings.maxFollowups} follow-up(s) sent since you last replied. Only runs while this chat is open in your browser.
          </p>
        )}
      </Modal>

      <Modal isOpen={isPersonaModalOpen} onClose={() => setIsPersonaModalOpen(false)} title="Persona for this chat">
        <p className="text-xs text-ink-faint -mt-1 mb-1">
          Choose which of your personas {characterData?.name || "this character"} sees you as, just in this chat.
        </p>
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => handleSelectPersona(undefined)}
            className={cn(
              "flex items-center justify-between px-3 py-2.5 rounded-lg border text-left text-sm transition",
              !currentChat?.personaId ? "border-primary bg-primary/10 text-foreground" : "border-border hover:bg-hover text-foreground"
            )}
          >
            <span>Use global default{globalActivePersona?.name ? ` (${globalActivePersona.name})` : ""}</span>
            {!currentChat?.personaId && <FaCheck size={12} className="text-primary flex-shrink-0" />}
          </button>
          {personas.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelectPersona(p.id)}
              className={cn(
                "flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-left text-sm transition",
                currentChat?.personaId === p.id ? "border-primary bg-primary/10 text-foreground" : "border-border hover:bg-hover text-foreground"
              )}
            >
              <span className="truncate">{p.name || "(unnamed persona)"}</span>
              {currentChat?.personaId === p.id && <FaCheck size={12} className="text-primary flex-shrink-0" />}
            </button>
          ))}
        </div>
      </Modal>

      {/* Error Message */}
      {error && (
        <div className="absolute top-16 w-full z-20 px-4 flex justify-center">
          <Alert variant="destructive" className="max-w-md">
            <AlertDescription>{error}</AlertDescription>
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
        <ChatWindow characterName={character} character={characterData} messages={messages} tree={currentChat?.tree} onSwitchBranch={handleSwitchBranch} onDeleteBranch={handleDeleteBranch} onRegenerate={handleRegenerate} onContinue={handleContinueMessage} onEdit={handleEditMessage} aiLoading={aiLoading} isFollowupPending={Boolean(chatIdNum && pendingFollowups[chatIdNum])} onSend={handleSend} chatId={chatIdNum ?? undefined} sceneOpen={sceneOpen} onCloseScene={() => setSceneOpen(false)} authorNote={currentChat?.authorNote} worldTags={currentChat?.worldTags} />
      </div>

      {/* Message Input Floating */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 w-full max-w-4xl px-4 z-20">
        <MessageInput onSend={handleSend} disabled={aiLoading} onStop={handleStopGenerating} onDraftActivity={handleDraftActivity} tokenCount={aiTokenCount} costEstimate={aiCostEstimate} characterName={characterData?.name || character} contextTokens={contextTokenEstimate} maxContextTokens={maxContextTokens} totalChatTokens={currentChat?.totalTokensUsed} totalChatCost={currentChat?.totalCostEstimate} />
      </div>
    </div>
  );
};

export default ChatPage;
