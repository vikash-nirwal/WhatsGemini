import { stickerFor } from "../../features/character/stickers";
import { unreadStart } from "../../features/chat/chatList";
import { sentWhileBlocked } from "../../features/chat/blocking";
import { DISAPPEAR_LABEL, willDisappear } from "../../features/chat/disappearing";
import { reactionRows } from "../../features/chat/reactions";
import React, { useRef, useEffect, useCallback, useMemo, useState } from "react";
import { avatarOf } from "../../features/character/profileChanges";
import { FaCheck, FaTimes, FaArrowDown, FaClock, FaMicrophone } from "react-icons/fa";
import { motion } from "framer-motion";
import { YOU, LS_INITIAL_MESSAGES } from "../../utils/constants";
import { Message, Character, ConversationTree, Intensity, StoryScript, ChatGame, OffscreenTalk, CharacterLetter, RelationshipStage } from "../../types";
import { STAGE_LABELS } from "../../features/character/relationshipStages";
import { getSiblingInfo } from "../../features/chat/messageTree";
import { resolveEmotionPortrait } from "../../features/ai/utils/emotionUtils";
import { stripStreamingTags } from "../../features/ai/utils/messageTags";
import { receiptFor, revealDelayMs, splitIntoTexts } from "../../features/ai/utils/textingMode";
import { bubbleDelayMs, FALSE_START_MS, planSlips, TextBubble } from "../../features/ai/utils/textingSlips";
import { stripImageContextTag } from "../../features/ai/utils/imageGeneration";
import type { RecapView } from "../../features/chat/useChatRecap";
import { RecapCard } from "src/components/molecules/RecapCard";
import { StoryProgress } from "src/components/molecules/StoryProgress";
import { GameProgress } from "src/components/molecules/GameProgress";
import { SceneStateStrip } from "src/components/molecules/SceneStateStrip";
import { applyMacros, getGreetings } from "../../features/ai/utils/macros";
import { isNsfwCharacter } from "../../features/character/contentRating";
import { stopSpeaking } from "../../features/voice/speech";
import MarkdownRenderer from "src/components/molecules/MarkdownRenderer";
import { DisplayImage } from "src/components/molecules/DisplayImage";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import ChatMessage from "./ChatMessage";
import PromptInspectorDialog from "./PromptInspectorDialog";
import ForwardDialog from "./ForwardDialog";
import ContactInfoPanel from "./ContactInfoPanel";
import ScenePanel from "./ScenePanel";
import ParticipantsPanel from "src/components/molecules/ParticipantsPanel";
import EmotionSpritePanel from "src/components/molecules/EmotionSpritePanel";
import EmotionPopup, { EmotionPopupTrigger } from "src/components/molecules/EmotionPopup";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { updateChatOptions } from "../../features/chatSlice";
import { OffscreenTalkCard } from "src/components/molecules/OffscreenTalkCard";
import { LetterCard } from "src/components/molecules/LetterCard";
import { updateCharacter } from "../../features/characterSlice";
import { setEmotionPanelEnabled } from "../../features/settingsSlice";
import { VIDEO_PROVIDERS } from "../../features/ai/providers/registry";
import { getProviderApiKey, getWanBaseUrl } from "../../features/ai/utils/settings";
import { Dialog, DialogContent, DialogTitle, DialogClose } from "src/components/molecules/dialog";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { Button } from "src/components/atoms/button";
import { Card } from "src/components/atoms/card";
import { Badge } from "src/components/atoms/badge";
import { useColorTheme } from "../../hooks/useColorTheme";
import { cn } from "../../utils/cn";
import { beatStarts } from "../../features/chat/storyScript";
import { messageInfoFor } from "../../features/chat/messageInfo";
import { latestMood, tintFor } from "../../features/chat/moodTint";

interface ChatWindowProps {
  unreadSince?: { since?: number; until: number }; // the chat's read mark when it was opened, for the unread line
  onToggleBookmark?: (msg: Message) => void; // star / unstar a message (#21)
  onUndoSummary?: (msg: Message) => void; // take a compression or chapter back out
  onReact?: (msg: Message, emoji: string) => void; // your emoji reaction to a reply (#11)
  recap?: RecapView; // "Previously on..." after a few days away (#46)
  storyScript?: StoryScript; // the story this chat follows (#57)
  game?: ChatGame; // the mini-game being played (#52)
  relationshipSuggestion?: { from: string; to: string }; // waiting for the user's OK (#30)
  arcSuggestion?: string; // a note on how the character has grown, waiting for the user's OK (#60)
  onReplyToLetter?: (letter: CharacterLetter) => void; // starts a reply to a letter (#61)
  onTranslate?: (msg: Message) => void; // language practice (#67): translate a reply
  coWriting?: boolean; // co-writing mode (#68): the chat shows as one document
  stageSuggestion?: { from: RelationshipStage; to: RelationshipStage }; // a stage change waiting for the user's OK (#70)
  onAcceptStage?: () => void;
  onDismissStage?: () => void;
  onSuggestNext?: () => void; // "What happens next?" ideas, shown as suggestions
  onFork?: (msg: Message) => void; // start a new chat from a message (#86)
  onAcceptArc?: () => void;
  onDismissArc?: () => void;
  awayNote?: string | null; // a realistic schedule (#7) is holding the reply back
  onAcceptRelationship?: () => void;
  onDismissRelationship?: () => void;
  gameScore?: { user: number; character: number };
  onEndGame?: () => void;
  onEditStory?: () => void;
  onMoveBeat?: (step: number) => void;
  onReply?: (msg: Message) => void; // quote a message in your next one (#119)
  onViewOnce?: (msg: Message) => void; // a view-once photo was opened (#122)
  onVote?: (msg: Message, option: number) => void; // your vote in a poll (#124)
  onOpenContact?: (msg: Message) => void; // message a shared contact (#128)
  onAnswerInvite?: (msg: Message, answer: "accepted" | "declined") => void; // event invites (#134)
  // Reply ideas for the newest message (#16) and what tapping one does.
  replySuggestions?: { forMessageId: string; items: string[] } | null;
  onPickSuggestion?: (text: string) => void;
  // Height of the composer floating over the bottom of the list (0 when it's
  // docked below it instead, as in the terminal theme).
  bottomInset?: number;
  messages: Message[];
  tree?: ConversationTree;
  onSwitchBranch?: (nodeId: string) => void;
  onDeleteBranch?: (nodeId: string) => void;
  onRegenerate?: (index: number) => void;
  onContinue?: (index: number) => void;
  onClearRefusal?: (index: number) => void;
  onEdit?: (index: number, text: string, isImageRequest?: boolean, isVideoRequest?: boolean) => void;
  onSend?: (text: string, isImageRequest?: boolean, isVideoRequest?: boolean) => void;
  aiLoading?: boolean;
  isFollowupPending?: boolean;
  characterName?: string;
  userName?: string;
  character?: Character; // the chat's primary character - header, empty state, and the fallback for any message with no resolvable speaker
  characters?: Character[]; // every character in the chat/room (Phase 12); per-message avatar/emotion resolve against this via Message.speakerId, falling back to `character` above
  allCharacters?: Character[]; // the full app-wide character roster, only needed by the Participants panel's invite picker
  chatId?: number;
  sceneOpen?: boolean;
  onCloseScene?: () => void;
  // Contact info (#151): the character everywhere, opened from the header.
  contactOpen?: boolean;
  onCloseContact?: () => void;
  authorNote?: string;
  worldTags?: string[];
  isRoom?: boolean; // whether this chat currently has 2+ characters - see ScenePanel's group-scoped memory/scenario
  chatMemory?: string[]; // Chat.memory - only meaningful/shown when isRoom
  chatPinnedMemory?: string[]; // Chat.pinnedMemory - only meaningful/shown when isRoom
  hardLimits?: string[];
  intensity?: Intensity;
  isNsfwChat?: boolean;
  greetingIndex?: number; // Chat.greetingIndex - which opening greeting an empty chat will start from
  onSelectGreeting?: (index: number) => void;
  chatScenario?: string; // Chat.scenario - only meaningful/shown when isRoom
  participantsOpen?: boolean;
  onCloseParticipants?: () => void;
  mutedParticipantIds?: number[];
  // The reply being written will be a voice note (#44): show "recording
  // audio..." instead of the text streaming in.
  recordingVoiceNote?: boolean;
}

const TerminalCursorLine = ({ name, note }: { name?: string; note?: string }) => (
  <div className="flex items-center gap-1.5 mb-5 text-[12px] text-muted-foreground">
    <span>{name || "session"}@session:~$</span>
    {note ? <span># {note}</span> : <span className="term-cursor" />}
  </div>
);

// The pending-reply bubbles (#149): the canvas's typing bubble, in the
// incoming bubble's colour with its tail. In a group the speaker's avatar
// sits beside it, as beside their messages; a 1:1 chat shows none.
const PendingRow = ({ charInitials, accent, imageSrc, showAvatar, children }: { charInitials: string; accent?: [string, string]; imageSrc?: string; showAvatar?: boolean; children: React.ReactNode }) => (
  <div className="flex items-end gap-2 mt-3.5">
    {showAvatar && <CharacterAvatar name={charInitials} accent={accent} imageSrc={imageSrc} size={32} />}
    {children}
  </div>
);

const TypingIndicator = ({ charInitials, accent, imageSrc, recording, showAvatar }: { charInitials: string; accent?: [string, string]; imageSrc?: string; recording?: boolean; showAvatar?: boolean }) => (
  <PendingRow charInitials={charInitials} accent={accent} imageSrc={imageSrc} showAvatar={showAvatar}>
    <div className="flex h-9 items-center gap-1 rounded-bubble rounded-bl-[6px] bg-bubble-in px-3.5 shadow-bubble" aria-label={recording ? "Recording audio" : "Typing"}>
      {recording && (
        <span className="mr-1.5 flex items-center gap-1.5 text-xs text-subtle">
          <FaMicrophone size={11} className="text-primary" /> recording audio...
        </span>
      )}
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-subtle"
          animate={{ opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </div>
  </PendingRow>
);

// The reply as it streams in, in place of the typing dots once the first
// visible text arrives.
const StreamingBubble = ({ text, charInitials, accent, imageSrc, showAvatar }: { text: string; charInitials: string; accent?: [string, string]; imageSrc?: string; showAvatar?: boolean }) => (
  <PendingRow charInitials={charInitials} accent={accent} imageSrc={imageSrc} showAvatar={showAvatar}>
    <div className="max-w-[86%] md:max-w-[min(600px,78%)] rounded-bubble rounded-bl-[6px] bg-bubble-in px-3 py-2 font-serif text-bubble-in-text shadow-bubble" data-chat-text style={{ fontSize: "var(--chat-font-size, 16px)" }}>
      <MarkdownRenderer msgText={text} isUser={false} />
    </div>
  </PendingRow>
);

// Shown while an autonomous follow-up's random delay is still counting down
// - distinct from TypingIndicator (which means a reply is actually
// generating) so the two are never shown at once.
// Left on read (#126): said out loud (the user's report, 2026-10-28: with
// only the read ticks to go by, it looked like the reply had failed).
const LEFT_ON_READ_NOTE = "read it, and will answer in a while";

const FollowupIndicator = ({ charInitials, accent, imageSrc, note, showAvatar }: { charInitials: string; accent?: [string, string]; imageSrc?: string; note?: string; showAvatar?: boolean }) => (
  <PendingRow charInitials={charInitials} accent={accent} imageSrc={imageSrc} showAvatar={showAvatar}>
    <div className="flex h-9 items-center gap-1.5 rounded-bubble rounded-bl-[6px] bg-bubble-in px-3.5 shadow-bubble">
      <motion.span
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        className="text-subtle"
      >
        <FaClock size={11} />
      </motion.span>
      <span className="text-xs text-subtle">{note || "thinking of reaching out..."}</span>
    </div>
  </PendingRow>
);

const ChatWindow: React.FC<ChatWindowProps> = ({ unreadSince, awayNote, onFork, stageSuggestion, onAcceptStage, onDismissStage, coWriting = false, onSuggestNext, onTranslate, onReplyToLetter, arcSuggestion, onAcceptArc, onDismissArc, relationshipSuggestion, onAcceptRelationship, onDismissRelationship, game, gameScore, onEndGame, storyScript, onEditStory, onMoveBeat, onReply, onViewOnce, onVote, onOpenContact, onAnswerInvite, recap, onToggleBookmark, onUndoSummary, onReact, replySuggestions, onPickSuggestion, bottomInset = 0, messages = [], tree, onSwitchBranch, onDeleteBranch, onRegenerate, onContinue, onClearRefusal, onEdit, onSend, aiLoading, isFollowupPending, characterName, userName, character, characters, allCharacters, chatId, sceneOpen, onCloseScene, contactOpen, onCloseContact, authorNote, worldTags, isRoom, chatMemory, chatPinnedMemory, chatScenario, participantsOpen, onCloseParticipants, mutedParticipantIds, greetingIndex, onSelectGreeting, hardLimits, intensity, isNsfwChat, recordingVoiceNote }) => {
  const { is } = useColorTheme();
  const terminal = is("terminal");
  const chatEndRef = useRef<HTMLDivElement>(null);
  // Only this chat's own stream - the ai slice holds at most one, keyed by chat id.
  const streamingReply = useAppSelector((state) => state.ai.streamingReply);
  const blurNsfwMedia = useAppSelector((state) => state.settings.privacy.blurNsfwMedia);
  // Blur every image in the chat when any member is NSFW - an image request
  // can depict any of them, whoever technically sent it.
  const blurMedia = blurNsfwMedia && [character, ...(characters || [])].some((c) => c && isNsfwCharacter(c));
  const streamingText = chatId != null && streamingReply?.key === String(chatId)
    ? stripStreamingTags(streamingReply.text)
    : "";
  const greetings = useMemo(
    () => getGreetings(character).map((g) => applyMacros(g, { char: character?.name, user: userName?.trim() || "User" })),
    [character, userName]
  );
  const selectedGreeting = Math.min(greetingIndex || 0, Math.max(greetings.length - 1, 0));
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editIsImageRequest, setEditIsImageRequest] = useState(false);
  const [editIsVideoRequest, setEditIsVideoRequest] = useState(false);
  // Same "is Wan actually configured" check MessageInput does for its own
  // video toggle - keeps the edit modal from offering an option that would
  // just fail.
  const [isVideoGenAvailable, setIsVideoGenAvailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const providerId = "wan";
      const caps = VIDEO_PROVIDERS[providerId]?.capabilities;
      if (!caps) return;
      const apiKey = caps.requiresApiKey ? await getProviderApiKey(providerId) : "ok";
      const baseUrl = caps.requiresBaseUrl ? getWanBaseUrl() : "ok";
      if (!cancelled) setIsVideoGenAvailable(Boolean(apiKey && baseUrl));
    })();
    return () => { cancelled = true; };
  }, []);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      setIsScrolledUp(scrollHeight - scrollTop - clientHeight > 100);
    }
  }, []);

  // scrollTop isn't re-clamped when the container shrinks (mobile keyboard
  // opening, browser chrome show/hide, orientation change) - it silently
  // falls short of the new bottom, letting old messages peek out from under
  // the floating composer. Snap back to bottom whenever that happens, but
  // only if the user hadn't deliberately scrolled up to read history.
  const isScrolledUpRef = useRef(isScrolledUp);
  isScrolledUpRef.current = isScrolledUp;
  // The unread line's jump (below), for the resize observer set up once.
  const tryUnreadJumpRef = useRef<() => boolean>(() => false);

  // When the composer grows (more lines, a banner), stay pinned to the
  // newest message instead of letting it slide under the composer.
  // Judged by distance from the bottom rather than isScrolledUp alone: the
  // first measurement lands right after the initial jump to the newest
  // message, when the extra padding itself makes the list look "scrolled up".
  const prevInsetRef = useRef(bottomInset);
  useEffect(() => {
    const el = scrollContainerRef.current;
    const grownBy = Math.max(0, bottomInset - prevInsetRef.current);
    prevInsetRef.current = bottomInset;
    if (!el) return;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (!isScrolledUpRef.current || fromBottom <= grownBy + 100) {
      el.scrollTop = el.scrollHeight;
      setIsScrolledUp(false);
    }
  }, [bottomInset]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (!isScrolledUpRef.current) {
        el.scrollTop = el.scrollHeight;
        tryUnreadJumpRef.current();
      }
    });
    observer.observe(el);
    // The content too: bubbles grow after the first scroll when web fonts or
    // images finish loading (and while a reply streams in), which used to
    // leave a freshly opened chat short of its newest message.
    if (contentRef.current) observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, []);

  const startIndex = useMemo(() => {
    let index = 0;

    const charPromptIndex = messages.findIndex(
      (m) =>
        m.role === YOU &&
        m.txt &&
        m.txt.startsWith("Role play as, Character Name:")
    );
    if (charPromptIndex !== -1) {
      index = Math.max(index, charPromptIndex + 2);
    }

    // Hide the [SYSTEM DIRECTIVE] summary message added during compression
    const sysDirIndex = messages.findIndex(
      (m) =>
        m.role === YOU &&
        m.txt &&
        m.txt.startsWith("[SYSTEM DIRECTIVE]:")
    );
    if (sysDirIndex !== -1) {
      index = Math.max(index, sysDirIndex + 2);
    }

    return index;
  }, [messages]);

  const filteredMessages = useMemo(() => {
    let sliced = messages.slice(startIndex) || [];

    // Hide explicitly flagged system setup messages
    sliced = sliced.filter(m => !m.isSystem);

    // Additionally hide backward compatibility pre-populated InitialMessages
    // if they weren't explicitly flagged (e.g. from an older app state)
    try {
      const savedMessages = JSON.parse(localStorage.getItem(LS_INITIAL_MESSAGES) || "[]") as any[];
      let hiddenCount = 0;
      for (let i = 0; i < savedMessages.length && i < sliced.length; i++) {
        if (sliced[i].role === savedMessages[i].role && sliced[i].txt?.trim() === savedMessages[i].message?.trim()) {
          hiddenCount++;
        } else {
          break;
        }
      }
      if (hiddenCount > 0) {
        sliced = sliced.slice(hiddenCount);
      }
    } catch (err) {
      console.warn("Failed to parse initial messages for filtering", err);
    }

    return sliced;
  }, [messages, startIndex]);

  // Texting mode (#6): a reply that arrives while the chat is open is shown
  // one text at a time, with the typing dots in between. Messages already
  // there when the chat opens (or reached by switching branches) show whole.
  const chatBackdrop = useAppSelector((state) => state.chat.chats.find((c) => c.id === chatId)?.backdrop);
  const chatTitle = useAppSelector((state) => state.chat.chats.find((c) => c.id === chatId)?.title);
  // Left on read (#126): they've seen your latest messages, no answer yet.
  const seenNoReply = useAppSelector((state) => Boolean(state.chat.chats.find((c) => c.id === chatId)?.leftOnReadUntil));
  // The scene state HUD (#9), when this chat tracks it.
  const sceneTracker = useAppSelector((state) => state.chat.chats.find((c) => c.id === chatId)?.sceneTracker);
  const chatMeters = useAppSelector((state) => state.chat.chats.find((c) => c.id === chatId)?.meters);
  const moodTintOn = useAppSelector((state) => Boolean(state.chat.chats.find((c) => c.id === chatId)?.moodTint));
  const currentMood = moodTintOn ? latestMood(messages) : undefined;
  const moodTint = tintFor(currentMood);
  // Conversations members had while you were away (#58), each shown after
  // the last message before it.
  const offscreenTalks = useAppSelector((state) => state.chat.chats.find((c) => c.id === chatId)?.offscreenTalks);
  const sceneState = useAppSelector((state) => state.chat.chats.find((c) => c.id === chatId)?.sceneState);
  // A chat's own choice wins over the app setting (Scene panel > Chat).
  const appTextingMode = useAppSelector((state) => state.settings.textingMode);
  const chatTextingMode = useAppSelector((state) => state.chat.chats.find((c) => c.id === chatId)?.textingMode);
  const disappearing = useAppSelector((state) => state.chat.chats.find((c) => c.id === chatId)?.disappearing);
  const blocked = useAppSelector((state) => state.chat.chats.find((c) => c.id === chatId)?.blocked);
  // Every theme, the terminal's prompt lines included (#141).
  const textingMode = Boolean(chatTextingMode ?? appTextingMode);
  // Reading aloud stops when you leave the chat.
  useEffect(() => () => stopSpeaking(), [chatId]);

  const lastReplyIndex = useMemo(() => {
    for (let i = filteredMessages.length - 1; i >= 0; i--) if (filteredMessages[i].role !== YOU) return i;
    return -1;
  }, [filteredMessages]);

  // Prompt inspector (#31): the request behind an AI reply, matched by its text.
  const [inspectText, setInspectText] = useState<string | null>(null);
  const handleInspect = useCallback((msg: Message) => setInspectText(msg.txt || ""), []);

  // Chapter numbers by message id, in story order.
  const chapterNumbers = useMemo(() => {
    const numbers = new Map<string, number>();
    filteredMessages.filter((m) => m.chapterTitle).forEach((m, i) => numbers.set(m.id || "", i + 1));
    return numbers;
  }, [filteredMessages]);

  // Position of the newest compression summary in the visible list, or -1.
  // Everything above it has been summarized and is left out of the prompt.
  const latestSummaryAt = useMemo(
    () => filteredMessages.map((m) => Boolean(m.isCompressionSummary)).lastIndexOf(true),
    [filteredMessages]
  );
  // Letters this character wrote you in this chat (#61), placed the same way.
  const lettersAfter = useMemo(() => {
    const byIndex = new Map<number, CharacterLetter[]>();
    if (isRoom || !character) return byIndex;
    for (const letter of character.letters || []) {
      if (!letter.text || letter.chatId !== chatId) continue;
      let at = -1;
      filteredMessages.forEach((m, i) => {
        if ((m.timestamp || 0) <= letter.at) at = i;
      });
      if (at >= 0) byIndex.set(at, [...(byIndex.get(at) || []), letter]);
    }
    return byIndex;
  }, [character, chatId, isRoom, filteredMessages]);

  const talksAfter = useMemo(() => {
    const byIndex = new Map<number, OffscreenTalk[]>();
    for (const talk of offscreenTalks || []) {
      if (talk.lines.length === 0) continue;
      let at = -1;
      filteredMessages.forEach((m, i) => {
        if ((m.timestamp || 0) <= talk.at) at = i;
      });
      if (at >= 0) byIndex.set(at, [...(byIndex.get(at) || []), talk]);
    }
    return byIndex;
  }, [offscreenTalks, filteredMessages]);

  // Where each story-script beat starts (#57), for a divider above it.
  const beatStartIndexes = useMemo(() => (storyScript ? beatStarts(filteredMessages) : new Set<number>()), [storyScript, filteredMessages]);

  useEffect(() => {
    setEditingIndex(null);
    setEditText("");
  }, [messages]);

  const prevMessagesLengthRef = useRef(messages.length);
  // Scrolls only the message list to its end. scrollIntoView also scrolled
  // the boxes around it whenever the end sat under the floating composer,
  // pushing the whole chat up and leaving a blank strip below it.
  const scrollToEnd = useCallback((behavior: ScrollBehavior) => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    if (!isScrolledUp) {
      // Determine if we should smooth scroll or jump instantly
      // Jump instantly if loading a new chat (length jumps significantly or goes from 0 to N)
      const diff = Math.abs(messages.length - prevMessagesLengthRef.current);
      const isInstant = prevMessagesLengthRef.current === 0 || diff > 1;

      scrollToEnd(isInstant ? "auto" : "smooth");
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages, aiLoading, isScrolledUp, streamingText, scrollToEnd]);

  // The "N unread messages" line, as other chat apps have it: where the
  // replies you haven't seen start. A chat with more unread than fits opens
  // at the line instead of at the bottom, once per opening.
  const unread = useMemo(() => (unreadSince ? unreadStart(filteredMessages, unreadSince.since, unreadSince.until) : undefined), [filteredMessages, unreadSince]);
  // Tried again while the list settles (bubbles grow as fonts and images
  // load, and a long chat renders in steps) for a moment after opening; not
  // later, so a reply arriving while you read never pulls you up.
  const unreadJumpRef = useRef<{ key: string; until: number; done: boolean } | null>(null);
  const tryUnreadJump = useCallback(() => {
    const el = scrollContainerRef.current;
    const pending = unreadJumpRef.current;
    if (!el || !pending || pending.done || Date.now() > pending.until) return false;
    const line = el.querySelector<HTMLElement>('[data-slot="unread-divider"]');
    if (!line) return false;
    // Measured against the list's end, wherever it's scrolled to now: if the
    // line still shows with the newest message at the bottom, stay there.
    const target = Math.max(0, el.scrollTop + line.getBoundingClientRect().top - el.getBoundingClientRect().top - 8);
    if (target >= el.scrollHeight - el.clientHeight) return false;
    pending.done = true;
    el.scrollTop = target;
    isScrolledUpRef.current = true;
    setIsScrolledUp(true);
    return true;
  }, []);
  tryUnreadJumpRef.current = tryUnreadJump;
  useEffect(() => {
    const key = unread && unreadSince ? `${chatId}-${unreadSince.until}` : null;
    if (!key) return;
    if (unreadJumpRef.current?.key !== key) unreadJumpRef.current = { key, until: Date.now() + 1500, done: false };
    tryUnreadJump();
  }, [unread, unreadSince, chatId, tryUnreadJump]);

  const handleRegenerate = useCallback(
    (msg: Message) => {
      if (onRegenerate) {
        const originalIndex = messages.indexOf(msg);
        if (originalIndex !== -1) {
          onRegenerate(originalIndex);
        }
      }
    },
    [onRegenerate, messages]
  );

  const handleClearRefusal = useCallback(
    (msg: Message) => {
      const originalIndex = messages.indexOf(msg);
      if (onClearRefusal && originalIndex !== -1) onClearRefusal(originalIndex);
    },
    [onClearRefusal, messages]
  );

  const handleContinue = useCallback(
    (msg: Message) => {
      if (onContinue) {
        const originalIndex = messages.indexOf(msg);
        if (originalIndex !== -1) {
          onContinue(originalIndex);
        }
      }
    },
    [onContinue, messages]
  );

  const startEdit = useCallback((msg: Message) => {
    const originalIndex = messages.indexOf(msg);
    if (originalIndex !== -1) {
      setEditingIndex(originalIndex);
      setEditText(msg.txt || "");
      setEditIsImageRequest(msg.isImageRequest || false);
      setEditIsVideoRequest(msg.isVideoRequest || false);
    }
  }, [messages]);

  const cancelEdit = useCallback(() => {
    setEditingIndex(null);
    setEditText("");
    setEditIsImageRequest(false);
    setEditIsVideoRequest(false);
  }, []);

  const saveEdit = useCallback(() => {
    if (editText.trim() && onEdit && editingIndex !== null) {
      onEdit(editingIndex, editText.trim(), editIsImageRequest, editIsVideoRequest);
      setEditingIndex(null);
      setEditText("");
      setEditIsImageRequest(false);
      setEditIsVideoRequest(false);
    }
  }, [editText, editIsImageRequest, editIsVideoRequest, editingIndex, onEdit]);

  const handleCopyMessage = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  // Resolves the character who actually said a given message - its
  // speakerId within `characters` (the room's full participant list) when
  // set, otherwise the chat's primary `character` (every message predating
  // this field, and every message in a plain 1:1 chat where speakerId always
  // just echoes the sole character anyway).
  const resolveSpeaker = useCallback(
    (msg: Message): Character | undefined => (msg.speakerId != null && characters?.find((c) => c.id === msg.speakerId)) || character,
    [characters, character]
  );

  // Texting imperfections (#108) ride along: `parts` are the planned bubbles,
  // and a false start keeps `shown` at 0 while the typing dots show, stop,
  // and show again (`phase`).
  const [reveal, setReveal] = useState<{ id: string; shown: number; parts: TextBubble[]; phase?: "typing" | "paused" | "retyping" } | null>(null);
  // The run of your messages right before a reply (two or more), for a
  // quoted reply (#108).
  const burstBefore = useCallback((index: number): string[] | undefined => {
    const out: string[] = [];
    for (let j = index - 1; j >= 0; j--) {
      const m = filteredMessages[j];
      if (m.role !== YOU || m.isNarration || m.isSystem || !m.txt) break;
      out.unshift(stripImageContextTag(m.txt));
    }
    return out.length >= 2 ? out : undefined;
  }, [filteredMessages]);
  const lastSeenRef = useRef<{ chatId?: number; id?: string } | null>(null);
  useEffect(() => {
    const last = filteredMessages[filteredMessages.length - 1];
    const previous = lastSeenRef.current;
    lastSeenRef.current = { chatId, id: last?.id };
    if (!previous || previous.chatId !== chatId) {
      setReveal(null);
      return;
    }
    if (!textingMode || !last?.id || last.id === previous.id || last.role === YOU || last.isVoiceNote) return;
    if (Date.now() - (last.timestamp || 0) > 60_000) return;
    const parts = splitIntoTexts(stripImageContextTag(last.txt || ""));
    const plan = planSlips(parts, last.id, resolveSpeaker(last)?.textingSlips, burstBefore(filteredMessages.length - 1));
    if (plan.bubbles.length > 1 || plan.falseStart) setReveal({ id: last.id, shown: plan.falseStart ? 0 : 1, parts: plan.bubbles, phase: plan.falseStart ? "typing" : undefined });
  }, [filteredMessages, chatId, textingMode, resolveSpeaker, burstBefore]);
  useEffect(() => {
    if (!reveal) return;
    if (!textingMode || reveal.shown >= reveal.parts.length) {
      setReveal(null);
      return;
    }
    const step = (patch: Partial<NonNullable<typeof reveal>>, after: number) => window.setTimeout(() => setReveal((r) => (r ? { ...r, ...patch } : r)), after);
    const timer = reveal.shown === 0
      ? reveal.phase === "typing"
        ? step({ phase: "paused" }, FALSE_START_MS.typing)
        : reveal.phase === "paused"
          ? step({ phase: "retyping" }, FALSE_START_MS.paused)
          : step({ shown: 1, phase: undefined }, bubbleDelayMs(reveal.parts[0], revealDelayMs))
      : step({ shown: reveal.shown + 1 }, bubbleDelayMs(reveal.parts[reveal.shown], revealDelayMs));
    return () => window.clearTimeout(timer);
  }, [reveal, textingMode]);

  // Forwarding (#123): the message being passed on.
  const [forwarding, setForwarding] = useState<Message | null>(null);
  // Message info (#121): which message of yours is open, by list position.
  const [infoIndex, setInfoIndex] = useState<number | null>(null);
  const memberIds = useMemo(() => (characters && characters.length > 0 ? characters.map((c) => c.id) : character ? [character.id] : []), [characters, character]);
  const info = infoIndex != null ? messageInfoFor(filteredMessages, infoIndex, memberIds) : undefined;
  const timeLabel = (at: number) => {
    const d = new Date(at);
    const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return d.toDateString() === new Date().toDateString() ? `Today, ${time}` : `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
  };
  const namesById = useMemo(
    () => Object.fromEntries((characters && characters.length > 0 ? characters : character ? [character] : []).map((c) => [c.id, c.name])) as Record<number, string>,
    [characters, character]
  );
  const offscreenDispatch = useAppDispatch();
  const markTalkSeen = (id: string) => {
    if (!chatId || !offscreenTalks?.some((t) => t.id === id && !t.seen)) return;
    offscreenDispatch(updateChatOptions({ chatId, patch: { offscreenTalks: offscreenTalks.map((t) => (t.id === id ? { ...t, seen: true } : t)) } }));
  };

  // Who left a character's reaction (#11), on any message.
  const resolveReactor = (speakerId?: number) =>
    (speakerId != null && characters?.find((c) => c.id === speakerId)?.name) || character?.name || characterName;

  const getInitials = (name?: string) => {
    if (!name || name === "New Chat" || name.trim() === "Chat") return "G";
    const parts = name.split(" ").filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return "G";
  };
  const charInitials = getInitials(characterName);

  // Bubbles group by sender (#149): a run is consecutive messages from the
  // same person with nothing between them (a room event, narration, a
  // summary, a beat divider, a letter or a side-conversation card). A run
  // gets space above it, and in a group the speaker's avatar and name.
  const runs = useMemo(() => {
    const senderOf = (m: Message) =>
      m.isNarration || m.isRoomEvent || m.isCompressionSummary ? null : m.role === YOU ? "you" : `c${resolveSpeaker(m)?.id ?? "?"}`;
    const starts = filteredMessages.map((m, i) => {
      if (i === 0) return true;
      const key = senderOf(m);
      return key === null || key !== senderOf(filteredMessages[i - 1]) || beatStartIndexes.has(i) || Boolean(lettersAfter.get(i - 1)?.length) || Boolean(talksAfter.get(i - 1)?.length);
    });
    return { starts, ends: starts.map((_, i) => i === starts.length - 1 || starts[i + 1]) };
  }, [filteredMessages, resolveSpeaker, beatStartIndexes, lettersAfter, talksAfter]);

  // Most recent AI message that reported an emotion - drives the "current
  // mood" portrait shown while a reply/follow-up is pending, distinct from
  // each individual message's own (historical) emotion below.
  const latestEmotionMessage = useMemo(() => {
    for (let i = filteredMessages.length - 1; i >= 0; i--) {
      if (filteredMessages[i].role !== YOU && filteredMessages[i].emotion) return filteredMessages[i];
    }
    return undefined;
  }, [filteredMessages]);
  const latestEmotion = latestEmotionMessage?.emotion;
  const currentEmotionImageSrc = resolveEmotionPortrait(character, latestEmotion);

  // Group-chat presence: dock every participant's current-mood portrait, not
  // just whoever spoke most recently - a multi-character room's whole mood
  // should be visible at a glance. Each character's own most recent
  // emotion-bearing message (resolveSpeaker follows the message's own
  // speakerId, same as roomRouting.ts uses to decide whose turn is next)
  // drives their own sprite.
  //
  // Unlike currentEmotionImageSrc above (which falls back to the character's
  // ordinary main avatar for the small typing/follow-up indicator, where an
  // opaque image is perfectly fine), the docked sprite panel must only ever
  // show a real, specifically-generated emotion portrait - those alone are
  // chroma-keyed to real transparency (portraitUtils.ts's
  // removeChromaKeyBackground). The main avatar is a normal opaque photo
  // with its own plain background baked into the pixels, which looked like
  // a boxed panel instead of blending with the page when it showed here.
  // "neutral" can have its own generated slot like any other mood
  // (emotionUtils.ts) - reading straight off images[emo] here (no
  // special-casing "neutral") means a character's sprite shows when one
  // exists and that character is simply skipped otherwise, same as any
  // other ungenerated mood.
  const dockedSprites = useMemo(() => {
    const roster = characters && characters.length > 0 ? characters : character ? [character] : [];
    const sprites: { imageSrc: string; characterName?: string; emotion?: string; characterId?: number }[] = [];
    for (const c of roster) {
      let emo: string | undefined;
      for (let i = filteredMessages.length - 1; i >= 0; i--) {
        const msg = filteredMessages[i];
        if (msg.role !== YOU && msg.emotion && resolveSpeaker(msg)?.id === c.id) {
          emo = msg.emotion;
          break;
        }
      }
      const imageSrc = c.emotionPortraits?.enabled && emo ? c.emotionPortraits.images[emo] : undefined;
      if (imageSrc) sprites.push({ imageSrc, characterName: c.name, emotion: emo, characterId: c.id });
    }
    return sprites;
  }, [characters, character, filteredMessages, resolveSpeaker]);

  const dispatch = useAppDispatch();
  const emotionPanelEnabled = useAppSelector((state) => state.settings.emotionPanelEnabled);
  const emotionPopupEnabled = useAppSelector((state) => state.settings.emotionPopupEnabled);
  const emotionPopupDuration = useAppSelector((state) => state.settings.emotionPopupDuration);

  // Pops a character's portrait up center-screen for a moment whenever their
  // mood actually changes mid-conversation - distinct from dockedSprites
  // above (the at-rest "current mood" state). prevEmotionsRef's first pass
  // over a freshly-opened chat only *records* each character's starting
  // mood (the `prev !== undefined` check) so opening a chat doesn't fire a
  // popup burst for moods that were already set before this render.
  const prevEmotionsRef = useRef<Map<number, string>>(new Map());
  const popupSeqRef = useRef(0);
  const [popupTrigger, setPopupTrigger] = useState<EmotionPopupTrigger | null>(null);
  useEffect(() => {
    for (const sprite of dockedSprites) {
      if (sprite.characterId == null || !sprite.emotion) continue;
      const prevEmotion = prevEmotionsRef.current.get(sprite.characterId);
      if (emotionPopupEnabled && prevEmotion !== undefined && prevEmotion !== sprite.emotion) {
        popupSeqRef.current += 1;
        setPopupTrigger({ ...sprite, key: popupSeqRef.current });
      }
      prevEmotionsRef.current.set(sprite.characterId, sprite.emotion);
    }
  }, [dockedSprites, emotionPopupEnabled]);

  return (
    <>
    {/* overflow-clip, not hidden: a hidden box can still be scrolled by
        focus or scrollIntoView inside it, which shifted the chat up. */}
    <div className="relative h-full w-full flex overflow-clip">
      <div className="flex-1 min-w-0 relative flex flex-col overflow-clip" data-slot="chat-pane" data-room={isRoom ? "true" : undefined}>
        {(chatBackdrop || character?.appearanceImages?.[0]) && !terminal && (
          <>
            {/* The chat's own backdrop (#13) when it has one, otherwise the
                character's photo, both kept faint behind the bubbles. */}
            <div className={cn("absolute inset-0 pointer-events-none overflow-hidden", chatBackdrop ? "opacity-40" : "opacity-25")} data-slot="chat-backdrop" data-kind={chatBackdrop ? "backdrop" : "photo"}>
              <DisplayImage srcContext={(chatBackdrop || character?.appearanceImages?.[0])!} alt="" aria-hidden="true" className="w-full h-full object-cover" />
            </div>
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-background/60 via-background/80 to-background" data-slot="chat-backdrop-fade" data-kind={chatBackdrop ? "backdrop" : "photo"} />
          </>
        )}
        {/* Mood-tinted chat (#90): a soft colour from the latest mood. */}
        {moodTintOn && !terminal && (
          <div
            aria-hidden
            data-slot="mood-tint"
            data-mood={currentMood || "neutral"}
            className="absolute inset-0 pointer-events-none transition-[background-color] duration-[1500ms] motion-reduce:transition-none"
            style={{ backgroundColor: moodTint ? `rgb(${moodTint} / 0.10)` : "transparent" }}
          />
        )}
        {sceneTracker && <SceneStateStrip state={sceneState} terminal={terminal} meters={chatMeters} />}
        <div
          className="relative z-[1] flex-1 overflow-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          ref={scrollContainerRef}
          onScroll={handleScroll}
          // Focusable so keyboard and switch users can scroll the history even
          // where the bubbles have no buttons of their own (touch screens).
          // A labeled region rather than role="log", which would announce
          // every streamed chunk of a reply.
          tabIndex={0}
          role="region"
          aria-label="Messages"
        >
          <div
            ref={contentRef}
            className={terminal ? "max-w-[760px] px-4 md:px-[26px] py-5" : coWriting ? "max-w-2xl mx-auto px-5 md:px-8 pt-8 pb-32" : "max-w-[824px] mx-auto px-3 md:px-8 pt-3 pb-32"}
            // Room for the floating composer, sized to it rather than a fixed
            // pb-32 that a multi-line draft or the mode banners outgrew.
            style={!terminal && bottomInset > 0 ? { paddingBottom: bottomInset + 16 } : undefined}
          >
            {filteredMessages.length === 0 ? (
              <div className="flex flex-col items-center h-full w-full px-4 pt-10">
                <Card className="flex flex-col items-center text-center gap-3 w-full max-w-[440px] px-5 py-8">
                  <CharacterAvatar name={charInitials} accent={character?.accent} imageSrc={avatarOf(character)} size={64} className="text-2xl" />
                  <div>
                    <div className="text-[19px] font-bold tracking-tight text-foreground">{characterName || "New Conversation"}</div>
                    {character?.relationship && (
                      <Badge variant="outline" className="mt-1 max-w-full truncate border-primary/20 bg-primary/10 font-medium text-primary">
                        {character.relationship}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[13.5px] leading-relaxed text-muted-foreground">
                    {character?.description || "Send a message to get started."}
                  </p>
                </Card>
                {greetings.length > 0 && (
                  <Card className="w-full max-w-[560px] mt-4 px-5 py-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold">Opening scene</span>
                      {greetings.length > 1 && onSelectGreeting && (
                        <div className="flex items-center gap-2 text-xs text-subtle">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => onSelectGreeting((selectedGreeting - 1 + greetings.length) % greetings.length)}
                            aria-label="Previous greeting"
                          >
                            ‹
                          </Button>
                          <span className="tabular-nums">{selectedGreeting + 1}/{greetings.length}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => onSelectGreeting((selectedGreeting + 1) % greetings.length)}
                            aria-label="Next greeting"
                          >
                            ›
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="text-[13.5px] text-foreground max-h-[320px] overflow-auto">
                      <MarkdownRenderer msgText={greetings[selectedGreeting]} isUser={false} />
                    </div>
                    <p className="text-[11.5px] text-subtle">
                      {greetings.length > 1 ? "Pick an opening, then send your first message to start from it." : "The chat starts from this greeting when you send your first message."}
                    </p>
                  </Card>
                )}
                {/* Story script (#57): written before the roleplay starts. */}
                {onEditStory && (
                  storyScript && onMoveBeat ? (
                    <div className="w-full max-w-[560px] mt-4">
                      <StoryProgress script={storyScript} onMove={onMoveBeat} onEdit={onEditStory} terminal={terminal} />
                    </div>
                  ) : (
                    <Card className="w-full max-w-[560px] mt-4 px-5 py-4 flex flex-col items-start gap-2">
                      <span className="text-[11px] tracking-[0.1em] uppercase text-subtle font-semibold">Story script</span>
                      <p className="text-[13px] text-muted-foreground">Want the AI to follow a story of yours? Write the premise, the beats and your directions first, and every reply stays inside it.</p>
                      <Button type="button" variant="outline" size="sm" onClick={onEditStory}>Write the story</Button>
                    </Card>
                  )
                )}
              </div>
            ) : (
              filteredMessages.map((msg, i) => {
                const siblingInfo = tree && msg.id ? getSiblingInfo(tree, msg.id) : undefined;
                const speaker = resolveSpeaker(msg);
                // A false start (#108): nothing of the reply shows yet, only
                // the typing dots below.
                if (reveal && reveal.id === msg.id && reveal.shown === 0) return null;
                const beatText = beatStartIndexes.has(i) && storyScript ? storyScript.beats[(msg.beat || 1) - 1]?.text : undefined;
                const message = (
                  <React.Fragment key={msg.id || i}>
                  {unread && msg.id === unread.id && (
                    <div role="separator" aria-label={`${unread.count} unread ${unread.count === 1 ? "message" : "messages"}`} data-slot="unread-divider" className="my-3 flex justify-center">
                      <span className="rounded-full bg-raised px-3.5 py-1 text-[12px] font-semibold text-muted-foreground ring-1 ring-inset ring-border">
                        {unread.count} unread {unread.count === 1 ? "message" : "messages"}
                      </span>
                    </div>
                  )}
                  {beatText !== undefined && (
                    <div role="separator" aria-label={`Beat ${msg.beat}`} className="flex items-center gap-3 mt-5 mb-1.5 text-[12px] text-subtle">
                      <span className="h-px flex-1 bg-border" />
                      <span className="max-w-[70%] truncate"><span className="font-semibold uppercase tracking-[0.06em]">Beat {msg.beat}</span> · {beatText}</span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  <ChatMessage
                    msg={msg}
                    // In a group the chat's name isn't anyone's (#149: the
                    // first member showed the group's initials).
                    charInitials={speaker === character && !isRoom ? charInitials : getInitials(speaker?.name)}
                    speakerName={speaker?.name || characterName}
                    userName={userName}
                    accent={speaker?.accent}
                    avatarImageSrc={resolveEmotionPortrait(speaker, msg.emotion)}
                    aiLoading={aiLoading || false}
                    onCopy={handleCopyMessage}
                    onRegenerate={handleRegenerate}
                    onContinue={handleContinue}
                    isLastMessage={i === filteredMessages.length - 1}
                    onStartEdit={startEdit}
                    setFullscreenImage={setFullscreenImage}
                    siblingInfo={siblingInfo && siblingInfo.total > 1 ? siblingInfo : undefined}
                    onSwitchBranch={onSwitchBranch}
                    onDeleteBranch={onDeleteBranch}
                    onClearRefusal={onClearRefusal ? handleClearRefusal : undefined}
                    blurMedia={blurMedia}
                    chapterNumber={msg.chapterTitle ? chapterNumbers.get(msg.id || "") : undefined}
                    onToggleBookmark={onToggleBookmark}
                    onUndoSummary={onUndoSummary}
                    onTranslate={onTranslate}
                    documentView={coWriting}
                    onFork={onFork}
                    onInspect={handleInspect}
                    onReact={onReact}
                    onReply={onReply}
                    onViewOnce={onViewOnce}
                    onForward={setForwarding}
                    onVote={onVote}
                    onOpenContact={onOpenContact}
                    onAnswerInvite={onAnswerInvite}
                    stickerSrc={msg.sticker ? stickerFor(speaker, msg.sticker)?.image : undefined}
                    voterName={(v) => (v === "you" ? "You" : namesById[v] || "Someone")}
                    onInfo={msg.role === YOU && !msg.isNarration ? () => setInfoIndex(i) : undefined}
                    replyToName={msg.replyTo && typeof msg.replyTo.from === "number" ? namesById[msg.replyTo.from] : undefined}
                    texting={textingMode}
                    visibleParts={reveal && reveal.id === msg.id ? reveal.shown : undefined}
                    slips={msg.role === YOU ? undefined : speaker?.textingSlips}
                    userBurst={textingMode && msg.role !== YOU ? burstBefore(i) : undefined}
                    // Ticks on your messages in every theme (#149), the
                    // terminal's prompt lines aside.
                    // Sent after they blocked you (#133): one grey tick, ever.
                    receipt={!terminal && msg.role === YOU && !msg.isNarration ? (sentWhileBlocked({ blocked }, msg) ? "sent" : seenNoReply ? "read" : receiptFor(i, lastReplyIndex, filteredMessages.length - 1, Boolean(aiLoading))) : undefined}
                    runStart={runs.starts[i]}
                    runEnd={runs.ends[i]}
                    inRoom={Boolean(isRoom)}
                    disappears={disappearing && willDisappear({ disappearing }, msg) ? DISAPPEAR_LABEL[disappearing.after] : undefined}
                    reactions={reactionRows(msg, (id) => resolveReactor(id) || "They")}
                    voice={msg.role === YOU ? undefined : speaker?.voice}
                  />
                  {character && lettersAfter.get(i)?.map((letter) => (
                    <LetterCard
                      key={letter.id}
                      letter={letter}
                      from={character.name}
                      onRead={() => !letter.read && offscreenDispatch(updateCharacter({ ...character, letters: (character.letters || []).map((l) => (l.id === letter.id ? { ...l, read: true } : l)) }))}
                      onReply={onReplyToLetter ? () => onReplyToLetter(letter) : undefined}
                    />
                  ))}
                  {talksAfter.get(i)?.map((talk) => (
                    <OffscreenTalkCard key={talk.id} talk={talk} namesById={namesById} onSeen={() => chatId && markTalkSeen(talk.id)} />
                  ))}
                  </React.Fragment>
                );
                const suggestions = !aiLoading && i === filteredMessages.length - 1 && replySuggestions && replySuggestions.forMessageId === msg.id ? replySuggestions.items : undefined;
                if (suggestions && onPickSuggestion) {
                  return (
                    <React.Fragment key={msg.id || i}>
                      {message}
                      <div role="group" aria-label="Reply suggestions" className="flex flex-wrap justify-end gap-2 mt-4">
                        {suggestions.map((text) => (
                          <button
                            key={text}
                            type="button"
                            onClick={() => onPickSuggestion(text)}
                            className="min-h-8 px-3.5 py-1.5 rounded-full bg-raised ring-1 ring-inset ring-border text-[13px] font-medium text-foreground hover:ring-primary/50 text-left"
                          >
                            {text}
                          </button>
                        ))}
                      </div>
                    </React.Fragment>
                  );
                }
                // Already covered by the latest summary: still readable (and
                // editable), but no longer sent to the AI.
                return i < latestSummaryAt ? (
                  <div key={msg.id || i} className="opacity-60" title="Summarized below - no longer sent to the AI">
                    {message}
                  </div>
                ) : message;
              })
            )}
            {recap && !aiLoading && <RecapCard recap={recap} terminal={terminal} />}
            {/* Choice moments (#87): the newest reply's options; tap one to send it. */}
            {!aiLoading && onSend && (() => {
              const last = filteredMessages[filteredMessages.length - 1];
              if (!last || last.role === YOU || !last.choices?.length) return null;
              return (
                <div role="group" aria-label="Choices" className="flex flex-wrap justify-center gap-2 mt-4 mb-2">
                  {last.choices.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onSend(c.label)}
                      className="min-h-9 px-3.5 py-1.5 rounded-full bg-raised ring-1 ring-inset ring-border text-[13.5px] font-medium text-foreground hover:ring-primary/50 text-left"
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              );
            })()}
            {coWriting && onSuggestNext && !aiLoading && filteredMessages.length > 0 && !replySuggestions && (
              <div className="mb-6 flex justify-center">
                <Button type="button" variant="outline" size="sm" onClick={onSuggestNext}>What happens next?</Button>
              </div>
            )}
            {relationshipSuggestion && !aiLoading && onAcceptRelationship && onDismissRelationship && (
              <section aria-label="Relationship update" className={cn(terminal ? "mb-6 mx-auto max-w-xl px-4 py-3 font-sans text-sm border border-border" : "my-4 mx-auto max-w-xl px-4 py-3 font-sans text-sm rounded-card bg-raised ring-1 ring-inset ring-border shadow-bubble")}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-subtle mb-1">Your relationship has changed?</div>
                <p className="text-foreground">
                  {relationshipSuggestion.from ? <><span className="text-muted-foreground line-through">{relationshipSuggestion.from}</span>{" → "}</> : null}
                  <span className="font-medium">{relationshipSuggestion.to}</span>
                </p>
                <div className="mt-2 flex gap-2">
                  <Button type="button" size="sm" onClick={onAcceptRelationship}>Update</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={onDismissRelationship}>Keep as is</Button>
                </div>
              </section>
            )}
            {stageSuggestion && !aiLoading && onAcceptStage && onDismissStage && (
              <section aria-label="Relationship stage" className={cn(terminal ? "mb-6 mx-auto max-w-xl px-4 py-3 font-sans text-sm border border-border" : "my-4 mx-auto max-w-xl px-4 py-3 font-sans text-sm rounded-card bg-raised ring-1 ring-inset ring-border shadow-bubble")}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-subtle mb-1">Move to the next stage?</div>
                <p className="text-foreground">
                  <span className="text-muted-foreground line-through">{STAGE_LABELS[stageSuggestion.from]}</span>{" → "}<span className="font-medium">{STAGE_LABELS[stageSuggestion.to]}</span>
                </p>
                <div className="mt-2 flex gap-2">
                  <Button type="button" size="sm" onClick={onAcceptStage}>Move on</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={onDismissStage}>Not yet</Button>
                </div>
              </section>
            )}
            {arcSuggestion && !aiLoading && onAcceptArc && onDismissArc && (
              <section aria-label="Character growth" className={cn(terminal ? "mb-6 mx-auto max-w-xl px-4 py-3 font-sans text-sm border border-border" : "my-4 mx-auto max-w-xl px-4 py-3 font-sans text-sm rounded-card bg-raised ring-1 ring-inset ring-border shadow-bubble")}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-subtle mb-1">{characterName || "They"} has changed?</div>
                <p className="text-foreground">{arcSuggestion}</p>
                <div className="mt-2 flex gap-2">
                  <Button type="button" size="sm" onClick={onAcceptArc}>Keep this</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={onDismissArc}>Not really</Button>
                </div>
              </section>
            )}
            {game && onEndGame && (
              <GameProgress game={game} score={gameScore} characterName={characterName || "them"} onEnd={onEndGame} terminal={terminal} />
            )}
            {storyScript && filteredMessages.length > 0 && onMoveBeat && onEditStory && (
              <StoryProgress script={storyScript} onMove={onMoveBeat} onEdit={onEditStory} terminal={terminal} />
            )}
            {terminal ? (
              aiLoading ? (
                <TerminalCursorLine name={characterName} note={recordingVoiceNote ? "recording audio..." : undefined} />
              ) : awayNote || isFollowupPending ? (
                <TerminalCursorLine name={characterName} note={awayNote || "thinking of reaching out..."} />
              ) : seenNoReply ? (
                <TerminalCursorLine name={characterName} note={LEFT_ON_READ_NOTE} />
              ) : null
            ) : aiLoading && streamingText && !textingMode && !recordingVoiceNote ? (
              <StreamingBubble text={streamingText} charInitials={charInitials} accent={character?.accent} imageSrc={currentEmotionImageSrc} showAvatar={isRoom} />
            ) : aiLoading || (reveal && reveal.phase !== "paused") ? (
              <TypingIndicator charInitials={charInitials} accent={character?.accent} imageSrc={currentEmotionImageSrc} recording={aiLoading && recordingVoiceNote} showAvatar={isRoom} />
            ) : awayNote || isFollowupPending ? (
              <FollowupIndicator charInitials={charInitials} accent={character?.accent} imageSrc={currentEmotionImageSrc} note={awayNote || undefined} showAvatar={isRoom} />
            ) : seenNoReply ? (
              <FollowupIndicator charInitials={charInitials} accent={character?.accent} imageSrc={currentEmotionImageSrc} note={LEFT_ON_READ_NOTE} showAvatar={isRoom} />
            ) : null}
            <div ref={chatEndRef} />
          </div>
        </div>
        <PromptInspectorDialog isOpen={inspectText != null} onClose={() => setInspectText(null)} replyText={inspectText ?? undefined} />
        {isScrolledUp && (
          <Button
            onClick={() => {
              setIsScrolledUp(false);
              scrollToEnd("smooth");
            }}
            size="icon"
            // Sits just above the composer, wherever its measured top is,
            // instead of a fixed offset a tall composer covered.
            className="absolute right-4 md:right-6 z-30 h-11 w-11 rounded-full shadow-lg hover:scale-105 opacity-80 hover:opacity-100"
            style={{ bottom: (bottomInset > 0 ? bottomInset : 24) + 12 }}
            title="Scroll to bottom"
            aria-label="Scroll to bottom"
          >
            <FaArrowDown size={16} />
          </Button>
        )}
      </div>

      {emotionPanelEnabled && dockedSprites.length > 0 && (
        <EmotionSpritePanel sprites={dockedSprites} blurred={blurMedia} onClose={() => dispatch(setEmotionPanelEnabled(false))} />
      )}
      {/* A full-screen mood flash is exactly what a blurred-media user doesn't want. */}
      {!blurMedia && <EmotionPopup trigger={popupTrigger} durationMs={emotionPopupDuration} />}

      {sceneOpen && chatId != null && (
        <ScenePanel
          chatId={chatId}
          character={character}
          isRoom={isRoom}
          chatMemory={chatMemory}
          chatPinnedMemory={chatPinnedMemory}
          hardLimits={hardLimits}
          intensity={intensity}
          isNsfwChat={isNsfwChat}
          chatScenario={chatScenario}
          authorNote={authorNote}
          worldTags={worldTags}
          onEditStory={onEditStory}
          hasStoryScript={Boolean(storyScript)}
          onClose={onCloseScene || (() => {})}
        />
      )}

      {contactOpen && chatId != null && character && !isRoom && (
        <ContactInfoPanel
          chatId={chatId}
          character={character}
          isRoom={false}
          chatMemory={chatMemory}
          chatPinnedMemory={chatPinnedMemory}
          intensity={intensity}
          onClose={onCloseContact || (() => {})}
        />
      )}

      {participantsOpen && chatId != null && characters && characters.length > 0 && (
        <ParticipantsPanel
          chatId={chatId}
          characters={characters}
          allCharacters={allCharacters}
          mutedParticipantIds={mutedParticipantIds}
          title={chatTitle}
          onClose={onCloseParticipants || (() => {})}
        />
      )}
    </div>

      {/* Full Screen Edit Modal */}
      <Dialog open={editingIndex !== null} onOpenChange={(open) => !open && cancelEdit()}>
        <DialogContent size="lg" className="h-[80vh] md:h-[70vh] p-0">
          <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
            <DialogTitle asChild>
              <h3 className="text-lg font-semibold text-foreground">Edit Message</h3>
            </DialogTitle>
            <DialogClose asChild>
              <Button variant="ghost" size="icon" className="h-auto w-auto p-2 -m-2 rounded-full text-muted-foreground hover:bg-background hover:text-foreground">
                <FaTimes size={18} />
              </Button>
            </DialogClose>
          </div>

          <div className="flex-1 p-4 md:p-6 overflow-hidden flex flex-col">
            <textarea
              ref={(el) => { if (el) el.focus() }}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="flex-1 w-full p-4 rounded-md border border-border bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none text-base disabled:opacity-50"
              placeholder="Type your message here..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  saveEdit();
                }
              }}
            />
            <div className="mt-2 text-xs text-muted-foreground flex flex-col sm:flex-row sm:justify-between gap-1">
              <span>Markdown is supported.</span>
              <span className="hidden sm:inline"><kbd className="bg-muted px-1.5 py-0.5 rounded">Enter</kbd> to save, <kbd className="bg-muted px-1.5 py-0.5 rounded">Shift+Enter</kbd> for new line, <kbd className="bg-muted px-1.5 py-0.5 rounded">Esc</kbd> to cancel</span>
            </div>
          </div>

          <div className="p-4 border-t border-border flex flex-col sm:flex-row justify-between gap-3 bg-background items-stretch sm:items-center flex-shrink-0">
            <div className="flex gap-4">
              <ToggleSwitch
                checked={editIsImageRequest}
                onChange={(v) => { setEditIsImageRequest(v); if (v) setEditIsVideoRequest(false); }}
                title="Request image generation"
                label="Generate Image"
              />
              {isVideoGenAvailable && (
                <ToggleSwitch
                  checked={editIsVideoRequest}
                  onChange={(v) => { setEditIsVideoRequest(v); if (v) setEditIsImageRequest(false); }}
                  title="Request video generation"
                  label="Generate Video"
                />
              )}
            </div>

            <div className="flex gap-3">
              <Button
                onClick={cancelEdit}
                variant="ghost"
                className="flex-1 sm:flex-none h-auto px-5 py-2.5 font-medium text-muted-foreground hover:bg-muted"
              >
                Cancel
              </Button>
              <Button
                onClick={saveEdit}
                disabled={!editText.trim()}
                className="flex-1 sm:flex-none h-auto px-5 py-2.5 font-medium shadow-sm"
              >
                <FaCheck size={14} />
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ForwardDialog message={forwarding} onClose={() => setForwarding(null)} />

      {/* Message info (#121): sent, delivered and read times - the canvas's
          layout (#156): the message on the chat's background, then who read
          it and when it was delivered. */}
      <Dialog open={info != null} onOpenChange={(open) => !open && setInfoIndex(null)}>
        <DialogContent size="sheet" className="bg-surface px-0">
          <DialogTitle className="px-4 pb-1 text-[17px]">Message info</DialogTitle>
          {info && infoIndex != null && (
            <div className="flex min-h-0 flex-col overflow-y-auto font-sans">
              <div className="border-b border-border bg-background px-3 pb-5 pt-4">
                <div className="ml-auto w-fit max-w-[85%] rounded-bubble rounded-tr-[5px] bg-bubble-out px-3 py-2 font-serif text-[15px] leading-[22px] text-bubble-out-text line-clamp-4">{filteredMessages[infoIndex]?.txt}</div>
              </div>
              <div className="flex flex-col gap-4 px-4 py-5">
                {filteredMessages[infoIndex]?.timestamp && (
                  <span className="text-[12px] text-subtle">In {characterName || "this chat"} · {new Date(filteredMessages[infoIndex].timestamp!).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</span>
                )}
                <ul aria-label="Read by" className="flex flex-col rounded-card bg-card px-4 py-1 ring-1 ring-inset ring-border">
                  {info.reads.map((r, k) => (
                    <li key={k} className="flex min-h-[52px] items-center gap-3 [&+&]:border-t [&+&]:border-border">
                      <span aria-hidden data-slot="ticks" data-state={r.readAt ? "read" : "sent"} className={cn("w-5 tracking-[-0.2em] font-semibold", r.readAt ? "text-primary" : "text-subtle")}>✓✓</span>
                      <span className="flex-1 text-[15px] font-semibold text-foreground">{info.reads.length > 1 ? namesById[r.speakerId ?? -1] || "Someone" : "Read"}</span>
                      <span className="text-[13.5px] tabular-nums text-muted-foreground">{r.readAt ? timeLabel(r.readAt) : "Not yet"}</span>
                    </li>
                  ))}
                  <li className="flex min-h-[52px] items-center gap-3 border-t border-border">
                    <span aria-hidden className="w-5 tracking-[-0.2em] font-semibold text-subtle">✓✓</span>
                    <span className="flex-1 text-[15px] font-semibold text-foreground">Delivered</span>
                    <span className="text-[13.5px] tabular-nums text-muted-foreground">{info.deliveredAt ? timeLabel(info.deliveredAt) : ""}</span>
                  </li>
                </ul>
                <p className="text-center text-[12px] text-subtle">Read receipts follow each character's texting habits. Someone who leaves you on read shows as read with no reply.</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Fullscreen Image Modal */}
      <Dialog open={fullscreenImage !== null} onOpenChange={(open) => !open && setFullscreenImage(null)}>
        <DialogContent size="full">
          <DialogTitle asChild>
            <span className="sr-only">Fullscreen image</span>
          </DialogTitle>
          <DialogClose asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 h-auto w-auto p-3 rounded-full text-white/70 hover:bg-black/80 hover:text-white bg-black/50 z-10"
              title="Close"
            >
              <FaTimes size={20} />
            </Button>
          </DialogClose>
          {fullscreenImage && (
            <DisplayImage
              srcContext={fullscreenImage}
              alt="Fullscreen"
              className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ChatWindow;
