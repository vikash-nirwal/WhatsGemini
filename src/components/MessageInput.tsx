import React, { useState, useCallback, useRef, useEffect, useMemo, useContext } from "react";
import { FaPaperPlane, FaStop, FaCog, FaImage, FaTimes, FaMask, FaUserFriends } from "react-icons/fa";
import { cn } from "../utils/cn";
import { Button } from "./ui/button";
import { CharacterAvatar } from "./ui/CharacterAvatar";
import { ThemeContext } from "../contexts/ThemeContext";
import ImageSettingsModal from "./ImageSettingsModal";
import { estimateTokens } from "../features/ai/utils/tokenEstimator";
import { Character } from "../types";

interface MessageInputProps {
  // `forcedSpeakerId` is set when the user picked a specific participant
  // (via the room picker below) while a draft was in the box - only that
  // character should reply to this particular message, bypassing the usual
  // @mention/round-robin pick.
  onSend: (text: string, isImageRequest?: boolean, isImpersonated?: boolean, forcedSpeakerId?: number) => void;
  disabled?: boolean;
  onStop?: () => void;
  // Fires while the user is actively typing a non-empty draft - lets a
  // parent treat that as "activity" (e.g. to push out a pending autonomous
  // follow-up) without needing the draft text itself.
  onDraftActivity?: () => void;
  tokenCount?: number;
  costEstimate?: number;
  characterName?: string;
  // Estimated tokens already committed to this chat's context (system prompt +
  // history), and the selected model's max context window - together these
  // drive the live pre-send budget bar below, updated as the draft grows.
  contextTokens?: number;
  maxContextTokens?: number;
  // Running real-usage totals for this chat's whole lifetime (persisted on
  // the Chat record) - keeps growing across turns and compressions, unlike
  // tokenCount/costEstimate above which reset to just the latest turn.
  totalChatTokens?: number;
  totalChatCost?: number;
  // Room-only (Phase 12+): every member, for the "reply as" picker. Omitted
  // (or a single-character list) for a plain 1:1 chat, which hides it entirely.
  roomCharacters?: Character[];
  mutedParticipantIds?: number[];
  // Picking a participant while the draft is EMPTY skips composing
  // altogether and asks that character to speak up now, same as before -
  // this is that existing force-reply/follow-up action, not a new one.
  onForceReply?: (characterId: number) => void;
}

const MAX_TEXTAREA_HEIGHT = 120;

const formatTokenCount = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
};

const MessageInput: React.FC<MessageInputProps> = ({
  onSend,
  disabled = false,
  onStop,
  onDraftActivity,
  tokenCount = 0,
  costEstimate = 0,
  characterName,
  contextTokens = 0,
  maxContextTokens = 0,
  totalChatTokens = 0,
  totalChatCost = 0,
  roomCharacters,
  mutedParticipantIds,
  onForceReply,
}) => {
  const { colorTheme } = useContext(ThemeContext);
  const neumorphic = colorTheme === "neumorphic";
  const [text, setText] = useState("");
  const [isImageRequest, setIsImageRequest] = useState(false);
  const [isImpersonated, setIsImpersonated] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<number | null>(null);
  // Set while the caret is sitting right after an in-progress "@word" with no
  // space yet typed - `start` is where the "@" sits in `text`, `query` is
  // whatever's been typed after it so far.
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const isRoom = Boolean(roomCharacters && roomCharacters.length > 1);
  const selectedSpeaker = selectedSpeakerId != null ? roomCharacters?.find((c) => c.id === selectedSpeakerId) : undefined;

  // Looks backward from the caret for an "@" that starts the current word
  // (line start or preceded by whitespace, no space/newline/second "@" typed
  // since) - the same shape of mention handleSend's own parseMention already
  // understands, just detected live as a prefix instead of read back after
  // the fact.
  const detectMention = useCallback((value: string, cursorPos: number): { start: number; query: string } | null => {
    if (!isRoom) return null;
    const uptoCursor = value.slice(0, cursorPos);
    const match = uptoCursor.match(/(?:^|\s)@([^\s@]*)$/);
    if (!match) return null;
    const query = match[1];
    return { start: cursorPos - query.length - 1, query };
  }, [isRoom]);

  const mentionSuggestions = useMemo(() => {
    if (!mention || !roomCharacters) return [];
    const q = mention.query.toLowerCase();
    return roomCharacters.filter((c) => c.name.toLowerCase().startsWith(q));
  }, [mention, roomCharacters]);

  // Reset the highlight to the top match every time the candidate list
  // changes - narrowing it by typing another letter, or starting a whole
  // new mention elsewhere - so it never points past the end or lingers on
  // an unrelated character from a previous mention.
  useEffect(() => {
    setMentionActiveIndex(0);
  }, [mentionSuggestions]);

  const updateMentionFromCaret = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    setMention(detectMention(el.value, el.selectionStart ?? el.value.length));
  }, [detectMention]);

  const applyMention = useCallback((character: Character) => {
    if (!mention) return;
    const before = text.slice(0, mention.start);
    const after = text.slice(mention.start + 1 + mention.query.length);
    const insertion = `@${character.name} `;
    const newText = `${before}${insertion}${after}`;
    setText(newText);
    setMention(null);
    const cursorPos = before.length + insertion.length;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(cursorPos, cursorPos);
    });
  }, [mention, text]);

  // Click-based, not hover - a hover-triggered popover this close to the
  // screen edge left no room to move the cursor from the icon into the
  // popover without it closing first. Closes on picking someone (see
  // handlePickParticipant), on Escape, or on clicking anywhere else.
  useEffect(() => {
    if (!pickerOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [pickerOpen]);

  const resize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [text, resize]);

  // Memoized function to handle message sending
  const handleSend = useCallback(() => {
    if (disabled) return;
    const trimmedText = text.trim();
    if (!trimmedText) return;

    onSend(trimmedText, isImageRequest, isImpersonated, selectedSpeakerId ?? undefined);
    setText("");
    setIsImageRequest(false); // Disable/uncheck it afterward
    setIsImpersonated(false);
    setSelectedSpeakerId(null);
    setMention(null);
  }, [text, isImageRequest, isImpersonated, selectedSpeakerId, onSend, disabled]);

  // Picking a participant means something different depending on whether
  // there's already a draft: with text in the box, it targets THIS message
  // (cleared once sent, like the image/impersonate toggles above); with an
  // empty box, there's nothing to target, so it goes straight to the
  // existing "make them speak up now" action instead.
  const handlePickParticipant = useCallback((character: Character) => {
    if (disabled) return;
    setPickerOpen(false);
    if (text.trim()) {
      setSelectedSpeakerId(character.id);
      inputRef.current?.focus();
    } else {
      onForceReply?.(character.id);
    }
  }, [disabled, text, onForceReply]);

  // Scroll input into view when focused (helps with mobile keyboards)
  const handleFocus = useCallback(() => {
    setTimeout(() => {
      inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  }, []);

  const canSend = Boolean(text.trim() && !disabled);

  // Live pre-send estimate: context already committed to this chat, plus
  // whatever's currently typed but not sent yet - recomputed on every
  // keystroke, purely client-side (no API round-trip).
  const draftTokens = useMemo(() => estimateTokens(text), [text]);
  const estimatedTotalTokens = contextTokens + draftTokens;
  const contextUtilization = maxContextTokens > 0 ? estimatedTotalTokens / maxContextTokens : 0;
  const budgetColorClass =
    contextUtilization >= 0.85 ? "text-destructive" : contextUtilization >= 0.6 ? "text-amber-500" : "text-ink-faint";
  const budgetBarColorClass =
    contextUtilization >= 0.85 ? "bg-destructive" : contextUtilization >= 0.6 ? "bg-amber-500" : "bg-primary/60";

  return (
    <div className="flex flex-col gap-2">
      {maxContextTokens > 0 && (
        <div className="flex flex-col gap-1 px-1">
          <div className={cn("flex justify-between text-[11px] font-mono", budgetColorClass)}>
            <span>Context</span>
            <span className="tabular-nums">
              {formatTokenCount(estimatedTotalTokens)} / {formatTokenCount(maxContextTokens)} tokens
            </span>
          </div>
          <div className={cn("h-1.5 rounded-full bg-accent/40 overflow-hidden", neumorphic && "shadow-inset")}>
            <div
              className={cn("h-full rounded-full transition-all", budgetBarColorClass)}
              style={{ width: `${Math.min(contextUtilization * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      {(tokenCount > 0 || totalChatTokens > 0) && (
        <div className="flex justify-center text-xs text-ink-faint font-mono">
          <span>
            {tokenCount > 0 && (
              <>~ {tokenCount.toLocaleString()} tokens last turn ({costEstimate > 0.0001 ? `$${costEstimate.toFixed(4)}` : '< $0.0001'} est.)</>
            )}
            {tokenCount > 0 && totalChatTokens > 0 && "  ·  "}
            {totalChatTokens > 0 && (
              <>{formatTokenCount(totalChatTokens)} tokens total this chat (~{totalChatCost > 0.0001 ? `$${totalChatCost.toFixed(4)}` : '< $0.0001'})</>
            )}
          </span>
        </div>
      )}

      {isImageRequest && (
        <div className="flex items-center gap-2.5 px-3 py-2 bg-primary/10 border border-primary rounded-lg">
          <span className="text-primary flex-shrink-0 flex"><FaImage size={13} /></span>
          <span className="flex-1 text-[12.5px] text-foreground font-medium">
            Image generation on — a picture will be created alongside the reply.
          </span>
          <Button
            onClick={() => setIsImageRequest(false)}
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground flex-shrink-0"
            aria-label="Turn off image generation"
          >
            <FaTimes size={11} />
          </Button>
        </div>
      )}

      {isImpersonated && (
        <div className="flex items-center gap-2.5 px-3 py-2 bg-violet-500/10 border border-violet-500/50 rounded-lg">
          <span className="text-violet-500 flex-shrink-0 flex"><FaMask size={13} /></span>
          <span className="flex-1 text-[12.5px] text-foreground font-medium">
            Impersonation on — this message is sent as {characterName || "the character"}, not you.
          </span>
          <Button
            onClick={() => setIsImpersonated(false)}
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground flex-shrink-0"
            aria-label="Turn off impersonation"
          >
            <FaTimes size={11} />
          </Button>
        </div>
      )}

      {selectedSpeaker && (
        <div className="flex items-center gap-2.5 px-3 py-2 bg-primary/10 border border-primary rounded-lg">
          <CharacterAvatar name={selectedSpeaker.name} accent={selectedSpeaker.accent} size={18} className="flex-shrink-0" />
          <span className="flex-1 text-[12.5px] text-foreground font-medium">
            Only {selectedSpeaker.name} will reply to this message.
          </span>
          <Button
            onClick={() => setSelectedSpeakerId(null)}
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground flex-shrink-0"
            aria-label="Clear selected replier"
          >
            <FaTimes size={11} />
          </Button>
        </div>
      )}

      {mention && mentionSuggestions.length > 0 && (
        <div className="flex flex-col gap-0.5 p-1.5 rounded-lg bg-card border border-border shadow-soft max-h-48 overflow-y-auto">
          {mentionSuggestions.map((char, i) => (
            <button
              key={char.id}
              type="button"
              // mousedown (not click) fires before the textarea would blur,
              // so preventing default here keeps focus/caret in the input
              // instead of losing it to this button first.
              onMouseDown={(e) => {
                e.preventDefault();
                applyMention(char);
              }}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[13px] transition-colors",
                i === mentionActiveIndex ? "bg-primary/[0.14] text-primary" : "text-foreground hover:bg-secondary"
              )}
            >
              <CharacterAvatar name={char.name} accent={char.accent} size={22} />
              <span className="font-medium">{char.name}</span>
            </button>
          ))}
        </div>
      )}

      <div
        className={cn(
          "flex items-center gap-1 h-14 px-2 rounded-full backdrop-blur-md transition-colors",
          neumorphic && !isImpersonated ? "shadow-inset" : "shadow-soft",
          isImpersonated
            ? "bg-violet-500/[0.06] border border-violet-500/40"
            : "bg-card/[0.85] border border-border/10"
        )}
      >
        {isRoom && roomCharacters && (
          <div className="relative flex-shrink-0" ref={pickerRef}>
            <Button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              disabled={disabled}
              variant="ghost"
              title="Reply as..."
              aria-label="Choose who replies"
              aria-expanded={pickerOpen}
              className={cn(
                "h-10 w-10 flex-shrink-0 rounded-lg",
                selectedSpeaker
                  ? "bg-primary/[0.14] text-primary hover:bg-primary/[0.2]"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              {selectedSpeaker ? (
                <CharacterAvatar name={selectedSpeaker.name} accent={selectedSpeaker.accent} size={22} />
              ) : (
                <FaUserFriends size={16} />
              )}
            </Button>

            {pickerOpen && (
              <div className="absolute bottom-full left-0 mb-2 flex items-center gap-1.5 p-1.5 rounded-full bg-card border border-border shadow-soft z-30">
                {roomCharacters.map((char) => {
                  const isMuted = mutedParticipantIds?.includes(char.id);
                  return (
                    <button
                      key={char.id}
                      type="button"
                      onClick={() => handlePickParticipant(char)}
                      disabled={disabled || isMuted}
                      title={isMuted ? `${char.name} is muted` : text.trim() ? `Only ${char.name} replies to this message` : `Make ${char.name} reply now`}
                      aria-label={isMuted ? `${char.name} is muted` : `Reply as ${char.name}`}
                      className={cn(
                        "flex-shrink-0 rounded-full transition disabled:cursor-not-allowed",
                        isMuted ? "opacity-30" : "hover:scale-110 hover:ring-2 hover:ring-primary/50",
                        selectedSpeakerId === char.id && "ring-2 ring-primary"
                      )}
                    >
                      <CharacterAvatar name={char.name} accent={char.accent} size={32} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <Button
          onClick={() => setIsImageRequest((v) => !v)}
          disabled={disabled}
          variant="ghost"
          title="Request an image with this message"
          aria-label="Request an image with this message"
          aria-pressed={isImageRequest}
          className={cn(
            "h-10 w-10 flex-shrink-0 rounded-lg",
            isImageRequest
              ? "bg-primary/[0.14] text-primary hover:bg-primary/[0.2]"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
        >
          <FaImage size={16} />
        </Button>

        <Button
          onClick={() => setIsImpersonated((v) => !v)}
          disabled={disabled}
          variant="ghost"
          title={`Write as ${characterName || "the character"} instead of yourself`}
          aria-label="Toggle impersonation mode"
          aria-pressed={isImpersonated}
          className={cn(
            "h-10 w-10 flex-shrink-0 rounded-lg",
            isImpersonated
              ? "bg-violet-500/[0.14] text-violet-500 hover:bg-violet-500/[0.2]"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
        >
          <FaMask size={16} />
        </Button>

        <Button
          onClick={() => setIsSettingsModalOpen(true)}
          variant="ghost"
          title="Image Generation Settings"
          aria-label="Image Generation Settings"
          className="h-10 w-10 flex-shrink-0 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <FaCog size={16} />
        </Button>

        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => {
            const value = e.target.value;
            setText(value);
            if (value.trim()) onDraftActivity?.();
            // A forced-speaker selection only makes sense for a message
            // that's actually being composed - clearing the draft back to
            // empty drops it too, instead of leaving a stale banner around.
            if (!value.trim() && selectedSpeakerId != null) setSelectedSpeakerId(null);
            setMention(detectMention(value, e.target.selectionStart ?? value.length));
          }}
          onClick={updateMentionFromCaret}
          rows={1}
          placeholder={
            disabled
              ? "Waiting for response..."
              : isImpersonated
              ? `Write as ${characterName || "the character"}…`
              : selectedSpeaker
              ? `Message ${selectedSpeaker.name}…`
              : characterName
              ? `Message ${characterName}…`
              : "Type a message..."
          }
          className="flex-1 min-w-0 px-2.5 py-1 leading-[22px] bg-transparent text-foreground placeholder-subtle outline-none transition-colors resize-none disabled:opacity-50"
          style={{ fontSize: 'var(--chat-font-size, 16px)', maxHeight: MAX_TEXTAREA_HEIGHT }}
          disabled={disabled}
          onFocus={handleFocus}
          onBlur={() => setMention(null)}
          onKeyUp={(e) => {
            // Arrow keys are already claimed below for navigating an open
            // mention list - only re-derive from the caret here once it's
            // actually moved the cursor (i.e. the list is closed).
            if (!mention && (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown")) {
              updateMentionFromCaret();
            }
          }}
          onKeyDown={(e) => {
            if (mention && mentionSuggestions.length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setMentionActiveIndex((i) => (i + 1) % mentionSuggestions.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setMentionActiveIndex((i) => (i - 1 + mentionSuggestions.length) % mentionSuggestions.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                applyMention(mentionSuggestions[mentionActiveIndex]);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setMention(null);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          aria-label="Message input"
          aria-busy={disabled}
        />

        {disabled && onStop ? (
          <Button
            onClick={onStop}
            variant="destructive"
            className="h-10 flex-shrink-0 rounded-lg font-semibold"
            title="Stop Generating"
            aria-label="Stop Generating"
          >
            <FaStop size={13} /> Stop
          </Button>
        ) : (
          <Button
            onClick={handleSend}
            className={cn(
              "h-10 flex-shrink-0 rounded-lg font-semibold shadow-none",
              !canSend && "bg-accent text-muted-foreground cursor-not-allowed hover:bg-accent"
            )}
            disabled={!canSend}
            title="Send Message"
            aria-label="Send Message"
          >
            Send <FaPaperPlane size={14} />
          </Button>
        )}
      </div>

      <ImageSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />
    </div>
  );
};

export default MessageInput;
