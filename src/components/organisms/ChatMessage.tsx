import React, { useCallback, useRef, useState } from "react";
import { useColorTheme } from "../../hooks/useColorTheme";
import { FaCopy, FaRedo, FaEdit, FaChevronLeft, FaChevronRight, FaTrash, FaCompressArrowsAlt, FaForward, FaMask, FaBookmark, FaStar, FaCode } from "react-icons/fa";
import { motion } from "framer-motion";
import { cn } from "../../utils/cn";
import { Message } from "../../types";
import { YOU } from "../../utils/constants";
import { stripImageContextTag } from "../../features/ai/utils/imageGeneration";
import MarkdownRenderer from "src/components/molecules/MarkdownRenderer";
import { Dialog, DialogContent, DialogTitle } from "src/components/molecules/dialog";
import { DisplayImage } from "src/components/molecules/DisplayImage";
import { DisplayVideo } from "src/components/molecules/DisplayVideo";
import { CharacterAvatar } from "src/components/molecules/CharacterAvatar";
import { Button } from "src/components/atoms/button";
import { Card, CardContent } from "src/components/atoms/card";
import { Tooltip, TooltipTrigger, TooltipContent } from "src/components/atoms/tooltip";
import { TermLink } from "src/components/atoms/TermLink";
import { NsfwBlur } from "src/components/molecules/NsfwBlur";
import { InnerThoughts, ReactionBadge, ReactionPicker, ReactionRow } from "src/components/molecules/MessageExtras";
import { splitIntoTexts } from "../../features/ai/utils/textingMode";

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
  onInspect?: (msg: Message) => void; // "Show what was sent" for an AI reply (#31)
  onReact?: (msg: Message, emoji: string) => void; // your emoji reaction to a reply (#11)
  reactorName?: string; // who left msg.characterReaction, for its label
  // Texting mode (#6): show a reply as several bubbles. visibleParts limits
  // how many are shown while a new reply is being revealed; receipt is the
  // read tick on your own messages.
  texting?: boolean;
  visibleParts?: number;
  receipt?: "sent" | "read";
}

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
  onInspect,
  onReact,
  reactorName,
  texting = false,
  visibleParts,
  receipt,
}: ChatMessageProps) => {
  const isUser = msg.role === YOU;
  const { is } = useColorTheme();
  const neumorphic = is("neumorphic");
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);

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
  const bookmarkLabel = msg.bookmarked ? "Remove bookmark" : "Bookmark";
  const handleReact = useCallback((emoji: string) => onReact?.(msg, emoji), [onReact, msg]);
  const canReact = Boolean(onReact && !isUser && msg.id);
  // Texting mode splits a reply into its texts; one text stays a normal bubble.
  const splitParts = texting && !isUser && !msg.isImpersonated && !msg.isCompressionSummary && !msg.isRoomEvent && !msg.isNarration
    ? splitIntoTexts(stripImageContextTag(msg.txt || ""))
    : [];
  const textParts = splitParts.length > 1 ? splitParts : null;
  const shownParts = textParts ? Math.min(visibleParts ?? textParts.length, textParts.length) : 0;
  const showMainBubble = !textParts || shownParts === textParts.length;
  const thoughtsBlock = !isUser && msg.thoughts ? <InnerThoughts thoughts={msg.thoughts} terminal={is("terminal")} /> : null;

  // Long-press (touch) or the browser's own long-press/context-menu gesture
  // opens the action sheet. Moving the finger cancels it, so scrolling past a
  // message never opens it.
  const [actionsOpen, setActionsOpen] = useState(false);
  const pressRef = useRef<{ timer: number; x: number; y: number } | null>(null);
  const cancelPress = useCallback(() => {
    if (pressRef.current) window.clearTimeout(pressRef.current.timer);
    pressRef.current = null;
  }, []);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    cancelPress();
    if (e.touches.length !== 1) return;
    const { clientX, clientY } = e.touches[0];
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
  }, [cancelPress]);
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    // Only on touch screens; a mouse right-click keeps the browser's menu.
    if (!window.matchMedia?.(TOUCH_ONLY).matches) return;
    e.preventDefault();
    cancelPress();
    setActionsOpen(true);
  }, [cancelPress]);

  const sheetActions: { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; onSelect: () => void; disabled?: boolean; danger?: boolean }[] = [
    { label: "Copy", icon: FaCopy, onSelect: handleCopy },
    ...(!isUser && !msg.isImpersonated ? [{ label: "Regenerate", icon: FaRedo, onSelect: handleRegenerate, disabled: aiLoading }] : []),
    ...(!isUser && !msg.isImpersonated && isLastMessage && onContinue ? [{ label: "Continue", icon: FaForward, onSelect: handleContinue, disabled: aiLoading }] : []),
    { label: "Edit", icon: FaEdit, onSelect: handleEdit, disabled: isUser && aiLoading },
    ...(onToggleBookmark ? [{ label: bookmarkLabel, icon: FaStar, onSelect: handleToggleBookmark }] : []),
    ...(canInspect ? [{ label: "Show what was sent", icon: FaCode, onSelect: handleInspect }] : []),
    ...(onDeleteBranch ? [{ label: siblingInfo ? "Delete this variant" : "Delete message", icon: FaTrash, onSelect: handleDeleteBranch, disabled: aiLoading, danger: true }] : []),
  ];
  const actionSheet = (
    <Dialog open={actionsOpen} onOpenChange={setActionsOpen}>
      <DialogContent
        aria-describedby={undefined}
        className="top-auto bottom-0 translate-y-0 data-[state=open]:slide-in-from-top-[100%] rounded-t-2xl rounded-b-none p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] gap-0"
      >
        <DialogTitle className="sr-only">Message actions</DialogTitle>
        {canReact && <ReactionRow current={msg.reaction} onPick={(emoji) => { setActionsOpen(false); handleReact(emoji); }} />}
        <div role="menu" aria-label="Message actions" className="flex flex-col">
          {sheetActions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              onClick={() => { setActionsOpen(false); action.onSelect(); }}
              className={cn(
                "flex items-center gap-3 px-4 py-3.5 rounded-xl text-left text-[15px] font-sans disabled:opacity-50",
                action.danger ? "text-destructive hover:bg-destructive/10" : "text-foreground hover:bg-secondary"
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
            {msg.chapterTitle ? `# chapter ${chapterNumber ?? ""}: ${msg.chapterTitle}`.replace("  ", " ") : "# compressed history"}
          </div>
          <div className={cn("text-xs text-muted-foreground", !isSummaryExpanded && "line-clamp-3")}>
            <MarkdownRenderer msgText={!isSummaryExpanded && msg.chapterRecap ? msg.chapterRecap : msg.txt || ""} isUser={false} />
          </div>
          <TermLink
            label={isSummaryExpanded ? "less" : "more"}
            onClick={() => setIsSummaryExpanded((v) => !v)}
            aria-expanded={isSummaryExpanded}
            className="mt-2"
          />
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
            {canReact && <TermLink label={msg.reaction === "❤️" ? "unlike" : "like"} onClick={() => handleReact("❤️")} />}
            {!isUser && !msg.isImpersonated && <TermLink label="regen" onClick={handleRegenerate} />}
            {!isUser && !msg.isImpersonated && isLastMessage && onContinue && (
              <TermLink label="continue" onClick={handleContinue} disabled={aiLoading} title="Ask the model to keep writing from where this reply left off" />
            )}
            <TermLink label="edit" onClick={handleEdit} disabled={isUser && aiLoading} />
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
        <div
          className={cn("mt-1 pl-2 border-l-2 leading-relaxed", isUser ? "border-ring/55 text-foreground" : "border-border text-primary")}
          style={{ fontSize: "var(--chat-font-size, 16px)" }}
        >
          {oocLabel}
          <MarkdownRenderer msgText={stripImageContextTag(msg.txt || "")} isUser={isUser} />
          {refusalNotice}
          {thoughtsBlock}
          {(msg.reaction || msg.characterReaction) && (
            <div className="mt-1 text-[12px] text-muted-foreground">
              # {isUser ? `${reactorName || "they"} reacted ${msg.characterReaction?.emoji}` : `you reacted ${msg.reaction}`}
            </div>
          )}
          {msg.images && msg.images.map((imgSrc, idx) => (
            <NsfwBlur key={idx} active={blurMedia} className="w-fit max-w-full">
              <DisplayImage
                srcContext={imgSrc}
                alt="Generated"
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
        className="flex w-full mb-6 justify-center"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <p className="max-w-[85%] md:max-w-[70%] text-center font-serif italic text-[15px] leading-relaxed text-muted-foreground">
          {msg.txt}
        </p>
      </motion.div>
    );
  }

  if (msg.isRoomEvent) {
    return (
      <motion.div
        className="flex w-full mb-6 justify-center"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <span className="px-3 py-1 rounded-full bg-muted text-[11.5px] font-medium text-muted-foreground">
          {msg.txt}
        </span>
      </motion.div>
    );
  }

  if (msg.isCompressionSummary) {
    return (
      <motion.div
        className="flex w-full mb-6 justify-center"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <Card className="max-w-[90%] md:max-w-[70%] bg-muted text-center">
          <CardContent className="px-4 py-3">
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-muted-foreground mb-1.5">
              {msg.chapterTitle ? <FaBookmark size={10} /> : <FaCompressArrowsAlt size={11} />}
              {msg.chapterTitle ? `Chapter ${chapterNumber ?? ""}: ${msg.chapterTitle}`.replace("  ", " ") : "Compressed history"}
            </div>
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
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  // The bubble itself; in texting mode it holds only the last text, after
  // the others.
  const bubble = (
        <div
          data-slot="message-bubble"
          data-sender={isUser ? "user" : "ai"}
          className={cn(
            "relative p-4 rounded-2xl min-w-0 group [@media(hover:none)]:[-webkit-touch-callout:none]",
            textParts ? "max-w-full" : "max-w-[85%] md:max-w-[70%]",
            // Canvas spec: "plain div. Incoming: bg-elevated surface-raised.
            // Outgoing: bg-accent-soft text-accent-ink." Cozy keeps its own
            // translucent-tint look untouched.
            isUser
              ? neumorphic
                ? "bg-accent-soft text-accent-ink rounded-br-[5px]"
                : "bg-primary/[0.16] text-foreground rounded-br-[5px]"
              : neumorphic
                ? "bg-elevated surface-raised text-foreground rounded-tl-[5px]"
                : "bg-card/[0.88] shadow-soft text-foreground rounded-tl-[5px]"
          )}
          style={{ fontSize: "var(--chat-font-size, 16px)" }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={cancelPress}
          onTouchCancel={cancelPress}
          onContextMenu={handleContextMenu}
        >
          {/* Floating sibling prev/next, anchored to the card's edges */}
          {siblingInfo && siblingInfo.index > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onSwitchBranch?.(siblingInfo.siblingIds[siblingInfo.index - 1])}
              className="absolute -left-4 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-secondary border border-border/50 shadow-soft text-foreground hover:bg-muted z-10"
              aria-label="Previous variant"
              title="Previous variant"
            >
              <FaChevronLeft size={12} />
            </Button>
          )}
          {siblingInfo && siblingInfo.index < siblingInfo.total - 1 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onSwitchBranch?.(siblingInfo.siblingIds[siblingInfo.index + 1])}
              className="absolute -right-4 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-secondary border border-border/50 shadow-soft text-foreground hover:bg-muted z-10"
              aria-label="Next variant"
              title="Next variant"
            >
              <FaChevronRight size={12} />
            </Button>
          )}

          {msg.bookmarked && (
            <span className="absolute -top-2 -right-2 text-amber-400 drop-shadow" title="Bookmarked" aria-label="Bookmarked">
              <FaStar size={12} />
            </span>
          )}

          {msg.isImpersonated && (
            <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold text-primary/80">
              <FaMask size={10} />
              You, in character
            </div>
          )}

          <div className="font-serif">
            {oocLabel}
            <MarkdownRenderer msgText={textParts ? textParts[textParts.length - 1] : stripImageContextTag(msg.txt || "")} isUser={isUser} />
            {refusalNotice}
          </div>
          {thoughtsBlock}
          {receipt && (
            <div className="mt-1 flex items-center justify-end gap-1 font-sans text-[11px] text-subtle" aria-label={receipt === "read" ? "Read" : "Sent"}>
              {msg.timestamp && <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>}
              <span aria-hidden className={cn("tracking-[-0.2em]", receipt === "read" && "text-primary")}>{receipt === "read" ? "✓✓" : "✓"}</span>
            </div>
          )}

          {!isUser && msg.reaction && <ReactionBadge emoji={msg.reaction} side="right" label={`You reacted ${msg.reaction}`} />}
          {isUser && msg.characterReaction && (
            <ReactionBadge emoji={msg.characterReaction.emoji} side="left" label={`${reactorName || "They"} reacted ${msg.characterReaction.emoji}`} />
          )}

          {msg.images && msg.images.map((imgSrc, idx) => (
            <NsfwBlur key={idx} active={blurMedia} className="w-fit max-w-full">
              <DisplayImage
                srcContext={imgSrc}
                alt="Generated"
                onClick={() => setFullscreenImage(imgSrc)}
                className="mt-2 max-w-full rounded-lg shadow-sm cursor-zoom-in hover:opacity-90 transition-opacity"
              />
            </NsfwBlur>
          ))}

          {msg.videos && msg.videos.map((vidSrc, idx) => (
            <NsfwBlur key={idx} active={blurMedia} className="w-fit max-w-full">
              <DisplayVideo
                srcContext={vidSrc}
                className="mt-2 max-w-full rounded-lg shadow-sm"
              />
            </NsfwBlur>
          ))}

          {/* User messages: the same hover-revealed footer as AI replies (the
              old ⋮ menu floated over the text). Touch screens use the
              long-press action sheet instead, so the row only shows there
              when it has a variant count to display. */}
          {isUser && (
            <div className={cn("flex items-center justify-end gap-1 mt-2 font-sans", !siblingInfo && "[@media(hover:none)]:hidden")}>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity [@media(hover:none)]:hidden">
                <Button variant="ghost" size="icon" onClick={handleCopy} aria-label="Copy" title="Copy" className="h-auto w-auto p-1.5 rounded-md text-foreground/60 hover:bg-primary/10 hover:text-foreground">
                  <FaCopy size={12} />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleEdit} disabled={aiLoading} aria-label="Edit" title="Edit" className="h-auto w-auto p-1.5 rounded-md text-foreground/60 hover:bg-primary/10 hover:text-foreground">
                  <FaEdit size={12} />
                </Button>
                {onToggleBookmark && (
                  <Button variant="ghost" size="icon" onClick={handleToggleBookmark} aria-label={bookmarkLabel} aria-pressed={Boolean(msg.bookmarked)} title={bookmarkLabel} className={cn("h-auto w-auto p-1.5 rounded-md hover:bg-primary/10", msg.bookmarked ? "text-amber-500" : "text-foreground/60 hover:text-foreground")}>
                    <FaStar size={11} />
                  </Button>
                )}
                {onDeleteBranch && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleDeleteBranch}
                    disabled={aiLoading}
                    className="h-auto w-auto p-1.5 rounded-md text-subtle hover:bg-destructive/15 hover:text-destructive"
                    aria-label={siblingInfo ? "Delete this variant" : "Delete message"}
                    title={siblingInfo ? "Delete this variant" : "Delete message"}
                  >
                    <FaTrash size={10} />
                  </Button>
                )}
              </div>
              {siblingInfo && (
                <span
                  className="text-[11px] font-mono font-semibold text-subtle tabular-nums"
                  title={`${siblingInfo.total} variants of this message`}
                >
                  {siblingInfo.index + 1}/{siblingInfo.total}
                </span>
              )}
            </div>
          )}

          {/* AI messages: icon-only actions, hidden until the message is hovered
              or a button inside it has focus (keyboard/touch) - a permanently
              visible labeled row under every single reply added a lot of
              constant weight for something used occasionally. The outer
              bubble already carries the `group` class this reveal keys off. */}
          {!isUser && (
            <div className={cn("flex items-center gap-1 mt-2 font-sans", !siblingInfo && "[@media(hover:none)]:hidden")}>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity [@media(hover:none)]:hidden">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={handleCopy} aria-label="Copy" className="h-auto w-auto p-1.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
                      <FaCopy size={12} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy</TooltipContent>
                </Tooltip>
                {canReact && (
                  <ReactionPicker
                    current={msg.reaction}
                    onPick={handleReact}
                    className="h-auto w-auto p-1.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                  />
                )}
                {!msg.isImpersonated && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={handleRegenerate} aria-label="Regenerate" className="h-auto w-auto p-1.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
                        <FaRedo size={12} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Regenerate</TooltipContent>
                  </Tooltip>
                )}
                {!msg.isImpersonated && isLastMessage && onContinue && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleContinue}
                        disabled={aiLoading}
                        aria-label="Continue"
                        className="h-auto w-auto p-1.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <FaForward size={12} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Ask the model to keep writing from where this reply left off</TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={handleEdit} aria-label="Edit" className="h-auto w-auto p-1.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
                      <FaEdit size={12} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit</TooltipContent>
                </Tooltip>
                {onToggleBookmark && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={handleToggleBookmark} aria-label={bookmarkLabel} aria-pressed={Boolean(msg.bookmarked)} className={cn("h-auto w-auto p-1.5 rounded-md hover:bg-secondary", msg.bookmarked ? "text-amber-500" : "text-muted-foreground hover:text-foreground")}>
                        <FaStar size={11} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{bookmarkLabel}</TooltipContent>
                  </Tooltip>
                )}
                {canInspect && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={handleInspect} aria-label="Show what was sent" className="h-auto w-auto p-1.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
                        <FaCode size={11} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Show what was sent to the model for this reply</TooltipContent>
                  </Tooltip>
                )}
                {onDeleteBranch && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleDeleteBranch}
                        disabled={aiLoading}
                        className="h-auto w-auto p-1.5 rounded-md text-subtle hover:bg-destructive/15 hover:text-destructive"
                        aria-label={siblingInfo ? "Delete this variant" : "Delete message"}
                      >
                        <FaTrash size={10} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{siblingInfo ? "Delete this variant" : "Delete message"}</TooltipContent>
                  </Tooltip>
                )}
              </div>
              <div className="flex-1" />
              {siblingInfo && (
                <span
                  className="text-[11px] font-mono font-semibold text-subtle tabular-nums"
                  title={`${siblingInfo.total} variants of this message`}
                >
                  {siblingInfo.index + 1}/{siblingInfo.total}
                </span>
              )}
            </div>
          )}
        </div>
  );

  return (
    <motion.div
      data-message-id={msg.id}
      className={cn("flex w-full mb-6 scroll-mt-20", isUser ? "justify-end" : "justify-start")}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {/* AI Avatar */}
      {!isUser && (
        <CharacterAvatar name={charInitials} accent={accent} imageSrc={avatarImageSrc} size={32} className="mt-1 mr-3 shadow-md" />
      )}

      {textParts ? (
        <div className="flex flex-col items-start gap-1.5 max-w-[85%] md:max-w-[70%] min-w-0">
          {textParts.slice(0, shownParts - (showMainBubble ? 1 : 0)).map((part, i) => (
            <motion.div
              key={i}
              data-slot="text-bubble"
              className={cn("px-4 py-2.5 rounded-2xl max-w-full min-w-0 font-serif text-foreground [@media(hover:none)]:[-webkit-touch-callout:none]", neumorphic ? "bg-elevated surface-raised" : "bg-card/[0.88] shadow-soft", i === 0 && "rounded-tl-[5px]")}
              style={{ fontSize: "var(--chat-font-size, 16px)" }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={cancelPress}
              onTouchCancel={cancelPress}
              onContextMenu={handleContextMenu}
            >
              <MarkdownRenderer msgText={part} isUser={false} />
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
