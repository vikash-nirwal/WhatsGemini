import React, { useCallback, useRef, useState } from "react";
import { useColorTheme } from "../../hooks/useColorTheme";
import { FaReply, FaShare, FaInfoCircle, FaCopy, FaRedo, FaEdit, FaChevronLeft, FaChevronRight, FaTrash, FaCompressArrowsAlt, FaForward, FaMask, FaBookmark, FaStar, FaCode, FaVolumeUp, FaStop, FaLanguage, FaCodeBranch, FaEllipsisH } from "react-icons/fa";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "src/components/molecules/dropdown-menu";
import { motion } from "framer-motion";
import { cn } from "../../utils/cn";
import { CharacterVoice, Message } from "../../types";
import { YOU } from "../../utils/constants";
import { stripImageContextTag } from "../../features/ai/utils/imageGeneration";
import MarkdownRenderer from "src/components/molecules/MarkdownRenderer";
import { Dialog, DialogContent, DialogTitle } from "src/components/molecules/dialog";
import { DisplayImage } from "src/components/molecules/DisplayImage";
import { DisplayVideo } from "src/components/molecules/DisplayVideo";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { PollCard } from "src/components/molecules/PollCard";
import { Button } from "src/components/atoms/button";
import { Card, CardContent } from "src/components/atoms/card";
import { TermLink } from "src/components/atoms/TermLink";
import { NsfwBlur } from "src/components/molecules/NsfwBlur";
import { InnerThoughts, ReactionBadge, ReactionPicker, ReactionRow } from "src/components/molecules/MessageExtras";
import { REACTION_EMOJIS } from "src/features/ai/utils/messageTags";
import { splitIntoTexts } from "../../features/ai/utils/textingMode";
import { planSlips, SlipLevel } from "../../features/ai/utils/textingSlips";
import { NOTE_LABELS } from "../../features/chat/storyTags";
import { VoiceNote } from "src/components/molecules/VoiceNote";
import { isSpeechSupported, speak, stopSpeaking, toSpokenText } from "../../features/voice/speech";
import { useSpeakingFor } from "../../features/voice/useSpeech";

interface SiblingInfo {
  index: number;
  total: number;
  siblingIds: string[];
}

interface ChatMessageProps {
  msg: Message;
  charInitials: string;
  // Full names for the terminal theme's `[name@session]$` prompt lines.
  speakerName?: string;
  userName?: string;
  accent?: [string, string];
  avatarImageSrc?: string;
  aiLoading: boolean;
  onCopy: (text: string) => void;
  onRegenerate: (msg: Message) => void;
  onContinue?: (msg: Message) => void;
  isLastMessage?: boolean;
  onStartEdit: (msg: Message) => void;
  setFullscreenImage: (src: string) => void;
  siblingInfo?: SiblingInfo;
  onSwitchBranch?: (nodeId: string) => void;
  onDeleteBranch?: (nodeId: string) => void;
  onClearRefusal?: (msg: Message) => void;
  blurMedia?: boolean; // Privacy > Blur NSFW images, for a chat with an NSFW character
  chapterNumber?: number; // for a summary made by "End chapter": its position among the chapters
  onToggleBookmark?: (msg: Message) => void; // star / unstar (#21)
  onUndoSummary?: (msg: Message) => void; // take a compression or chapter back out
  onTranslate?: (msg: Message) => void; // language practice (#67)
  documentView?: boolean; // co-writing mode (#68): a paragraph of the shared story
  onFork?: (msg: Message) => void; // start a new chat from this message (#86)
  onInspect?: (msg: Message) => void; // "Show what was sent" for an AI reply (#31)
  onReact?: (msg: Message, emoji: string) => void; // your emoji reaction to a reply (#11)
  onReply?: (msg: Message) => void; // quote it in your next message (#119)
  replyToName?: string; // who wrote the message this one quotes (#119)
  onInfo?: () => void; // message info for one of yours (#121)
  onViewOnce?: (msg: Message) => void; // a view-once photo was opened (#122)
  onForward?: (msg: Message) => void; // pass it on to another chat (#123)
  onVote?: (msg: Message, option: number) => void; // your vote in a poll (#124)
  voterName?: (voter: "you" | number) => string; // names on a poll's votes (#124)
  onOpenContact?: (msg: Message) => void; // message a shared contact (#128)
  reactorName?: string; // who left msg.characterReaction, for its label
  // Texting mode (#6): show a reply as several bubbles. visibleParts limits
  // how many are shown while a new reply is being revealed; receipt is the
  // read tick on your own messages.
  texting?: boolean;
  visibleParts?: number;
  receipt?: "sent" | "read";
  // Texting imperfections (#108): how sloppily the speaker texts, and the
  // run of your messages this reply answers, for a quoted reply.
  slips?: SlipLevel;
  userBurst?: string[];
  voice?: CharacterVoice; // the speaker's voice, for "Read aloud" and voice notes (#12, #44)
  // Bubbles group by sender (#149): runStart is the first message of a run
  // from the same sender (more space above it; in a group, the speaker's
  // avatar and name), runEnd the last (its corner on the sender's side
  // tightens into a tail). inRoom: a group chat, where avatars show.
  runStart?: boolean;
  runEnd?: boolean;
  inRoom?: boolean;
}

// The chat's text size. `data-chat-text` lets a reading font or line
// spacing (reading comfort, #91) override the theme's in tokens.css, only
// when one is chosen.
const CHAT_TEXT_STYLE: React.CSSProperties = { fontSize: "var(--chat-font-size, 16px)" };

// Shown under a reply flagged as an out-of-character refusal (see
// looksLikeRefusal) - it's kept on screen but left out of the AI's context.
// A user line written as an out-of-character direction - (OOC: ...) or
// ((...)) - which the model is told to follow rather than treat as speech.
const OOC_PATTERN = /^\s*(?:\(\(|\(\s*ooc\b|\[\s*ooc\b)/i;

const RefusalNotice = ({ onRegenerate, onClear, disabled }: { onRegenerate: () => void; onClear?: () => void; disabled: boolean }) => (
  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-foreground">
    <span className="flex-1 min-w-[180px]">Looks like the model refused. This reply is hidden from the AI's context so it doesn't keep refusing.</span>
    <button type="button" onClick={onRegenerate} disabled={disabled} className="font-medium text-primary hover:underline disabled:opacity-50">Regenerate</button>
    {onClear && <button type="button" onClick={onClear} className="font-medium text-subtle hover:underline">Not a refusal</button>}
  </div>
);

// How long a press on a message has to last before its action sheet opens.
const LONG_PRESS_MS = 450;
// Finger movement (px) that turns a press into a scroll and cancels it.
const LONG_PRESS_SLOP = 10;
// Touch screens have no hover, so the hover-revealed action row would only
// leave an empty strip in every bubble; there it's hidden and long-press
// opens an action sheet instead.
const TOUCH_ONLY = "(hover: none)";

// A quoted reply (#108, #119): the message this one answers, the way
// messaging apps show it above the text. #149: the canvas's quote card, an
// accent bar beside the name and two lines of the quoted text.
const QuoteCard = ({ name, text, label, slot }: { name: string; text: string; label: string; slot: string }) => (
  <div data-slot={slot} className="mb-1.5 flex overflow-hidden rounded-[10px] bg-foreground/[0.07] font-sans" aria-label={label}>
    <span aria-hidden className="w-[3px] flex-none bg-primary" />
    <span className="min-w-0 px-2.5 py-1.5">
      <span className="block text-[12.5px] font-semibold leading-[17px] text-primary-text">{name}</span>
      <span className="line-clamp-2 text-[13px] leading-[18px] opacity-80">{text}</span>
    </span>
  </div>
);

const QuotedMessage = ({ text, name = "You" }: { text: string; name?: string }) => (
  <QuoteCard slot="quoted-message" name={name} text={text} label={`Replying to: ${text}`} />
);

// A reply to a status (#117, #129): the status quoted above the text, like
// WhatsApp's "Status" card.
const QuotedStatus = ({ quoted, ownerName }: { quoted: NonNullable<Message["quotedStatus"]>; ownerName: string }) => (
  <QuoteCard
    slot="quoted-status"
    name={`${ownerName} · Status`}
    text={`${quoted.photo ? "📷 " : ""}${quoted.text || "Photo"}`}
    label={`Replying to ${ownerName === "You" ? "your" : `${ownerName}'s`} status: ${quoted.text || "a photo"}`}
  />
);

// The time, the ticks on your own messages and a regenerated reply's 2/3
// pager, at the bubble's bottom edge (#149), in every theme but terminal.
const formatTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const Ticks = ({ state }: { state: "sent" | "read" }) => (
  <svg data-slot="ticks" data-state={state} aria-hidden viewBox="0 0 24 24" className={cn("h-4 w-4 flex-none", state === "read" ? "text-tick-read" : "text-tick")} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
    {state === "read" ? <path d="M2 13l4 4L16 7M10 15l2 2L22 7" /> : <path d="m5 12 4 4 10-10" />}
  </svg>
);

const ChatMessage = React.memo(({
  msg,
  charInitials,
  speakerName,
  userName,
  accent,
  avatarImageSrc,
  aiLoading,
  onCopy,
  onRegenerate,
  onContinue,
  isLastMessage,
  onStartEdit,
  setFullscreenImage,
  siblingInfo,
  onSwitchBranch,
  onDeleteBranch,
  onClearRefusal,
  blurMedia = false,
  chapterNumber,
  onToggleBookmark,
  onUndoSummary,
  onTranslate,
  documentView = false,
  onFork,
  onInspect,
  onReact,
  onReply,
  replyToName,
  onInfo,
  onViewOnce,
  onForward,
  onVote,
  voterName,
  onOpenContact,
  reactorName,
  texting = false,
  visibleParts,
  receipt,
  slips,
  userBurst,
  voice,
  runStart = true,
  runEnd = true,
  inRoom = false,
}: ChatMessageProps) => {
  const isUser = msg.role === YOU;
  const { is } = useColorTheme();
  const neumorphic = is("neumorphic");
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [termReactOpen, setTermReactOpen] = useState(false);

  const handleCopy = useCallback(() => onCopy(stripImageContextTag(msg.txt || "")), [onCopy, msg.txt]);
  const handleRegenerate = useCallback(() => onRegenerate(msg), [onRegenerate, msg]);
  const handleContinue = useCallback(() => onContinue?.(msg), [onContinue, msg]);
  const handleClearRefusal = useCallback(() => onClearRefusal?.(msg), [onClearRefusal, msg]);
  const oocLabel = isUser && OOC_PATTERN.test(msg.txt || "") ? (
    <span className="inline-block mb-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-muted text-muted-foreground" title="Out-of-character direction: the AI follows it instead of treating it as dialogue">
      OOC
    </span>
  ) : null;
  const refusalNotice = !isUser && msg.isRefusal ? (
    <RefusalNotice onRegenerate={handleRegenerate} onClear={onClearRefusal ? handleClearRefusal : undefined} disabled={aiLoading} />
  ) : null;
  const handleEdit = useCallback(() => onStartEdit(msg), [onStartEdit, msg]);
  const handleDeleteBranch = useCallback(() => msg.id && onDeleteBranch?.(msg.id), [onDeleteBranch, msg.id]);
  const handleToggleBookmark = useCallback(() => onToggleBookmark?.(msg), [onToggleBookmark, msg]);
  const handleInspect = useCallback(() => onInspect?.(msg), [onInspect, msg]);
  // Only a real generation has a request behind it.
  const canInspect = Boolean(onInspect && !isUser && !msg.isImpersonated);
  const bookmarkLabel = msg.bookmarked ? "Unstar" : "Star";
  const handleReact = useCallback((emoji: string) => onReact?.(msg, emoji), [onReact, msg]);
  const canReply = Boolean(onReply && msg.id && !msg.isNarration && !msg.isRoomEvent && !msg.isCompressionSummary);
  // View-once photos (#122): a pill instead of the picture; opening it shows
  // it full screen once, then only "Opened" is left.
  const viewOnceBadge = msg.viewOnce ? (
    msg.viewedOnce || !msg.images?.length ? (
      <div data-slot="view-once" data-state="opened" className="mt-1.5 inline-flex h-9 items-center gap-2 rounded-[18px] pl-2.5 pr-3.5 font-sans text-[13.5px] font-semibold text-subtle ring-1 ring-inset ring-border-strong">
        <span aria-hidden>◌</span> Opened
      </div>
    ) : (
      <button
        type="button"
        data-slot="view-once"
        onClick={() => { setFullscreenImage(msg.images![0]); onViewOnce?.(msg); }}
        className="mt-1.5 inline-flex h-9 items-center gap-2 rounded-[18px] bg-primary/[0.14] pl-2.5 pr-3.5 font-sans text-[13.5px] font-semibold text-primary-text"
      >
        <span aria-hidden>①</span> Photo · view once
      </button>
    )
  ) : null;
  const handleReply = useCallback(() => onReply?.(msg), [onReply, msg]);
  // Fork into a new chat (#86): from any real message.
  const canFork = Boolean(onFork && msg.id && !msg.isSystem);
  const handleFork = useCallback(() => onFork?.(msg), [onFork, msg]);
  const canReact = Boolean(onReact && !isUser && msg.id);
  // "Read aloud" (#12) on a character's reply; a voice note has its own
  // play button instead. It's a stop button while that reply is speaking.
  const speaking = Boolean(useSpeakingFor(msg.id));
  const canReadAloud = !isUser && !msg.isVoiceNote && Boolean(msg.id) && isSpeechSupported();
  const readAloudLabel = speaking ? "Stop reading" : "Read aloud";
  const handleReadAloud = useCallback(() => {
    if (!msg.id) return;
    if (speaking) stopSpeaking();
    else speak(msg.id, toSpokenText(msg.txt || ""), voice, undefined, msg.emotion);
  }, [speaking, msg.id, msg.txt, msg.emotion, voice]);
  const voiceNote = msg.isVoiceNote && msg.id ? <VoiceNote id={msg.id} text={stripImageContextTag(msg.txt || "")} voice={voice} isUser={isUser} terminal={is("terminal")} emotion={isUser ? undefined : msg.emotion} /> : null;
  // Texting mode splits a reply into its texts; one text stays a normal
  // bubble, and so does a voice note.
  const splitParts = texting && !isUser && !msg.isVoiceNote && !msg.isImpersonated && !msg.isCompressionSummary && !msg.isRoomEvent && !msg.isNarration
    ? splitIntoTexts(stripImageContextTag(msg.txt || ""))
    : [];
  // Texting imperfections (#108): the odd typo and correction, a deleted
  // message, a quote - decided from the message's id, so the look is stable.
  const bubbles = planSlips(splitParts, msg.id || "", slips, userBurst).bubbles;
  const textParts = bubbles.length > 1 ? bubbles : null;
  const shownParts = textParts ? Math.min(visibleParts ?? textParts.length, textParts.length) : 0;
  const showMainBubble = !textParts || shownParts === textParts.length;
  const mainQuote = !textParts ? bubbles[0]?.quote : undefined;
  const thoughtsBlock = !isUser && msg.thoughts ? <InnerThoughts thoughts={msg.thoughts} terminal={is("terminal")} /> : null;
  // Language practice (#67): a correction under your message, a translation
  // under a reply once asked for.
  const [translating, setTranslating] = useState(false);
  const canTranslate = Boolean(onTranslate && !isUser && msg.id && msg.txt && !msg.isCompressionSummary);
  const handleTranslate = useCallback(async () => {
    if (!onTranslate) return;
    setTranslating(true);
    try {
      await onTranslate(msg);
    } finally {
      setTranslating(false);
    }
  }, [onTranslate, msg]);
  const languageBlock = isUser && msg.correction ? (
    <div className="mt-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 font-sans text-[12px] text-foreground" aria-label="Correction">
      <span aria-hidden>✏️ </span>{msg.correction}
    </div>
  ) : !isUser && (msg.translation || translating) ? (
    <div className="mt-1.5 border-t border-border/50 pt-1.5 font-sans text-[12.5px] text-muted-foreground" aria-label="Translation">
      {translating && !msg.translation ? "Translating..." : msg.translation}
    </div>
  ) : null;

  // Secrets (#81) and the other story notes (#93-#100): a pill under the
  // reply where a secret came out, a dream was told, a fight started...
  const notePills = [
    ...(!isUser && msg.secretRevealed ? [{ key: "secret", emoji: "🤫", text: "A secret came out" }] : []),
    ...(!isUser ? (msg.notes || []).map((n) => ({ key: n, ...NOTE_LABELS[n] })) : []),
  ];
  const secretNote = notePills.length > 0 ? (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {notePills.map((n) => (
        <span key={n.key} className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-sans text-[11.5px] text-foreground" data-slot={n.key === "secret" ? "secret-note" : "story-note"}>
          <span aria-hidden>{n.emoji}</span> {n.text}
        </span>
      ))}
    </div>
  ) : null;

  // Long-press (touch) or the browser's own long-press/context-menu gesture
  // opens the action sheet. Moving the finger cancels it, so scrolling past a
  // message never opens it.
  const [actionsOpen, setActionsOpen] = useState(false);
  const pressRef = useRef<{ timer: number; x: number; y: number } | null>(null);
  // Swipe right to reply (#119), like WhatsApp: a mostly sideways drag.
  const swipeRef = useRef<{ x: number; y: number; done: boolean } | null>(null);
  const [swipeX, setSwipeX] = useState(0);
  const cancelPress = useCallback(() => {
    if (pressRef.current) window.clearTimeout(pressRef.current.timer);
    pressRef.current = null;
  }, []);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    cancelPress();
    if (e.touches.length !== 1) return;
    const { clientX, clientY } = e.touches[0];
    swipeRef.current = { x: clientX, y: clientY, done: false };
    pressRef.current = {
      x: clientX,
      y: clientY,
      timer: window.setTimeout(() => {
        pressRef.current = null;
        navigator.vibrate?.(10);
        setActionsOpen(true);
      }, LONG_PRESS_MS),
    };
  }, [cancelPress]);
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const press = pressRef.current;
    const touch = e.touches[0];
    if (press && touch && Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > LONG_PRESS_SLOP) cancelPress();
    const swipe = swipeRef.current;
    if (swipe && touch && canReply && !swipe.done) {
      const dx = touch.clientX - swipe.x;
      const dy = Math.abs(touch.clientY - swipe.y);
      if (dy > 30) swipeRef.current = null;
      else if (dx > 0) {
        setSwipeX(Math.min(dx, 72));
        if (dx > 64) {
          swipe.done = true;
          navigator.vibrate?.(10);
          handleReply();
        }
      }
    }
  }, [cancelPress, canReply, handleReply]);
  const endSwipe = useCallback(() => {
    swipeRef.current = null;
    setSwipeX(0);
  }, []);
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    // Only on touch screens; a mouse right-click keeps the browser's menu.
    if (!window.matchMedia?.(TOUCH_ONLY).matches) return;
    e.preventDefault();
    cancelPress();
    setActionsOpen(true);
  }, [cancelPress]);

  const sheetActions: { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; onSelect: () => void; disabled?: boolean; danger?: boolean }[] = [
    ...(canReply ? [{ label: "Reply", icon: FaReply, onSelect: handleReply }] : []),
    { label: "Copy", icon: FaCopy, onSelect: handleCopy },
    ...(onInfo && isUser ? [{ label: "Info", icon: FaInfoCircle, onSelect: onInfo }] : []),
    ...(onForward && canReply ? [{ label: "Forward", icon: FaShare, onSelect: () => onForward(msg) }] : []),
    ...(!isUser && !msg.isImpersonated ? [{ label: "Regenerate", icon: FaRedo, onSelect: handleRegenerate, disabled: aiLoading }] : []),
    ...(!isUser && !msg.isImpersonated && isLastMessage && onContinue ? [{ label: "Continue", icon: FaForward, onSelect: handleContinue, disabled: aiLoading }] : []),
    ...(canReadAloud ? [{ label: readAloudLabel, icon: speaking ? FaStop : FaVolumeUp, onSelect: handleReadAloud }] : []),
    { label: "Edit", icon: FaEdit, onSelect: handleEdit, disabled: isUser && aiLoading },
    ...(onToggleBookmark ? [{ label: bookmarkLabel, icon: FaStar, onSelect: handleToggleBookmark }] : []),
    ...(canInspect ? [{ label: "Show what was sent", icon: FaCode, onSelect: handleInspect }] : []),
    ...(canTranslate ? [{ label: "Translate", icon: FaLanguage, onSelect: handleTranslate, disabled: translating }] : []),
    ...(canFork ? [{ label: "Start a new chat from here", icon: FaCodeBranch, onSelect: handleFork, disabled: aiLoading }] : []),
    ...(onDeleteBranch ? [{ label: siblingInfo ? "Delete this variant" : "Delete message", icon: FaTrash, onSelect: handleDeleteBranch, disabled: aiLoading, danger: true }] : []),
  ];
  const actionSheet = (
    <Dialog open={actionsOpen} onOpenChange={setActionsOpen}>
      <DialogContent aria-describedby={undefined} size="sheet">
        <DialogTitle className="sr-only">Message actions</DialogTitle>
        {canReact && <ReactionRow current={msg.reaction} onPick={(emoji) => { setActionsOpen(false); handleReact(emoji); }} />}
        {/* Scrolls inside the sheet when the actions outgrow a short screen. */}
        <div role="menu" aria-label="Message actions" className="flex flex-col max-h-[65dvh] overflow-y-auto">
          {sheetActions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              onClick={() => { setActionsOpen(false); action.onSelect(); }}
              className={cn(
                "flex items-center gap-3 px-4 py-3.5 rounded-xl text-left text-[15px] font-sans disabled:opacity-50",
                action.danger ? "text-destructive hover:bg-destructive/10" : "text-foreground hover:bg-raised"
              )}
            >
              <action.icon size={15} className="flex-shrink-0" />
              {action.label}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );

  // Co-writing mode (#68): one paragraph of the shared story, with its
  // author and a few small actions under it.
  if (documentView && !msg.isCompressionSummary && !msg.isRoomEvent) {
    const linkClass = "hover:text-foreground hover:underline disabled:opacity-50";
    return (
      <div className="group relative mb-5" data-slot="story-paragraph">
        <div
          className={cn("font-serif leading-[1.75] text-foreground", isUser && "border-l-2 border-primary/50 pl-3")}
          data-chat-text
          style={CHAT_TEXT_STYLE}
        >
          <MarkdownRenderer msgText={stripImageContextTag(msg.txt || "")} isUser={false} />
        </div>
        <div className="mt-1 flex items-center gap-3 font-sans text-[11px] text-subtle md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <span>{isUser ? userName?.trim() || "You" : speakerName || charInitials}</span>
          <button type="button" className={linkClass} onClick={handleEdit} disabled={isUser && aiLoading}>Edit</button>
          {!isUser && !msg.isImpersonated && <button type="button" className={linkClass} onClick={handleRegenerate} disabled={aiLoading}>Rewrite</button>}
          {onDeleteBranch && <button type="button" className={cn(linkClass, "hover:text-destructive")} onClick={handleDeleteBranch} disabled={aiLoading}>Delete</button>}
        </div>
      </div>
    );
  }

  if (is("terminal")) {
    if (msg.isRoomEvent) {
      return <div className="mb-4 text-[12px] text-muted-foreground"># {msg.txt}</div>;
    }
    if (msg.isNarration) {
      return <div className="mb-5 text-[13px] italic text-muted-foreground">~ {msg.txt}</div>;
    }
    if (msg.isCompressionSummary) {
      return (
        <div className="mb-4 border border-border p-3">
          <div className="text-[10px] font-bold text-ring mb-1.5">
            {msg.chapterTitle ? `# ${msg.episodeTeaser ? "episode" : "chapter"} ${chapterNumber ?? ""}: ${msg.chapterTitle}`.replace("  ", " ") : "# compressed history"}
          </div>
          {msg.episodeTeaser && <div className="mb-1.5 text-xs italic text-foreground">next time on... {msg.episodeTeaser}</div>}
          <div className={cn("text-xs text-muted-foreground", !isSummaryExpanded && "line-clamp-3")}>
            <MarkdownRenderer msgText={!isSummaryExpanded && msg.chapterRecap ? msg.chapterRecap : msg.txt || ""} isUser={false} />
          </div>
          <TermLink
            label={isSummaryExpanded ? "less" : "more"}
            onClick={() => setIsSummaryExpanded((v) => !v)}
            aria-expanded={isSummaryExpanded}
            className="mt-2"
          />
          {onUndoSummary && <TermLink label="undo" onClick={() => onUndoSummary(msg)} className="mt-2 ml-3" />}
        </div>
      );
    }
    const prompt = isUser
      ? `[you@${(userName?.trim() || "you").toLowerCase()}]$`
      : `[${speakerName || charInitials}@session]$`;
    return (
      <motion.div
        className="mb-5 group"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
      >
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
          <span className={cn("font-bold text-[13px]", isUser ? "text-ring" : "text-foreground")}>{prompt}</span>
          {msg.isImpersonated && <span className="text-[11px] text-muted-foreground"># you, in character</span>}
          {siblingInfo && (
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums" title={`${siblingInfo.total} variants of this message`}>
              <TermLink
                label="<"
                onClick={() => onSwitchBranch?.(siblingInfo.siblingIds[siblingInfo.index - 1])}
                disabled={siblingInfo.index === 0}
                aria-label="Previous variant"
              />
              {siblingInfo.index + 1}/{siblingInfo.total}
              <TermLink
                label=">"
                onClick={() => onSwitchBranch?.(siblingInfo.siblingIds[siblingInfo.index + 1])}
                disabled={siblingInfo.index >= siblingInfo.total - 1}
                aria-label="Next variant"
              />
            </span>
          )}
          <span className="flex items-center gap-2.5 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <TermLink label="copy" onClick={handleCopy} />
            {canReadAloud && <TermLink label={speaking ? "hush" : "say"} onClick={handleReadAloud} aria-label={readAloudLabel} />}
            {canReact && <TermLink label="react" onClick={() => setTermReactOpen((v) => !v)} aria-expanded={termReactOpen} />}
            {!isUser && !msg.isImpersonated && <TermLink label="regen" onClick={handleRegenerate} />}
            {!isUser && !msg.isImpersonated && isLastMessage && onContinue && (
              <TermLink label="continue" onClick={handleContinue} disabled={aiLoading} title="Ask the model to keep writing from where this reply left off" />
            )}
            <TermLink label="edit" onClick={handleEdit} disabled={isUser && aiLoading} />
            {canFork && <TermLink label="fork" onClick={handleFork} disabled={aiLoading} aria-label="Start a new chat from here" />}
            {onDeleteBranch && (
              <TermLink
                label="rm"
                danger
                onClick={handleDeleteBranch}
                disabled={aiLoading}
                aria-label={siblingInfo ? "Delete this variant" : "Delete message"}
              />
            )}
          </span>
        </div>
        {/* The terminal theme's reactions: the same six as elsewhere (#11), inline. */}
        {canReact && termReactOpen && (
          <div role="group" aria-label="React" className="mt-1 flex flex-wrap items-center gap-2 text-[12px]">
            <span className="text-muted-foreground">react:</span>
            {REACTION_EMOJIS.map((emoji) => (
              <TermLink
                key={emoji}
                label={emoji}
                active={msg.reaction === emoji}
                aria-label={msg.reaction === emoji ? `Remove ${emoji} reaction` : `React with ${emoji}`}
                onClick={() => {
                  handleReact(emoji);
                  setTermReactOpen(false);
                }}
              />
            ))}
          </div>
        )}
        <div
          className={cn("mt-1 pl-2 border-l-2 leading-relaxed", isUser ? "border-ring/55 text-foreground" : "border-border text-primary")}
          data-chat-text
          style={CHAT_TEXT_STYLE}
        >
          {oocLabel}
          {/* Texting mode (#141): the terminal shows a reply's texts as
              separate lines too, revealed one at a time like the bubbles. */}
          {voiceNote || (textParts ? (
            <div className="flex flex-col gap-1" data-slot="terminal-texts">
              {textParts.slice(0, shownParts).map((part, i) => (
                <div key={i} className={cn(part.kind === "deleted" && "italic text-muted-foreground")}>
                  {part.kind === "deleted" ? `# ${part.text}` : <MarkdownRenderer msgText={part.text} isUser={false} />}
                </div>
              ))}
            </div>
          ) : <MarkdownRenderer msgText={stripImageContextTag(msg.txt || "")} isUser={isUser} />)}
          {refusalNotice}
          {thoughtsBlock}
          {languageBlock}
          {secretNote}
          {canTranslate && <TermLink label="translate" onClick={handleTranslate} disabled={translating} className="mt-1" />}
          {(msg.reaction || msg.characterReaction) && (
            <div className="mt-1 text-[12px] text-muted-foreground">
              # {isUser ? `${reactorName || "they"} reacted ${msg.characterReaction?.emoji}` : `you reacted ${msg.reaction}`}
            </div>
          )}
          {viewOnceBadge}
          {!viewOnceBadge && msg.images && msg.images.map((imgSrc, idx) => (
            <NsfwBlur key={idx} active={blurMedia} className="w-fit max-w-full">
              <DisplayImage
                srcContext={imgSrc}
                alt={isUser ? "Sent by you" : "Generated"}
                onClick={() => setFullscreenImage(imgSrc)}
                className="mt-2 max-w-full md:max-w-[70%] border border-border-bright cursor-zoom-in hover:opacity-90 transition-opacity"
              />
            </NsfwBlur>
          ))}
          {msg.videos && msg.videos.map((vidSrc, idx) => (
            <NsfwBlur key={idx} active={blurMedia} className="w-fit max-w-full">
              <DisplayVideo
                srcContext={vidSrc}
                className="mt-2 max-w-full md:max-w-[70%] border border-border-bright"
              />
            </NsfwBlur>
          ))}
        </div>
      </motion.div>
    );
  }

  // A /narrate line: the scene's own voice, centered between the speakers.
  if (msg.isNarration) {
    return (
      <motion.div
        data-slot="narration"
        className="flex w-full mt-3.5 mb-1 justify-center"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <p className="max-w-[88%] md:max-w-[70%] rounded-xl bg-surface px-3 py-1.5 text-center font-serif italic text-[14px] leading-[21px] text-muted-foreground ring-1 ring-inset ring-border">
          {msg.txt}
        </p>
      </motion.div>
    );
  }

  if (msg.isRoomEvent) {
    return (
      <motion.div
        className="flex w-full mt-3 mb-0.5 justify-center"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <span data-slot="room-event" className="max-w-[80%] rounded-xl bg-surface px-3 py-[5px] text-center text-[12.5px] leading-[17px] text-muted-foreground ring-1 ring-inset ring-border">
          {msg.txt}
        </span>
      </motion.div>
    );
  }

  if (msg.isCompressionSummary) {
    return (
      <motion.div
        className="flex w-full mt-4 mb-2 justify-center"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <Card className="max-w-[90%] md:max-w-[70%] rounded-card bg-surface text-center shadow-none">
          <CardContent className="px-4 py-3">
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-muted-foreground mb-1.5">
              {msg.chapterTitle ? <FaBookmark size={10} /> : <FaCompressArrowsAlt size={11} />}
              {msg.chapterTitle ? `${msg.episodeTeaser ? "Episode" : "Chapter"} ${chapterNumber ?? ""}: ${msg.chapterTitle}`.replace("  ", " ") : "Compressed history"}
            </div>
            {/* Episodes (#103): the "Next time on…" teaser under the title. */}
            {msg.episodeTeaser && (
              <p className="mb-2 font-serif italic text-[13px] text-foreground" data-slot="episode-teaser">
                <span className="not-italic font-sans text-[11px] font-semibold uppercase tracking-wide text-subtle">Next time on… </span>
                {msg.episodeTeaser}
              </p>
            )}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setIsSummaryExpanded((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setIsSummaryExpanded((v) => !v);
                }
              }}
              className="text-left text-xs text-ink-faint cursor-pointer"
              aria-expanded={isSummaryExpanded}
              title={isSummaryExpanded ? "Click to collapse" : "Click to show the full summary"}
            >
              {/* A chapter shows its own short recap; expanding shows the
                  full story-so-far summary the next replies build on. */}
              <div className={cn(!isSummaryExpanded && "line-clamp-3")}>
                <MarkdownRenderer msgText={!isSummaryExpanded && msg.chapterRecap ? msg.chapterRecap : msg.txt || ""} isUser={false} />
              </div>
              <span className="mt-1 inline-block text-[11px] font-medium text-primary hover:underline">
                {isSummaryExpanded ? "Show less" : msg.chapterRecap ? "Show the full summary" : "Show more"}
              </span>
            </div>
            {onUndoSummary && (
              <button
                type="button"
                onClick={() => onUndoSummary(msg)}
                className="mt-1.5 text-[11px] font-medium text-subtle hover:text-foreground hover:underline"
              >
                {msg.chapterTitle ? "Undo this chapter" : "Undo compression"}
              </button>
            )}
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  // The bubble itself; in texting mode it holds only the last text, after
  // the others. #149: the canvas's bubble - its own colour token, 18 px
  // corners with a tail on the last bubble of a sender's run, and the time
  // (plus ticks and the 2/3 pager) inside it, with nothing reserved below.
  const tailCorner = isUser ? "rounded-br-[6px]" : "rounded-bl-[6px]";
  const bubbleTone = isUser
    ? neumorphic
      ? "bg-accent-soft text-accent-ink"
      : "bg-bubble-out text-bubble-out-text"
    : neumorphic
      ? "bg-elevated surface-raised text-foreground"
      : "bg-bubble-in text-bubble-in-text";
  const metaTone = isUser ? "text-bubble-out-meta" : "text-bubble-meta";
  const hasReaction = Boolean((!isUser && msg.reaction) || (isUser && msg.characterReaction));
  const showMeta = Boolean(msg.timestamp || receipt || siblingInfo);

  const meta = showMeta ? (
    <div
      data-slot="bubble-meta"
      className={cn("mt-0.5 -mb-0.5 flex items-center justify-end gap-1 font-sans text-[11.5px] leading-[14px] tabular-nums", metaTone)}
      aria-label={receipt === "read" ? "Read" : receipt === "sent" ? "Sent" : undefined}
    >
      {siblingInfo && (
        <span className="mr-auto flex items-center gap-0.5 pr-2" title={`${siblingInfo.total} variants of this message`}>
          {/* Only the arrows that lead somewhere; a spacer keeps the count still. */}
          {siblingInfo.index > 0 ? (
            <button
              type="button"
              onClick={() => onSwitchBranch?.(siblingInfo.siblingIds[siblingInfo.index - 1])}
              className="grid h-5 w-5 place-items-center rounded-md hover:bg-foreground/10"
              aria-label="Previous variant"
              data-hit
            >
              <FaChevronLeft size={9} />
            </button>
          ) : <span aria-hidden className="w-5" />}
          <span className="font-semibold">{siblingInfo.index + 1}/{siblingInfo.total}</span>
          {siblingInfo.index < siblingInfo.total - 1 ? (
            <button
              type="button"
              onClick={() => onSwitchBranch?.(siblingInfo.siblingIds[siblingInfo.index + 1])}
              className="grid h-5 w-5 place-items-center rounded-md hover:bg-foreground/10"
              aria-label="Next variant"
              data-hit
            >
              <FaChevronRight size={9} />
            </button>
          ) : <span aria-hidden className="w-5" />}
        </span>
      )}
      {msg.bookmarked && <FaStar size={10} className="text-warning" aria-label="Starred" data-slot="star" />}
      {msg.timestamp && <span>{formatTime(msg.timestamp)}</span>}
      {receipt && <Ticks state={receipt} />}
    </div>
  ) : null;

  // Desktop (#149): a small toolbar beside the bubble on hover or keyboard
  // focus - React, Reply and More, with every other action in the More menu -
  // instead of a row of icons that reserved space under every bubble. Touch
  // screens use the long-press sheet. The padding (not a margin) between it
  // and the bubble keeps the pointer inside while it moves across.
  const menuActions = sheetActions.filter((a) => a.label !== "Reply");
  const toolbar = (
    <div
      data-slot="message-toolbar"
      className={cn(
        // Faded out rather than pointer-events: none, so a pointer
        // that lands on it directly still hovers the bubble and shows it.
        "absolute top-0 z-20 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100 [@media(hover:none)]:hidden",
        isUser ? "right-full pr-2" : "left-full pl-2"
      )}
    >
      <div className="flex items-center gap-0.5 rounded-xl bg-popover p-[3px] shadow-popover ring-1 ring-inset ring-border font-sans">
        {canReact && (
          <ReactionPicker
            current={msg.reaction}
            onPick={handleReact}
            className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-raised hover:text-foreground"
          />
        )}
        {/* While this reply is read aloud, stopping it is one tap away. */}
        {speaking && (
          <Button variant="ghost" size="icon" onClick={handleReadAloud} aria-label="Stop reading" title="Stop reading" className="h-8 w-8 rounded-lg text-primary-text hover:bg-raised">
            <FaStop size={11} />
          </Button>
        )}
        {canReply && (
          <Button variant="ghost" size="icon" onClick={handleReply} aria-label="Reply" title="Reply" className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-raised hover:text-foreground">
            <FaReply size={12} />
          </Button>
        )}
        {/* Not modal: its actions open dialogs (Info, Edit), and a modal menu's
            layer still holding Escape and focus as it fades fights them. */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="More message actions" title="More" className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-raised hover:text-foreground">
              <FaEllipsisH size={12} />
            </Button>
          </DropdownMenuTrigger>
          {/* No focus return to "More" and no fade-out on close: an action
              that opens a dialog (Info, Edit) keeps the focus, and a menu
              still fading out would keep taking the dialog's Escape. */}
          <DropdownMenuContent align={isUser ? "end" : "start"} className="w-60 data-[state=closed]:!animate-none" onCloseAutoFocus={(e) => e.preventDefault()}>
            {menuActions.map((action, i) => (
              <DropdownMenuItem
                // By position: "Read aloud" becomes "Stop reading" while it
                // speaks, and a label key would remount the item mid-click.
                key={i}
                disabled={action.disabled}
                onSelect={action.onSelect}
                aria-pressed={action.label === bookmarkLabel ? Boolean(msg.bookmarked) : undefined}
                className={cn("gap-3 py-2", action.danger && "text-destructive focus:text-destructive")}
              >
                <action.icon size={13} className="flex-shrink-0" />
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  const bubble = (
        <div
          data-slot="message-bubble"
          data-sender={isUser ? "user" : "ai"}
          className={cn(
            "relative min-w-0 group rounded-bubble px-3 pt-2 pb-1.5 shadow-bubble [@media(hover:none)]:[-webkit-touch-callout:none]",
            textParts ? "max-w-full" : "max-w-[86%] md:max-w-[min(600px,78%)]",
            bubbleTone,
            runEnd && tailCorner
          )}
          data-chat-text
          style={swipeX ? { ...CHAT_TEXT_STYLE, transform: `translateX(${swipeX}px)` } : CHAT_TEXT_STYLE}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={() => { cancelPress(); endSwipe(); }}
          onTouchCancel={() => { cancelPress(); endSwipe(); }}
          onContextMenu={handleContextMenu}
        >
          {toolbar}

          {/* In a group (#149), the speaker's name opens their run. */}
          {inRoom && !isUser && runStart && speakerName && (
            <div data-slot="sender-name" className="mb-0.5 font-sans text-[13px] font-semibold leading-[18px] text-foreground">{speakerName}</div>
          )}

          {msg.isImpersonated && (
            <div className="flex items-center gap-1.5 mb-1 font-sans text-[11.5px] font-semibold text-primary-text">
              <FaMask size={10} />
              You, in character
            </div>
          )}
          {/* Role reversal (#105): who's playing whom. */}
          {msg.swapped && !msg.isImpersonated && (
            <div className="flex items-center gap-1.5 mb-1 font-sans text-[11.5px] font-semibold text-primary-text" data-slot="swap-label">
              <FaMask size={10} />
              {isUser ? `You, as ${speakerName || "them"}` : `${speakerName || "They"}, as ${userName?.trim() || "you"}`}
            </div>
          )}

          <div className="font-serif">
            {oocLabel}
            {msg.quotedStatus && <QuotedStatus quoted={msg.quotedStatus} ownerName={msg.quotedStatus.owner === "you" ? "You" : speakerName || "Them"} />}
            {msg.poll && <PollCard poll={msg.poll} onVote={onVote && msg.id ? (option) => onVote(msg, option) : undefined} nameOf={voterName || ((v) => (v === "you" ? "You" : "Someone"))} />}
            {msg.forward && (
              <div data-slot="forwarded" className="mb-1.5 font-sans">
                <span className={cn("flex items-center gap-1 text-[12px] italic", metaTone)}><FaShare size={9} aria-hidden /> Forwarded</span>
                <div className="mt-1 rounded-[10px] bg-foreground/[0.07] px-2.5 py-1.5 text-[14px] leading-[20px] whitespace-pre-line">{msg.forward.text}</div>
              </div>
            )}
            {msg.replyTo && <QuotedMessage text={msg.replyTo.text} name={msg.replyTo.from === "you" ? "You" : replyToName || "Them"} />}
            {mainQuote && <QuotedMessage text={mainQuote} />}
            {voiceNote || <MarkdownRenderer msgText={textParts ? textParts[textParts.length - 1].text : stripImageContextTag(msg.txt || "")} isUser={isUser} />}
            {refusalNotice}
          </div>
          {/* A shared contact (#128): a card with "Message". */}
          {msg.contactCard && (
            <div data-slot="contact-card" className="mt-1.5 w-[280px] max-w-full overflow-hidden rounded-xl bg-foreground/[0.07] font-sans">
              <div className="flex items-center gap-3 p-3">
                <CharacterAvatar name={msg.contactCard.name} size={40} />
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold">{msg.contactCard.name}</div>
                  {msg.contactCard.about && <div className="line-clamp-2 text-[12.5px] opacity-80">{msg.contactCard.about}</div>}
                </div>
              </div>
              {onOpenContact && (
                <button type="button" onClick={() => onOpenContact(msg)} className="w-full border-t border-border py-2.5 text-[14px] font-semibold text-primary-text hover:bg-primary/5" aria-label={`Message ${msg.contactCard.name}`}>
                  Message
                </button>
              )}
            </div>
          )}
          {thoughtsBlock}
          {languageBlock}
          {secretNote}

          {viewOnceBadge || (msg.images && msg.images.map((imgSrc, idx) => (
            <NsfwBlur key={idx} active={blurMedia} className="w-fit max-w-full">
              <DisplayImage
                srcContext={imgSrc}
                alt={isUser ? "Sent by you" : "Generated"}
                onClick={() => setFullscreenImage(imgSrc)}
                className="mt-1.5 max-w-full rounded-xl cursor-zoom-in hover:opacity-90 transition-opacity"
              />
            </NsfwBlur>
          )))}

          {msg.videos && msg.videos.map((vidSrc, idx) => (
            <NsfwBlur key={idx} active={blurMedia} className="w-fit max-w-full">
              <DisplayVideo
                srcContext={vidSrc}
                className="mt-1.5 max-w-full rounded-xl"
              />
            </NsfwBlur>
          ))}

          {meta}

          {!isUser && msg.reaction && <ReactionBadge emoji={msg.reaction} side="right" label={`You reacted ${msg.reaction}`} />}
          {isUser && msg.characterReaction && (
            <ReactionBadge emoji={msg.characterReaction.emoji} side="left" label={`${reactorName || "They"} reacted ${msg.characterReaction.emoji}`} />
          )}
        </div>
  );

  // Texting mode's earlier texts and deleted messages (#6, #108), in the
  // same bubble style as the reply's last text.
  const partClass = () => cn(
    "max-w-full min-w-0 rounded-bubble px-3 py-2 shadow-bubble",
    neumorphic ? "bg-elevated surface-raised" : "bg-bubble-in text-bubble-in-text"
  );

  return (
    <motion.div
      data-message-id={msg.id}
      data-run-start={runStart ? "true" : undefined}
      className={cn(
        "flex w-full scroll-mt-20",
        isUser ? "justify-end" : "justify-start",
        runStart ? "mt-3.5" : "mt-0.5",
        hasReaction && "mb-4"
      )}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {/* Group chats show who's talking (#149); a 1:1 chat needs no avatar
          beside each message. The avatar opens a run; the rest keep its space. */}
      {!isUser && inRoom && (
        <div data-slot="message-avatar" className="mr-2 w-8 flex-shrink-0">
          {runStart && <CharacterAvatar name={charInitials} accent={accent} imageSrc={avatarImageSrc} size={32} className="mt-0.5" />}
        </div>
      )}

      {textParts ? (
        <div className="flex flex-col items-start gap-0.5 max-w-[86%] md:max-w-[min(600px,78%)] min-w-0">
          {textParts.slice(0, shownParts - (showMainBubble ? 1 : 0)).map((part, i) => part.kind === "deleted" ? (
            <motion.div
              key={i}
              data-slot="deleted-bubble"
              className={cn(partClass(), "flex items-center gap-1.5 font-sans text-[13px] italic text-subtle")}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <span aria-hidden>🚫</span>
              {part.text}
            </motion.div>
          ) : (
            <motion.div
              key={i}
              data-slot="text-bubble"
              data-kind={part.kind === "correction" ? "correction" : undefined}
              className={cn(partClass(), "font-serif [@media(hover:none)]:[-webkit-touch-callout:none]")}
              data-chat-text
              style={CHAT_TEXT_STYLE}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={() => { cancelPress(); endSwipe(); }}
              onTouchCancel={() => { cancelPress(); endSwipe(); }}
              onContextMenu={handleContextMenu}
            >
              {i === 0 && inRoom && runStart && speakerName && (
                <div data-slot="sender-name" className="mb-0.5 font-sans text-[13px] font-semibold leading-[18px] text-foreground">{speakerName}</div>
              )}
              {part.quote && <QuotedMessage text={part.quote} />}
              <MarkdownRenderer msgText={part.text} isUser={false} />
            </motion.div>
          ))}
          {showMainBubble && bubble}
        </div>
      ) : bubble}
      {actionSheet}
    </motion.div>
  );
});


ChatMessage.displayName = "ChatMessage";

export default ChatMessage;
